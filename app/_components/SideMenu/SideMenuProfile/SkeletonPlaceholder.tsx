import {AddressBookEntryAddress} from '@lib/components/AddressBookEntry';
import {Avatar} from '@lib/components/Avatar';
import {NetworkPopoverSelector} from '@lib/components/NetworkSelector/Popover';

import type {ReactElement} from 'react';

export function SkeletonPlaceholder(): ReactElement {
	return (
		<section className={'p-4'}>
			<div className={'flex gap-2'}>
				<Avatar
					sizeClassname={'h-10 w-10 min-w-[40px]'}
					isLoading
					address={undefined}
					src={undefined}
				/>
				<AddressBookEntryAddress
					isConnecting
					address={undefined}
					ens={undefined}
				/>
			</div>

			<hr className={'mb-2 mt-4 text-neutral-200'} />

			<div className={'grid grid-cols-4 gap-6 md:grid-cols-5'}>
				<div className={'col-span-1 md:col-span-3'}>
					<small className={'text-xxs'}>{'Chain'}</small>
					<NetworkPopoverSelector />
				</div>
				<div className={'col-span-1 col-start-4 md:col-span-2'}>
					<small className={'text-xxs'}>{'Coin'}</small>
					<div className={'skeleton-lg mt-1 h-6'} />
				</div>
			</div>
		</section>
	);
}
