import { useCallback, useEffect, useState } from "react";
import { CHAIN_ID, shortAddress } from "../lib/ammora";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

export default function ConnectWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) return;
    try {
      const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
      setAddress(accounts[0] ?? null);
      const id = (await eth.request({ method: "eth_chainId" })) as string;
      setChainId(parseInt(id, 16));
    } catch {
      // Not connected yet; ignore.
    }
  }, []);

  useEffect(() => {
    refresh();
    const eth = window.ethereum;
    if (!eth?.on) return;
    const onAccounts = () => refresh();
    const onChain = () => refresh();
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, [refresh]);

  const connect = async () => {
    const eth = window.ethereum;
    if (!eth) {
      setError("MetaMask not found — install the MetaMask extension first.");
      return;
    }
    setError(null);
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      setAddress(accounts[0] ?? null);
      const id = (await eth.request({ method: "eth_chainId" })) as string;
      setChainId(parseInt(id, 16));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection rejected.");
    }
  };

  const switchChain = async () => {
    const eth = window.ethereum;
    if (!eth) return;
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${CHAIN_ID.toString(16)}` }],
      });
      await refresh();
    } catch {
      setError("Please switch to GIWA Sepolia (chain 91342) in MetaMask.");
    }
  };

  if (!window.ethereum) {
    return (
      <div className="wallet">
        <span className="muted">MetaMask not detected.</span>{" "}
        <a href="https://metamask.io/download/" target="_blank" rel="noreferrer">
          Install MetaMask
        </a>
      </div>
    );
  }

  if (address) {
    const wrongChain = chainId !== null && chainId !== CHAIN_ID;
    return (
      <div className="wallet">
        <span className="address">{shortAddress(address)}</span>
        {wrongChain ? (
          <button onClick={switchChain}>Switch to GIWA Sepolia</button>
        ) : (
          <span className="ok">GIWA Sepolia</span>
        )}
      </div>
    );
  }

  return (
    <div className="wallet">
      <button onClick={connect}>Connect Wallet</button>
      {error && <span className="error">{error}</span>}
    </div>
  );
}
