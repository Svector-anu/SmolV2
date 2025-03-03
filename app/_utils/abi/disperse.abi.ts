export const DISPERSE_ABI = [
	{
		constant: false,
		inputs: [
			{name: 'token', type: 'address'},
			{name: 'recipients', type: 'address[]'},
			{name: 'values', type: 'uint256[]'}
		],
		name: 'disperseTokenSimple',
		outputs: [],
		payable: false,
		stateMutability: 'nonpayable',
		type: 'function'
	},
	{
		constant: false,
		inputs: [
			{name: 'token', type: 'address'},
			{name: 'recipients', type: 'address[]'},
			{name: 'values', type: 'uint256[]'}
		],
		name: 'disperseToken',
		outputs: [],
		payable: false,
		stateMutability: 'nonpayable',
		type: 'function'
	},
	{
		constant: false,
		inputs: [
			{name: 'recipients', type: 'address[]'},
			{name: 'values', type: 'uint256[]'}
		],
		name: 'disperseEther',
		outputs: [],
		payable: true,
		stateMutability: 'payable',
		type: 'function'
	}
] as const;
