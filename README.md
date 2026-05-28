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

## Task Types

| Type                   | Mô tả                                        |
|------------------------|----------------------------------------------|
| `data_fetch`           | Fetch Arc block stats qua RPC                |
| `contract_interaction` | Đọc USDC balance từ contract                 |
| `onchain_identity`     | ERC-8004 register AI agent identity          |
| `payment_processing`   | ERC-8183 full job lifecycle (5 USDC escrow)  |
| `reputation_building`  | ERC-8004 giveFeedback on ReputationRegistry  |

## Task Schedules

| Schedule              | Ý nghĩa                            |
|-----------------------|------------------------------------|
| `every_poll`          | Chạy mỗi poll cycle               |
| `once`                | Chạy đúng 1 lần, skip sau đó      |
| `manual`              | Chỉ chạy khi trigger thủ công     |
| `after_task_complete` | Chạy sau khi task khác hoàn thành |

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
