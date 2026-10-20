Build and test **Gasback**, a Solidity contract (max preset: full audit + tests). Deploy it to Arc Testnet when the tests pass.

## Idea
On Arc, gas is paid in USDC. A merchant can therefore refund a customer's exact gas fee **in USDC, inside the same payment transaction, with no oracle**, so the customer pays exactly the sticker price. On any other chain this needs a price oracle, because gas is paid in a volatile token.

## Facts to verify on-chain first (report what you find)
- USDC ERC-20 interface at `0x3600000000000000000000000000000000000000` on both Arc Testnet and Arc mainnet (chain 5042). Read `decimals()`. Native gas USDC has 18 decimals.
- Check whether `block.basefee` is non-zero and meaningful on Arc (EIP-1559). If it isn't, use the merchant-set `maxGasPrice` clamp described below.

## Contract
- Constructor: `(IERC20 usdc, uint256 overheadGas)`. Both immutable. No owner, no admin, no upgradeability, no pause. Use SafeERC20, follow checks-effects-interactions, add a reentrancy guard on `pay`, custom errors and NatSpec.
- `struct Merchant { uint128 pool; uint64 maxRebatePerTx; uint64 maxGasPrice; bool exists; }` (maxRebate in USDC 6-dec units, maxGasPrice in wei).
- `registerMerchant(uint64 maxRebatePerTx, uint64 maxGasPrice)`
- `setLimits(uint64 maxRebatePerTx, uint64 maxGasPrice)`: merchant only
- `fundPool(uint128 amount)`: merchant only, transferFrom
- `withdrawPool(uint128 amount)`: merchant only, ≤ pool
- `pay(address merchant, uint256 amount, bytes32 orderRef) returns (uint256 rebate)`:
  1. `uint256 gasStart = gasleft();`
  2. Revert on: amount 0, unregistered merchant, `merchant == msg.sender`.
  3. `usdc.safeTransferFrom(msg.sender, merchant, amount)`. The payment goes straight to the merchant.
  4. `gasUsed = gasStart - gasleft() + overheadGas`
  5. `price = min(tx.gasprice, maxGasPrice)`, and if basefee is meaningful, also `min(price, block.basefee * 2)`. This stops a customer from inflating the gas price to drain the pool.
  6. `rebate = min(gasUsed * price / 10**(18 - usdcDecimals), maxRebatePerTx, pool)`
  7. `pool -= rebate`, then transfer the rebate to msg.sender if > 0. An empty pool still lets the payment succeed with rebate 0.
  8. `emit Paid(merchant, msg.sender, amount, orderRef, rebate, gasUsed, price)`
- View: `merchants(address)`, `quoteRebate(address merchant, uint256 estGas, uint256 gasPrice)`.
- Events: `MerchantRegistered`, `LimitsUpdated`, `PoolFunded`, `PoolWithdrawn`, `Paid`.

## Tests (Foundry; use a mock 6-decimal ERC-20 for unit tests)
- Happy path: the merchant receives exactly `amount`, the pool drops by `rebate`, the customer gets `rebate`, and the event fields are correct.
- **Calibration:** measure the real `gasUsed` of a `pay()` tx (vm.txGasPrice plus gas reporting) and choose `overheadGas` so the rebate is within ±5% of the real tx fee. Print the table: real fee vs rebate.
- The rebate is capped by `maxRebatePerTx`, by the pool, and by `maxGasPrice` (inflated `tx.gasprice` is clamped).
- An empty pool still lets the payment succeed with rebate 0.
- Reverts: zero amount, unregistered merchant, self-pay, double register, non-merchant fund/withdraw/setLimits, withdraw > pool, insufficient allowance.
- Fuzz: an invariant that the contract's USDC balance == the sum of all merchant pools, and that the merchant always receives the exact `amount`.

## Deploy
Deploy to Arc Testnet with the real USDC address and the calibrated `overheadGas`. Then run one live testnet `pay()` and report the receipt's actual fee vs the rebate. Report: test results, the calibrated overheadGas, the testnet address, and the tx hash.
