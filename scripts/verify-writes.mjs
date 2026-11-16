#!/usr/bin/env node
/**
 * Verify the Phase 2 write builders end-to-end WITHOUT broadcasting.
 *
 * Reads template #6 live from GIWA Sepolia (slow public RPC — 120s timeout,
 * 3 attempts per step), then runs the exact derivation the frontend uses:
 *   template -> deriveConfigFromTemplate -> planTeamConfig (recipients =
 *   the user's wallet) -> buildCreateAmmoraV4Config calldata + review hash
 *   -> buildCreateAmmoraV4Launch calldata + pool creation fee (value)
 *   -> swapExactInput calldata encoding (dummy curve, pure)
 *   -> wrap ETH->WETH calldata (pure)
 *   -> FeeVault claim calldata (pure)
 * Nothing is signed or sent. Exit 0 when every builder produces valid
 * calldata; exit 1 otherwise.
 *
 * Usage: node scripts/verify-writes.mjs
 */
import {
  AmmoraV4MigrationMode,
  ammoraLaunchPoolV4Abi,
  assertAmmoraV4Config,
  buildAmmoraPortableWrapTransaction,
  buildClaimFeeVaultFor,
  buildCreateAmmoraV4Config,
  buildCreateAmmoraV4Launch,
  getAmmoraV4ConfigAtBlock,
  giwaSepoliaAutoRouteDeployment,
} from "@ammora-protocol/sdk";
import {
  buildSingleSegmentCurve,
  concentratedDepositQuote,
} from "@ammora-protocol/math";
import { createPublicClient, defineChain, encodeFunctionData, http } from "viem";

const RPC_URL =
  process.env.AMMORA_RPC_URL ||
  process.env.VITE_RPC_URL ||
  "https://sepolia-rpc.giwa.io";
const TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;
const USER = "0x28e3c13619894c8eb554b06c0dc1acf63358f2f8";
const SALE_SUPPLY = 1_000_000_000_000_000n;
const THRESHOLD = 1_000_000_000_000_000n;

const deployment = giwaSepoliaAutoRouteDeployment;
const results = [];
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function step(name, fn) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const value = await fn();
      results.push({ name, status: "PASS", attempt });
      console.log(`[PASS] ${name} (attempt ${attempt})${value !== undefined ? `: ${value}` : ""}`);
      return value;
    } catch (e) {
      const msg = e?.shortMessage || e?.message || String(e);
      console.log(`[retry] ${name} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${msg}`);
      if (attempt < MAX_ATTEMPTS) await sleep(5_000 * attempt);
      else {
        results.push({ name, status: "FAIL", attempt });
        console.log(`[FAIL] ${name}: ${msg}`);
        return undefined;
      }
    }
  }
}

const chain = defineChain({
  id: deployment.chain.id,
  name: deployment.chain.name,
  nativeCurrency: deployment.chain.nativeCurrency,
  rpcUrls: { default: { http: [RPC_URL] } },
});
const client = createPublicClient({
  chain,
  transport: http(RPC_URL, { timeout: TIMEOUT_MS, retryCount: 0 }),
});

console.log("RPC:", RPC_URL);
console.log("User wallet (owner/recipients):", USER);

const block = await step("latest block", () => client.getBlockNumber());
if (block === undefined) {
  console.log("\nCannot reach the RPC — write builders below still run on a cached template shape only if available; aborting live part.");
  process.exit(1);
}

const template = await step("read template Config #6", async () => {
  const t = await getAmmoraV4ConfigAtBlock(
    client,
    deployment.contracts.launch.configRegistry,
    6n,
    block,
  );
  if (!t.enabled) throw new Error("template #6 disabled");
  if (t.config.migrationMode !== AmmoraV4MigrationMode.Concentrated) {
    throw new Error("template #6 is not concentrated graduation");
  }
  return t;
});
if (!template) process.exit(1);

// --- Derive (mirrors src/lib/derive-config.ts) ---
const derived = await step("derive Config from template #6", () => {
  const curve = buildSingleSegmentCurve(
    template.config.startSqrtPrice,
    SALE_SUPPLY,
    THRESHOLD,
  );
  const segment = curve[0];
  if (!segment) throw new Error("no segment");
  const range = {
    sqrtPriceX64: segment.upperSqrtPrice,
    sqrtMinPriceX64: segment.lowerSqrtPrice,
    sqrtMaxPriceX64: segment.upperSqrtPrice * 2n,
  };
  const quoteFee = (THRESHOLD * BigInt(template.config.migrationQuoteFeeBps)) / 10_000n;
  const quoteAfterFee = THRESHOLD - quoteFee;
  const destination = concentratedDepositQuote(range, { quoteAmount: quoteAfterFee });
  const vesting = template.config.lockedBaseVesting;
  const lockedBase =
    vesting.cliffUnlockAmount + vesting.amountPerPeriod * BigInt(vesting.numberOfPeriods);
  const config = {
    ...template.config,
    partnerRecipient: USER,
    leftoverReceiver: USER,
    liquidityDistribution: { ...template.config.liquidityDistribution, partner: USER },
    totalSupply: SALE_SUPPLY + destination.baseAmount + lockedBase,
    migrationQuoteThreshold: THRESHOLD,
    migrationBaseThreshold: destination.baseAmount,
    postMigrationSqrtMinPrice: range.sqrtMinPriceX64,
    postMigrationSqrtMaxPrice: range.sqrtMaxPriceX64,
    postMigrationLiquidity: destination.liquidity,
  };
  assertAmmoraV4Config(config, curve);
  return { config, curve, economics: {
    totalSupplyRaw: config.totalSupply,
    grossMigrationBaseRaw: destination.baseAmount,
    grossMigrationQuoteRaw: destination.quoteAmount,
    migrationQuoteFeeRaw: quoteFee,
  } };
});
if (!derived) process.exit(1);
console.log("  totalSupply:", derived.economics.totalSupplyRaw.toString());
console.log("  migrationBase:", derived.economics.grossMigrationBaseRaw.toString());
console.log("  poolCreationFee:", template.config.poolCreationFee.toString(), "wei");
console.log("  tokenDecimals:", template.config.tokenDecimals);

const configTx = await step("buildCreateAmmoraV4Config calldata", () => {
  const { data } = buildCreateAmmoraV4Config(derived.config, derived.curve, USER);
  if (!data || data === "0x") throw new Error("empty calldata");
  return `${data.length} hex chars`;
});
if (!configTx) process.exit(1);

await step("buildCreateAmmoraV4Launch calldata + value", () => {
  const built = buildCreateAmmoraV4Launch(
    {
      name: "AmmoraPad Demo",
      symbol: "APAD",
      metadataURI: "https://ammorapad.example/tokens/apad.json",
      creatorMetadataURI: "https://ammorapad.example/tokens/apad.json",
      tokenDecimals: template.config.tokenDecimals,
    },
    38n,
    template.config.poolCreationFee,
  );
  if (!built.data || built.data === "0x") throw new Error("empty calldata");
  if (built.value !== template.config.poolCreationFee) throw new Error("value != poolCreationFee");
  return `${built.data.length} hex chars, value ${built.value} wei`;
});

await step("encode swapExactInput calldata (pure)", () => {
  const data = encodeFunctionData({
    abi: ammoraLaunchPoolV4Abi,
    functionName: "swapExactInput",
    args: [1000n, 990n, false, false, USER, 1_800_000_000n],
  });
  if (!data.startsWith("0x") || data.length < 10) throw new Error("bad calldata");
  return `${data.length} hex chars`;
});

await step("build wrap ETH->WETH calldata (pure)", () => {
  const tx = buildAmmoraPortableWrapTransaction(
    {
      kind: "WRAPPED_ERC20",
      nativeDecimals: 18,
      wrappedToken: deployment.contracts.tokens.wrappedNative,
      wrappedTokenDecimals: 18,
      nativeRouter: deployment.contracts.routers.native,
    },
    1_000_000_000_000_000n,
  );
  if (!tx.data || tx.data === "0x") throw new Error("empty calldata");
  return `to ${tx.to}, value ${tx.value}`;
});

await step("build FeeVault claim calldata (pure)", () => {
  const { data } = buildClaimFeeVaultFor(
    deployment.contracts.tokens.wrappedNative,
    USER,
    USER,
  );
  if (!data || data === "0x") throw new Error("empty calldata");
  return `${data.length} hex chars`;
});

const passed = results.filter((r) => r.status === "PASS").length;
console.log(`\nSummary: ${passed}/${results.length} steps passed. No transaction was sent.`);
process.exit(passed === results.length ? 0 : 1);
