# Arc Worker Bot

Autonomous AI agent bot cho [Arc Testnet](https://docs.arc.io) — thực thi tasks, xử lý ERC-8183 jobs, nhận USDC payments, và build on-chain reputation qua ERC-8004.

## Cấu trúc project

```
arc-worker-bot/
├── config/
│   ├── workers.json          # Worker config (poll interval, budget, etc.)
│   └── apis.json             # Arc API endpoints & contract addresses
├── scripts/
│   ├── scheduler.ts          # Main entry point - polling loop
│   ├── wallet-manager.ts     # Circle Developer-Controlled Wallet ops
│   ├── payment-handler.ts    # ERC-8183 job lifecycle (nanopayments)
│   ├── task-executor.ts      # Execute task definitions
│   ├── logger.ts             # Logger utility
│   ├── setup.ts              # One-time setup script
│   └── demo-unified-balance.ts # Demo Circle Unified Balance Kit (mới)
├── tasks/
│   └── tasks-worker-01.json  # Task definitions
├── runtime/
│   └── worker-01/
│       ├── results/          # API results (per task)
│       ├── transactions/     # Payment logs (tx hashes)
│       └── state/            # Worker state & wallet info
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

## Prerequisites

1. **Node.js v22+**
2. **Circle Developer account** — [console.circle.com](https://console.circle.com)
   - Tạo API key: Keys → Create a key → Standard Key
   - Register Entity Secret
3. **Testnet USDC** từ [faucet.circle.com](https://faucet.circle.com)

## Quick Start

### 1. Clone & install

```bash
git clone <repo>
cd arc-worker-bot
npm install
```

### 2. Config .env

```bash
cp .env.example .env
# Edit .env: điền CIRCLE_API_KEY và CIRCLE_ENTITY_SECRET
```

### 3. Setup (tạo wallets)

```bash
npm run setup
```

Output sẽ in địa chỉ 2 wallets — fund cả 2 từ faucet.

### 4. Chạy worker

```bash
npm start
```

### Docker

```bash
docker-compose up -d
docker-compose logs -f arc-worker-01
```

## Network Info

| Thông số    | Giá trị                             |
|-------------|-------------------------------------|
| Network     | Arc Testnet                         |
| Chain ID    | `5042002`                           |
| Gas Token   | USDC (không phải ETH)               |
| RPC         | `https://rpc.testnet.arc.network`   |
| Explorer    | `https://testnet.arcscan.app`       |
| Faucet      | `https://faucet.circle.com`         |

### Arc Testnet v0.7.2 Upgrade & Zero7 Hardfork Compatibility
Mạng testnet Arc đang nâng cấp lên phiên bản **`v0.7.2`** và sẽ kích hoạt hardfork **Zero7** vào ngày **18 tháng 6 năm 2026 lúc 14:00:00 UTC** (tức 21:00:00 giờ Việt Nam).
*   **Trạng thái tương thích của Bot**: Đã kiểm tra và **hoàn toàn tương thích** với phiên bản `v0.7.2` mới nhất:
    *   **Giới hạn Gas Cap 30M (mới)**: Mặc định `--rpc.gascap` của các node giảm xuống 30M. Các giao dịch do Agent tự động thực thi rất nhỏ (thường chỉ tốn từ 100k - 500k gas), do đó không bị ảnh hưởng bởi giới hạn này.
    *   **Từ chối giao dịch pre-EIP-155 (mặc định)**: Phiên bản node `v0.7.2` sẽ từ chối các giao dịch không có replay protection (pre-EIP-155). Bot sử dụng Circle Developer-Controlled Wallets và thư viện `viem`, tất cả các giao dịch được gửi đi đều được ký chuẩn EIP-155 mang Chain ID `5042002`, đảm bảo an toàn tuyệt đối và hoạt động liên tục.
    *   **Giới hạn Batch JSON-RPC 100 entries**: Bot không gửi các yêu cầu batch JSON-RPC lớn vượt quá giới hạn này nên không bị ảnh hưởng.
    *   **RPC Endpoints**: URL kết nối chính thức của bot vẫn giữ nguyên `https://rpc.testnet.arc.network` và dự phòng `https://arc-testnet.drpc.org`.

## Contract Addresses (Arc Testnet)

| Contract            | Address                                      |
|---------------------|----------------------------------------------|
| USDC                | `0x3600000000000000000000000000000000000000`  |
| cirBTC              | `0xf0c4a4ce82a5746abaad9425360ab04fbba432bf`  |
| AgenticCommerce     | `0x0747EEf0706327138c69792bF28Cd525089e4583`  |
| IdentityRegistry    | `0x8004A818BFB912233c491871b3d84c89A494BD9e`  |
| ReputationRegistry  | `0x8004B663056A597Dffe9eCcC1965A193B7388713`  |
| ValidationRegistry  | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`  |
| MultiCollateralPool | `0x9a74bf64a73d5e3fed03002640a59a511bf0e33d`  |

## Task Types

| Type                   | Mô tả                                        |
|------------------------|----------------------------------------------|
| `data_fetch`           | Fetch Arc block stats qua RPC                |
| `contract_interaction` | Đọc USDC balance từ contract                 |
| `onchain_identity`     | ERC-8004 register AI agent identity          |
| `payment_processing`   | ERC-8183 full job lifecycle (5 USDC escrow)  |
| `reputation_building`  | ERC-8004 giveFeedback on ReputationRegistry  |
| `lending_borrowing`    | Deposit USDC/cirBTC collateral, borrow EURC, auto-manage health factor |

## Agentic Multi-Collateral & Risk Governance Upgrade (Tính năng nâng cao)

Hệ thống tích hợp giao thức **Multi-Collateral Lending & Borrowing** nâng cao, quản trị rủi ro thế chấp tự động bằng AI Agent với 4 tính năng vượt trội:

1. **Smart Contract nâng cấp (`AgenticMultiCollateralPool.sol`)**:
   * Địa chỉ mới: `0x9a74bf64a73d5e3fed03002640a59a511bf0e33d`
   * Hỗ trợ thế chấp song song **USDC (6 decimals)** và **cirBTC (8 decimals)** để vay **EURC (6 decimals)**. Hạn mức vay mặc định (LTV) là 80% (tỷ giá vay cố định 1 USD = 1.10 EURC).
   * **Reputation-based LTV (ERC-8004)**: Tích hợp điểm uy tín của Agent. Nếu điểm >= 90, hạn mức vay tự động nâng lên **90% LTV**; nếu điểm >= 80, LTV nâng lên **85%**.

2. **Cơ chế Quản trị Rủi ro & Tự động Phòng thủ (Risk Governance Strategy)**:
   * AI Agent chạy tác vụ giám sát liên tục (`auto_manage` mỗi poll). Nếu **Health Factor (Hệ số an toàn) < 1.20**, bot sẽ tự động thực hiện 1 trong 3 mức phòng thủ tùy theo số dư ví:
     * **Mức 1 (Auto-Deposit)**: Nếu số dư ví >= 5.00 USDC, nạp thêm 5.00 USDC thế chấp để kéo HF lên mức an toàn.
     * **Mức 2 (Emergency Deleverage)**: Nếu số dư ví không đủ USDC và còn cirBTC thế chấp, Agent tự động gọi hàm `emergencyDeleverage(uint256)` bán cirBTC trực tiếp on-chain theo giá Oracle hiện tại để thanh lý một phần nợ EURC.
     * **Mức 3 (Circle CCTP Cross-Chain Bridge)**: Nếu cạn kiệt USDC và không còn cirBTC để bán, Agent giả lập bắc cầu mint 10.00 USDC xuyên chuỗi từ Base Sepolia sang Arc (chuyển tiền từ ví Validator sang Owner) và nạp thế chấp cứu vị thế.

3. **Tính toán Rủi ro Giá Thanh Lý BTC (BTC Liquidation Price Analytics)**:
   * Dashboard hiển thị giá thanh lý của Bitcoin thời gian thực dựa trên tỷ trọng nợ EURC và tài sản thế chấp USDC + cirBTC.
   * Công thức: `Liquidation Price = ((Debt / (LTV * Exchange Rate)) - USDC Collateral) / BTC Collateral`

4. **Bảng điều khiển Giả lập Khẩn cấp**:
   * Dashboard tại `http://localhost:3000` cung cấp đầy đủ các nút bấm simulator phục vụ kiểm thử:
     * **Crash BTC ($60k)** / **Restore ($90k)**: Thay đổi giá Oracle của Bitcoin.
     * **Sim Low USDC & Crash (Deleverage)**: Giả lập sập giá BTC khi ví Agent cạn USDC, buộc Agent kích hoạt bán tự động cirBTC giảm nợ trên chuỗi.
     * **Sim Low USDC & Crash (CCTP Bridge)**: Giả lập sập giá BTC khi ví cạn USDC và thế chấp không còn cirBTC để bán, buộc Agent bắc cầu USDC xuyên chuỗi.

## Demo Thanh Toán Tự Động Gas-Free (demo.html)

Dự án cung cấp một trang kiểm thử tương tác độc lập để minh họa khả năng thanh toán tự động, liên tục ở tốc độ cao của AI Agent:

* **Cách truy cập**: Mở trình duyệt và truy cập **`http://localhost:3000/demo.html`** hoặc click nút **"Demo Thanh Toán Tự Động"** ở thanh điều hướng trên Dashboard.
* **Quy trình hoạt động**:
  1. Người dùng nhập địa chỉ ví nhận USDC (mạng Arc Testnet).
  2. Bấm **"Kích Hoạt 20 Thanh Toán Tự Động"**: Client gửi yêu cầu và máy chủ sẽ sinh ra một phiên chạy (`runId`), đồng thời chạy một luồng xử lý ngầm (asynchronous background worker).
  3. Máy chủ sử dụng Circle Developer-Controlled Wallets thực hiện gửi **20 giao dịch chuyển USDC** liên tiếp đến ví nhận. Phí gas và tiền USDC được tài trợ hoàn toàn bởi ví Owner của Agent.
  4. Các yêu cầu được giãn cách **`1.5 giây`** để tránh hoàn toàn lỗi quá tải `429 Too Many Requests` (Rate limit của Circle Sandbox).
  5. Giao diện hiển thị trực quan tiến trình hoàn thành và cung cấp các link mã băm giao dịch (`txHash`) on-chain liên kết trực tiếp sang ArcScan Explorer để kiểm tra thời gian thực.
## Demo Số Dư Hợp Nhất Cross-Chain (Unified Balance Kit)

Dự án tích hợp và trình diễn tính năng **Unified Balance Kit** mới nhất của Circle để đơn giản hóa việc quản lý và luân chuyển tài sản xuyên chuỗi:

* **Cách chạy thử nghiệm:**
  ```bash
  npm run demo:unified
  ```
* **Chức năng thực hiện:**
  1. Khởi tạo `UnifiedBalanceKit` kết hợp với `CircleWalletsAdapter` (DCW).
  2. Truy vấn số dư USDC của ví Owner cùng lúc trên hai mạng **Arc Testnet** và **Base Sepolia**.
  3. Tính toán và hiển thị tổng số dư hợp nhất (Unified Balance) của ví.
  4. Trình diễn cách gọi hàm `spend()` để tự động rút và mint USDC xuyên chuỗi mà không cần lập trình viên viết code bridge CCTP thủ công.

## Runtime Files

- `runtime/worker-01/state/wallets.json` — wallet addresses & IDs
- `runtime/worker-01/state/worker.json` — worker status, poll count
- `runtime/worker-01/results/*.json` — kết quả từng task
- `runtime/worker-01/transactions/*.json` — job results với tx hashes

## Docs

- Arc: https://docs.arc.io
- Circle Wallets: https://developers.circle.com
- ERC-8004 (AI Agent Identity): https://eips.ethereum.org/EIPS/eip-8004
- ERC-8183 (Agentic Commerce): https://testnet.arcscan.app/address/0x0747EEf0706327138c69792bF28Cd525089e4583

