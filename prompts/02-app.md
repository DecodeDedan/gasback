Now build the Gasback web app around the deployed Gasback contract in this workspace. Arc Testnet first. Put the network config (chain id, RPC, Gasback address, USDC address) in one config module, so switching to Arc mainnet (chain 5042, https://rpc.mainnet.arc.io, USDC 0x3600000000000000000000000000000000000000) means changing only the address and chain.

## Art direction
Dark, futuristic and dense, with a live feel, like an instrument panel. Not a template.
- Ink background (#0B0D10 to #12161B), text #E8ECEF, muted #8A949E, hairline borders #1F262E.
- Accent: electric amber #F5B53D for "gas" and the money in motion. Refund green #3FD39A for "refunded". No purple, no neon gradients, no glassmorphism.
- Numbers in a tabular mono font (JetBrains Mono or IBM Plex Mono), UI text in Inter. Amounts are shown in dollars, with sub-cent gas to 4–6 decimals ($0.002137).
- Signature moment, on the checkout receipt: a split bar shows **Paid $5.000000 → Gas burned $0.002137 → Gas refunded $0.002137 → Net cost $5.000000**, with the refund segment animating in (Framer Motion, ≤600ms). Respect prefers-reduced-motion.
- The landing hero has a live ticker of the latest `Paid` events and the total gas refunded, polling every 5s.
- Responsive from 360px, keyboard operable, visible focus rings, 4.5:1 contrast.

## Pages
1. **`/` landing**
   - The one-line pitch: "The price is the price. On Arc, gas is USDC, so merchants can refund it in the same transaction."
   - The live ticker.
   - Two CTAs: "I'm a merchant" and "Try a $0.10 checkout".
   - A 3-step "how it works" built from the real contract flow.
2. **`/merchant` dashboard**
   - Connect wallet. If not registered, show a register form (max rebate per tx in $, max gas price prefilled from the current network gas price ×3).
   - Once registered: pool balance, fund/withdraw (handles the approve step), limits editor, payments received, total gas refunded, and a table of recent Paid events.
   - Pay-link builder: amount + order ref → `/pay/<merchant>?amount=5&ref=order-42`, with a copy button and a QR code.
3. **`/pay/[merchant]` checkout**
   - Merchant address (shortened), amount, and "Gas included" badge, based on whether pool > 0 (use `quoteRebate` with an estimateGas of `pay`).
   - Big "Pay $X, gas included" button: approve if needed, then `pay`.
   - The receipt decodes the `Paid` event plus the tx receipt (gasUsed × effectiveGasPrice) and shows the split bar, the explorer links and the exact net cost.
   - If the pool is empty, warn: "This merchant isn't covering gas right now. You'll pay $X + ~$0.002 gas."
4. **`/stats`**: total payments, total volume, total gas refunded, merchant count, and the latest 50 Paid events (paginated, explorer links).

## States (all required)
- Wallet not connected, wrong network (offer a switch-chain button), insufficient USDC, approve pending, tx pending, success, user rejected, revert with the custom error decoded into plain English, RPC error with retry, empty lists ("No payments yet").

## Data
- Read events with getLogs in bounded block ranges (≤10k blocks per call, newest first). No unbounded scans.
- No mock or sample data anywhere. Every number comes from the chain.

Run it in the preview. Then do one full flow on testnet (register → fund $0.50 → pay $0.10 from a second wallet) and report the receipt numbers.
