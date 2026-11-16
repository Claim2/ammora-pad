import { formatAmount } from "../lib/ammora";

/** Bonding-curve graduation progress bar. */
export default function CurveProgress({
  current,
  target,
}: {
  current: bigint;
  target: bigint;
}) {
  const pct =
    target > 0n ? Math.min(100, Number((current * 100n) / target)) : 0;
  return (
    <div className="curve-progress">
      <div className="row">
        <span>Graduation progress</span>
        <strong>{pct}%</strong>
      </div>
      <div className="progress">
        <div className="bar" style={{ width: `${pct}%` }} />
      </div>
      <div className="muted small">
        {formatAmount(current, 18)} / {formatAmount(target, 18)} WETH raised
      </div>
    </div>
  );
}
