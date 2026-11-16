# AmmoraPad

A token launchpad built with the **Ammora SDK** on **GIWA Sepolia** (chain
91342). Create tokens with bonding curves, trade them before graduation, and
migrate them into concentrated-liquidity pools — no backend, no API key, just
your MetaMask.

This is an **Ammora project** (ammora.org builder mission). It is not a
GenLayer project; do not submit it to GenLayer.

## Status — Phase 1 (setup + scaffold)

- [x] Ammora examples cloned, `npm ci` clean, LAUNCHPAD / AGENT-LAUNCHPAD /
      PARTNER-QUICKSTART + SDK quickstart read.
- [x] Deployment catalog verified from the SDK (see below).
- [x] Fresh deployer wallet generated (testnet only). Private key at
      `.deployer-key` (mode 600, git-ignored, never committed).
- [x] Vite + React + TypeScript scaffold; READ paths wired (Config, curve
      state, quote, migration progress). Writes disabled until Phase 2.
- [x] `npm run build` passes.
- [x] Live on-chain verification (`npm run verify`) — **6/6 steps PASS**
      (2026-11-16, block 41479619): chain id 91342, registry 34,442 bytes of
      code, factory 33,978 bytes, **Config #6 readable: enabled=true,
      1 segment**, next config id 38 (37 configs exist on-chain). The public
      GIWA RPC answers in ~29s/call and drops ~half the calls, so the script
      retries each step (120s timeout, 3 attempts). Run it with `npm run verify`.
- [x] Phase 2 (2026-11-16): writes wired through injected MetaMask
      (create Config, create token, buy/sell, wrap, graduate, migrate,
      fee claims). Platform Config parameters + demo token recorded below.
      `npm run build` passes; `npm run verify-writes` **8/8 PASS** (live
      template #6 read, Config derived, all calldata builders verified —
      no transaction sent).
- [ ] Phase 3 (user signing steps): create the platform Config, launch the
      APAD demo token, buy, graduate, migrate, deploy, X post, submit to
      Ammora.

## Verified deployment (SDK catalog, GIWA Sepolia auto-route V4)

| Item | Value |
| --- | --- |
| Chain | GIWA Sepolia, 91342 |
| Deployment slot | v4-auto-route-20260917 |
| Launch protocol | V4 |
| Config registry | 0x6d043014972b87406C4757a5f2d655A24e0b0aF9 |
| Launch factory | 0x35353a2Dab7426EcCAe6f5FB267702a542ab68fA |
| Fee policy | 0x17B44C14F640fD429740FA3220f47a567c62725C |
| Template | #6, concentrated graduation |
| Template hash | 0x6048908774397e0691bb0e19f72dabb790eb0d892d6081d3622b39e7f738e667 |
| RPC (public) | https://sepolia-rpc.giwa.io (slow, ~29s/call, rate-limited) |
| Explorer | https://sepolia-explorer.giwa.io |
| SDK | @ammora-protocol/sdk 0.3.9 (MIT), Math 0.3.0 |

Live verification (2026-11-16, `npm run verify`, 6/6 PASS at block
41479619): chain id 91342, runtime code at registry (34,442 bytes) and
factory (33,978 bytes), **Config #6 readable: enabled=true, 1 segment**,
next config id 38. See `scripts/verify-deployment.mjs` (120s timeout,
3 attempts per step — the public RPC drops ~half the calls).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into dist/
npm run verify     # keyless on-chain deployment check (slow RPC: minutes)
npm run verify-writes  # live template read + all write builders, no broadcast
```

## How it works

1. **Discover** — the home page shows the platform Config and every token
   launched through it (registry in `public/tokens/index.json`), plus a
   lookup for any curve by address.
2. **Create** — a token form (name, symbol, supply, graduation threshold).
   Submitting launches through MetaMask on the platform Config (Phase 2,
   wired).
3. **Token page** — live curve state (reserves, fee, status), graduation
   progress, buy/sell box with live quotes, wrap ETH→WETH, graduate,
   migrate, and fee claims (Phase 2, wired).
4. **Wallet** — MetaMask injected only (`window.ethereum`). No WalletConnect
   project id needed. The app refuses the wrong chain and offers to switch
   to GIWA Sepolia.

## Phase 2 — writes (wired, not yet signed)

All writes go through the connected MetaMask (`window.ethereum` via viem
`walletClient`). No private key is ever held by the app. Each flow plans
the transaction first (fresh block, quote, slippage guard), shows it, then
asks MetaMask to sign. A rejected signature reports cleanly; nothing is
retried. Approvals are exact-amount, never infinite.

### Platform Config (template #6)

| Item | Value |
| --- | --- |
| Template | #6, concentrated graduation (hash `0x604890…667`) |
| Config owner | `0x28e3c13619894c8eb554b06c0dc1acf63358f2f8` (user's wallet) |
| partnerRecipient (fee claimer) | user's wallet |
| liquidityPartner | user's wallet |
| leftoverReceiver | user's wallet |
| Sale supply | 1,000,000 tokens (9 decimals, raw 1e15) |
| Graduation threshold | 0.001 WETH (raw 1e15) |
| Derived total supply | 1,010,204,081,632,818 raw (verified live) |
| Derived migration base | 10,204,081,632,818 raw (verified live) |
| Pool creation fee | **0 wei** (template #6 — launch costs gas only) |

Derivation: read template #6 live → `deriveConfigFromTemplate` (port of the
examples, using `@ammora-protocol/math` for the curve helpers) → override
the three recipients → `buildCreateAmmoraV4Config` → review hash. Verify
without sending: `npm run verify-writes` (8/8 PASS, 2026-11-16, block
41480574). Create it in the app: home page → "Create platform Config" →
Preview → Create. The new Config id is parsed from the receipt and saved
to localStorage (`ammorapad:platformConfigId`).

### Demo token — APAD

| Item | Value |
| --- | --- |
| Name / symbol | AmmoraPad Demo / APAD |
| Decimals | 9 |
| Sale supply / threshold | 1,000,000 tokens / 0.001 WETH |
| Metadata | `public/tokens/apad.json` (+ `apad.svg` logo) |
| Metadata URI at launch | `<deployed-site>/tokens/apad.json` (the Create form defaults to the current site origin when it is https) |

Launch it in the app: Create page → fill the form (prefilled with APAD) →
"Create token in MetaMask". The receipt names the token + curve addresses;
add them to `public/tokens/index.json` so the token appears on the home page.

### Write flows (all in the UI)

1. **Wrap ETH → WETH** (Token page, swap box) — buys pay in WETH.
   `buildAmmoraPortableWrapTransaction`. One signature.
2. **Buy / Sell** (Token page, swap box) — Get quote (live read) → Buy/Sell
   re-plans at a fresh block (min-out, 0.5% slippage, fill must be "full")
   → balance check → exact-amount ERC-20 approve to the curve if short →
   `swapExactInput`. Up to two signatures (approve + swap).
3. **Graduate** (Token page, when Active) — boundary buy (1% slippage,
   `allowPartialFill`, input = remaining threshold + 1% headroom; excess
   refunded) → migrate into the ARL pool. Two signatures.
4. **Migrate** (Token page, when ReadyToMigrate) — `planMigrateAtBlock`.
   One signature, permissionless.
5. **Claim launch fees** (Token page) — reads the factory FeeVault + what
   the connected wallet is owed (WETH); sends `claimFor` only when owed > 0.
   One signature.
6. **Claim LP fees** (Token page, after migration) — paste the LP position
   NFT tokenId; `DammV2Client.planClaimManagedConcentratedFees`. One signature.

### Signing order (for the browser task / user)

1. Home → Connect MetaMask (user's wallet `0x28e3…f2f8`, GIWA Sepolia).
2. Home → "Create platform Config" → Preview → Create. Note the Config id.
3. Create page → launch APAD on that Config id. Note token + curve addresses.
4. Add APAD to `public/tokens/index.json`, rebuild, redeploy (or launch from
   the deployed site so the metadata URI is public).
5. Token page → Wrap 0.001–0.002 ETH → Buy APAD (small amount).
6. Token page → Graduate (buys the remaining threshold, then migrates).
7. Token page → Claim launch fees (WETH) once trades have accrued fees.
8. Screenshot each step for the X post; submit to Ammora.

Expected MetaMask approvals: Config (1), launch (1), wrap (1), buy
(approve 1 + swap 1), graduate (approve 1 + fill 1 + migrate 1), claim (1).
Gas is <0.1 Gwei; the wallet holds ~0.0198 ETH — plenty.

## Deployment (static, ready)

`dist/` builds cleanly (868K, relative asset paths, `tokens/` copied) and
can be hosted as static files with no backend. Options (all free):
Vercel, Netlify, Cloudflare Pages, or GitHub Pages (needs the public repo
first). Deploy with `npm run build` then upload `dist/` (or connect the
repo for auto-deploys). The launch metadata URI must be the deployed
site's `/tokens/apad.json` URL.

## Funding

The user's wallet `0x28e3c13619894c8eb554b06c0dc1acf63358f2f8` holds ~0.0198
ETH on GIWA Sepolia (verified on-chain 2026-11-16 17:34 WIB) — already
funded; no faucet claim needed. The fresh deployer wallet from Phase 1
(`0x2De58BAa…`) is set aside per the user's instruction ("pake wallet
ini", 2026-11-16 17:31 WIB); its key stays mode 600 at `.deployer-key`,
never used. If more test ETH is ever needed: https://faucet.giwa.io
(0.005 ETH/24h, browser PoW) or https://faucet.lambda256.io/giwa-sepolia
(Nodit, 0.01 ETH/24h).

## Known limits

- The public GIWA RPC is very slow (~29s per call) and rate-limited. The UI
  shows loading states and uses a 60s transport timeout. A faster RPC can be
  set via `VITE_RPC_URL` (e.g. Nodit, free signup).
- Token discovery reads the local registry (`public/tokens/index.json`);
  on-chain event scanning for all launched tokens is a future enhancement.
- SDK 0.3.9 types gap: `buildSingleSegmentCurve` / `concentratedDepositQuote`
  exist at runtime in `@ammora-protocol/sdk` but are missing from its
  `.d.ts`, so the derivation imports them from `@ammora-protocol/math`
  0.3.0 (properly typed). The examples repo's `config-from-template.ts`
  imports them from the SDK and would fail `tsc` for the same reason.

## Links

- Ammora docs: https://docs.ammora.org
- SDK quickstart: https://docs.ammora.org/ai/sdk-quickstart.md
- Examples: https://github.com/AmmoraLabs/ammora-examples
- Launchpad guide: `../ammora-examples/LAUNCHPAD.md`
- Research: `../ammora-sdk-research.md`
