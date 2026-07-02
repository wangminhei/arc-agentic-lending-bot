// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockAggregatorV3 {
    uint8 public decimals = 8;
    string public description = "BTC / USD";
    uint256 public version = 1;
    
    int256 private price;
    uint80 private roundId;
    uint256 private updatedAt;

    event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt);

    constructor() {
        price = 90000 * 10**8; // Initial price $90,000 in 8 decimals
        roundId = 1;
        updatedAt = block.timestamp;
    }

    function updateAnswer(int256 newAnswer) external {
        price = newAnswer;
        roundId++;
        updatedAt = block.timestamp;
        emit AnswerUpdated(newAnswer, roundId, updatedAt);
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 _roundId,
            int256 answer,
            uint256 startedAt,
            uint256 _updatedAt,
            uint80 answeredInRound
        )
    {
        return (roundId, price, updatedAt, updatedAt, roundId);
    }

    function getRoundData(uint80 _roundId)
        external
        view
        returns (
            uint80,
            int256 answer,
            uint256 startedAt,
            uint256 _updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, price, updatedAt, updatedAt, _roundId);
    }
}
