export const GASBACK_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: 'usdc_', type: 'address', internalType: 'contract IERC20' },
      { name: 'overheadGas_', type: 'uint256', internalType: 'uint256' },
    ],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'fundPool',
    inputs: [{ name: 'amount', type: 'uint128', internalType: 'uint128' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'merchants',
    inputs: [{ name: '', type: 'address', internalType: 'address' }],
    outputs: [
      { name: 'pool', type: 'uint128', internalType: 'uint128' },
      { name: 'maxRebatePerTx', type: 'uint64', internalType: 'uint64' },
      { name: 'maxGasPrice', type: 'uint64', internalType: 'uint64' },
      { name: 'exists', type: 'bool', internalType: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'overheadGas',
    inputs: [],
    outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'pay',
    inputs: [
      { name: 'merchant', type: 'address', internalType: 'address' },
      { name: 'amount', type: 'uint256', internalType: 'uint256' },
      { name: 'orderRef', type: 'bytes32', internalType: 'bytes32' },
    ],
    outputs: [{ name: 'rebate', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'quoteRebate',
    inputs: [
      { name: 'merchant', type: 'address', internalType: 'address' },
      { name: 'estGas', type: 'uint256', internalType: 'uint256' },
      { name: 'gasPrice', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [{ name: 'rebate', type: 'uint256', internalType: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'registerMerchant',
    inputs: [
      { name: 'maxRebatePerTx', type: 'uint64', internalType: 'uint64' },
      { name: 'maxGasPrice', type: 'uint64', internalType: 'uint64' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'setLimits',
    inputs: [
      { name: 'maxRebatePerTx', type: 'uint64', internalType: 'uint64' },
      { name: 'maxGasPrice', type: 'uint64', internalType: 'uint64' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'usdc',
    inputs: [],
    outputs: [{ name: '', type: 'address', internalType: 'contract IERC20' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'withdrawPool',
    inputs: [{ name: 'amount', type: 'uint128', internalType: 'uint128' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'event',
    name: 'LimitsUpdated',
    inputs: [
      { name: 'merchant', type: 'address', indexed: true, internalType: 'address' },
      { name: 'maxRebatePerTx', type: 'uint64', indexed: false, internalType: 'uint64' },
      { name: 'maxGasPrice', type: 'uint64', indexed: false, internalType: 'uint64' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MerchantRegistered',
    inputs: [
      { name: 'merchant', type: 'address', indexed: true, internalType: 'address' },
      { name: 'maxRebatePerTx', type: 'uint64', indexed: false, internalType: 'uint64' },
      { name: 'maxGasPrice', type: 'uint64', indexed: false, internalType: 'uint64' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'Paid',
    inputs: [
      { name: 'merchant', type: 'address', indexed: true, internalType: 'address' },
      { name: 'customer', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amount', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'orderRef', type: 'bytes32', indexed: true, internalType: 'bytes32' },
      { name: 'rebate', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'gasUsed', type: 'uint256', indexed: false, internalType: 'uint256' },
      { name: 'gasPrice', type: 'uint256', indexed: false, internalType: 'uint256' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PoolFunded',
    inputs: [
      { name: 'merchant', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amount', type: 'uint128', indexed: false, internalType: 'uint128' },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'PoolWithdrawn',
    inputs: [
      { name: 'merchant', type: 'address', indexed: true, internalType: 'address' },
      { name: 'amount', type: 'uint128', indexed: false, internalType: 'uint128' },
    ],
    anonymous: false,
  },
  {
    type: 'error',
    name: 'AlreadyRegistered',
    inputs: [],
  },
  {
    type: 'error',
    name: 'InsufficientPool',
    inputs: [],
  },
  {
    type: 'error',
    name: 'NotMerchant',
    inputs: [],
  },
  {
    type: 'error',
    name: 'SelfPay',
    inputs: [],
  },
  {
    type: 'error',
    name: 'UnregisteredMerchant',
    inputs: [],
  },
  {
    type: 'error',
    name: 'ZeroAmount',
    inputs: [],
  },
] as const;
