import { useEffect, useState } from "react";
import {
  configRegistry,
  curveStatusLabel,
  formatAmount,
  launchFactory,
  listConfigs,
  publicClient,
  readCurveState,
  readMigrationProgress,
  shortAddress,
} from "../lib/ammora";
import { PLATFORM_CONFIG_ID, TEMPLATE_HASH, TEMPLATE_ID } from "../lib/config";
import TokenCard, { type TokenMeta } from "../components/TokenCard";
import PlatformConfig from "../components/PlatformConfig";
import type { CurveState } from "../lib/ammora";

export default function Home() {
  const [tokens, setTokens] = useState<TokenMeta[]>([]);
  const [states, setStates] = useState<Record<string, CurveState | null>>({});
  const [progress, setProgress] = useState<
    Record<string, { current: bigint; target: bigint } | null>
  >({});
  const [configCount, setConfigCount] = useState<string | null>(null);
  const [lookup, setLookup] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("tokens/index.json");
        const list: TokenMeta[] = res.ok ? await res.json() : [];
        if (cancelled) return;
        setTokens(list);
        // Config count (one cheap read) — proves the registry is live.
        const client = publicClient();
        const next = await listConfigs(client, 1).catch(() => null);
        if (!cancelled && next) setConfigCount(`${next.length} config(s) read`);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const client = publicClient();
      for (const t of tokens) {
        if (cancelled) return;
        try {
          const curve = t.curve as `0x${string}`;
          const st = await readCurveState(client, curve);
          const prog = await readMigrationProgress(client, curve);
          if (cancelled) return;
          setStates((s) => ({ ...s, [t.curve]: st }));
          setProgress((p) => ({
            ...p,
            [t.curve]: { current: prog.current, target: prog.target },
          }));
        } catch {
          if (!cancelled) {
            setStates((s) => ({ ...s, [t.curve]: null }));
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tokens]);

  const goLookup = () => {
    const addr = lookup.trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      window.location.hash = `#/token/${addr}`;
    } else {
      setError("Enter a valid 0x curve address.");
    }
  };

  return (
    <div>
      <section className="hero">
        <h1>AmmoraPad</h1>
        <p>
          Launch tokens on GIWA Sepolia with the Ammora SDK. Bonding-curve
          launches that graduate into concentrated liquidity — no backend, no
          API key, just your wallet.
        </p>
        <a className="button" href="#/create">
          Create a token
        </a>
      </section>

      <section className="card">
        <h2>Platform</h2>
        <div className="row">
          <span>Chain</span>
          <strong>GIWA Sepolia (91342)</strong>
        </div>
        <div className="row">
          <span>Config registry</span>
          <strong>{shortAddress(configRegistry)}</strong>
        </div>
        <div className="row">
          <span>Launch factory</span>
          <strong>{shortAddress(launchFactory)}</strong>
        </div>
        <div className="row">
          <span>Template</span>
          <strong>
            #{TEMPLATE_ID} (concentrated graduation)
          </strong>
        </div>
        <div className="row">
          <span>Template hash</span>
          <strong>{shortAddress(TEMPLATE_HASH)}</strong>
        </div>
        <div className="row">
          <span>Platform Config</span>
          <strong>
            {PLATFORM_CONFIG_ID === null
              ? "Not created yet — use the form below"
              : `#${PLATFORM_CONFIG_ID}`}
          </strong>
        </div>
        {configCount && (
          <div className="row">
            <span>Registry read</span>
            <strong>{configCount}</strong>
          </div>
        )}
      </section>

      <PlatformConfig />

      <section>
        <h2>Launched tokens</h2>
        {tokens.length === 0 ? (
          <p className="muted">
            No tokens launched yet. The first token goes live once the platform
            Config is created (Phase 2). Use the lookup below to inspect any
            curve by address.
          </p>
        ) : (
          <div className="grid">
            {tokens.map((t) => (
              <TokenCard
                key={t.curve}
                meta={t}
                state={states[t.curve] ?? null}
                progress={progress[t.curve] ?? null}
              />
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Look up a curve</h2>
        <div className="lookup">
          <input
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            placeholder="0x curve address"
          />
          <button onClick={goLookup}>Open</button>
        </div>
        {error && <div className="error">{error}</div>}
        <p className="muted small">
          Reads the curve state, reserves and graduation progress directly from
          GIWA Sepolia. The public RPC is slow — a read can take ~30s.
        </p>
      </section>

      <p className="muted small">
        AmmoraPad is a testnet demo on GIWA Sepolia. Nothing here is financial
        advice. Status labels: {curveStatusLabel(1)}, {curveStatusLabel(2)},{" "}
        {curveStatusLabel(3)}. Fee example: {formatAmount(0n, 18)} WETH.
      </p>
    </div>
  );
}
