import { useState } from "react";
import {
  EXPLORER_URL,
  WETH,
  connectedAccounts,
  ensureAllowance,
  formatAmount,
  friendlyError,
  planSwap,
  planWrap,
  publicClient,
  quoteExactInput,
  sendTransaction,
  shortAddress,
  tokenBalance,
} from "../lib/ammora";
import type { Address } from "viem";

/**
 * Buy/sell box. The QUOTE is a live on-chain read; Buy/Sell sends a real
 * swap through MetaMask:
 *   1. Re-plan at a fresh block (quote + min-out slippage guard).
 *   2. Check the input balance (WETH for buys, the token for sells).
 *   3. Approve the exact input amount to the curve when the allowance is
 *      short (exact amount, never infinite).
 *   4. Send swapExactInput; wait for the receipt and show the tx hash.
 * Buys need WETH — the wrap box below turns ETH into WETH first.
 * A rejected signature in MetaMask reports cleanly; nothing is retried.
 */
export default function SwapBox({
  curve,
  symbol,
  quoteDecimals = 18,
  baseDecimals = 9,
}: {
  curve: Address;
  symbol: string;
  quoteDecimals?: number;
  baseDecimals?: number;
}) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<{
    out: bigint;
    fee: bigint;
    left: bigint;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [wrapAmount, setWrapAmount] = useState("");
  const [wrapBusy, setWrapBusy] = useState(false);
  const [wrapTx, setWrapTx] = useState<string | null>(null);

  const getQuote = async () => {
    setError(null);
    setQuote(null);
    setTxHash(null);
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    setLoading(true);
    try {
      const decimals = side === "buy" ? quoteDecimals : baseDecimals;
      const raw = BigInt(Math.floor(value * 10 ** decimals));
      const q = await quoteExactInput(publicClient(), curve, side, raw);
      setQuote({ out: q.amountOut, fee: q.fee, left: q.amountLeft });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  const trade = async () => {
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    setError(null);
    setTxHash(null);
    setBusy(true);
    try {
      const [account] = await connectedAccounts();
      if (!account) throw new Error("No wallet connected — connect MetaMask first.");
      const decimals = side === "buy" ? quoteDecimals : baseDecimals;
      const raw = BigInt(Math.floor(value * 10 ** decimals));
      // Re-plan at a fresh block so the quote and min-out are current.
      const plan = await planSwap(curve, side, raw, account, 50);
      const balance = await tokenBalance(plan.tokenIn, account);
      if (balance < raw) {
        throw new Error(
          side === "buy"
            ? `Not enough WETH (have ${formatAmount(balance, 18)}). Wrap ETH below first.`
            : `Not enough ${symbol} (have ${formatAmount(balance, baseDecimals)}).`,
        );
      }
      await ensureAllowance(plan.approval.token, plan.approval.spender, plan.approval.amount, account);
      const receipt = await sendTransaction(plan.transaction);
      setTxHash(receipt.transactionHash);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const wrap = async () => {
    const value = Number(wrapAmount);
    if (!wrapAmount || Number.isNaN(value) || value <= 0) {
      setError("Enter an ETH amount to wrap.");
      return;
    }
    setError(null);
    setWrapTx(null);
    setWrapBusy(true);
    try {
      const raw = BigInt(Math.floor(value * 10 ** 18));
      const receipt = await sendTransaction(planWrap(raw));
      setWrapTx(receipt.transactionHash);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setWrapBusy(false);
    }
  };

  const outDecimals = side === "buy" ? baseDecimals : quoteDecimals;
  const outSymbol = side === "buy" ? symbol : "WETH";

  return (
    <div className="card swap-box">
      <div className="tabs">
        <button className={side === "buy" ? "active" : ""} onClick={() => { setSide("buy"); setQuote(null); setTxHash(null); }}>
          Buy
        </button>
        <button className={side === "sell" ? "active" : ""} onClick={() => { setSide("sell"); setQuote(null); setTxHash(null); }}>
          Sell
        </button>
      </div>
      <label>
        Amount in ({side === "buy" ? "WETH" : symbol})
        <input
          type="number"
          min="0"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.0"
        />
      </label>
      <button onClick={getQuote} disabled={loading || busy}>
        {loading ? "Quoting… (GIWA RPC is slow)" : "Get quote"}
      </button>
      {error && <div className="error">{error}</div>}
      {quote && (
        <div className="quote">
          <div className="row">
            <span>You receive (est.)</span>
            <strong>
              {formatAmount(quote.out, outDecimals)} {outSymbol}
            </strong>
          </div>
          <div className="row">
            <span>Fee</span>
            <strong>{formatAmount(quote.fee, outDecimals)} {outSymbol}</strong>
          </div>
          {quote.left > 0n && (
            <div className="row">
              <span>Unfilled (graduation boundary)</span>
              <strong>{formatAmount(quote.left, side === "buy" ? quoteDecimals : baseDecimals)}</strong>
            </div>
          )}
          <p className="muted small">
            Min-out uses 0.5% slippage. The trade re-plans at a fresh block
            before sending.
          </p>
          <button onClick={trade} disabled={busy}>
            {busy ? "Waiting for MetaMask…" : side === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`}
          </button>
        </div>
      )}
      {txHash && (
        <div className="quote">
          <div className="row">
            <span>Swap sent</span>
            <strong>
              {EXPLORER_URL ? (
                <a href={`${EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer">
                  {shortAddress(txHash)}
                </a>
              ) : (
                shortAddress(txHash)
              )}
            </strong>
          </div>
        </div>
      )}
      <div className="wrap">
        <h3>Wrap ETH → WETH</h3>
        <p className="muted small">
          Buys pay in WETH ({shortAddress(WETH)}). Wrap some ETH first — keep
          a little ETH for gas.
        </p>
        <label>
          ETH to wrap
          <input
            type="number"
            min="0"
            step="any"
            value={wrapAmount}
            onChange={(e) => setWrapAmount(e.target.value)}
            placeholder="0.001"
          />
        </label>
        <button onClick={wrap} disabled={wrapBusy}>
          {wrapBusy ? "Waiting for MetaMask…" : "Wrap"}
        </button>
        {wrapTx && (
          <div className="row">
            <span>Wrapped</span>
            <strong>
              {EXPLORER_URL ? (
                <a href={`${EXPLORER_URL}/tx/${wrapTx}`} target="_blank" rel="noreferrer">
                  {shortAddress(wrapTx)}
                </a>
              ) : (
                shortAddress(wrapTx)
              )}
            </strong>
          </div>
        )}
      </div>
    </div>
  );
}
