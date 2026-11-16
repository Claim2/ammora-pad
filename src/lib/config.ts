// AmmoraPad platform Config.
// Template #6 is the reviewed GIWA concentrated-graduation template.
// The platform Config is created by the USER's wallet (MetaMask) in Phase 2;
// its id is written back here and to localStorage once the creation receipt
// is parsed. Until then it is null and the UI shows the template + a
// "create the Config" flow.
import type { Address } from "viem";
import type { TeamRecipients } from "./derive-config";

export const TEMPLATE_ID = 6;
export const TEMPLATE_HASH =
  "0x6048908774397e0691bb0e19f72dabb790eb0d892d6081d3622b39e7f738e667";
export const REGISTRY = "0x6d043014972b87406C4757a5f2d655A24e0b0aF9";

/** The user's wallet — Ammora account wallet (800 AP). All platform roles. */
export const PLATFORM_OWNER: Address = "0x28e3c13619894c8eb554b06c0dc1acf63358f2f8";

/** Platform Config id (set in Phase 2 after creation). Null until created. */
export const PLATFORM_CONFIG_ID: bigint | null = null;

/** localStorage key where the UI remembers the created Config id. */
export const PLATFORM_CONFIG_STORAGE_KEY = "ammorapad:platformConfigId";

/**
 * Platform launch economics (chosen in Phase 2, guide example values).
 * Base token: 9 decimals. Sale supply 1,000,000 tokens (raw 1e15).
 * Graduation threshold 0.001 WETH (raw 1e15, WETH 18 decimals).
 * The Config derivation re-solves the curve + migration reserves from these
 * two numbers, so they are the only economics the platform operator picks.
 */
export const DEFAULT_SALE_SUPPLY_RAW = 1_000_000_000_000_000n; // 1e15
export const DEFAULT_THRESHOLD_RAW = 1_000_000_000_000_000n; // 1e15
export const BASE_DECIMALS = 9;
export const QUOTE_DECIMALS = 18;

/**
 * Recipient roles for the platform Config. The user owns the launchpad, so
 * every role is their wallet: they are the Config owner, the fee claimer
 * (partnerRecipient), the migration liquidity partner, and the leftover
 * receiver. Protocol fees stay fixed by the deployment fee policy and cannot
 * be redirected by this file.
 */
export const TEAM_RECIPIENTS: TeamRecipients = {
  configOwner: PLATFORM_OWNER,
  partnerRecipient: PLATFORM_OWNER,
  liquidityPartner: PLATFORM_OWNER,
  leftoverReceiver: PLATFORM_OWNER,
};

/**
 * First demo token. Launched on the platform Config once it exists.
 * Metadata lives at public/tokens/apad.json; the launch metadataURI is the
 * deployed site's URL for that file (see README).
 */
export const DEMO_TOKEN = {
  name: "AmmoraPad Demo",
  symbol: "APAD",
  description:
    "First demo token on AmmoraPad — a bonding-curve launch on GIWA Sepolia that graduates into concentrated liquidity. Testnet only, no value.",
  image: "tokens/apad.svg",
  saleSupplyRaw: DEFAULT_SALE_SUPPLY_RAW,
  thresholdRaw: DEFAULT_THRESHOLD_RAW,
  decimals: BASE_DECIMALS,
} as const;
