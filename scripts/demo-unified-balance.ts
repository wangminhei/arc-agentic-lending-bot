/**
 * demo-unified-balance.ts
 *
 * Chương trình demo tích hợp và sử dụng @circle-fin/unified-balance-kit mới của Circle.
 * Thực hiện:
 * 1. Khởi tạo Unified Balance Kit Context.
 * 2. Sử dụng Circle Wallets Adapter để đọc số dư USDC hợp nhất (Unified Balance) của ví Owner
 *    trên nhiều chuỗi (Arc Testnet và Base Sepolia Sepolia) đồng thời.
 * 3. Trình diễn cách thực hiện cross-chain spend (rút/chuyển tiền xuyên chuỗi tự động).
 *
 * Chạy demo:
 *   npm run demo:unified
 */

import {
  createUnifiedBalanceKitContext,
  getBalances,
  estimateSpend,
  spend
} from "@circle-fin/unified-balance-kit";
import { createCircleWalletsAdapter } from "@circle-fin/adapter-circle-wallets";
import fs from "fs";
import path from "path";

// ─── Thiết lập môi trường và cấu hình ──────────────────────────────────────────

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;

if (!apiKey || !entitySecret) {
  console.error("❌ Lỗi: Thiếu CIRCLE_API_KEY hoặc CIRCLE_ENTITY_SECRET trong file .env!");
  process.exit(1);
}

// Đọc địa chỉ ví Owner từ runtime state để kiểm tra
const WORKER_ID = "worker-01";
const walletsPath = path.resolve(`./runtime/${WORKER_ID}/state/wallets.json`);
let ownerAddress = "";
try {
  if (fs.existsSync(walletsPath)) {
    const wallets = JSON.parse(fs.readFileSync(walletsPath, "utf-8"));
    ownerAddress = wallets.owner?.address || "";
  }
} catch (err) {
  console.log("⚠️ Không đọc được ví owner từ state. Sẽ sử dụng chế độ truy vấn tự động.");
}

async function main() {
  console.log("================================================================================");
  console.log("   ⚡  CIRCLE UNIFIED BALANCE KIT - CROSS-CHAIN DEMO");
  console.log("================================================================================");

  // 1. Khởi tạo adapter kết nối với Developer-Controlled Wallets của Circle
  console.log("1. Đang khởi tạo Circle Wallets Adapter...");
  const adapter = createCircleWalletsAdapter({
    apiKey,
    entitySecret,
  });

  // 2. Tạo Unified Balance Kit Context (sử dụng mặc định Gateway v1 Provider)
  console.log("2. Đang tạo Unified Balance Kit Context...");
  const context = createUnifiedBalanceKitContext();

  // 3. Truy vấn số dư USDC hợp nhất (Unified Balance)
  try {
    if (!ownerAddress) {
      throw new Error("Không tìm thấy địa chỉ ví Owner trong file state để thực hiện truy vấn.");
    }
    const balances = await getBalances(context, {
      sources: {
        adapter,
        address: ownerAddress,
        chains: ["Arc_Testnet", "Base_Sepolia"]
      }
    });

    console.log("\n--------------------------------------------------------------------------------");
    console.log("📊 KẾT QUẢ SỐ DƯ HỢP NHẤT (UNIFIED BALANCES):");
    console.log("--------------------------------------------------------------------------------");
    console.log(`💵 Tổng số dư đã xác nhận (Total Confirmed): ${balances.totalConfirmedBalance} USDC`);
    console.log(`⏳ Tổng số dư đang xử lý (Total Pending):    ${balances.totalPendingBalance || "0"} USDC`);
    console.log("\nChi tiết số dư theo từng chuỗi (Per-Chain Balances):");
    
    // In chi tiết số dư trên từng mạng được hỗ trợ
    if (balances.balances && balances.balances.length > 0) {
      balances.balances.forEach((b: any) => {
        console.log(`  • [${b.chain}]: ${b.confirmedBalance} USDC (Địa chỉ ví: ${b.address})`);
      });
    } else {
      console.log("  (Không tìm thấy số dư hoạt động trên các chuỗi)");
    }
    console.log("--------------------------------------------------------------------------------\n");

  } catch (err: any) {
    console.error("❌ Lỗi truy vấn số dư hợp nhất:", err.message);
  }

  // 4. Trình diễn code giả định về cách Spend / Cross-chain Transfer tự động
  console.log("4. Minh họa cơ chế chuyển tiền xuyên chuỗi tự động (Unified Spend):");
  console.log("   Với Unified Balance Kit, khi Agent cần tiếp quỹ 5.00 USDC từ Base Sepolia sang Arc Testnet,");
  console.log("   chúng ta chỉ cần gọi hàm spend() mà không cần viết bất kỳ logic bridge thủ công nào:");
  
  console.log(`
  \`\`\`typescript
  // 1. Ước tính phí giao dịch trước khi thực hiện chuyển
  const estimate = await estimateSpend(context, {
    amount: "5.00",
    from: {
      adapter,
      allocations: { amount: "5.00", chain: "Base_Sepolia" }, // Rút từ ví Base Sepolia
    },
    to: { adapter, chain: "Arc_Testnet" }, // Mint trực tiếp sang ví Arc Testnet
  });
  console.log("Estimated bridge fees:", estimate.fees, "USDC");

  // 2. Kích hoạt giao dịch spend (rút và mint tự động)
  const result = await spend(context, {
    amount: "5.00",
    from: {
      adapter,
      allocations: { amount: "5.00", chain: "Base_Sepolia" },
    },
    to: { adapter, chain: "Arc_Testnet" },
  });
  console.log("Spend Succeeded! Transaction Hash:", result.txHash);
  console.log("Explorer URL:", result.explorerUrl);
  \`\`\`
  `);

  console.log("================================================================================");
  console.log("✅ Demo kết thúc thành công!");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("❌ Lỗi thực thi demo chính:", err);
});
