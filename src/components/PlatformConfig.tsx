import { useState } from "react";
import {
  EXPLORER_URL,
  friendlyError,
  parseConfigCreated,
  planCreateConfig,
  sendTransaction,
  shortAddress,
} from "../lib/ammora";
import type { PlannedConfig } from "../lib/ammora";
import {
  DEFAULT_SALE_SUPPLY_RAW,
  DEFAULT_THRESHOLD_RAW,
  PLATFORM_CONFIG_STORAGE_KEY,
  TEAM_RECIPIENTS,
} from "../lib/config";

/**
 * Create the AmmoraPad platform Config (template #6) from the connected
 * wallet. Two steps, both reviewed before any signature:
 *   1. Preview — reads template #6 live, derives the Config, shows the
 *      recipients + economics + review hash. No signature.
 *   2. Create — sends the registry tx through MetaMask. The receipt is
 *      parsed for the new Config id, which is saved to localStorage.
 * The deployer is the connected wallet (the user's wallet). Gas is <0.1 Gwei.
 */
export default function PlatformConfig() {
  const [plan, setPlan] = useState<PlannedConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{
    configId: string;
    hash: string;
    txHash: string;
  } | null>(null);

  const stored =
    typeof window !== "undefined"
      ? window.localStorage.getItem(PLATFORM_CONFIG_STORAGE_KEY)
      : null;

  const preview = async () => {
    setError(null);
    setPlan(null);
    setLoading(true);
    try {
      const p = await planCreateConfig(
        DEFAULT_SALE_SUPPLY_RAW,
        DEFAULT_THRESHOLD_RAW,
        TEAM_RECIPIENTS,
      );
      setPlan(p);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    if (!plan) return;
    setError(null);
    setSending(true);
    try {
      const receipt = await sendTransaction(plan.transaction);
      const createdInfo = parseConfigCreated(receipt);
      const configId = createdInfo.configId.toString();
      window.localStorage.setItem(PLATFORM_CONFIG_STORAGE_KEY, configId);
      setCreated({
        configId,
        hash: createdInfo.configHash,
        txHash: receipt.transactionHash,
      });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setSending(false);
    }
  };

  if (created) {
    return (
      <div className="card platform-config">
        <h2>Platform Config created</h2>
        <div className="row">
          <span>Config id</span>
          <strong>#{created.configId}</strong>
        </div>
        <div className="row">
          <span>Config hash</span>
          <strong>{shortAddress(created.hash)}</strong>
        </div>
        <div className="row">
          <span>Transaction</span>
          <strong>
            {EXPLORER_URL ? (
              <a
                href={`${EXPLORER_URL}/tx/${created.txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {shortAddress(created.txHash)}
              </a>
            ) : (
              shortAddress(created.txHash)
            )}
          </strong>
        </div>
        <p className="muted small">
          Saved in this browser. Next: create the first token on Config #
          {created.configId} (Create page), then buy on its curve.
        </p>
      </div>
    );
  }

  return (
    <div className="card platform-config">
      <h2>Create platform Config</h2>
      {stored && (
        <p className="muted">
          This browser already created Config #{stored}. Creating another one
          is allowed but unnecessary — use #{stored} for launches.
        </p>
      )}
      <div className="row">
        <span>Template</span>
        <strong>#6 (concentrated graduation)</strong>
      </div>
      <div className="row">
        <span>Owner / fee claimer / LP partner / leftover</span>
        <strong>{shortAddress(TEAM_RECIPIENTS.configOwner)}</strong>
      </div>
      <div className="row">
        <span>Sale supply</span>
        <strong>1,000,000 APAD (9 decimals)</strong>
      </div>
      <div className="row">
        <span>Graduation threshold</span>
        <strong>0.001 WETH raised</strong>
      </div>
      <button onClick={preview} disabled={loading}>
        {loading ? "Reading template #6… (GIWA RPC is slow)" : "Preview Config"}
      </button>
      {error && <div className="error">{error}</div>}
      {plan && (
        <div className="preview">
          <div className="row">
            <span>Total supply</span>
            <strong>{plan.economics.totalSupplyRaw.toString()} raw</strong>
          </div>
          <div className="row">
            <span>Migration base</span>
            <strong>{plan.economics.grossMigrationBaseRaw.toString()} raw</strong>
          </div>
          <div className="row">
            <span>Pool creation fee</span>
            <strong>{plan.poolCreationFee.toString()} wei</strong>
          </div>
          <div className="row">
            <span>Review hash</span>
            <strong>{shortAddress(plan.reviewHash)}</strong>
          </div>
          <p className="muted small">
            Check the recipients and economics above. Creating the Config is
            one MetaMask signature; the Config is immutable afterwards.
          </p>
          <button onClick={create} disabled={sending}>
            {sending ? "Waiting for MetaMask…" : "Create Config in MetaMask"}
          </button>
        </div>
      )}
    </div>
  );
}
