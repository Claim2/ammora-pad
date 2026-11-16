import { useEffect, useState } from "react";
import ConnectWallet from "./components/ConnectWallet";
import Home from "./pages/Home";
import TokenPage from "./pages/TokenPage";
import CreatePage from "./pages/CreatePage";

type Route =
  | { name: "home" }
  | { name: "token"; curve: string }
  | { name: "create" };

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [page, arg] = hash.split("/");
  if (page === "token" && arg) return { name: "token", curve: arg };
  if (page === "create") return { name: "create" };
  return { name: "home" };
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="app">
      <header>
        <a className="brand" href="#/">
          AmmoraPad
        </a>
        <nav>
          <a href="#/">Discover</a>
          <a href="#/create">Create</a>
        </nav>
        <ConnectWallet />
      </header>
      <main>
        {route.name === "home" && <Home />}
        {route.name === "token" && <TokenPage curve={route.curve} />}
        {route.name === "create" && <CreatePage />}
      </main>
      <footer className="muted small">
        AmmoraPad — token launchpad on GIWA Sepolia (chain 91342), built with
        @ammora-protocol/sdk 0.3.9. Testnet demo; no real value.
      </footer>
    </div>
  );
}
