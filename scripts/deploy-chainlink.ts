/**
 * deploy-chainlink.ts
 * Biên dịch và deploy các contract Chainlink Mock & CCIP Receiver lên Arc Testnet
 */

import fs from "fs";
import path from "path";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
// @ts-ignore
import solc from "solc";
import { WalletManager } from "./wallet-manager.js";

const BASE_SEPOLIA_SELECTOR = 1034497123587106507n; // Base Sepolia Chain Selector

async function compileContract(fileName: string, contractName: string) {
  const contractPath = path.resolve(`./contracts/${fileName}`);
  if (!fs.existsSync(contractPath)) {
    throw new Error(`Solidity file not found at ${contractPath}`);
  }

  const source = fs.readFileSync(contractPath, "utf8");

  const input = {
    language: "Solidity",
    sources: {
      [fileName]: {
        content: source,
      },
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    let hasError = false;
    for (const error of output.errors) {
      console.error(error.formattedMessage);
      if (error.severity === "error") {
        hasError = true;
      }
    }
    if (hasError) {
      throw new Error(`Solidity compilation failed for ${fileName}`);
    }
  }

  const contractOutput = output.contracts[fileName][contractName];
  return {
    abi: contractOutput.abi,
    bytecode: contractOutput.evm.bytecode.object,
  };
}

async function main() {
  console.log("=== COMPILING CHAINLINK CONTRACTS ===");
  
  const mockAggregator = await compileContract("MockAggregatorV3.sol", "MockAggregatorV3");
  console.log("✓ MockAggregatorV3 compiled.");

  const mockRouter = await compileContract("MockCCIPRouter.sol", "MockCCIPRouter");
  console.log("✓ MockCCIPRouter compiled.");

  const ccipReceiver = await compileContract("AgenticCCIPReceiver.sol", "AgenticCCIPReceiver");
  console.log("✓ AgenticCCIPReceiver compiled.");

  const stateDir = path.resolve("./runtime/worker-01/state");
  fs.mkdirSync(stateDir, { recursive: true });

  // Save ABIs
  fs.writeFileSync(path.join(stateDir, "MockAggregatorABI.json"), JSON.stringify(mockAggregator.abi, null, 2));
  fs.writeFileSync(path.join(stateDir, "MockRouterABI.json"), JSON.stringify(mockRouter.abi, null, 2));
  fs.writeFileSync(path.join(stateDir, "CCIPReceiverABI.json"), JSON.stringify(ccipReceiver.abi, null, 2));
  console.log("✓ Contract ABIs saved to state.");

  // Load private key of nanopay local wallet
  const walletFile = path.join(stateDir, "nanopay-wallet.json");
  if (!fs.existsSync(walletFile)) {
    throw new Error(`nanopay-wallet.json not found. Please run the bot first to generate it.`);
  }

  const walletState = JSON.parse(fs.readFileSync(walletFile, "utf8"));
  const privateKey = walletState.privateKey as `0x${string}`;
  const account = privateKeyToAccount(privateKey);

  console.log(`Deployer address: ${account.address}`);

  const rpcUrl = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
  const publicClient = createPublicClient({
    chain: arcTestnet,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(rpcUrl),
  });

  // Get Pool address from contracts.json
  const contractsConfigPath = path.join(stateDir, "contracts.json");
  if (!fs.existsSync(contractsConfigPath)) {
    throw new Error(`contracts.json not found at ${contractsConfigPath}`);
  }
  const contractsConfig = JSON.parse(fs.readFileSync(contractsConfigPath, "utf8"));
  const poolAddress = contractsConfig["multi_collateral_pool"];
  if (!poolAddress) {
    throw new Error("Lending pool address not found in contracts.json");
  }
  console.log(`Target Multi-Collateral Pool: ${poolAddress}`);

  // 1. Deploy MockAggregatorV3
  console.log("\n--- Deploying MockAggregatorV3 ---");
  const aggHash = await walletClient.deployContract({
    abi: mockAggregator.abi,
    bytecode: `0x${mockAggregator.bytecode}`,
  });
  console.log(`Tx sent: ${aggHash}`);
  let receipt = await publicClient.waitForTransactionReceipt({ hash: aggHash });
  const aggregatorAddress = receipt.contractAddress!;
  console.log(`✅ MockAggregatorV3 Address: ${aggregatorAddress}`);

  // 2. Deploy MockCCIPRouter
  console.log("\n--- Deploying MockCCIPRouter ---");
  const routerHash = await walletClient.deployContract({
    abi: mockRouter.abi,
    bytecode: `0x${mockRouter.bytecode}`,
  });
  console.log(`Tx sent: ${routerHash}`);
  receipt = await publicClient.waitForTransactionReceipt({ hash: routerHash });
  const routerAddress = receipt.contractAddress!;
  console.log(`✅ MockCCIPRouter Address: ${routerAddress}`);

  // 3. Deploy AgenticCCIPReceiver
  console.log("\n--- Deploying AgenticCCIPReceiver ---");
  const receiverHash = await walletClient.deployContract({
    abi: ccipReceiver.abi,
    bytecode: `0x${ccipReceiver.bytecode}`,
    args: [routerAddress, poolAddress, account.address],
  });
  console.log(`Tx sent: ${receiverHash}`);
  receipt = await publicClient.waitForTransactionReceipt({ hash: receiverHash });
  const receiverAddress = receipt.contractAddress!;
  console.log(`✅ AgenticCCIPReceiver Address: ${receiverAddress}`);

  // 4. Configure Multi-Collateral Pool to use Mock Price Feed & Enable toggle via Circle Owner SCA
  console.log("\n--- Configuring Price Feed on Lending Pool via Circle Owner SCA ---");
  const walletManager = new WalletManager("worker-01");
  const wallets = await walletManager.getOrCreateWallets();

  // Set Feed
  console.log("Setting price feed address via Circle SCA...");
  const setFeedTx = await walletManager.executeContract(
    wallets.owner.address,
    poolAddress,
    "setBTCPriceFeed(address)",
    [aggregatorAddress],
    "Configure Price Feed on Lending Pool"
  );
  console.log(`✓ BTC Price Feed updated on pool. Tx: ${setFeedTx}`);

  // Enable Chainlink Oracle by default
  console.log("Enabling Chainlink Oracle toggle via Circle SCA...");
  const setToggleTx = await walletManager.executeContract(
    wallets.owner.address,
    poolAddress,
    "setUseChainlinkOracle(bool)",
    [true],
    "Enable Chainlink Oracle"
  );
  console.log(`✓ Chainlink Oracle toggled to TRUE. Tx: ${setToggleTx}`);

  // 5. Configure Receiver Whitelist
  console.log("\n--- Configuring AgenticCCIPReceiver Whitelist ---");
  const receiverAbi = parseAbi([
    "function setWhitelistChain(uint64 chainSelector, bool allowed) external",
    "function setWhitelistSender(address sender, bool allowed) external"
  ]);

  // Whitelist Base Sepolia
  console.log("Whitelisting Base Sepolia Chain Selector...");
  let recTx = await walletClient.writeContract({
    address: receiverAddress,
    abi: receiverAbi,
    functionName: "setWhitelistChain",
    args: [BASE_SEPOLIA_SELECTOR, true],
  });
  await publicClient.waitForTransactionReceipt({ hash: recTx });

  // Whitelist Deployer Address (to simulated mock sending)
  console.log("Whitelisting deployer/sender address...");
  recTx = await walletClient.writeContract({
    address: receiverAddress,
    abi: receiverAbi,
    functionName: "setWhitelistSender",
    args: [account.address, true],
  });
  await publicClient.waitForTransactionReceipt({ hash: recTx });
  console.log("✓ Receiver whitelisting completed.");

  // Save address config
  contractsConfig["btc_price_feed"] = aggregatorAddress;
  contractsConfig["ccip_router"] = routerAddress;
  contractsConfig["ccip_receiver"] = receiverAddress;
  fs.writeFileSync(contractsConfigPath, JSON.stringify(contractsConfig, null, 2));

  console.log(`\n=========================================`);
  console.log(`✅ All Chainlink components deployed and linked!`);
  console.log(`BTC Price Feed:  ${aggregatorAddress}`);
  console.log(`CCIP Router:     ${routerAddress}`);
  console.log(`CCIP Receiver:   ${receiverAddress}`);
  console.log(`=========================================\n`);
}

main().catch((err) => {
  console.error("Chainlink Deployment failed:", err);
  process.exit(1);
});
