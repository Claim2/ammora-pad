import { useEffect, useState } from "react";
import {
  curveStatusLabel,
  formatAmount,
  publicClient,
  readCurveState,
  readMigrationProgress,
  shortAddress,
} from "../lib/ammora";
import type { CurveState } from "../lib/ammora";
import CurveProgress from "../components/CurveProgress";
import GraduateBox from "../components/GraduateBox";
import ClaimFees from "../components/ClaimFees";
import SwapBox from "../components/SwapBox";
import type { TokenMeta } from "../components/TokenCard";
import type { Address } from "viem";

export default function TokenPage({ curve }: { curve: string }) {
  const [meta, setMeta] = useState<TokenMeta | null>(null);
  const [state, setState] = useState<CurveState | null>(null);
  const [progress, setProgress] = useState<{ current: bigint; target: bigint } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const valid = /^0x[0-9a-fA-F]{40}$/.test(curve);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("tokens/index.json");
        const list: TokenMeta[] = res.ok ? await res.json() : [];
        if (!cancelled) {
          setMeta(list.find((t) => t.curve.toLowerCase() === curve.toLowerCase()) ?? null);
        }
        if (!valid) {
          if (!cancelled) {
            setError("Invalid curve address.");
            setLoading(false);
          }
          return;
        }
        const client = publicClient();
        const addr = curve as Address;
        const st = await readCurveState(client, addr);
        const prog = await readMigrationProgress(client, addr);
        if (cancelled) return;
        setState(st);
        setProgress({ current: prog.current, target: prog.target });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to read curve.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [curve, valid]);

  if (!valid) {
    return (
      <div className="card">
        <h1>Invalid curve address</h1>
        <p className="muted">Expected a 0x address, got: {curve}</p>
        <a href="#/">Back home</a>
      </div>
    );
  }

  return (
    <div>
      <a href="#/">← All tokens</a>
      <h1>{meta ? `${meta.name} (${meta.symbol})` : "Token"}</h1>
      <p className="muted">Curve {shortAddress(curve)}</p>
      {meta?.description && <p>{meta.description}</p>}

      {loading && <p className="muted">Reading curve state from GIWA Sepolia… (public RPC is slow, ~30s)</p>}
      {error && <div className="error">{error}</div>}

      {state && (
        <section className="card">
          <h2>Curve</h2>
          <div className="row">
            <span>Status</span>
            <strong>{curveStatusLabel(state.status)}</strong>
          </div>
          <div className="row">
            <span>Config</span>
            <strong>#{state.configId.toString()}</strong>
          </div>
          <div className="row">
            <span>Base token</span>
            <strong>{shortAddress(state.baseToken)}</strong>
          </div>
          <div className="row">
            <span>Quote token</span>
            <strong>{shortAddress(state.quoteToken)}</strong>
          </div>
          <div className="row">
            <span>Creator</span>
            <strong>{shortAddress(state.creator)}</strong>
          </div>
          <div className="row">
            <span>Base reserve</span>
            <strong>{formatAmount(state.baseReserve, 9)} {meta?.symbol ?? "tokens"}</strong>
          </div>
          <div className="row">
            <span>Quote reserve</span>
            <strong>{formatAmount(state.quoteReserve, 18)} WETH</strong>
          </div>
          <div className="row">
            <span>Fee</span>
            <strong>{state.currentFeeBps} bps</strong>
          </div>
          {state.status === 3 && (
            <div className="row">
              <span>Graduated pool</span>
              <strong>{shortAddress(state.canonicalPool)}</strong>
            </div>
          )}
          {progress && (
            <CurveProgress current={progress.current} target={progress.target} />
          )}
        </section>
      )}

      <section>
        <h2>Trade</h2>
        <SwapBox curve={curve as Address} symbol={meta?.symbol ?? "TOKEN"} />
      </section>

      {state && (state.status === 1 || state.status === 2) && progress && (
        <section>
          <GraduateBox
            curve={curve as Address}
            status={state.status}
            raised={progress.current}
            threshold={progress.target}
          />
        </section>
      )}

      {state && (
        <section>
          <ClaimFees pool={state.status === 3 ? (state.canonicalPool as Address) : null} />
        </section>
      )}
    </div>
  );
}
