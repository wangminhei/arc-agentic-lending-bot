// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract AgenticMultiCollateralPool {
    address public usdcToken;
    address public eurcToken;
    address public cirbtcToken;
    address public owner;
    
    // Simulating LTV = 80% and Exchange Rate: 1.10 EURC per USD (scaled by 100)
    uint256 public constant LTV = 80;
    uint256 public constant EXCHANGE_RATE = 110;
    
    // Simulated BTC Price (scaled by 10^6, e.g. 90000 * 10^6 = 90000000000)
    uint256 public btcPrice;
    
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
    
    function setBTCPrice(uint256 newPrice) external onlyOwner {
        btcPrice = newPrice;
        emit PriceUpdated(newPrice);
    }
    
    function depositUSDC(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(IERC20(usdcToken).transferFrom(msg.sender, address(this), amount), "USDC transfer failed");
        
        positions[msg.sender].collateralUSDC += amount;
        positions[msg.sender].lastUpdated = block.timestamp;
        
        emit DepositedUSDC(msg.sender, amount);
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
        
        // Calculate max borrow capacity
        uint256 totalCollateralUSD = pos.collateralUSDC + (pos.collateralCirBTC * btcPrice) / 10**8;
        uint256 maxBorrowEURC = (totalCollateralUSD * LTV * EXCHANGE_RATE) / 10000;
        
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
        uint256 totalCollateralUSD = remainingUSDC + (pos.collateralCirBTC * btcPrice) / 10**8;
        uint256 maxBorrowEURC = (totalCollateralUSD * LTV * EXCHANGE_RATE) / 10000;
        
        require(pos.borrowedEURC <= maxBorrowEURC, "Remaining collateral cannot support existing borrow position");
        
        require(IERC20(usdcToken).transfer(msg.sender, amount), "USDC transfer failed");
        
        pos.collateralUSDC = remainingUSDC;
        pos.lastUpdated = block.timestamp;
        
        emit WithdrawnUSDC(msg.sender, amount);
    }
    
    // Withdraw cirBTC
    function withdrawCirBTC(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        UserPosition storage pos = positions[msg.sender];
        require(pos.collateralCirBTC >= amount, "Withdrawing more than deposited");
        
        uint256 remainingCirBTC = pos.collateralCirBTC - amount;
        uint256 totalCollateralUSD = pos.collateralUSDC + (remainingCirBTC * btcPrice) / 10**8;
        uint256 maxBorrowEURC = (totalCollateralUSD * LTV * EXCHANGE_RATE) / 10000;
        
        require(pos.borrowedEURC <= maxBorrowEURC, "Remaining collateral cannot support existing borrow position");
        
        require(IERC20(cirbtcToken).transfer(msg.sender, amount), "cirBTC transfer failed");
        
        pos.collateralCirBTC = remainingCirBTC;
        pos.lastUpdated = block.timestamp;
        
        emit WithdrawnCirBTC(msg.sender, amount);
    }
    
    // View positions
    function getAccountData(address user) external view returns (
        uint256 collateralUSDC,
        uint256 collateralCirBTC,
        uint256 borrowedEURC,
        uint256 currentBtcPrice,
        uint256 totalCollateralUSD,
        uint256 maxBorrowEURC,
        uint256 healthFactor // Scaled by 100, e.g. 150 = 1.50 Health Factor. If healthFactor < 100 (1.00), it's liquidatable.
    ) {
        UserPosition memory pos = positions[user];
        collateralUSDC = pos.collateralUSDC;
        collateralCirBTC = pos.collateralCirBTC;
        borrowedEURC = pos.borrowedEURC;
        currentBtcPrice = btcPrice;
        
        totalCollateralUSD = collateralUSDC + (collateralCirBTC * btcPrice) / 10**8;
        maxBorrowEURC = (totalCollateralUSD * LTV * EXCHANGE_RATE) / 10000;
        
        if (borrowedEURC == 0) {
            healthFactor = 99999; // Safe
        } else {
            healthFactor = (maxBorrowEURC * 100) / borrowedEURC;
        }
    }
}
