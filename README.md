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
│   └── setup.ts              # One-time setup script
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

## Contract Addresses (Arc Testnet)

| Contract            | Address                                      |
|---------------------|----------------------------------------------|
| USDC                | `0x3600000000000000000000000000000000000000`  |
| AgenticCommerce     | `0x0747EEf0706327138c69792bF28Cd525089e4583`  |
| IdentityRegistry    | `0x8004A818BFB912233c491871b3d84c89A494BD9e`  |
| ReputationRegistry  | `0x8004B663056A597Dffe9eCcC1965A193B7388713`  |
| ValidationRegistry  | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`  |
| AgenticLendingPool  | `0xedcdc17827a787ef5802335d1ac24df5764fa858`  | (Deployed Contract)

## Task Types

| Type                   | Mô tả                                        |
|------------------------|----------------------------------------------|
| `data_fetch`           | Fetch Arc block stats qua RPC                |
| `contract_interaction` | Đọc USDC balance từ contract                 |
| `onchain_identity`     | ERC-8004 register AI agent identity          |
| `payment_processing`   | ERC-8183 full job lifecycle (5 USDC escrow)  |
| `reputation_building`  | ERC-8004 giveFeedback on ReputationRegistry  |
| `lending_borrowing`    | Deposit USDC collateral, borrow EURC, auto-manage health factor |

## Agentic Lending & Borrowing (Tính năng nâng cao)

Hệ thống tích hợp một giao thức **Lending & Borrowing** thông minh, quản trị dòng tiền tự động (Machine-Speed Treasury):

1. **Smart Contract (`AgenticLendingPool.sol`)**:
   * Địa chỉ: `0xedcdc17827a787ef5802335d1ac24df5764fa858`
   * Cho phép nạp USDC làm tài sản thế chấp (Collateral), vay EURC với hạn mức tối đa **80% LTV** (tỷ giá cố định 1 USDC = 1.10 EURC).
   * Hỗ trợ rút tài sản thế chấp và hoàn trả EURC để giảm nợ.

2. **Cơ chế Tự động Phòng vệ (Credit Line Auto-Defense)**:
   * Tích hợp tác vụ tự động giám sát trạng thái tài khoản (`auto_manage`).
   * Khi **Health Factor (Hệ số an toàn)** giảm xuống dưới **`1.20`** (nguy cơ thanh lý cao do vay nhiều hoặc rút bớt tài sản thế chấp), bot sẽ tự động rút **`5.00 USDC`** từ ví Treasury nạp thêm vào hợp đồng thông minh để tăng Health Factor lên mức an toàn (`2.20`).

3. **Giao diện Glassmorphic Dashboard Web**:
   * Cập nhật Tab **Lending & Borrowing** trực quan tại cổng `http://localhost:3005`.
   * Hiển thị thời gian thực các chỉ số tài chính: *USDC Collateral, EURC Borrowed, Max Borrow Power, LTV Progress Bar, và Health Factor*.
   * Cung cấp bảng điều khiển thủ công cho các thao tác: *Deposit, Borrow, Repay, Withdraw*.

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

