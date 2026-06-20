/**
 * scripts/swap-eurc-to-usdc.ts
 * Thủ công hoán đổi EURC sang USDC trên Arc Testnet bằng Circle App Kit (DCW)
 * 
 * Usage:
 *   npx tsx --env-file=.env scripts/swap-eurc-to-usdc.ts [amount_eurc]
 *   Ví dụ: npx tsx --env-file=.env scripts/swap-eurc-to-usdc.ts 1700
 */

import { WalletManager } from "./wallet-manager.js";
import { Logger } from "./logger.js";
import { createPublicClient, http, formatUnits, type Address } from "viem";
import { arcTestnet } from "viem/chains";

const logger = new Logger("SwapTool");

const EURC_CONTRACT = "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a" as Address;
const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

async function main(): Promise<void> {
  logger.section("SWAP TOOL: EURC → USDC");

  const workerId = process.env.WORKER_ID || "worker-01";
  const walletManager = new WalletManager(workerId);
  const wallets = walletManager.loadWalletState();

  if (!wallets) {
    logger.error("Không tìm thấy cấu hình ví. Vui lòng chạy 'npm run setup' trước.");
    process.exit(1);
  }

  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"),
  });

  // 1. Kiểm tra balance EURC của Owner
  logger.info(`Đang truy vấn số dư EURC của Owner (${wallets.owner.address})...`);
  const balRaw = await publicClient.readContract({
    address: EURC_CONTRACT,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: [wallets.owner.address as Address],
  });
  const ownerEURC = parseFloat(formatUnits(balRaw, 6));
  logger.info(`Số dư hiện tại: ${ownerEURC} EURC`);

  // 2. Xác định số lượng cần swap
  const args = process.argv.slice(2);
  let swapAmount = 0;
  if (args.length > 0) {
    swapAmount = parseFloat(args[0]);
  } else {
    // Mặc định swap hầu hết số EURC hiện có (chừa lại 1 EURC làm dự phòng)
    swapAmount = Math.max(0, Math.floor(ownerEURC - 1));
  }

  if (swapAmount <= 0) {
    logger.error(`Số lượng swap không hợp lệ: ${swapAmount} EURC. Hoặc số dư EURC quá thấp.`);
    process.exit(1);
  }

  if (swapAmount > ownerEURC) {
    logger.error(`Số lượng cần swap (${swapAmount} EURC) vượt quá số dư hiện tại của Owner (${ownerEURC} EURC).`);
    process.exit(1);
  }

  logger.info(`Chuẩn bị swap ${swapAmount} EURC sang USDC...`);

  // 3. Thực hiện swap
  try {
    const swapResult = await walletManager.swapToken(
      wallets.owner.id,
      wallets.owner.address,
      swapAmount.toFixed(2),
      "EURC", // tokenIn
      "USDC"  // tokenOut
    );

    logger.success("Hoán đổi EURC → USDC thành công!");
    console.log(`  Giao dịch swap: ${swapResult.txHash}`);
    console.log(`  Số lượng USDC ước tính nhận được: ${swapResult.amountOut || "N/A"}`);
    console.log(`  Chi tiết tx: https://testnet.arcscan.app/tx/${swapResult.txHash}`);

    // Đợi 5 giây rồi check lại balance mới
    logger.info("Đợi cập nhật trạng thái số dư mới...");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await walletManager.printBalances(wallets);

  } catch (error: any) {
    logger.error(`Swap thất bại: ${error.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n[ERROR]", err.message);
  process.exit(1);
});
