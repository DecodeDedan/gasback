# Gasback: resume notes (Arc Microgrants Round 2)

Last updated 2026-10-20. Read this first in a new session.

## What exists
- **App (live, Arc MAINNET):** https://gasback-coral.vercel.app (Vercel project `crypt/gasback`, CLI user `softcysec`; deploy with `cd app && npx vercel@latest deploy --prod --yes`)
- **Repo:** https://github.com/DecodeDedan/gasback (public, commit b2029f8 on main). gh: switch to DecodeDedan to push, then back to okwareddevnest. Commits are SSH-signed with `~/.ssh/fingo_ed25519`, which has a passphrase, so run `git commit` in the user's terminal.
- **Arc Studio project:** https://studio.arc.io/app/6b16cd5e-94db-4d94-bc25-8b859ef0c2c8 (CLI session `gasback`; prompts in `prompts/01…06`)
- **Mainnet contract:** `0x6389e393197d575f0cf737f3d063b9f6eefc8202`
  - deploy tx `0xec80082c78ca4a0e075024e52fff7da35ced1e012e40258e4a1ca27b2ec88338`, block 26928006
  - `overheadGas` 42000
- **Testnet contract:** `0xc0ad33f01758f9d0e15f4dc4c8ddfbc998477df0`
  - E2E 13/13 passed; `Paid` tx `0xb2b2d67db26d32f004b340199eb7415a2cee66ad5e5c669897724b99b9776a13`
- **Vercel env (production):**
  - `VITE_NETWORK=mainnet`
  - `VITE_GASBACK_MAINNET=0x6389…8202`
  - `VITE_GASBACK_MAINNET_BLOCK=26928006`
- **User wallet (Brave):** `0x454D3Feb5dD4c579267B62071a1cA8F963FC7268`
  - mainnet: about $0.31 USDC, deployed the contract, not yet registered as a merchant on mainnet
  - testnet: registered merchant with a $5 pool on the testnet contract
- **E2E test wallets (testnet only):** keys in `~/.gasback/e2e-testnet-keys.json` (chmod 600, never commit). Run with `cd app && E2E_KEYS=~/.gasback/e2e-testnet-keys.json node scripts/e2e-testnet.ts`.

## Still to do (in order)
1. **Mainnet demo transaction (required for submission).** The user does it in Brave; Claude can't sign.
   - Register at /merchant, then fund the pool with $0.05 (approve, then Add to pool).
   - Send $0.10 USDC on Arc to the second Brave account.
   - Open the pay link for $0.05 from that account and pay.
   - Then verify on-chain from `app/`: `node scripts/verify-mainnet-paid.ts` (scans every `Paid` event; or pass the tx hash). PASS means the rebate is within ±5% of gasUsed × effectiveGasPrice. As of 2026-10-22 there are no merchants and no `Paid` events on mainnet.
2. **Demo video.** Rendered: `video/out/render.mp4`, 5:04 (303.6 s), current rebrand. Once the mainnet payment exists, add its tx to the proof scene (`e3` in `video/script.json`), and trim ~4 s if the limit is a hard 5:00, then re-render (`video/capture/build.mjs`).
3. **Arc Studio is in sync (done 2026-10-22).** Local files were uploaded, Arc Studio's lint fixes were pulled back, and `scripts/verify-mainnet-paid.ts` was added there too. Production (Vercel) still runs the pre-lint-fix build: redeploy with `cd app && npx vercel@latest deploy --prod --yes` so all three match.
4. **Commit and push the remaining work.** README: add the mainnet `Paid` tx. Add the video source (`video/` is gitignored for now; commit the source, not `out/`). Commit RESUME.md too.
5. **Submit** at the Arc Microgrants page with:
   - the Arc Studio URL
   - the live app URL
   - the contract and tx links on explorer.arc.io
   - the repo
   - the video
   - a short description
   - builder profile: GitHub DecodeDedan

## Gotchas learned
- Brave Shields blocks `rpc.testnet.arc.io` / `rpc.mainnet.arc.io` (ERR_BLOCKED_BY_CLIENT). The app proxies through `/rpc/arc-*` (vercel.json + vite proxy).
- Brave Wallet can't estimate gas on Arc and tips around 117 gwei. `app/src/hooks/usePreparedWrite.ts` simulates every call, sets gas, and prices at base fee + 1 gwei.
- Brave shows "Send 0 USDC" for contract calls. That's normal: the contract pulls USDC via the approval.
- The Arc Studio daily limit stops turns mid-way: check `arc-studio usage` before sending one.
- Claude in Chrome would not connect from Brave in this session.
