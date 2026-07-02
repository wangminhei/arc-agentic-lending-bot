import fs from "fs";
import path from "path";
import { WalletManager } from "./wallet-manager.js";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
  const stateDir = path.resolve("./runtime/worker-01/state");
  const walletFile = path.join(stateDir, "nanopay-wallet.json");
  if (!fs.existsSync(walletFile)) {
    throw new Error("nanopay-wallet.json not found");
  }
  
  const walletState = JSON.parse(fs.readFileSync(walletFile, "utf8"));
  const account = privateKeyToAccount(walletState.privateKey as `0x${string}`);
  const localAddress = account.address;
  console.log(`Local EOA Address: ${localAddress}`);

  const walletManager = new WalletManager("worker-01");
  const wallets = await walletManager.getOrCreateWallets();
  console.log(`Owner SCA: ${wallets.owner.address}`);

  console.log("Transferring 30 USDC to EOA local...");
  const txHash = await walletManager.transferUSDC(
    wallets.owner.id,
    wallets.owner.address,
    localAddress,
    "30.00"
  );
  console.log(`✅ Success! Tx: ${txHash}`);
}

main().catch(console.error);
