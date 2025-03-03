import {usePlausible} from 'next-plausible';
import React, {useState} from 'react';
import {useAccount, useChainId} from 'wagmi';

import {Button} from '@lib/components/Button';
import {ErrorModal} from '@lib/components/ErrorModal';
import {SuccessModal} from '@lib/components/SuccessModal';
import {toBigInt} from '@lib/utils/numbers';
import {PLAUSIBLE_EVENTS} from '@lib/utils/plausible';
import {isEthAddress, isZeroAddress, toAddress} from '@lib/utils/tools.addresses';
import {defaultTxStatus} from '@lib/utils/tools.transactions';
import {TWEETER_SHARE_CONTENT} from '@lib/utils/twitter';
import {useSend} from 'app/(apps)/send/contexts/useSend';
import {useSendContext} from 'app/(apps)/send/contexts/useSendContext';

import type {ReactElement} from 'react';

export function SendWizard({isReceiverERC20}: {isReceiverERC20: boolean}): ReactElement {
	const chainID = useChainId();
	const {address} = useAccount();
	const {configuration, dispatchConfiguration} = useSendContext();
	const [migrateStatus, setMigrateStatus] = useState(defaultTxStatus);
	const {migratedTokens, onHandleMigration} = useSend(undefined, undefined, setMigrateStatus);

	const plausible = usePlausible();

	const isSendButtonDisabled =
		isZeroAddress(configuration.receiver?.address) ||
		isEthAddress(configuration.receiver.address) ||
		configuration.inputs.some(input => input.token && input.normalizedBigAmount.raw === toBigInt(0)) ||
		!configuration.inputs.every(input => input.isValid === true) ||
		isReceiverERC20;

	const errorModalContent =
		migratedTokens.length === 0
			? 'No tokens were sent, please try again.'
			: `${migratedTokens.map(token => token.token?.name).join(', ')} ${migratedTokens.length === 1 ? 'was' : 'were'} sent, please retry the rest.`;

	const onMigration = (): void => {
		onHandleMigration();
		plausible(PLAUSIBLE_EVENTS.SEND_TOKENS, {
			props: {
				sendChainID: chainID,
				sendTo: toAddress(configuration.receiver?.address),
				sendFrom: toAddress(address)
			}
		});
	};

	return (
		<>
			<Button
				id={'send-button'}
				className={'!h-8 w-full max-w-[240px] !text-xs'}
				isBusy={migrateStatus.pending}
				isDisabled={isSendButtonDisabled}
				onClick={onMigration}>
				<b>{'Send'}</b>
			</Button>
			<SuccessModal
				title={'Success!'}
				content={
					'Like a fancy bird, your tokens have migrated! They are moving to their new home, with their new friends.'
				}
				twitterShareContent={TWEETER_SHARE_CONTENT.SEND}
				ctaLabel={'Close'}
				isOpen={migrateStatus.success}
				onClose={(): void => {
					dispatchConfiguration({type: 'RESET', payload: undefined});
					setMigrateStatus(defaultTxStatus);
				}}
			/>

			<ErrorModal
				title={migratedTokens.length === 0 ? 'Error' : 'Partial Success'}
				content={errorModalContent}
				ctaLabel={'Close'}
				isOpen={migrateStatus.error}
				type={migratedTokens.length === 0 ? 'hard' : 'soft'}
				onClose={(): void => {
					setMigrateStatus(defaultTxStatus);
					setTimeout(() => {
						dispatchConfiguration({
							type: 'REMOVE_SUCCESFUL_INPUTS',
							payload: undefined
						});
					}, 500);
				}}
			/>
		</>
	);
}
