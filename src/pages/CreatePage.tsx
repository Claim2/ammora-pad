import CreateToken from "../components/CreateToken";

export default function CreatePage() {
  return (
    <div>
      <a href="#/">← All tokens</a>
      <h1>Create a token</h1>
      <p className="muted">
        Issue a new token with a bonding curve on GIWA Sepolia. The token is
        created through the AmmoraPad platform Config, trades on the curve
        before graduation, then migrates into a concentrated-liquidity pool.
      </p>
      <CreateToken />
    </div>
  );
}
