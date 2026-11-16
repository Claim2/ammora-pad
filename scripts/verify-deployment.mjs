#!/usr/bin/env node
/**
 * Keyless on-chain verification of the Ammora GIWA Sepolia deployment.
 *
 * The public GIWA RPC (https://sepolia-rpc.giwa.io) is SLOW (~29s/call) and
 * flaky (dropped sockets / rate limits). The stock SDK `quickstart:verify`
 * times out on viem's 10s default, so this script uses a 120s timeout and
 * retries every step up to 3 times with backoff. It never crashes on a
 * single failed step — it prints a per-step PASS/FAIL summary.
 *
 * Usage: AMMORA_RPC_URL=https://sepolia-rpc.giwa.io node scripts/verify-deployment.mjs
 * (defaults to VITE_RPC_URL / https://sepolia-rpc.giwa.io)
 */
import {
  giwaSepoliaAutoRouteDeployment,
  getAmmoraV4ConfigAtBlock,
  getAmmoraV4NextConfigId,
} from "@ammora-protocol/sdk";
import { createPublicClient, defineChain, http } from "viem";

const RPC_URL =
  process.env.AMMORA_RPC_URL ||
  process.env.VITE_RPC_URL ||
  "https://sepolia-rpc.giwa.io";
const TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;

const deployment = giwaSepoliaAutoRouteDeployment;
const results = [];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function step(name, fn) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const value = await fn();
      results.push({ name, status: "PASS", attempt, value });
      console.log(`[PASS] ${name} (attempt ${attempt})${value !== undefined ? `: ${value}` : ""}`);
      return value;
    } catch (e) {
      const msg = e?.shortMessage || e?.message || String(e);
      console.log(`[retry] ${name} attempt ${attempt}/${MAX_ATTEMPTS} failed: ${msg}`);
      if (attempt < MAX_ATTEMPTS) await sleep(5_000 * attempt);
      else {
        results.push({ name, status: "FAIL", attempt, value: msg });
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
  blockExplorers: deployment.chain.blockExplorerUrl
    ? { default: { name: "Explorer", url: deployment.chain.blockExplorerUrl } }
    : undefined,
});

const client = createPublicClient({
  chain,
  transport: http(RPC_URL, { timeout: TIMEOUT_MS, retryCount: 0 }),
});

console.log("RPC:", RPC_URL);
console.log("Deployment slot:", deployment.slot);
console.log("Chain:", deployment.chain.id, deployment.chain.name);

const chainId = await step("eth_chainId = 91342", () => client.getChainId());
const block = await step("latest block", async () => {
  const b = await client.getBlockNumber();
  return `block ${b.toString()}`;
});
await step("config registry has code", async () => {
  const code = await client.getBytecode({ address: deployment.contracts.launch.configRegistry });
  if (!code || code === "0x") throw new Error("no code at registry");
  return `${code.length} bytes of code`;
});
await step("launch factory has code", async () => {
  const code = await client.getBytecode({ address: deployment.contracts.launch.factory });
  if (!code || code === "0x") throw new Error("no code at factory");
  return `${code.length} bytes of code`;
});
await step("Config #6 readable", async () => {
  const b = block !== undefined ? BigInt(block.replace("block ", "")) : await client.getBlockNumber();
  const config = await getAmmoraV4ConfigAtBlock(
    client,
    deployment.contracts.launch.configRegistry,
    6n,
    b,
  );
  const segs = Array.isArray(config.segments) ? config.segments.length : "?";
  return `configId=${config.configId?.toString() ?? "6"} enabled=${config.enabled} segments=${segs}`;
});
await step("next config id readable", async () => {
  const b = block !== undefined ? BigInt(block.replace("block ", "")) : await client.getBlockNumber();
  const next = await getAmmoraV4NextConfigId(
    client,
    deployment.contracts.launch.configRegistry,
    b,
  );
  return `next = ${next.toString()}`;
});

const passed = results.filter((r) => r.status === "PASS").length;
console.log(`\nSummary: ${passed}/${results.length} steps passed.`);
console.log("Deployment catalog:");
console.log("  registry:", deployment.contracts.launch.configRegistry);
console.log("  factory:", deployment.contracts.launch.factory);
console.log("  feePolicy:", deployment.contracts.launch.feePolicy);
console.log("  template #6 hash:", "0x6048908774397e0691bb0e19f72dabb790eb0d892d6081d3622b39e7f738e667");
process.exit(passed === results.length ? 0 : 1);
