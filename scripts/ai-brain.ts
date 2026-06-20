import axios from "axios";
import { Logger } from "./logger.js";

const logger = new Logger("AIBrain");

export interface AgentState {
  ownerUSDC: number;
  ownerEURC: number;
  ownerBTC: number;
  collateralUSDC: number;
  collateralCirBTC: number;
  borrowedEURC: number;
  healthFactor: number; // e.g. 1.34 or 1.20
  btcPrice: number;
  repScore: number;
}

export interface AIDecision {
  action: "DEPOSIT_COLLATERAL" | "BORROW_EURC" | "REPAY_DEBT" | "A2A_COMMERCE" | "NO_ACTION";
  amount: string;
  reason: string;
  mode: "REAL_AI" | "FALLBACK";
}

export class AIBrain {
  private apiKey: string | undefined;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    if (!this.apiKey || this.apiKey.trim() === "") {
      logger.warn("⚠️ GEMINI_API_KEY chưa được cấu hình trong .env. AI Brain sẽ tự động chuyển sang chế độ mô phỏng (Fallback Mode).");
    }
  }

  async getDecision(state: AgentState): Promise<AIDecision> {
    if (!this.apiKey || this.apiKey.trim() === "") {
      return this.getFallbackDecision(state);
    }

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`;
      
      const prompt = `Bạn là bộ não AI quyết định (AI Decision Engine) của một AI Agent đang chạy trên blockchain Arc Testnet.
Nhiệm vụ của bạn là đọc trạng thái tài chính hiện tại và đưa ra quyết định hành động tối ưu để quản lý tài sản, tối ưu hóa lợi nhuận và phòng ngừa rủi ro thanh lý.

Thông tin trạng thái hiện tại:
- Ví Owner: ${state.ownerUSDC} USDC | ${state.ownerEURC} EURC | ${state.ownerBTC} cirBTC
- Vị thế vay Lending Pool:
  + USDC thế chấp: ${state.collateralUSDC} USDC
  + cirBTC thế chấp: ${state.collateralCirBTC} cirBTC
  + EURC đang vay (nợ): ${state.borrowedEURC} EURC
  + Hệ số an toàn (Health Factor - HF): ${state.healthFactor} (ví dụ: 1.34 tức là 134%)
  + Giá Bitcoin hiện tại: $${state.btcPrice}
- Uy tín Agent (Reputation Score): ${state.repScore}/100 (Uy tín >= 90 tăng LTV lên 90%, >= 80 tăng lên 85%, bình thường là 80%)

Hãy đưa ra quyết định hành động bằng cách trả về đúng định dạng JSON sau (không chứa markdown, không chứa \`\`\`json, chỉ trả về JSON thuần):
{
  "action": "DEPOSIT_COLLATERAL" | "BORROW_EURC" | "REPAY_DEBT" | "A2A_COMMERCE" | "NO_ACTION",
  "amount": "số lượng token hành động (ví dụ: '5.00' USDC hoặc '4.00' EURC, định dạng chuỗi)",
  "reason": "Giải thích chi tiết lý do bạn đưa ra quyết định này bằng tiếng Việt (tối đa 150 ký tự)"
}

Quy tắc quyết định:
1. Nếu Health Factor nguy hiểm (< 1.20) và ví Owner còn USDC (>= 5.00 USDC): Hãy chọn "DEPOSIT_COLLATERAL" với amount '5.00' để nạp thêm thế chấp cứu vị thế.
2. Nếu Health Factor nguy hiểm (< 1.20) và ví Owner cạn USDC nhưng còn EURC (>= 5.00 EURC): Hãy chọn "REPAY_DEBT" với amount '5.00' để trả bớt nợ.
3. Nếu Health Factor rất an toàn (>= 1.50) và bạn muốn tối ưu dòng vốn: Hãy chọn "BORROW_EURC" với amount '5.00' để vay thêm EURC.
4. Nếu Health Factor ở mức trung bình (1.20 - 1.50) và bạn muốn tích lũy thêm dữ liệu phân tích thị trường cho Agent, hãy chọn "A2A_COMMERCE" với amount '0.05' để mua báo cáo phân tích giá Bitcoin từ Agent 2 (giá 0.05 USDC).
5. Nếu mọi thứ bình thường, chọn "NO_ACTION" với amount '0.00'.`;

      const response = await axios.post(
        url,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json"
          }
        },
        { headers: { "Content-Type": "application/json" }, timeout: 10000 }
      );

      const responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!responseText) {
        throw new Error("Không nhận được phản hồi từ Gemini API");
      }

      const decision: AIDecision = JSON.parse(responseText.trim());
      return {
        ...decision,
        mode: "REAL_AI"
      };

    } catch (error: any) {
      logger.error(`[AIBrain Error] Lỗi khi gọi Gemini API: ${error.message}. Chuyển sang Fallback.`);
      return this.getFallbackDecision(state);
    }
  }

  private getFallbackDecision(state: AgentState): AIDecision {
    // Logic fallback mô phỏng
    let action: AIDecision["action"] = "NO_ACTION";
    let amount = "0.00";
    let reason = "Mọi chỉ số đều nằm trong mức an toàn ổn định.";

    if (state.healthFactor < 1.20) {
      if (state.ownerUSDC >= 5.0) {
        action = "DEPOSIT_COLLATERAL";
        amount = "5.00";
        reason = `[Fallback AI] Health Factor nguy hiểm (${state.healthFactor} < 1.20). AI khuyên nạp 5.00 USDC thế chấp để cứu vị thế.`;
      } else if (state.ownerEURC >= 5.0) {
        action = "REPAY_DEBT";
        amount = "5.00";
        reason = `[Fallback AI] Ví cạn USDC, Health Factor thấp (${state.healthFactor}). AI khuyên dùng 5.00 EURC để trả bớt nợ.`;
      } else {
        reason = `[Fallback AI] Cảnh báo! Health Factor thấp (${state.healthFactor}) nhưng ví Owner đã cạn kiệt tài sản.`;
      }
    } else if (state.healthFactor >= 1.60 && state.ownerUSDC < 200.0) {
      action = "BORROW_EURC";
      amount = "10.00";
      reason = `[Fallback AI] Health Factor cực kỳ an toàn (${state.healthFactor} >= 1.60). AI khuyên tận dụng hạn mức để vay thêm 10.00 EURC tối ưu vốn.`;
    } else {
      // 30% cơ hội thực hiện thương mại A2A để mua báo cáo giá BTC khi rảnh rỗi
      if (Math.random() < 0.3) {
        action = "A2A_COMMERCE";
        amount = "0.05";
        reason = `[Fallback AI] Vị thế lending an toàn. AI khuyên trích 0.05 USDC mua báo cáo phân tích BTC từ Agent 2 để cập nhật dữ liệu.`;
      }
    }

    return {
      action,
      amount,
      reason,
      mode: "FALLBACK"
    };
  }
}

// Chạy test nhanh khi chạy độc lập
if (process.argv.includes("--test")) {
  const brain = new AIBrain();
  const testState: AgentState = {
    ownerUSDC: 129.94,
    ownerEURC: 1857.22,
    ownerBTC: 0.00479,
    collateralUSDC: 15.0,
    collateralCirBTC: 0.0001,
    borrowedEURC: 18.0,
    healthFactor: 1.34,
    btcPrice: 90000,
    repScore: 95
  };
  
  console.log("Đang chạy thử nghiệm AI Brain với trạng thái giả định...");
  brain.getDecision(testState).then((res) => {
    console.log("=== KẾT QUẢ AI BRAIN DECISION ===");
    console.log(JSON.stringify(res, null, 2));
  }).catch(console.error);
}
