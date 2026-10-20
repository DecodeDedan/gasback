<p align="center"><img src="brand/gasback-logo.svg" alt="gasback" width="360"></p>

<p align="center">
  <a href="https://gasback-coral.vercel.app"><b>Live app (Arc mainnet)</b></a> ·
  <a href="https://studio.arc.io/app/6b16cd5e-94db-4d94-bc25-8b859ef0c2c8"><b>Arc Studio project</b></a> ·
  <a href="https://explorer.arc.io/address/0x6389e393197d575f0cf737f3d063b9f6eefc8202"><b>Mainnet contract</b></a>
</p>

> **The price is the price.** On Arc, gas is paid in USDC, so a merchant can refund the buyer's exact gas fee **inside the same payment transaction**, with no oracle. Pay $5.00, spend $5.00.

## Why this only works on Arc

On every other EVM chain, gas is paid in a volatile token. To absorb a customer's gas, an app needs a price oracle, a relayer or account abstraction, and the customer still needs a second token to press "pay".

On Arc the fee and the payment are the **same asset**. A contract can measure the gas it burned (`gasleft()` × `tx.gasprice`) and pay it back in USDC, at the same value, in the same transaction. Gasback turns that property into a one-call checkout any Arc merchant, dapp or DAO can offer.

## How it works

1. **A merchant funds a gas pool.** `registerMerchant(maxRebatePerTx, maxGasPrice)` then `fundPool(amount)`. No owner, no admin, no upgrade path.
2. **The buyer pays the sticker price.** `pay(merchant, amount, orderRef)`: the full amount goes straight to the merchant.
3. **Gas comes back in the same transaction.**
   `rebate = min(gasUsed × min(tx.gasprice, maxGasPrice, 2 × basefee), maxRebatePerTx, pool)`. That's paid from the merchant's pool to the buyer, and a `Paid` event records the amount, rebate, gasUsed and gasPrice.

`overheadGas` covers the gas a contract cannot see from inside itself (intrinsic cost, calldata, the final transfer). It was measured on Arc, not guessed: Foundry's 9,940 was wrong for Arc; a fork measurement gave 38,100; a real testnet payment showed 3,897 more gas, so mainnet uses **42,000**.

## Deployments

| Network | Contract | Proof |
|---|---|---|
| **Arc mainnet** (5042) | [`0x6389e393197d575f0cf737f3d063b9f6eefc8202`](https://explorer.arc.io/address/0x6389e393197d575f0cf737f3d063b9f6eefc8202) | deploy tx [`0xec80082c…2ec88338`](https://explorer.arc.io/tx/0xec80082c78ca4a0e075024e52fff7da35ced1e012e40258e4a1ca27b2ec88338) |
| Arc testnet (5042002) | [`0xc0ad33f01758f9d0e15f4dc4c8ddfbc998477df0`](https://explorer.testnet.arc.io/address/0xc0ad33f01758f9d0e15f4dc4c8ddfbc998477df0) | `Paid` tx [`0xb2b2d67d…b9776a13`](https://explorer.testnet.arc.io/tx/0xb2b2d67db26d32f004b340199eb7415a2cee66ad5e5c669897724b99b9776a13) |

USDC (ERC-20 interface): `0x3600000000000000000000000000000000000000`, 6 decimals. Native gas USDC has 18 decimals.

## Built with Arc Studio

The contract, tests, audit, testnet deploys and the app were built in Arc Studio, driven from the Arc Studio CLI (`arc-studio run --session gasback`). Every prompt sent is in [`prompts/`](prompts):

| Prompt | What Arc Studio did |
|---|---|
| [01-contract](prompts/01-contract.md) | Wrote `Gasback.sol` and 34 Foundry tests (unit, fuzz, invariant). Ran a max-preset audit and Slither (0 issues, 102 detectors). Deployed to Arc testnet. |
| [02-app](prompts/02-app.md) | Built the React + wagmi app: landing, merchant dashboard, checkout, stats. |
| [03-calibrate](prompts/03-calibrate.md) | Redeployed with Arc-measured `overheadGas`, then fixed history paging and gas-price defaults. |
| [04-finish](prompts/04-finish.md), [05-resume](prompts/05-resume.md) | Added the wallet-signed mainnet `/deploy` route and the env-driven network config. |
| [06-sync](prompts/06-sync.md) | Synced the brand, UI and hardening work back into the Arc Studio project. |

Arc Studio does not sign mainnet transactions, so the mainnet deploy was signed by the builder's own wallet from the app's `/deploy` page.

## Tested end to end

`app/scripts/e2e-testnet.ts` runs the full lifecycle on Arc testnet with two throwaway wallets. Keys come from `E2E_KEYS` and are never committed. Last run, **13/13 checks passed**:
- register, and double register blocked
- fund pool
- buyer pays $0.10, and the merchant receives exactly $0.10
- `Paid` emitted
- refund within ±5% of the real fee
- buyer net cost ≈ sticker price
- pool pays the rebate
- self-pay, zero amount, unregistered merchant and over-withdraw all blocked
- withdraw

Hardening found by testing in a real browser wallet (Brave):
- **RPC proxy:** Brave Shields blocks Arc's RPC host (`ERR_BLOCKED_BY_CLIENT`), so the app sends reads through its own domain (`/rpc/arc-mainnet`, a Vercel rewrite) and falls back to the direct endpoint.
- **Explicit gas and fees:** Brave couldn't estimate gas on Arc and tipped 117 gwei, which would push the price past the refund cap. The app now simulates every call, sets the gas limit itself, and prices at base fee + 1 gwei.

## Run it

```bash
cd app
bun install
bun run dev        # http://localhost:5173 (testnet by default)
bun test           # unit tests for parsing and the pump meter
bunx tsc --noEmit  # typecheck
```

Environment variables (see `app/.env.example`):
- `VITE_NETWORK` (`testnet` | `mainnet`)
- `VITE_GASBACK_MAINNET`
- `VITE_GASBACK_MAINNET_BLOCK`
- `VITE_DEMO_MERCHANT`

## What's next

- **Rebate SDK:** a one-line `gasback.pay()` for any Arc checkout.
- Subscriptions and invoices with gas included.
- Merchant analytics.
- A Centscan integration that shows each Gasback merchant's real cost per checkout.

---

Built on Arc with Arc Studio · by [okwaretech.com](https://okwaretech.com)
