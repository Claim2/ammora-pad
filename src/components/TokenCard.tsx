import { curveStatusLabel, formatAmount, shortAddress } from "../lib/ammora";
import type { CurveState } from "../lib/ammora";

export interface TokenMeta {
  symbol: string;
  name: string;
  description?: string;
  token: string;
  curve: string;
  configId: string;
  createdAt?: string;
}

export default function TokenCard({
  meta,
  state,
  progress,
}: {
  meta: TokenMeta;
  state: CurveState | null;
  progress: { current: bigint; target: bigint } | null;
}) {
  const pct =
    progress && progress.target > 0n
      ? Math.min(100, Number((progress.current * 100n) / progress.target))
      : null;
  return (
    <a className="card token-card" href={`#/token/${meta.curve}`}>
      <div className="token-head">
        <strong>{meta.name}</strong>
        <span className="symbol">{meta.symbol}</span>
      </div>
      <div className="muted small">curve {shortAddress(meta.curve)}</div>
      {state ? (
        <>
          <div className="row">
            <span>Status</span>
            <strong>{curveStatusLabel(state.status)}</strong>
          </div>
          <div className="row">
            <span>Quote reserve</span>
            <strong>{formatAmount(state.quoteReserve, 18)} WETH</strong>
          </div>
          <div className="row">
            <span>Base reserve</span>
            <strong>{formatAmount(state.baseReserve, 9)} {meta.symbol}</strong>
          </div>
          {pct !== null && (
            <div className="progress">
              <div className="bar" style={{ width: `${pct}%` }} />
              <span>{pct}% to graduation</span>
            </div>
          )}
        </>
      ) : (
        <div className="muted">Loading curve state… (GIWA RPC is slow)</div>
      )}
    </a>
  );
}
