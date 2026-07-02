import fs from "fs";
import path from "path";
import { WalletManager } from "./wallet-manager.js";

async function main() {
  const stateDir = path.resolve("./runtime/worker-01/state");
  
  // Load contracts.json
  const contractsPath = path.join(stateDir, "contracts.json");
  if (!fs.existsSync(contractsPath)) {
    throw new Error(`contracts.json not found`);
  }
  const contracts = JSON.parse(fs.readFileSync(contractsPath, "utf-8"));
  const poolAddress = contracts.multi_collateral_pool;
  if (!poolAddress) {
    throw new Error(`multi_collateral_pool address not found`);
  }
  console.log(`Target pool address: ${poolAddress}`);

  // Load wallets
  const walletManager = new WalletManager("worker-01");
  const wallets = await walletManager.getOrCreateWallets();
  console.log(`Owner SCA: ${wallets.owner.address}`);

  // Transfer 200 EURC to Pool
  console.log("Transferring 200 EURC to Pool contract for liquidity...");
  const txHash = await walletManager.transferEURC(
    wallets.owner.id,
    wallets.owner.address,
    poolAddress,
    "200.00"
  );
  console.log(`✅ Success! Funded 200 EURC to Pool. Tx: ${txHash}`);
}

main().catch((err) => {
  console.error("Funding EURC failed:", err);
  process.exit(1);
});
