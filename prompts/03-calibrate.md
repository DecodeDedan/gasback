Four fixes, then report:

1. **Arc gas calibration.** Redeploy Gasback to Arc Testnet with `overheadGas = 38100`. That is the Arc overhead you measured on the fork (62,038 real gas − 23,939 measured internally); 9,940 was the Foundry figure. Then send one REAL testnet tx (not a fork): register a merchant, fund $0.50, and `pay()` $0.10 from a second wallet. Report the receipt's gasUsed × effectiveGasPrice next to the rebate and the % deviation. If it is outside ±5%, compute the correct overheadGas, redeploy with it, and repeat. Update `src/gasback-config.ts` to the final address and record the deploy block.

2. **maxGasPrice prefill.** Prefill with `eth_gasPrice × 3`, read live, instead of the constant 3e14.

3. **History.** `/stats`, the landing ticker totals and the merchant tables must cover ALL history since the deploy block (store `deployBlock` in the config). Page backwards in ≤9,000-block getLogs windows and cache the results in memory. Show a "syncing… N%" indicator while it backfills, and never silently truncate.

4. **Mainnet deploy script** (Arc Studio doesn't deploy to mainnet, so I'll run it myself). Add `contracts/script/DeployGasback.s.sol`: a Foundry script that reads `USDC_ADDRESS` (default 0x3600000000000000000000000000000000000000) and `OVERHEAD_GAS` (default the calibrated value) from env and deploys Gasback. It must work with `forge script contracts/script/DeployGasback.s.sol --rpc-url https://rpc.mainnet.arc.io --account <keystore> --broadcast`, and must contain no private keys or .env reads of keys. Also add a mainnet entry in `gasback-config.ts`, chain 5042, with `gasbackAddress` read from `VITE_GASBACK_MAINNET` so I can fill it in after deploying.

Run the tests and the lint/typecheck again, and report the results.
