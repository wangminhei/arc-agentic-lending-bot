import fs from "fs";
import path from "path";
import { WalletManager } from "./wallet-manager.js";

const contractsPath = path.resolve("./runtime/worker-01/state/contracts.json");
if (!fs.existsSync(contractsPath)) {
  throw new Error("contracts.json not found! Please deploy the contract first.");
}
const contracts = JSON.parse(fs.readFileSync(contractsPath, "utf8"));
const EURC_POOL_ADDRESS = contracts.multi_collateral_pool;
if (!EURC_POOL_ADDRESS) {
  throw new Error("multi_collateral_pool address not found in contracts.json");
}
const AMOUNT = "200.00";

async function main() {
  console.log("=== FUNDING MULTI-COLLATERAL POOL WITH EURC ===");

  const walletManager = new WalletManager("worker-01");
  const wallets = await walletManager.getOrCreateWallets();

  if (!wallets) {
    throw new Error("Wallets not loaded");
  }

  console.log(`Owner address: ${wallets.owner.address}`);
  console.log(`Sending ${AMOUNT} EURC to pool: ${EURC_POOL_ADDRESS}...`);

  // Transfer EURC via Circle Developer Wallets
  const txHash = await (walletManager as any).transferEURC(
    wallets.owner.id,
    wallets.owner.address,
    EURC_POOL_ADDRESS,
    AMOUNT
  );

  console.log(`\n=========================================`);
  console.log(`✅ Liquidity transfer successful!`);
  console.log(`Transaction Hash: ${txHash}`);
  console.log(`Tx: https://testnet.arcscan.app/tx/${txHash}`);
  console.log(`=========================================\n`);
}

main().catch((err) => {
  console.error("Funding failed:", err);
  process.exit(1);
});
