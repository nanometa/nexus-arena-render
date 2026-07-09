// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MatchRegistry {
    address public owner;

    struct MatchResult {
        bytes32 matchHash;
        bytes32 winnerHash;
        uint16 player0Cards;
        uint16 player1Cards;
        uint32 player0Power;
        uint32 player1Power;
        uint64 playedAt;
        address recorder;
    }

    mapping(bytes32 => MatchResult) public results;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event MatchRecorded(
        bytes32 indexed matchIDHash,
        bytes32 indexed matchHash,
        bytes32 indexed winnerHash,
        uint16 player0Cards,
        uint16 player1Cards,
        uint32 player0Power,
        uint32 player1Power,
        uint64 playedAt,
        address recorder
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "MatchRegistry: only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "MatchRegistry: zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function recordMatch(
        bytes32 matchIDHash,
        bytes32 matchHash,
        bytes32 winnerHash,
        uint16 player0Cards,
        uint16 player1Cards,
        uint32 player0Power,
        uint32 player1Power,
        uint64 playedAt
    ) external onlyOwner {
        require(matchIDHash != bytes32(0), "MatchRegistry: empty match id");
        require(matchHash != bytes32(0), "MatchRegistry: empty match hash");
        require(results[matchIDHash].playedAt == 0, "MatchRegistry: already recorded");

        results[matchIDHash] = MatchResult({
            matchHash: matchHash,
            winnerHash: winnerHash,
            player0Cards: player0Cards,
            player1Cards: player1Cards,
            player0Power: player0Power,
            player1Power: player1Power,
            playedAt: playedAt,
            recorder: msg.sender
        });

        emit MatchRecorded(
            matchIDHash,
            matchHash,
            winnerHash,
            player0Cards,
            player1Cards,
            player0Power,
            player1Power,
            playedAt,
            msg.sender
        );
    }
}
