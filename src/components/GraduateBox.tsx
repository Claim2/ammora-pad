import { useState } from "react";
import {
  EXPLORER_URL,
  connectedAccounts,
  ensureAllowance,
  formatAmount,
  friendlyError,
  parseMigrated,
  planMigrate,
  planSwap,
  sendTransaction,
  shortAddress,
} from "../lib/ammora";
import type { Address } from "viem";

/**
 * Graduation box, shown on a token page while the curve is Active (1) or
 * ReadyToMigrate (2).
 *   - Graduate: one boundary buy (slippage 1%, allowPartialFill) that fills
 *     the curve to its threshold, then the separate permissionless migrate
 *     into the canonical ARL concentrated pool. Two MetaMask signatures.
 *   - Migrate only: when the curve is already ReadyToMigrate, just the
 *     migrate step. One signature.
 * The fill input is a maximum: the curve consumes only what remains fillable
 * and refunds the rest.
 */
export default function GraduateBox({
  curve,
  status,
  raised,
  threshold,
}: {
  curve: Address;
  status: number;
  raised: bigint;
  threshold: bigint;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pool, setPool] = useState<string | null>(null);
  const [fillTx, setFillTx] = useState<string | null>(null);

  const remaining = threshold > raised ? threshold - raised : 0n;

  const graduate = async () => {
    setError(null);
    setBusy(true);
    try {
      const [account] = await connectedAccounts();
      if (!account) throw new Error("No wallet connected — connect MetaMask first.");
      if (remaining <= 0n) throw new Error("Curve is already at its threshold — use Migrate.");
      // A little headroom above the remaining amount; the curve refunds the excess.
      const maxInput = remaining + remaining / 100n;
      const plan = await planSwap(curve, "buy", maxInput, account, 100, true);
      await ensureAllowance(plan.approval.token, plan.approval.spender, plan.approval.amount, account);
      const fillReceipt = await sendTransaction(plan.transaction);
      setFillTx(fillReceipt.transactionHash);
      const migration = await planMigrate(curve);
      const migReceipt = await sendTransaction(migration.transaction);
      const migrated = parseMigrated(migReceipt, curve);
      setPool(migrated.canonicalPool);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const migrate = async () => {
    setError(null);
    setBusy(true);
    try {
      const migration = await planMigrate(curve);
      const receipt = await sendTransaction(migration.transaction);
      const migrated = parseMigrated(receipt, curve);
      setPool(migrated.canonicalPool);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (pool) {
    return (
      <div className="card">
        <h2>Graduated</h2>
        <div className="row">
          <span>ARL pool</span>
          <strong>{shortAddress(pool)}</strong>
        </div>
        {fillTx && (
          <div className="row">
            <span>Final fill</span>
            <strong>
              {EXPLORER_URL ? (
                <a href={`${EXPLORER_URL}/tx/${fillTx}`} target="_blank" rel="noreferrer">
                  {shortAddress(fillTx)}
                </a>
              ) : (
                shortAddress(fillTx)
              )}
            </strong>
          </div>
        )}
        <p className="muted small">
          The token now trades on its concentrated-liquidity pool. Fee claims
          are below.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Graduation</h2>
      <div className="row">
        <span>Raised</span>
        <strong>
          {formatAmount(raised, 18)} / {formatAmount(threshold, 18)} WETH
        </strong>
      </div>
      <div className="row">
        <span>Remaining</span>
        <strong>{formatAmount(remaining, 18)} WETH</strong>
      </div>
      {status === 1 && (
        <p className="muted small">
          Graduating buys the remaining {formatAmount(remaining, 18)} WETH of
          the curve (a little headroom is sent; the excess is refunded), then
          migrates the liquidity into the ARL pool. Two MetaMask signatures.
        </p>
      )}
      {status === 2 && (
        <p className="muted small">
          The curve is full. Migrate it into the ARL concentrated pool — one
          MetaMask signature, permissionless.
        </p>
      )}
      {status === 1 && (
        <button onClick={graduate} disabled={busy}>
          {busy ? "Waiting for MetaMask…" : "Graduate (buy + migrate)"}
        </button>
      )}
      {status === 2 && (
        <button onClick={migrate} disabled={busy}>
          {busy ? "Waiting for MetaMask…" : "Migrate to ARL pool"}
        </button>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
