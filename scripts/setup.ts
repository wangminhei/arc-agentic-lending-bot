/**
 * setup.ts
 * Chạy một lần để setup project:
 *   - Tạo wallet pair (owner + validator)
 *   - In địa chỉ để fund faucet
 *   - Verify kết nối Arc testnet
 *
 * Usage: npm run setup
 */

import { createPublicClient, http, formatUnits } from "viem";
import { arcTestnet } from "viem/chains";
import { WalletManager } from "./wallet-manager.js";
import { Logger } from "./logger.js";

const logger = new Logger("Setup");

async function main(): Promise<void> {
  logger.section("ARC WORKER BOT - SETUP");

  // ── 1. Verify Arc testnet connection ────────────────────────────────────

  logger.info("Verifying Arc Testnet connection...");
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"),
  });

  const blockNumber = await publicClient.getBlockNumber();
  logger.success(`Connected! Latest block: #${blockNumber}`);
  logger.info(`  Explorer: https://testnet.arcscan.app`);

  // ── 2. Create/load wallets ───────────────────────────────────────────────

  logger.section("WALLET SETUP");

  const workerId = process.env.WORKER_ID || "worker-01";
  const walletManager = new WalletManager(workerId);

  logger.info("Creating or loading wallet pair...");
  const wallets = await walletManager.getOrCreateWallets();

  // ── 3. Print funding instructions ───────────────────────────────────────

  logger.section("FUND YOUR WALLETS");

  console.log("  ⚠️  Both wallets need USDC to operate.\n");
  console.log("  Faucet options:");
  console.log("    1. Public:  https://faucet.circle.com");
  console.log("    2. Console: https://console.circle.com/faucet\n");

  console.log("  Fund these addresses:\n");
  console.log(`  Owner Wallet (main operations + gas):`);
  console.log(`    ${wallets.owner.address}`);
  console.log(`    Recommend: 20+ USDC\n`);

  console.log(`  Validator Wallet (reputation + budget set):`);
  console.log(`    ${wallets.validator.address}`);
  console.log(`    Recommend: 5+ USDC\n`);

  console.log("  Explorer links:");
  console.log(
    `    Owner:     https://testnet.arcscan.app/address/${wallets.owner.address}`
  );
  console.log(
    `    Validator: https://testnet.arcscan.app/address/${wallets.validator.address}`
  );

  // ── 4. Check current balances ────────────────────────────────────────────

  logger.section("CURRENT BALANCES");
  await walletManager.printBalances(wallets);

  // ── 5. Print next steps ──────────────────────────────────────────────────

  logger.section("NEXT STEPS");
  console.log("  1. Fund both wallets from faucet above");
  console.log("  2. Run the worker:");
  console.log("       npm start\n");
  console.log("  Wallet state saved to:");
  console.log(`    ./runtime/${workerId}/state/wallets.json\n`);
}

main().catch((err) => {
  console.error("\n[ERROR]", err.message);
  process.exit(1);
});
