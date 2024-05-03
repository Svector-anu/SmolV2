import {type ReactElement, useMemo, useState} from 'react';
import {CommandList} from 'cmdk';
import {Command, CommandEmpty, CommandInput, CommandItem} from 'lib/primitives/Commands';
import {ImageWithFallback} from 'packages/lib/common/ImageWithFallback';
import {supportedNetworks} from 'packages/lib/utils/tools.chains';
import {toSafeChainID} from '@builtbymom/web3/hooks/useChainID';
import {cl} from '@builtbymom/web3/utils';
import * as Popover from '@radix-ui/react-popover';
import {useIsMounted} from '@react-hookz/web';

export function NetworkInputSelector(props: {value: number; onChange: (value: number) => void}): ReactElement {
	const isMounted = useIsMounted();
	const safeChainID = toSafeChainID(props.value, Number(process.env.BASE_CHAINID));
	const isDev = process.env.NODE_ENV === 'development' && Boolean(process.env.SHOULD_USE_FORKNET);

	const currentNetwork = useMemo(
		() =>
			supportedNetworks.find(
				(network): boolean => network.id === safeChainID || (isDev && network.id === props.value)
			),
		[safeChainID, props.value, isDev]
	);
	const [isOpen, set_isOpen] = useState(false);
	return (
		<Popover.Root
			open={isOpen}
			onOpenChange={set_isOpen}>
			<Popover.Trigger asChild>
				<div className={'relative size-full h-20 rounded-lg'}>
					<button
						role={'combobox'}
						aria-expanded={isOpen}
						className={cl(
							'z-20 relative border transition-all',
							'flex justify-center items-center cursor-pointer',
							'focus:placeholder:text-neutral-300 placeholder:transition-colors',
							'aspect-square bg-neutral-0 rounded-lg border-neutral-400 size-full',
							'hover:bg-neutral-100 transition-colors hover:border-neutral-600'
						)}>
						<div className={'flex size-10 items-center justify-center'}>
							{isMounted() && currentNetwork?.name ? (
								<ImageWithFallback
									width={40}
									height={40}
									alt={currentNetwork.name}
									className={'size-10'}
									src={`${process.env.SMOL_ASSETS_URL}/chain/${currentNetwork.id}/logo-128.png`}
								/>
							) : (
								<div className={'size-10 rounded-full bg-neutral-400'} />
							)}
						</div>
					</button>
				</div>
			</Popover.Trigger>

			<Popover.Content
				className={cl(
					'z-50 min-w-[8rem] overflow-hidden rounded-md border border-neutral-400 bg-neutral-0 p-1',
					'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
					'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
					'data-[side=bottom]:slide-in-from-top-2',
					'DropdownMenuContent'
				)}
				style={{boxShadow: 'rgba(36, 40, 51, 0.08) 0px 0px 20px 8px'}}>
				<Command>
					<CommandInput placeholder={'Search chain...'} />
					<CommandEmpty>{'No chain found.'}</CommandEmpty>
					<CommandList className={'max-h-48 overflow-y-auto'}>
						{supportedNetworks.map(network => (
							<CommandItem
								key={network.id}
								value={network.name}
								className={cl(
									'relative flex cursor-pointer items-center rounded-lg p-2',
									'outline-none select-none transition-colors',
									'text-xs text-neutral-800 group',
									'focus:bg-neutral-300',
									'bg-neutral-0 hover:bg-neutral-200',
									currentNetwork?.id === network.id ? 'bg-neutral-200' : ''
								)}
								onSelect={selectedNetwork => {
									if (selectedNetwork === currentNetwork?.name) {
										return;
									}
									const chain = supportedNetworks.find(
										network => network.name.toLowerCase() === selectedNetwork.toLocaleLowerCase()
									);
									props.onChange(chain?.id || 1);
									set_isOpen(false);
								}}>
								<ImageWithFallback
									width={16}
									height={16}
									className={'mr-2'}
									alt={network.name}
									src={`${process.env.SMOL_ASSETS_URL}/chain/${network.id}/logo-32.png`}
								/>
								{network.name}
							</CommandItem>
						))}
					</CommandList>
				</Command>
			</Popover.Content>
		</Popover.Root>
	);
}
