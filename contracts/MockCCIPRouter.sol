// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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

interface IReceiverSim {
    function ccipReceive(Client.Any2EVMMessage calldata message) external;
}

library CCIPClient {
    struct EVMTokenAmount {
        address token;
        uint256 amount;
    }

    struct EVM2AnyMessage {
        bytes receiver; // abi.encode(receiverAddress)
        bytes data; // payload
        EVMTokenAmount[] tokenAmounts; // tokens to transfer
        address feeToken; // fee token
        bytes extraArgs; // extra args
    }
}

contract MockCCIPRouter {
    event MockCCIPMessageSent(
        uint64 destinationChainSelector,
        address receiver,
        bytes data,
        CCIPClient.EVMTokenAmount[] tokenAmounts
    );

    function ccipSend(
        uint64 destinationChainSelector,
        CCIPClient.EVM2AnyMessage calldata message
    ) external payable returns (bytes32) {
        bytes32 messageId = keccak256(abi.encodePacked(block.timestamp, msg.sender, destinationChainSelector));
        address receiver = abi.decode(message.receiver, (address));
        
        emit MockCCIPMessageSent(
            destinationChainSelector,
            receiver,
            message.data,
            message.tokenAmounts
        );
        return messageId;
    }

    function simulateReceiveMessage(
        address receiver,
        uint64 sourceChainSelector,
        address sender,
        bytes calldata data,
        address token,
        uint256 tokenAmount
    ) external {
        bytes32 messageId = keccak256(abi.encodePacked(block.timestamp, sender, receiver, sourceChainSelector));
        
        Client.EVMTokenAmount[] memory destTokenAmounts;
        if (token != address(0) && tokenAmount > 0) {
            destTokenAmounts = new Client.EVMTokenAmount[](1);
            destTokenAmounts[0] = Client.EVMTokenAmount({
                token: token,
                amount: tokenAmount
            });
        } else {
            destTokenAmounts = new Client.EVMTokenAmount[](0);
        }

        Client.Any2EVMMessage memory message = Client.Any2EVMMessage({
            messageId: messageId,
            sourceChainSelector: sourceChainSelector,
            sender: abi.encode(sender),
            data: data,
            destTokenAmounts: destTokenAmounts
        });

        IReceiverSim(receiver).ccipReceive(message);
    }
}
