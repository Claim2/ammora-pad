// AmmoraPad — Ammora SDK + viem wiring (GIWA Sepolia, auto-route V4).
// READ paths are fully wired. Writes (create / buy / sell / graduate) are
// implemented in Phase 2, after the deployer wallet is funded.
// The public GIWA RPC is slow (~29s per call from this VM) and rate-limited:
// every read shows a loading state and the transport timeout is 60s. A faster
// RPC (e.g. Nodit, free signup) can be set via VITE_RPC_URL.
import {
  giwaSepoliaAutoRouteDeployment,
  getAmmoraV4ConfigAtBlock,
  getAmmoraV4NextConfigId,
  AmmoraV4LaunchCurveClient,
} from "@ammora-protocol/sdk";
import { createPublicClient, createWalletClient, custom, defineChain, http } from "viem";
import type { Address, Chain, PublicClient, WalletClient } from "viem";

export const deployment = giwaSepoliaAutoRouteDeployment;

export const CHAIN_ID = 91342;

export const chain: Chain = defineChain({
  id: deployment.chain.id,
  name: deployment.chain.name,
  nativeCurrency: deployment.chain.nativeCurrency,
  rpcUrls: {
    default: { http: [import.meta.env.VITE_RPC_URL || "https://sepolia-rpc.giwa.io"] },
  },
  blockExplorers: deployment.chain.blockExplorerUrl
    ? { default: { name: "Explorer", url: deployment.chain.blockExplorerUrl } }
    : undefined,
});

export const RPC_URL: string =
  import.meta.env.VITE_RPC_URL || "https://sepolia-rpc.giwa.io";

export const EXPLORER_URL: string | undefined = deployment.chain.blockExplorerUrl;

/** Read-only client. 60s timeout because the public GIWA RPC is very slow. */
export function publicClient(): PublicClient {
  return createPublicClient({
    chain,
    transport: http(RPC_URL, { timeout: 60_000, retryCount: 1 }),
  });
}

/** Signing client from the connected MetaMask (injected provider only). */
export function walletClient(): WalletClient {
  const ethereum = (window as unknown as { ethereum?: unknown }).ethereum;
  if (!ethereum) throw new Error("MetaMask (window.ethereum) not found");
  return createWalletClient({ chain, transport: custom(ethereum as never) });
}

export const configRegistry: Address = deployment.contracts.launch
  .configRegistry as Address;
export const launchFactory: Address = deployment.contracts.launch
  .factory as Address;

export type LaunchConfigEntry = Awaited<
  ReturnType<typeof getAmmoraV4ConfigAtBlock>
>;

/** Read one launch Config by id (keyless). */
export async function readConfig(
  client: PublicClient,
  configId: bigint,
  blockNumber?: bigint,
): Promise<LaunchConfigEntry> {
  const block = blockNumber ?? (await client.getBlockNumber());
  return getAmmoraV4ConfigAtBlock(client, configRegistry, configId, block);
}

/** How many Configs exist (next id). Keyless. */
export async function nextConfigId(
  client: PublicClient,
  blockNumber?: bigint,
): Promise<bigint> {
  const block = blockNumber ?? (await client.getBlockNumber());
  return getAmmoraV4NextConfigId(client, configRegistry, block);
}

/** List the first N Configs (keyless). Slow on the public RPC — one call each. */
export async function listConfigs(
  client: PublicClient,
  count = 10,
): Promise<LaunchConfigEntry[]> {
  const block = await client.getBlockNumber();
  const next = await getAmmoraV4NextConfigId(client, configRegistry, block);
  const total = Number(next > 17n ? 16n : next - 1n);
  const ids = Array.from({ length: Math.min(total, count) }, (_, i) => BigInt(i + 1));
  const out: LaunchConfigEntry[] = [];
  for (const id of ids) {
    out.push(await getAmmoraV4ConfigAtBlock(client, configRegistry, id, block));
  }
  return out;
}

export type CurveState = Awaited<
  ReturnType<AmmoraV4LaunchCurveClient["getStateAtBlock"]>
>;

export type CurveQuote = Awaited<
  ReturnType<AmmoraV4LaunchCurveClient["quoteExactInputAtBlock"]>
>;

/** Build a connected curve client (needs the launch core: factory + feePolicy). */
export function curveClient(client: PublicClient, curve: Address): AmmoraV4LaunchCurveClient {
  return new AmmoraV4LaunchCurveClient(client, curve, {
    launchFactory: launchFactory,
    feePolicy: deployment.contracts.launch.feePolicy as Address,
  });
}

/** Read a bonding curve's live state (keyless). */
export async function readCurveState(
  client: PublicClient,
  curve: Address,
  blockNumber?: bigint,
): Promise<CurveState> {
  const cc = curveClient(client, curve);
  if (blockNumber !== undefined) return cc.getStateAtBlock(blockNumber);
  return cc.getState();
}

/**
 * Quote an exact-input trade (keyless).
 * side "buy": quote token -> base token (baseForQuote=false).
 * side "sell": base token -> quote token (baseForQuote=true).
 */
export async function quoteExactInput(
  client: PublicClient,
  curve: Address,
  side: "buy" | "sell",
  amountRaw: bigint,
  blockNumber?: bigint,
): Promise<CurveQuote> {
  const cc = curveClient(client, curve);
  const baseForQuote = side === "sell";
  if (blockNumber !== undefined) {
    return cc.quoteExactInputAtBlock(amountRaw, baseForQuote, blockNumber);
  }
  return cc.quoteExactInput(amountRaw, baseForQuote);
}

/** Graduation progress: { ready, migrated, current, target } (keyless). */
export async function readMigrationProgress(
  client: PublicClient,
  curve: Address,
  blockNumber?: bigint,
) {
  const cc = curveClient(client, curve);
  const block = blockNumber ?? (await client.getBlockNumber());
  return cc.getMigrationProgressAtBlock(block);
}

/** Curve status codes: 0 Uninitialized, 1 Active, 2 ReadyToMigrate, 3 Migrated. */
export function curveStatusLabel(status: number): string {
  switch (status) {
    case 0:
      return "Uninitialized";
    case 1:
      return "Active";
    case 2:
      return "Ready to migrate";
    case 3:
      return "Migrated";
    default:
      return `Unknown (${status})`;
  }
}

/** Shorten an address for display. */
export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Format a raw bigint amount with `decimals` into a human string. */
export function formatAmount(raw: bigint, decimals: number, precision = 4): string {
  const s = raw.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals) || "0";
  const frac = s.slice(-decimals).slice(0, precision).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

// ---------------------------------------------------------------------------
// WRITE paths (Phase 2). Every planner below only BUILDS a transaction and
// returns it for the user to review. Nothing is sent here. Sending happens
// through the connected MetaMask (injected walletClient) in the components,
// via `sendTransaction`, so the user signs each step in their own wallet.
// A rejected signature (MetaMask code 4001) is reported, never retried.
// ---------------------------------------------------------------------------
import {
  AmmoraV4MigrationMode,
  ammoraLaunchFactoryV4Abi,
  ammoraLaunchPoolV4Abi,
  buildAmmoraPortableWrapTransaction,
  buildClaimFeeVaultFor,
  buildCreateAmmoraV4Launch,
  classifyAmmoraV4ExactInputFill,
  DammV2Client,
  feeVaultAbi,
  parseAmmoraV4ConfigCreatedReceipt,
  parseAmmoraV4LaunchCreatedReceipt,
  parseAmmoraV4MigratedReceipt,
  verifyAmmoraV4CoreAtBlock,
} from "@ammora-protocol/sdk";
import { encodeFunctionData, erc20Abi, zeroAddress } from "viem";
import { planTeamConfig, type TeamRecipients } from "./derive-config";

/** WETH on GIWA Sepolia — the quote asset for every bonding curve. */
export const WETH: Address = deployment.contracts.tokens.wrappedNative as Address;
export const NATIVE_ROUTER: Address = deployment.contracts.routers.native as Address;
export const GRADUATION_ADAPTER: Address = deployment.contracts.launch
  .graduationAdapter as Address;
export const FEE_POLICY: Address = deployment.contracts.launch.feePolicy as Address;

function launchCore() {
  return {
    configRegistry,
    launchFactory,
    graduationAdapter: GRADUATION_ADAPTER,
    feePolicy: FEE_POLICY,
  };
}

/** Connected MetaMask addresses (empty when not connected). */
export async function connectedAccounts(): Promise<Address[]> {
  return walletClient().getAddresses();
}

export function isUserRejection(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { code?: unknown; message?: string; shortMessage?: string };
  if (err.code === 4001) return true;
  const msg = `${err.shortMessage ?? ""} ${err.message ?? ""}`.toLowerCase();
  return msg.includes("user rejected") || msg.includes("user denied");
}

export function friendlyError(e: unknown): string {
  if (isUserRejection(e)) return "Signature rejected in MetaMask — nothing was sent.";
  return e instanceof Error ? e.message : "Transaction failed.";
}

export interface TxRequest {
  to: Address;
  data: `0x${string}`;
  value?: bigint;
}

/**
 * Send a reviewed transaction through MetaMask and wait for its receipt.
 * The user approves (or rejects) in their own wallet. Returns the receipt.
 */
export async function sendTransaction(
  tx: TxRequest,
  confirmations = 1,
): Promise<ReturnType<PublicClient["waitForTransactionReceipt"]>> {
  const wc = walletClient();
  const [account] = await wc.getAddresses();
  if (!account) throw new Error("No wallet connected — connect MetaMask first.");
  const hash = await wc.sendTransaction({
    account,
    chain,
    to: tx.to,
    data: tx.data,
    value: tx.value ?? 0n,
  });
  const client = publicClient();
  return client.waitForTransactionReceipt({ hash, confirmations });
}

/**
 * Ensure `owner` has approved at least `amount` of `token` for `spender`.
 * Sends an exact-amount ERC-20 approve (never infinite) only when the current
 * allowance is short. Returns the approve tx hash, or null when no approve
 * was needed.
 */
export async function ensureAllowance(
  token: Address,
  spender: Address,
  amount: bigint,
  owner: Address,
): Promise<`0x${string}` | null> {
  const client = publicClient();
  const allowance = await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (allowance >= amount) return null;
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
  });
  const receipt = await sendTransaction({ to: token, data });
  return receipt.transactionHash;
}

/** Read a token balance (keyless). */
export async function tokenBalance(token: Address, owner: Address): Promise<bigint> {
  return publicClient().readContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
}

// --- Platform Config -------------------------------------------------------

export interface PlannedConfig {
  transaction: TxRequest;
  reviewHash: `0x${string}`;
  economics: {
    saleAllocationRaw: bigint;
    grossMigrationBaseRaw: bigint;
    grossMigrationQuoteRaw: bigint;
    migrationQuoteFeeRaw: bigint;
    quoteSurplusToProtocolRaw: bigint;
    lockedBaseRaw: bigint;
    totalSupplyRaw: bigint;
  };
  poolCreationFee: bigint;
  tokenDecimals: number;
}

/**
 * Plan the platform Config from template #6 (read live, then derive).
 * Returns the registry calldata + review hash. Nothing is sent.
 */
export async function planCreateConfig(
  saleSupply: bigint,
  quoteThreshold: bigint,
  recipients: TeamRecipients,
): Promise<PlannedConfig> {
  const client = publicClient();
  const block = await client.getBlockNumber();
  await verifyAmmoraV4CoreAtBlock(client, launchCore(), block);
  const template = await readConfig(client, BigInt(6), block);
  if (!template.enabled) throw new Error("Template Config #6 is disabled.");
  if (template.config.migrationMode !== AmmoraV4MigrationMode.Concentrated) {
    throw new Error("Template #6 is not a concentrated-graduation template.");
  }
  const plan = planTeamConfig(template, recipients, configRegistry, saleSupply, quoteThreshold);
  return {
    transaction: plan.transaction,
    reviewHash: plan.reviewHash,
    economics: plan.economics,
    poolCreationFee: template.config.poolCreationFee,
    tokenDecimals: template.config.tokenDecimals,
  };
}

/** Parse a Config-creation receipt into its new Config id. */
export function parseConfigCreated(
  receipt: Parameters<typeof parseAmmoraV4ConfigCreatedReceipt>[0],
) {
  return parseAmmoraV4ConfigCreatedReceipt(receipt, configRegistry);
}

// --- Token launch ----------------------------------------------------------

export interface PlannedLaunch {
  transaction: TxRequest;
  poolCreationFee: bigint;
  tokenDecimals: number;
  configId: bigint;
}

/**
 * Plan a token launch on an existing platform Config. The creator pays the
 * pool creation fee in ETH (tx value). Nothing is sent.
 */
export async function planCreateLaunch(
  configId: bigint,
  name: string,
  symbol: string,
  metadataURI: string,
): Promise<PlannedLaunch> {
  const client = publicClient();
  const block = await client.getBlockNumber();
  await verifyAmmoraV4CoreAtBlock(client, launchCore(), block);
  const entry = await readConfig(client, configId, block);
  if (!entry.enabled) throw new Error(`Config #${configId} is disabled.`);
  const tokenDecimals = entry.config.tokenDecimals;
  const built = buildCreateAmmoraV4Launch(
    { name, symbol, metadataURI, creatorMetadataURI: metadataURI, tokenDecimals },
    configId,
    entry.config.poolCreationFee,
  );
  return {
    transaction: { to: launchFactory, data: built.data, value: built.value },
    poolCreationFee: entry.config.poolCreationFee,
    tokenDecimals,
    configId,
  };
}

/** Parse a launch receipt into the new token + curve addresses. */
export function parseLaunchCreated(
  receipt: Parameters<typeof parseAmmoraV4LaunchCreatedReceipt>[0],
) {
  return parseAmmoraV4LaunchCreatedReceipt(receipt, launchFactory);
}

// --- Swaps (bonding curve) -------------------------------------------------

export interface PlannedSwap {
  transaction: TxRequest;
  approval: { token: Address; spender: Address; amount: bigint };
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  expectedOut: bigint;
  minimumOut: bigint;
  fee: bigint;
  amountLeft: bigint;
}

/**
 * Plan an exact-input swap on a bonding curve, at a fresh block, with a
 * minimum-output slippage guard. Mirrors the examples' `planCurveAtBlock`.
 * Ordinary trades must fill in full; set `graduationBoundary` for the final
 * fill that graduates the curve (it consumes only what remains fillable).
 * Nothing is sent. The caller must approve `approval` first (exact amount).
 */
export async function planSwap(
  curve: Address,
  side: "buy" | "sell",
  amountRaw: bigint,
  recipient: Address,
  slippageBps = 50,
  graduationBoundary = false,
): Promise<PlannedSwap> {
  if (amountRaw <= 0n) throw new Error("Amount must be positive.");
  if (slippageBps < 0 || slippageBps > 1000) {
    throw new Error("Slippage must be 0–1000 bps.");
  }
  const client = publicClient();
  const block = await client.getBlockNumber();
  await verifyAmmoraV4CoreAtBlock(client, launchCore(), block);
  const cc = curveClient(client, curve);
  const state = await cc.getStateAtBlock(block);
  const factoryToken = await client.readContract({
    address: launchFactory,
    abi: ammoraLaunchFactoryV4Abi,
    functionName: "tokenForCurve",
    args: [curve],
    blockNumber: block,
  });
  if (
    factoryToken === zeroAddress ||
    factoryToken.toLowerCase() !== state.baseToken.toLowerCase() ||
    state.feePolicy.toLowerCase() !== FEE_POLICY.toLowerCase()
  ) {
    throw new Error("Curve is not bound to the reviewed V4 factory and fee policy.");
  }
  if (state.status !== 1) {
    throw new Error(`Curve status ${state.status} is not active (1).`);
  }
  const baseForQuote = side === "sell";
  const tokenIn = baseForQuote ? state.baseToken : state.quoteToken;
  const tokenOut = baseForQuote ? state.quoteToken : state.baseToken;
  const quote = await cc.quoteExactInputAtBlock(amountRaw, baseForQuote, block);
  const fill = classifyAmmoraV4ExactInputFill(quote, baseForQuote);
  if (graduationBoundary ? fill.kind !== "graduation-boundary" : fill.kind !== "full") {
    throw new Error(
      `Unexpected fill ${fill.kind}; ordinary orders must fill in full and ` +
        `graduation buys must reach the boundary.`,
    );
  }
  const minimumOut = (quote.amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
  if (minimumOut === 0n) throw new Error("Minimum output rounds to zero.");
  const head = await client.getBlock({ blockNumber: block });
  const deadline = head.timestamp + 20n * 60n;
  const data = encodeFunctionData({
    abi: ammoraLaunchPoolV4Abi,
    functionName: "swapExactInput",
    args: [amountRaw, minimumOut, baseForQuote, graduationBoundary, recipient, deadline],
  });
  return {
    transaction: { to: curve, data },
    approval: { token: tokenIn, spender: curve, amount: amountRaw },
    tokenIn,
    tokenOut,
    amountIn: amountRaw,
    expectedOut: quote.amountOut,
    minimumOut,
    fee: quote.fee,
    amountLeft: quote.amountLeft,
  };
}

// --- Graduation + migration ------------------------------------------------

/**
 * Plan the permissionless migration of a ReadyToMigrate (status 2) curve
 * into its canonical ARL concentrated pool. Nothing is sent.
 */
export async function planMigrate(curve: Address): Promise<{ transaction: TxRequest }> {
  const client = publicClient();
  const block = await client.getBlockNumber();
  const cc = curveClient(client, curve);
  const state = await cc.getStateAtBlock(block);
  if (state.status === 3) throw new Error("Curve already migrated.");
  if (state.status !== 2) {
    throw new Error(`Migration requires ReadyToMigrate (2), observed ${state.status}.`);
  }
  const plan = await cc.planMigrateAtBlock(block);
  return { transaction: { to: plan.transaction.to, data: plan.transaction.data } };
}

/** Parse a migration receipt into the canonical ARL pool address. */
export function parseMigrated(
  receipt: Parameters<typeof parseAmmoraV4MigratedReceipt>[0],
  curve: Address,
) {
  return parseAmmoraV4MigratedReceipt(receipt, curve);
}

// --- Wrap ETH -> WETH ------------------------------------------------------

/** Build the wrap transaction (ETH -> WETH) for a buy. Nothing is sent. */
export function planWrap(amountRaw: bigint): TxRequest {
  if (amountRaw <= 0n) throw new Error("Wrap amount must be positive.");
  const tx = buildAmmoraPortableWrapTransaction(
    {
      kind: "WRAPPED_ERC20",
      nativeDecimals: 18,
      wrappedToken: WETH,
      wrappedTokenDecimals: 18,
      nativeRouter: NATIVE_ROUTER,
    },
    amountRaw,
  );
  return { to: tx.to, data: tx.data, value: tx.value };
}

// --- Fee claims ------------------------------------------------------------

/** The factory's FeeVault address (creator + partner launch fees settle here). */
export async function feeVaultAddress(): Promise<Address> {
  const client = publicClient();
  const block = await client.getBlockNumber();
  return client.readContract({
    address: launchFactory,
    abi: ammoraLaunchFactoryV4Abi,
    functionName: "feeVault",
    blockNumber: block,
  }) as Promise<Address>;
}

/** How much of `token` the FeeVault owes `beneficiary` (keyless). */
export async function claimableFees(
  feeVault: Address,
  token: Address,
  beneficiary: Address,
): Promise<bigint> {
  const client = publicClient();
  const block = await client.getBlockNumber();
  return client.readContract({
    address: feeVault,
    abi: feeVaultAbi,
    functionName: "claimable",
    args: [token, beneficiary],
    blockNumber: block,
  }) as Promise<bigint>;
}

/** Build the creator/partner fee-claim calldata for a FeeVault. Nothing is sent. */
export function planClaimFees(
  feeVault: Address,
  token: Address,
  beneficiary: Address,
  recipient: Address = beneficiary,
): TxRequest {
  const { data } = buildClaimFeeVaultFor(token, beneficiary, recipient);
  return { to: feeVault, data };
}

/**
 * Build an LP fee claim for a migrated (concentrated) pool position.
 * Needs the position NFT tokenId. Nothing is sent.
 */
export async function planClaimLpFees(
  pool: Address,
  tokenId: bigint,
  recipient: Address,
  caller: Address,
): Promise<TxRequest> {
  const client = publicClient();
  const arl = new DammV2Client(client, pool, "concentrated");
  const tx = await arl.planClaimManagedConcentratedFees(tokenId, recipient, caller);
  return { to: tx.to, data: tx.data };
}
