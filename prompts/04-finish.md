Your last turn redeployed Gasback to Arc Testnet at 0xc0ad33f01758f9d0e15f4dc4c8ddfbc998477df0 (overheadGas 38100, verified on-chain). It stopped before finishing. Please complete these:

1. Point `src/gasback-config.ts` testnet at 0xc0ad33f01758f9d0e15f4dc4c8ddfbc998477df0 and add `deployBlock` (that contract's creation block).
2. Send a REAL testnet flow against it: register a merchant, fund $0.50, then `pay()` $0.10 from a second wallet. Report the receipt's gasUsed × effectiveGasPrice next to the rebate and the % deviation. If it is outside ±5%, tell me the correct overheadGas, but do NOT redeploy yet.
3. maxGasPrice prefill = live `eth_gasPrice × 3` (not the 3e14 constant).
4. `/stats`, the ticker totals and the merchant tables cover all history from `deployBlock`. Page in ≤9,000-block getLogs windows, cache in memory, show "syncing… N%", and never truncate silently.
5. **Mainnet deploy from the browser wallet** (Arc Studio doesn't sign mainnet, and I don't have Foundry): add a `/deploy` route. It is not linked from the nav. It shows the compiled Gasback bytecode and constructor args (USDC 0x3600000000000000000000000000000000000000, overheadGas prefilled with the calibrated value and editable). A "Deploy to Arc mainnet" button uses wagmi `deployContract` from the connected wallet on chain 5042 (with a switch-chain prompt), then shows the new address and tx with explorer.arc.io links and a copy button.
6. The mainnet config's `gasbackAddress` comes from `import.meta.env.VITE_GASBACK_MAINNET`, and `NETWORK` comes from `VITE_NETWORK` (`testnet` | `mainnet`, default testnet). Fail loudly in the UI if mainnet is selected with no address.

Re-run the tests and lint/typecheck, then report the results, the real testnet tx hashes and the deviation.
