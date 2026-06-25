// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract AgenticEscrow {
    struct Escrow {
        address buyer;
        address seller;
        uint256 amount;
        bool released;
        bool refunded;
        uint256 timeout;
    }

    IERC20 public immutable usdc;
    mapping(bytes32 => Escrow) public escrows;

    event EscrowCreated(bytes32 indexed jobId, address indexed buyer, address indexed seller, uint256 amount, uint256 timeout);
    event EscrowReleased(bytes32 indexed jobId);
    event EscrowRefunded(bytes32 indexed jobId);

    constructor(address _usdc) {
        usdc = IERC20(_usdc);
    }

    function createEscrow(bytes32 jobId, address seller, uint256 amount, uint256 duration) external {
        require(escrows[jobId].amount == 0, "Escrow already exists");
        require(amount > 0, "Amount must be > 0");
        require(usdc.transferFrom(msg.sender, address(this), amount), "Transfer failed");

        escrows[jobId] = Escrow({
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            released: false,
            refunded: false,
            timeout: block.timestamp + duration
        });

        emit EscrowCreated(jobId, msg.sender, seller, amount, block.timestamp + duration);
    }

    function release(bytes32 jobId) external {
        Escrow storage esc = escrows[jobId];
        require(msg.sender == esc.buyer, "Only buyer can release");
        require(!esc.released && !esc.refunded, "Escrow already settled");

        esc.released = true;
        require(usdc.transfer(esc.seller, esc.amount), "Transfer failed");

        emit EscrowReleased(jobId);
    }

    function refund(bytes32 jobId) external {
        Escrow storage esc = escrows[jobId];
        require(msg.sender == esc.buyer, "Only buyer can refund");
        require(block.timestamp >= esc.timeout, "Timeout not reached");
        require(!esc.released && !esc.refunded, "Escrow already settled");

        esc.refunded = true;
        require(usdc.transfer(esc.buyer, esc.amount), "Transfer failed");

        emit EscrowRefunded(jobId);
    }
}
