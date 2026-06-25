/**
 * demo-memo.ts
 * Script demo tính năng gửi USDC kèm theo Transaction Memo trên Arc Testnet
 */

import { WalletManager } from "./wallet-manager.js";
import { Logger } from "./logger.js";
import dotenv from "dotenv";

dotenv.config();

const logger = new Logger("DemoMemo");

async function main() {
  logger.section("DEMO ARC TRANSACTION MEMOS");

  try {
    const walletManager = new WalletManager("worker-01");
    
    logger.info("Loading wallets...");
    const wallets = await walletManager.getOrCreateWallets();
    
    // Print current balances
    logger.info("\nCurrent balances:");
    await walletManager.printBalances(wallets);

    const amount = "1.00";
    const memoText = `invoice-id-${Date.now()}`;
    const memoIdText = `inv-${Math.floor(Math.random() * 10000)}`;

    logger.info(`\nInitiating USDC transfer with memo:`);
    logger.info(`  Amount:   ${amount} USDC`);
    logger.info(`  From:     ${wallets.owner.address}`);
    logger.info(`  To:       ${wallets.validator.address}`);
    logger.info(`  Memo:     "${memoText}"`);
    logger.info(`  Memo ID:  "${memoIdText}"`);

    // Check balance of owner
    const ownerBal = await walletManager.getUSDCBalance(wallets.owner.address);
    if (parseFloat(ownerBal.usdc) < parseFloat(amount) + 0.5) {
      throw new Error(`Insufficient owner balance (${ownerBal.usdc} USDC) to perform transaction.`);
    }

    const txHash = await walletManager.transferUSDCWithMemo(
      wallets.owner.id,
      wallets.owner.address,
      wallets.validator.address,
      amount,
      memoText,
      memoIdText
    );

    logger.success(`\nTransaction Memo succeeded!`);
    logger.success(`  Tx Hash: ${txHash}`);
    logger.success(`  Explorer URL: https://testnet.arcscan.app/tx/${txHash}`);

  } catch (error: any) {
    logger.error(`\nDemo failed: ${error.message}`);
    process.exit(1);
  }
}

main();
