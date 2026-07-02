// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IMultiCollateralPool {
    function depositUSDCFor(address user, uint256 amount) external;
    function usdcToken() external view returns (address);
}

library Client {
    struct EVMTokenAmount {
        address token;
        uint256 amount;
    }

    struct Any2EVMMessage {
        bytes32 messageId;
        uint64 sourceChainSelector;
        bytes sender;
        bytes data;
        EVMTokenAmount[] destTokenAmounts;
    }
}

interface IAny2EVMMessageReceiver {
    function ccipReceive(Client.Any2EVMMessage calldata message) external;
}

contract AgenticCCIPReceiver is IAny2EVMMessageReceiver {
    address public router;
    address public pool;
    address public owner;
    
    mapping(uint64 => bool) public whitelistedChains;
    mapping(address => bool) public whitelistedSenders;

    event MessageReceived(
        bytes32 indexed messageId,
        uint64 indexed sourceChainSelector,
        address sender,
        address agent,
        uint256 amount
    );

    modifier onlyRouter() {
        require(msg.sender == router, "Only router can call this");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }

    constructor(address _router, address _pool, address _owner) {
        router = _router;
        pool = _pool;
        owner = _owner;
    }

    function setWhitelistChain(uint64 chainSelector, bool allowed) external onlyOwner {
        whitelistedChains[chainSelector] = allowed;
    }

    function setWhitelistSender(address sender, bool allowed) external onlyOwner {
        whitelistedSenders[sender] = allowed;
    }

    function ccipReceive(Client.Any2EVMMessage calldata message) external override onlyRouter {
        require(whitelistedChains[message.sourceChainSelector], "Source chain not whitelisted");
        address sender = abi.decode(message.sender, (address));
        require(whitelistedSenders[sender], "Sender not whitelisted");

        // Parse data: agent (address), amount (uint256)
        (address agent, uint256 amount) = abi.decode(message.data, (address, uint256));
        require(agent != address(0), "Invalid agent address");
        require(amount > 0, "Invalid amount");

        address usdc = IMultiCollateralPool(pool).usdcToken();

        // 1. If CCIP transferred tokens along (real CCIP token transfer)
        if (message.destTokenAmounts.length > 0) {
            address tokenTransferred = message.destTokenAmounts[0].token;
            uint256 amountTransferred = message.destTokenAmounts[0].amount;
            
            require(tokenTransferred == usdc, "Unsupported transferred token");
            
            // Approve pool to pull tokens
            IERC20(usdc).approve(pool, amountTransferred);
            
            // Deposit on behalf of agent
            IMultiCollateralPool(pool).depositUSDCFor(agent, amountTransferred);
            
            emit MessageReceived(message.messageId, message.sourceChainSelector, sender, agent, amountTransferred);
        } else {
            // 2. Message-only trigger (USDC is already in this Receiver contract, or mock credit)
            uint256 receiverBalance = IERC20(usdc).balanceOf(address(this));
            if (receiverBalance >= amount) {
                IERC20(usdc).approve(pool, amount);
                IMultiCollateralPool(pool).depositUSDCFor(agent, amount);
            }
            
            emit MessageReceived(message.messageId, message.sourceChainSelector, sender, agent, amount);
        }
    }
}
