import { useEffect, useState } from "react";
import {
  WETH,
  claimableFees,
  connectedAccounts,
  feeVaultAddress,
  formatAmount,
  friendlyError,
  planClaimFees,
  planClaimLpFees,
  sendTransaction,
  shortAddress,
} from "../lib/ammora";
import type { Address } from "viem";

/**
 * Fee claims, shown on a token page.
 *   - Creator/partner launch fees (WETH) accrue in the factory FeeVault.
 *     The button reads what the connected wallet is owed first and only
 *     sends when something is owed.
 *   - LP fees on a migrated pool need the position NFT tokenId; the owner
 *     pastes it and claims through the ARL (DammV2) client.
 */
export default function ClaimFees({ pool }: { pool?: Address | null }) {
  const [vault, setVault] = useState<Address | null>(null);
  const [owed, setOwed] = useState<bigint | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimedTx, setClaimedTx] = useState<string | null>(null);
  const [tokenId, setTokenId] = useState("");
  const [lpBusy, setLpBusy] = useState(false);
  const [lpTx, setLpTx] = useState<string | null>(null);

  const refresh = async () => {
    setError(null);
    setLoading(true);
    try {
      const [account] = await connectedAccounts();
      if (!account) {
        setOwed(null);
        setVault(null);
        return;
      }
      const v = await feeVaultAddress();
      setVault(v);
      setOwed(await claimableFees(v, WETH, account));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const claim = async () => {
    if (!vault || owed === null || owed === 0n) return;
    setError(null);
    setBusy(true);
    try {
      const [account] = await connectedAccounts();
      if (!account) throw new Error("No wallet connected — connect MetaMask first.");
      const receipt = await sendTransaction(planClaimFees(vault, WETH, account));
      setClaimedTx(receipt.transactionHash);
      setOwed(0n);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const claimLp = async () => {
    if (!pool || !/^\d+$/.test(tokenId.trim())) {
      setError("Enter the LP position NFT tokenId.");
      return;
    }
    setError(null);
    setLpBusy(true);
    try {
      const [account] = await connectedAccounts();
      if (!account) throw new Error("No wallet connected — connect MetaMask first.");
      const receipt = await sendTransaction(
        await planClaimLpFees(pool, BigInt(tokenId.trim()), account, account),
      );
      setLpTx(receipt.transactionHash);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLpBusy(false);
    }
  };

  return (
    <div className="card">
      <h2>Fee claims</h2>
      {loading && <p className="muted">Reading the FeeVault…</p>}
      {vault && (
        <div className="row">
          <span>FeeVault</span>
          <strong>{shortAddress(vault)}</strong>
        </div>
      )}
      {owed !== null && (
        <div className="row">
          <span>Owed to you (WETH)</span>
          <strong>{formatAmount(owed, 18)} WETH</strong>
        </div>
      )}
      <button onClick={claim} disabled={busy || owed === null || owed === 0n}>
        {busy ? "Waiting for MetaMask…" : "Claim launch fees"}
      </button>
      <button onClick={refresh} disabled={loading}>
        Refresh
      </button>
      {claimedTx && (
        <div className="row">
          <span>Claimed</span>
          <strong>{shortAddress(claimedTx)}</strong>
        </div>
      )}
      {pool && (
        <div className="lp-claim">
          <h3>LP fees (migrated pool)</h3>
          <p className="muted small">
            Pool {shortAddress(pool)}. Paste your LP position NFT tokenId to
            claim its accrued fees.
          </p>
          <label>
            Position tokenId
            <input
              value={tokenId}
              onChange={(e) => setTokenId(e.target.value)}
              placeholder="e.g. 1"
            />
          </label>
          <button onClick={claimLp} disabled={lpBusy}>
            {lpBusy ? "Waiting for MetaMask…" : "Claim LP fees"}
          </button>
          {lpTx && (
            <div className="row">
              <span>Claimed</span>
              <strong>{shortAddress(lpTx)}</strong>
            </div>
          )}
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  );
}
