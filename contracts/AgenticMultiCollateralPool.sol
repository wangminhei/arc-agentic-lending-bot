// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);
    function getRoundData(uint80 _roundId) external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

contract AgenticMultiCollateralPool {
    address public usdcToken;
    address public eurcToken;
    address public cirbtcToken;
    address public owner;
    
    // Chainlink price feed configs
    address public btcPriceFeed;
    bool public useChainlinkOracle;
    
    // Simulating LTV = 80% (Base) and Exchange Rate: 1.10 EURC per USD (scaled by 100)
    uint256 public constant EXCHANGE_RATE = 110;
    
    // Simulated BTC Price (scaled by 10^6, e.g. 90000 * 10^6 = 90000000000)
    uint256 public btcPrice;
    
    // On-chain Reputation mapping (ERC-8004 sync score)
    mapping(address => uint256) public userReputation;
    
    struct UserPosition {
        uint256 collateralUSDC;   // USDC collateral (6 decimals)
        uint256 collateralCirBTC; // cirBTC collateral (8 decimals)
        uint256 borrowedEURC;     // EURC borrowed debt (6 decimals)
        uint256 lastUpdated;
    }
    
    mapping(address => UserPosition) public positions;
    
    event DepositedUSDC(address indexed user, uint256 amount);
    event DepositedCirBTC(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event WithdrawnUSDC(address indexed user, uint256 amount);
    event WithdrawnCirBTC(address indexed user, uint256 amount);
    event PriceUpdated(uint256 newPrice);
    event ReputationUpdated(address indexed user, uint256 score);
    event Deleveraged(address indexed user, uint256 cirBTCAmount, uint256 eurcRepaid);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }
    
    constructor(address _usdcToken, address _eurcToken, address _cirbtcToken, address _owner) {
        usdcToken = _usdcToken;
        eurcToken = _eurcToken;
        cirbtcToken = _cirbtcToken;
        owner = _owner;
        btcPrice = 90000 * 10**6; // Initial price of BTC = $90,000
    }
    
    function setBTCPriceFeed(address _feed) external onlyOwner {
        btcPriceFeed = _feed;
    }
    
    function setUseChainlinkOracle(bool _use) external onlyOwner {
        useChainlinkOracle = _use;
    }
    
    function setBTCPrice(uint256 newPrice) external onlyOwner {
        btcPrice = newPrice;
        emit PriceUpdated(newPrice);
    }
    
    function getBTCPrice() public view returns (uint256) {
        if (useChainlinkOracle && btcPriceFeed != address(0)) {
            (, int256 answer, , , ) = AggregatorV3Interface(btcPriceFeed).latestRoundData();
            require(answer > 0, "Invalid oracle price");
            return uint256(answer) / 100; // Convert 8 decimals (Chainlink standard) to 6 decimals
        }
        return btcPrice;
    }
    
    function updateReputation(address user, uint256 score) external onlyOwner {
        userReputation[user] = score;
        emit ReputationUpdated(user, score);
    }
    
    // Dynamically calculate LTV based on ERC-8004 reputation:
    // Score >= 90: LTV = 90%
    // Score >= 80: LTV = 85%
    // Otherwise: LTV = 80% (Base)
    function getUserLTV(address user) public view returns (uint256) {
        uint256 score = userReputation[user];
        if (score >= 90) return 90;
        if (score >= 80) return 85;
        return 80;
    }
    
    function depositUSDC(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(IERC20(usdcToken).transferFrom(msg.sender, address(this), amount), "USDC transfer failed");
        
        positions[msg.sender].collateralUSDC += amount;
        positions[msg.sender].lastUpdated = block.timestamp;
        
        emit DepositedUSDC(msg.sender, amount);
    }
    
    // Allow third-party contracts (like CCIP receivers) to deposit USDC for a user
    function depositUSDCFor(address user, uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(IERC20(usdcToken).transferFrom(msg.sender, address(this), amount), "USDC transfer failed");
        
        positions[user].collateralUSDC += amount;
        positions[user].lastUpdated = block.timestamp;
        
        emit DepositedUSDC(user, amount);
    }
    
    function depositCirBTC(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(IERC20(cirbtcToken).transferFrom(msg.sender, address(this), amount), "cirBTC transfer failed");
        
        positions[msg.sender].collateralCirBTC += amount;
        positions[msg.sender].lastUpdated = block.timestamp;
        
        emit DepositedCirBTC(msg.sender, amount);
    }
    
    function borrowEURC(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        
        UserPosition storage pos = positions[msg.sender];
        uint256 currentBtcPrice = getBTCPrice();
        
        // Calculate max borrow capacity with reputation LTV
        uint256 totalCollateralUSD = pos.collateralUSDC + (pos.collateralCirBTC * currentBtcPrice) / 10**8;
        uint256 userLTV = getUserLTV(msg.sender);
        uint256 maxBorrowEURC = (totalCollateralUSD * userLTV * EXCHANGE_RATE) / 10000;
        
        require(pos.borrowedEURC + amount <= maxBorrowEURC, "Insufficient collateral to borrow this amount");
        
        // Ensure pool has enough EURC liquidity
        uint256 poolEURC = IERC20(eurcToken).balanceOf(address(this));
        require(poolEURC >= amount, "Lending pool has insufficient EURC liquidity");
        
        require(IERC20(eurcToken).transfer(msg.sender, amount), "EURC transfer failed");
        
        pos.borrowedEURC += amount;
        pos.lastUpdated = block.timestamp;
        
        emit Borrowed(msg.sender, amount);
    }
    
    function repayEURC(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        UserPosition storage pos = positions[msg.sender];
        require(pos.borrowedEURC >= amount, "Repaying more than borrowed");
        
        require(IERC20(eurcToken).transferFrom(msg.sender, address(this), amount), "EURC transfer failed");
        
        pos.borrowedEURC -= amount;
        pos.lastUpdated = block.timestamp;
        
        emit Repaid(msg.sender, amount);
    }
    
    function withdrawUSDC(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        UserPosition storage pos = positions[msg.sender];
        require(pos.collateralUSDC >= amount, "Withdrawing more than deposited");
        
        uint256 remainingUSDC = pos.collateralUSDC - amount;
        uint256 currentBtcPrice = getBTCPrice();
        uint256 totalCollateralUSD = remainingUSDC + (pos.collateralCirBTC * currentBtcPrice) / 10**8;
        uint256 userLTV = getUserLTV(msg.sender);
        uint256 maxBorrowEURC = (totalCollateralUSD * userLTV * EXCHANGE_RATE) / 10000;
        
        require(pos.borrowedEURC <= maxBorrowEURC, "Remaining collateral cannot support existing borrow position");
        
        require(IERC20(usdcToken).transfer(msg.sender, amount), "USDC transfer failed");
        
        pos.collateralUSDC = remainingUSDC;
        pos.lastUpdated = block.timestamp;
        
        emit WithdrawnUSDC(msg.sender, amount);
    }
    
    function withdrawCirBTC(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        UserPosition storage pos = positions[msg.sender];
        require(pos.collateralCirBTC >= amount, "Withdrawing more than deposited");
        
        uint256 remainingCirBTC = pos.collateralCirBTC - amount;
        uint256 currentBtcPrice = getBTCPrice();
        uint256 totalCollateralUSD = pos.collateralUSDC + (remainingCirBTC * currentBtcPrice) / 10**8;
        uint256 userLTV = getUserLTV(msg.sender);
        uint256 maxBorrowEURC = (totalCollateralUSD * userLTV * EXCHANGE_RATE) / 10000;
        
        require(pos.borrowedEURC <= maxBorrowEURC, "Remaining collateral cannot support existing borrow position");
        
        require(IERC20(cirbtcToken).transfer(msg.sender, amount), "cirBTC transfer failed");
        
        pos.collateralCirBTC = remainingCirBTC;
        pos.lastUpdated = block.timestamp;
        
        emit WithdrawnCirBTC(msg.sender, amount);
    }
    
    // Emergency deleveraging function: Automatically sells/burns cirBTC to repay EURC debt
    function emergencyDeleverage(uint256 cirBTCAmount) external {
        require(cirBTCAmount > 0, "Amount must be > 0");
        UserPosition storage pos = positions[msg.sender];
        require(pos.collateralCirBTC >= cirBTCAmount, "Deleveraging more cirBTC than deposited");
        require(pos.borrowedEURC > 0, "No debt to deleverage");
        
        uint256 currentBtcPrice = getBTCPrice();
        
        // Calculation: usdValue = (cirBTCAmount * currentBtcPrice) / 10**8 (6 decimals)
        // eurcRepaid = (usdValue * EXCHANGE_RATE) / 100 (6 decimals)
        uint256 usdValue = (cirBTCAmount * currentBtcPrice) / 10**8;
        uint256 eurcRepaid = (usdValue * EXCHANGE_RATE) / 100;
        
        if (eurcRepaid > pos.borrowedEURC) {
            eurcRepaid = pos.borrowedEURC;
            // Recalculate exact cirBTCAmount required to avoid overpaying
            uint256 requiredUSD = (eurcRepaid * 100) / EXCHANGE_RATE;
            cirBTCAmount = (requiredUSD * 10**8) / currentBtcPrice;
        }
        
        pos.collateralCirBTC -= cirBTCAmount;
        pos.borrowedEURC -= eurcRepaid;
        pos.lastUpdated = block.timestamp;
        
        emit Deleveraged(msg.sender, cirBTCAmount, eurcRepaid);
    }
    
    // View positions
    function getAccountData(address user) external view returns (
        uint256 collateralUSDC,
        uint256 collateralCirBTC,
        uint256 borrowedEURC,
        uint256 currentBtcPrice,
        uint256 totalCollateralUSD,
        uint256 maxBorrowEURC,
        uint256 healthFactor
    ) {
        UserPosition memory pos = positions[user];
        collateralUSDC = pos.collateralUSDC;
        collateralCirBTC = pos.collateralCirBTC;
        borrowedEURC = pos.borrowedEURC;
        currentBtcPrice = getBTCPrice();
        
        totalCollateralUSD = collateralUSDC + (collateralCirBTC * currentBtcPrice) / 10**8;
        uint256 userLTV = getUserLTV(user);
        maxBorrowEURC = (totalCollateralUSD * userLTV * EXCHANGE_RATE) / 10000;
        
        if (borrowedEURC == 0) {
            healthFactor = 99999; // Safe
        } else {
            healthFactor = (maxBorrowEURC * 100) / borrowedEURC;
        }
    }
}

