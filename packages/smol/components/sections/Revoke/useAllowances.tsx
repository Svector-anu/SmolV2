import {createContext, useCallback, useContext, useEffect, useReducer, useRef, useState} from 'react';
import {optionalRenderProps, type TOptionalRenderProps} from 'packages/lib/utils/react/optionalRenderProps';
import {isUnlimitedBN} from 'packages/lib/utils/tools.revoke';
import {useIndexedDBStore} from 'use-indexeddb';
import {erc20Abi as abi, isAddressEqual} from 'viem';
import axios from 'axios';
import {useWeb3} from '@builtbymom/web3/contexts/useWeb3';
import {useAsyncTrigger} from '@builtbymom/web3/hooks/useAsyncTrigger';
import {useChainID} from '@builtbymom/web3/hooks/useChainID';
import {isAddress, toAddress, toNormalizedBN} from '@builtbymom/web3/utils';
import {retrieveConfig} from '@builtbymom/web3/utils/wagmi';
import {useDeepCompareMemo} from '@react-hookz/web';
import {useTokensWithBalance} from '@smolHooks/useTokensWithBalance';
import {readContracts, serialize} from '@wagmi/core';
import {createUniqueID} from '@lib/utils/tools.identifiers';

import {contractDataURL} from './constants';
import {useApproveEventsChainSync} from './useApproveEventsChainSync';
import {useHistoricalAllowances} from './useHistoricalAllowances';

import type {
	TAllowances,
	TApproveEventEntry,
	TExpandedAllowance,
	TRevokeActions,
	TRevokeConfiguration,
	TRevokeContext
} from 'packages/lib/types/Revoke';
import type {ReactElement} from 'react';
import type {TAddress} from '@builtbymom/web3/types/address';

const initialFilters = {
	unlimited: {
		filter: undefined
	},
	withBalance: {
		filter: undefined
	},
	asset: {
		filter: []
	},
	spender: {
		filter: []
	}
};

const defaultProps: TRevokeContext = {
	allowances: undefined,
	filteredAllowances: undefined,
	configuration: {
		tokenToCheck: undefined,
		tokensToCheck: [],
		tokenToRevoke: undefined,
		allowancesFilters: initialFilters
	},
	dispatchConfiguration: (): void => undefined,
	isDoneWithInitialFetch: false,
	isLoading: false,
	allowanceFetchingFromBlock: 0n,
	allowanceFetchingToBlock: 0n,
	isLoadingInitialDB: false
};

/**********************************************************************************************
 ** Here, we obtain distinctive tokens based on their token addresses to avoid making
 ** additional requests for the same tokens.
 *********************************************************************************************/
function getUniqueAllowancesByToken(allowances: TAllowances | undefined): TAllowances {
	const noDuplicatedStep0 = [...new Map(allowances?.map(item => [item.address, item])).values()];
	const noDuplicated = noDuplicatedStep0.filter(
		(item, index, self) =>
			index === self.findIndex(t => t.blockNumber === item.blockNumber && t.logIndex === item.logIndex)
	);
	return noDuplicated;
}

/**********************************************************************************************
 ** Here, we obtain distinctive allowances based on their spender addresses to avoid making
 ** additional requests for the same spender.
 *********************************************************************************************/
function getUniqueAllowancesBySpender(allowances: TAllowances | undefined): TAllowances {
	return [...new Map(allowances?.map(item => [item.args.sender, item])).values()];
}

const configurationReducer = (state: TRevokeConfiguration, action: TRevokeActions): TRevokeConfiguration => {
	switch (action.type) {
		case 'SET_TOKEN_TO_CHECK':
			return {...state, tokenToCheck: action.payload};
		case 'SET_FILTER':
			return {...state, allowancesFilters: action.payload};
		case 'SET_ALLOWANCE_TO_REVOKE':
			return {...state, tokenToRevoke: action.payload};
		case 'RESET_FILTER':
			return {...state, allowancesFilters: initialFilters};
	}
};

const RevokeContext = createContext<TRevokeContext>(defaultProps);
export const RevokeContextApp = (props: {
	children: TOptionalRenderProps<TRevokeContext, ReactElement>;
}): ReactElement => {
	const {address} = useWeb3();
	const [configuration, dispatch] = useReducer(configurationReducer, defaultProps.configuration);
	const {chainID, safeChainID} = useChainID();
	const {listTokensWithBalance, isLoadingOnCurrentChain} = useTokensWithBalance();

	const [chainFilteredAllowances, set_chainFilteredAllowances] = useState<TExpandedAllowance[]>([]);
	const [isLoadingInitialDB, set_isLoadingInitialDB] = useState(true);
	const {getAll, add, deleteByID} = useIndexedDBStore<TApproveEventEntry>('approve-events');
	const {currentEntry, updateChainSyncEntry} = useApproveEventsChainSync();
	const currentIdentifier = useRef<string | undefined>();

	/**********************************************************************************************
	 **This useEffect clears the filters when the user switches the chain.
	 *********************************************************************************************/
	useEffect(() => {
		dispatch({type: 'RESET_FILTER'});
	}, [chainID]);

	/**********************************************************************************************
	 ** A callback function that allows us to add entry into approve-events DB
	 *********************************************************************************************/
	const addApproveEventEntry = useCallback(
		async (entry: TApproveEventEntry) => {
			try {
				const entriesFromDB = await getAll();
				const duplicateAllowance = entriesFromDB.find(
					item =>
						isAddressEqual(item.address, entry.address) &&
						isAddressEqual(item.sender, entry.sender) &&
						item.blockNumber === entry.blockNumber &&
						item.logIndex === entry.logIndex
				);
				if (duplicateAllowance) {
					return;
				}

				const deprecateAllowance = entriesFromDB.find(
					item =>
						(isAddressEqual(item.address, entry.address) &&
							isAddressEqual(item.sender, entry.sender) &&
							entry.blockNumber > item.blockNumber) ||
						(entry.blockNumber === item.blockNumber && entry.logIndex > item.logIndex)
				);

				if (deprecateAllowance) {
					await deleteByID(deprecateAllowance.id);
				}

				if (entry.value === 0n) {
					return;
				}
				await add(entry);
			} catch (error) {
				//Do nothing
			}
		},
		[add, getAll, deleteByID]
	);

	/**********************************************************************************************
	 ** This hook is used to fetch historical allowances for the current address. We pass the
	 ** tokenAddresses array to the hook to fetch historical allowances for those tokens.
	 ** We also pass the fromBlock to the hook to fetch historical allowances from that block.
	 ** The fromBlock is retrieved from the indexDB. By default it will be set to -1, meaning the
	 ** fetching will not start until the fromBlock is set to a valid block number (aka indexDB is
	 ** done loading).
	 *********************************************************************************************/
	const {allowances, fromBlock, toBlock, isDoneWithInitialFetch, isLoadingAllowances, getAllowancesForToken} =
		useHistoricalAllowances({
			tokenAddresses: isLoadingOnCurrentChain
				? undefined
				: listTokensWithBalance(chainID).map(item => item.address),
			fromBlock: currentEntry ? currentEntry.blockNumber || 0n : -1n
		});

	/**********************************************************************************************
	 ** This bigass function is used to handle the allowances and process the raw data into a
	 ** more structured format. This function is triggered by the useAsyncTrigger hook with the
	 ** above allowances as main dependencies.
	 ** The identifier pattern is used to ensure that the function is not called multiple times
	 ** with the same data.
	 *********************************************************************************************/
	useAsyncTrigger(async () => {
		if (!allowances || !safeChainID || !isAddress(address) || !isDoneWithInitialFetch) {
			return;
		}
		if (allowances.length < 1) {
			set_isLoadingInitialDB(false);
			return;
		}

		/******************************************************************************************
		 ** We are getting a bunch of allowances, we first need to make sure that they are unique.
		 ** We will call the getUniqueAllowancesByToken function to get the unique allowances.
		 *****************************************************************************************/
		const uniqueAllowancesByToken = getUniqueAllowancesByToken(allowances);
		const uniqueAllowancesBySpender = getUniqueAllowancesBySpender(allowances);

		if (
			!uniqueAllowancesByToken ||
			uniqueAllowancesByToken.length < 1 ||
			!uniqueAllowancesBySpender ||
			uniqueAllowancesBySpender.length < 1
		) {
			set_isLoadingInitialDB(false);
			return;
		}

		/******************************************************************************************
		 ** Now, we can set an unique identifier for the current data set. If the identifier is
		 ** the same as the previous one, we will return and not process the data again.
		 ** This will save us some useless computing time
		 *****************************************************************************************/
		const identifier = createUniqueID(serialize({allowances, fromBlock, toBlock}));
		if (currentIdentifier.current === identifier) {
			return;
		}
		currentIdentifier.current = identifier;

		/******************************************************************************************
		 ** For each tokens in our list, we want to know the symbol, decimals, balanceOf and name.
		 ** We will form an array of calls to get this information from the blockchain.
		 **
		 ** TODO @Karlen9 this can be improved by only fetching tokens onces for the same address
		 ** and recomputing the structure later
		 *****************************************************************************************/
		const calls = [];
		for (const token of uniqueAllowancesByToken) {
			const from = {abi, address: toAddress(token.address), chainId: token.chainID};
			calls.push({...from, functionName: 'symbol'});
			calls.push({...from, functionName: 'decimals'});
			calls.push({...from, functionName: 'balanceOf', args: [address]});
			calls.push({...from, functionName: 'name'});
		}

		const data = await readContracts(retrieveConfig(), {contracts: calls});
		const dictionary: {[key: TAddress]: {symbol: string; decimals: number; balanceOf: bigint; name: string}} = {};
		if (data.length < 4) {
			// Stop if we don't have enough data
			set_isLoadingInitialDB(false);
			return;
		}

		/******************************************************************************************
		 ** Once we have an array of those additional fields, we form a dictionary
		 ** with key of an address and additional fields as a value.
		 *****************************************************************************************/
		for (let i = 0; i < uniqueAllowancesByToken.length; i++) {
			const idx = i * 4;
			const symbol = data[idx].result;
			const decimals = data[idx + 1].result;
			const balanceOf = data[idx + 2].result;
			const name = data[idx + 3].result;
			dictionary[uniqueAllowancesByToken[i].address] = {
				symbol: symbol as string,
				decimals: decimals as number,
				balanceOf: balanceOf as bigint,
				name: name as string
			};
		}
		const spenderDictionary: {[key: TAddress]: {name: string}} = {};

		/******************************************************************************************
		 ** Here, we're making request to get names for each spender contract.
		 *****************************************************************************************/
		const responses = await Promise.allSettled(
			uniqueAllowancesBySpender.map(async (allowance): Promise<{spender: TAddress; name: string}> => {
				return {
					spender: allowance.args.sender,
					name: (await axios.get(`${contractDataURL}${allowance.chainID}/${allowance.args.sender}.json`)).data
						.name
				};
			})
		);

		for (const response of responses) {
			if (response.status === 'fulfilled') {
				spenderDictionary[response.value.spender] = {name: response.value.name};
			}
		}

		/******************************************************************************************
		 ** Here we're expanding allowances array using the dictionary, and we are also saving the
		 ** data in the indexedDB.
		 *****************************************************************************************/
		const promises = allowances.map(async allowance => {
			const item = {
				address: allowance.address,
				args: allowance.args,
				blockNumber: allowance.blockNumber,
				symbol: dictionary[allowance.address]?.symbol,
				decimals: dictionary[allowance.address]?.decimals,
				balanceOf: toNormalizedBN(
					dictionary[allowance.address]?.balanceOf,
					dictionary[allowance.address]?.decimals
				),
				name: dictionary[allowance.address]?.name,
				chainID: allowance.chainID,
				logIndex: allowance.logIndex,
				spenderName: spenderDictionary[allowance.args.sender]?.name
			};
			return addApproveEventEntry({
				UID: `${item.chainID}_${item.address}_${item.args.sender}_${item.blockNumber}_${item.logIndex}`,
				address: item.address,
				blockNumber: item.blockNumber,
				symbol: item.symbol,
				decimals: item.decimals,
				chainID: item.chainID,
				owner: item.args.owner,
				sender: item.args.sender,
				value: item.args.value as bigint,
				balanceOf: item.balanceOf,
				name: item.name,
				logIndex: item.logIndex,
				spenderName: item.spenderName
			});
		});

		await Promise.all(promises);

		/******************************************************************************************
		 ** Now we want to retrieve all the items from the indexedDB and filter them by the
		 ** current address and chainID (aka current user for current chainID) and only deal with
		 ** them.
		 *****************************************************************************************/
		const itemsFromDB = await getAll();
		const lastAllowanceBlockNumber = chainFilteredAllowances[chainFilteredAllowances.length - 1]?.blockNumber || 0n;
		updateChainSyncEntry({address, chainID: safeChainID, blockNumber: lastAllowanceBlockNumber});

		/******************************************************************************************
		 ** Here we are formatting the allowances to be displayed in the UI.
		 *****************************************************************************************/
		const _formatedAllowances: TExpandedAllowance[] = [];
		for (const allowance of itemsFromDB) {
			_formatedAllowances.push({
				...allowance,
				args: {
					owner: allowance.owner,
					sender: allowance.sender,
					value: allowance.value
				}
			});
		}

		/******************************************************************************************
		 ** And finally we are filtering allowances by address and chainID to show them to user.
		 *****************************************************************************************/
		const filteredAllowances = _formatedAllowances.filter(
			item => isAddressEqual(item.args.owner, address) && item.chainID === safeChainID
		);
		set_chainFilteredAllowances(filteredAllowances);
		set_isLoadingInitialDB(false);
	}, [
		allowances,
		safeChainID,
		address,
		isDoneWithInitialFetch,
		fromBlock,
		toBlock,
		getAll,
		chainFilteredAllowances,
		updateChainSyncEntry,
		addApproveEventEntry
	]);

	useEffect(() => {
		set_isLoadingInitialDB(true);
	}, [chainID]);

	/**********************************************************************************************
	 ** We sequentially apply filters to the allowances based on the provided filter object. First,
	 ** we check for the presence of the 'unlimited' filter and apply it. Then, we move on to the
	 ** 'asset' filter, ensuring the array is not empty before filtering by assets. The same
	 ** process applies to the 'spender' filter.
	 *********************************************************************************************/
	const filteredAllowances = useDeepCompareMemo(() => {
		const filters = configuration.allowancesFilters;

		return chainFilteredAllowances?.filter(item => {
			if (filters.unlimited.filter === 'unlimited') {
				if (!isUnlimitedBN(item.args.value as bigint)) {
					return false;
				}
			} else if (filters.unlimited.filter === 'limited') {
				if (isUnlimitedBN(item.args.value as bigint)) {
					return false;
				}
			}

			if (filters.withBalance.filter === 'with-balance') {
				if (item.balanceOf && item.balanceOf.normalized === 0) {
					return false;
				}
			} else if (filters.withBalance.filter === 'without-balance') {
				if (item.balanceOf && item.balanceOf.normalized > 0) {
					return false;
				}
			}

			if (filters.asset.filter.length > 0) {
				if (!filters.asset.filter.includes(item.address)) {
					return false;
				}
			}

			if (filters.spender.filter.length > 0) {
				if (!filters.spender.filter.includes(item.args.sender)) {
					return false;
				}
			}

			return true;
		});
	}, [configuration.allowancesFilters, chainFilteredAllowances]);

	/**********************************************************************************************
	 ** Separate function to fetch approve events for additional tokenToCheck.
	 *********************************************************************************************/
	useAsyncTrigger(async () => {
		if (!configuration.tokenToCheck || !isAddress(address)) {
			return;
		}
		getAllowancesForToken(toAddress(configuration.tokenToCheck.address), 0n);
	}, [address, configuration.tokenToCheck, getAllowancesForToken]);

	const contextValue = useDeepCompareMemo(
		(): TRevokeContext => ({
			allowances: chainFilteredAllowances,
			filteredAllowances,
			dispatchConfiguration: dispatch,
			configuration,
			isDoneWithInitialFetch,
			isLoading: isLoadingAllowances,
			allowanceFetchingFromBlock: fromBlock || 0n,
			allowanceFetchingToBlock: toBlock || 0n,
			isLoadingInitialDB
		}),
		[
			chainFilteredAllowances,
			filteredAllowances,
			configuration,
			isDoneWithInitialFetch,
			isLoadingAllowances,
			fromBlock,
			toBlock,
			isLoadingInitialDB
		]
	);

	return (
		<RevokeContext.Provider value={contextValue}>
			{optionalRenderProps(props.children, contextValue)}
		</RevokeContext.Provider>
	);
};

export const useAllowances = (): TRevokeContext => {
	const ctx = useContext(RevokeContext);
	if (!ctx) {
		throw new Error('RevokeContext not found');
	}
	return ctx;
};
