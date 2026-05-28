// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract AgenticLendingPool {
    address public usdcToken;
    address public eurcToken;
    
    // Simulating LTV = 80% and Exchange Rate: 1.10 EURC per USDC (scaled by 100)
    uint256 public constant LTV = 80;
    uint256 public constant EXCHANGE_RATE = 110;
    
    struct UserPosition {
        uint256 collateralUSDC; // Deposition of USDC
        uint256 borrowedEURC;   // Borrowed EURC debt
        uint256 lastUpdated;
    }
    
    mapping(address => UserPosition) public positions;
    
    event Deposited(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    
    constructor(address _usdcToken, address _eurcToken) {
        usdcToken = _usdcToken;
        eurcToken = _eurcToken;
    }
    
    function depositCollateral(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(IERC20(usdcToken).transferFrom(msg.sender, address(this), amount), "USDC transfer failed");
        
        positions[msg.sender].collateralUSDC += amount;
        positions[msg.sender].lastUpdated = block.timestamp;
        
        emit Deposited(msg.sender, amount);
    }
    
    function borrowEURC(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        
        UserPosition storage pos = positions[msg.sender];
        
        // Calculate max borrow capacity: maxBorrowEURC = collateralUSDC * LTV / 100 * EXCHANGE_RATE / 100
        uint256 maxBorrowEURC = (pos.collateralUSDC * LTV * EXCHANGE_RATE) / 10000;
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
    
    function withdrawCollateral(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        UserPosition storage pos = positions[msg.sender];
        require(pos.collateralUSDC >= amount, "Withdrawing more than deposited");
        
        // Check if remaining collateral is enough to back existing borrow position
        uint256 remainingCollateral = pos.collateralUSDC - amount;
        uint256 maxBorrowEURC = (remainingCollateral * LTV * EXCHANGE_RATE) / 10000;
        require(pos.borrowedEURC <= maxBorrowEURC, "Remaining collateral cannot support existing borrow position");
        
        require(IERC20(usdcToken).transfer(msg.sender, amount), "USDC transfer failed");
        
        pos.collateralUSDC = remainingCollateral;
        pos.lastUpdated = block.timestamp;
        
        emit Withdrawn(msg.sender, amount);
    }
    
    // View positions
    function getAccountData(address user) external view returns (
        uint256 collateralUSDC,
        uint256 borrowedEURC,
        uint256 maxBorrowEURC,
        uint256 healthFactor // Scaled by 100, e.g. 150 = 1.50 Health Factor. If healthFactor < 100 (1.00), it's liquidatable.
    ) {
        UserPosition memory pos = positions[user];
        collateralUSDC = pos.collateralUSDC;
        borrowedEURC = pos.borrowedEURC;
        
        maxBorrowEURC = (collateralUSDC * LTV * EXCHANGE_RATE) / 10000;
        
        if (borrowedEURC == 0) {
            healthFactor = 99999; // Safe
        } else {
            healthFactor = (maxBorrowEURC * 100) / borrowedEURC;
        }
    }
}
