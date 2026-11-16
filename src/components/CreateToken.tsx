import { useState } from "react";
import {
  EXPLORER_URL,
  friendlyError,
  parseLaunchCreated,
  planCreateLaunch,
  sendTransaction,
  shortAddress,
} from "../lib/ammora";
import {
  DEMO_TOKEN,
  PLATFORM_CONFIG_ID,
  PLATFORM_CONFIG_STORAGE_KEY,
} from "../lib/config";

/**
 * Create-token form. Submitting sends a real launch through MetaMask:
 * the creator pays the pool creation fee in ETH (tx value), the factory
 * deploys the token + its bonding curve, and the receipt names both
 * addresses. The metadata URI defaults to this site's own apad.json — once
 * the site is deployed that URL is public and correct; on localhost it is
 * only a placeholder, so the form warns instead of launching blind.
 */
export default function CreateToken() {
  const storedConfig =
    typeof window !== "undefined"
      ? window.localStorage.getItem(PLATFORM_CONFIG_STORAGE_KEY)
      : null;
  const [configId, setConfigId] = useState(
    PLATFORM_CONFIG_ID?.toString() ?? storedConfig ?? "",
  );
  const [name, setName] = useState<string>(DEMO_TOKEN.name);
  const [symbol, setSymbol] = useState<string>(DEMO_TOKEN.symbol);
  const [description, setDescription] = useState<string>(DEMO_TOKEN.description);
  const [supply, setSupply] = useState("1000000");
  const [threshold, setThreshold] = useState("0.001");
  const [metadataURI, setMetadataURI] = useState(
    typeof window !== "undefined" && window.location.origin.startsWith("https")
      ? new URL("tokens/apad.json", window.location.href).toString()
      : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [launched, setLaunched] = useState<{
    token: string;
    curve: string;
    txHash: string;
    configId: string;
  } | null>(null);

  const valid =
    name.trim().length > 0 &&
    symbol.trim().length > 0 &&
    symbol.trim().length <= 10 &&
    Number(supply) > 0 &&
    Number(threshold) > 0 &&
    /^\d+$/.test(configId.trim()) &&
    metadataURI.startsWith("https://");

  const launch = async () => {
    if (!valid) {
      setError(
        "Need: a platform Config id, a name, a symbol (max 10), supply, threshold, and an https metadata URI.",
      );
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const plan = await planCreateLaunch(
        BigInt(configId.trim()),
        name.trim(),
        symbol.trim().toUpperCase(),
        metadataURI.trim(),
      );
      const receipt = await sendTransaction(plan.transaction);
      const created = parseLaunchCreated(receipt);
      setLaunched({
        token: created.token,
        curve: created.curve,
        txHash: receipt.transactionHash,
        configId: configId.trim(),
      });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  if (launched) {
    return (
      <div className="card create-token">
        <h2>Token launched</h2>
        <div className="row">
          <span>Token</span>
          <strong>
            {EXPLORER_URL ? (
              <a
                href={`${EXPLORER_URL}/token/${launched.token}`}
                target="_blank"
                rel="noreferrer"
              >
                {shortAddress(launched.token)}
              </a>
            ) : (
              shortAddress(launched.token)
            )}
          </strong>
        </div>
        <div className="row">
          <span>Curve</span>
          <strong>
            <a href={`#/token/${launched.curve}`}>{shortAddress(launched.curve)}</a>
          </strong>
        </div>
        <div className="row">
          <span>Config</span>
          <strong>#{launched.configId}</strong>
        </div>
        <div className="row">
          <span>Transaction</span>
          <strong>
            {EXPLORER_URL ? (
              <a
                href={`${EXPLORER_URL}/tx/${launched.txHash}`}
                target="_blank"
                rel="noreferrer"
              >
                {shortAddress(launched.txHash)}
              </a>
            ) : (
              shortAddress(launched.txHash)
            )}
          </strong>
        </div>
        <p className="muted small">
          Add this token to <code>public/tokens/index.json</code> (token +
          curve + configId) so it appears on the home page, then open the
          curve to buy.
        </p>
        <a className="button" href={`#/token/${launched.curve}`}>
          Open the curve
        </a>
      </div>
    );
  }

  return (
    <div className="card create-token">
      <label>
        Platform Config id
        <input
          value={configId}
          onChange={(e) => setConfigId(e.target.value)}
          placeholder="e.g. 38 — from the Config creation receipt"
        />
      </label>
      <label>
        Token name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. AmmoraPad Token"
        />
      </label>
      <label>
        Symbol (max 10)
        <input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          placeholder="e.g. APAD"
          maxLength={10}
        />
      </label>
      <label>
        Description
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this token for?"
        />
      </label>
      <label>
        Sale supply (tokens)
        <input
          type="number"
          min="1"
          value={supply}
          onChange={(e) => setSupply(e.target.value)}
        />
      </label>
      <label>
        Graduation threshold (WETH)
        <input
          type="number"
          min="0"
          step="any"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
        />
      </label>
      <label>
        Metadata URI (https)
        <input
          value={metadataURI}
          onChange={(e) => setMetadataURI(e.target.value)}
          placeholder="https://your-site/tokens/apad.json"
        />
      </label>
      <p className="muted small">
        The sale supply and threshold are set by the platform Config, not by
        this form — the values above are shown for reference and must match
        the Config (1,000,000 tokens, 0.001 WETH). The launch costs the pool
        creation fee in ETH, paid by the creator.
      </p>
      <button onClick={launch} disabled={!valid || busy}>
        {busy ? "Waiting for MetaMask…" : "Create token in MetaMask"}
      </button>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
