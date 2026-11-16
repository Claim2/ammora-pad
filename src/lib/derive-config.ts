// AmmoraPad — derive a platform Config from a reviewed template.
//
// Port of the Ammora examples' `config-from-template.ts` +
// `team/policy.ts` (MIT, github.com/AmmoraLabs/ammora-examples).
// The examples import `buildSingleSegmentCurve` / `concentratedDepositQuote`
// from "@ammora-protocol/sdk", but SDK 0.3.9 only re-exports them at runtime
// (missing from its .d.ts). We import them from "@ammora-protocol/math"
// 0.3.0 instead, where they are properly typed.
//
// A launch Config has dozens of coupled fields (fee schedule, rate limiter,
// dynamic fee, graduation mode, post-migration pool shape, vesting). Writing
// them from scratch is how a launch ends up with a graduation that can never
// reconcile, so we read template #6, change only the sale supply, the
// graduation threshold and the team recipients, and let the SDK validate the
// result before any calldata is built.
import {
  AmmoraV4MigrationMode,
  assertAmmoraV4Config,
  buildCreateAmmoraV4Config,
  type AmmoraV4Config,
  type AmmoraV4ConfigSnapshot,
  type AmmoraV4Segment,
} from "@ammora-protocol/sdk";
import {
  buildSingleSegmentCurve,
  concentratedDepositQuote,
} from "@ammora-protocol/math";
import { encodeAbiParameters, getAddress, keccak256, type Address, type Hex } from "viem";

export interface TeamRecipients {
  configOwner: Address;
  partnerRecipient: Address;
  liquidityPartner: Address;
  leftoverReceiver: Address;
}

export interface DerivedConfig {
  config: AmmoraV4Config;
  curve: readonly AmmoraV4Segment[];
  economics: {
    saleAllocationRaw: bigint;
    grossMigrationBaseRaw: bigint;
    grossMigrationQuoteRaw: bigint;
    migrationQuoteFeeRaw: bigint;
    quoteSurplusToProtocolRaw: bigint;
    lockedBaseRaw: bigint;
    totalSupplyRaw: bigint;
  };
}

/**
 * Derive a complete, registry-valid Config from a reviewed template.
 * Template #6 is the concentrated-graduation template.
 */
export function deriveConfigFromTemplate(
  template: Pick<AmmoraV4ConfigSnapshot, "config">,
  saleSupply: bigint,
  migrationQuoteThreshold: bigint,
): DerivedConfig {
  if (saleSupply <= 0n || migrationQuoteThreshold <= 0n) {
    throw new RangeError("sale supply and quote threshold must be positive");
  }
  if (template.config.migrationMode !== AmmoraV4MigrationMode.Concentrated) {
    throw new RangeError(
      "this helper supports concentrated graduation only; " +
        "use a reviewed compounding authoring policy instead of rewriting " +
        "its coupled reserves",
    );
  }

  const curve = buildSingleSegmentCurve(
    template.config.startSqrtPrice,
    saleSupply,
    migrationQuoteThreshold,
  );
  const segment = curve[0];
  if (!segment) throw new Error("single-segment curve construction returned no segment");

  const range = {
    sqrtPriceX64: segment.upperSqrtPrice,
    sqrtMinPriceX64: segment.lowerSqrtPrice,
    sqrtMaxPriceX64: segment.upperSqrtPrice * 2n,
  };
  const quoteFee =
    (migrationQuoteThreshold * BigInt(template.config.migrationQuoteFeeBps)) / 10_000n;
  const quoteAfterFee = migrationQuoteThreshold - quoteFee;
  const destination = concentratedDepositQuote(range, { quoteAmount: quoteAfterFee });
  const vesting = template.config.lockedBaseVesting;
  const lockedBase =
    vesting.cliffUnlockAmount +
    vesting.amountPerPeriod * BigInt(vesting.numberOfPeriods);
  const config: AmmoraV4Config = {
    ...template.config,
    totalSupply: saleSupply + destination.baseAmount + lockedBase,
    migrationQuoteThreshold,
    migrationBaseThreshold: destination.baseAmount,
    postMigrationSqrtMinPrice: range.sqrtMinPriceX64,
    postMigrationSqrtMaxPrice: range.sqrtMaxPriceX64,
    postMigrationLiquidity: destination.liquidity,
  };
  assertAmmoraV4Config(config, curve);
  return {
    config,
    curve,
    economics: {
      saleAllocationRaw: saleSupply,
      grossMigrationBaseRaw: destination.baseAmount,
      grossMigrationQuoteRaw: destination.quoteAmount,
      migrationQuoteFeeRaw: quoteFee,
      quoteSurplusToProtocolRaw: quoteAfterFee - destination.quoteAmount,
      lockedBaseRaw: lockedBase,
      totalSupplyRaw: config.totalSupply,
    },
  };
}

export interface TeamConfigPlan extends DerivedConfig {
  transaction: { to: Address; data: Hex; value?: bigint };
  reviewHash: Hex;
  recipients: {
    configOwner: Address;
    partnerRecipient: { inherited: Address; selected: Address };
    liquidityPartner: { inherited: Address; selected: Address };
    leftoverReceiver: { inherited: Address; selected: Address };
  };
}

/**
 * Plan a team Config: derive from the template, override the recipients,
 * build the registry calldata. All template fee rates, vesting and LP ratios
 * are preserved. Nothing is sent — the caller reviews `reviewHash` and the
 * recipients, then signs `transaction` through their own wallet.
 */
export function planTeamConfig(
  template: AmmoraV4ConfigSnapshot,
  recipients: TeamRecipients,
  registry: Address,
  saleSupply: bigint,
  quoteThreshold: bigint,
): TeamConfigPlan {
  if (!template.enabled) throw new Error("template Config is disabled");
  const derived = deriveConfigFromTemplate(template, saleSupply, quoteThreshold);
  const config = {
    ...derived.config,
    partnerRecipient: getAddress(recipients.partnerRecipient),
    leftoverReceiver: getAddress(recipients.leftoverReceiver),
    liquidityDistribution: {
      ...derived.config.liquidityDistribution,
      partner: getAddress(recipients.liquidityPartner),
    },
  };
  assertAmmoraV4Config(config, derived.curve);
  const { data } = buildCreateAmmoraV4Config(
    config,
    derived.curve,
    getAddress(recipients.configOwner),
  );
  const transaction = { to: registry, data };
  // Bind the review to chain, target, value and exact calldata; a changed
  // recipient, supply, threshold, template or owner requires another preview.
  const reviewHash = keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes" }],
      [91342n, transaction.to, 0n, transaction.data],
    ),
  );
  return {
    ...derived,
    config,
    transaction,
    reviewHash,
    recipients: {
      configOwner: getAddress(recipients.configOwner),
      partnerRecipient: {
        inherited: template.config.partnerRecipient,
        selected: config.partnerRecipient,
      },
      liquidityPartner: {
        inherited: template.config.liquidityDistribution.partner,
        selected: config.liquidityDistribution.partner,
      },
      leftoverReceiver: {
        inherited: template.config.leftoverReceiver,
        selected: config.leftoverReceiver,
      },
    },
  };
}
