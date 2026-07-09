// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Nexus Arena Genesis Pack
/// @notice Free testnet pack drop: 5000 packs, one pack per wallet, 20 cards off-chain per opened pack.
contract GenesisPack {
    string public constant name = "Nexus Arena Genesis Pack";
    string public constant symbol = "NAGP";
    uint256 public constant MAX_SUPPLY = 5000;
    uint256 public constant MAX_PER_WALLET = 1;
    uint256 public constant CARDS_PER_PACK = 20;

    address public immutable owner;
    uint256 public totalMinted;
    uint256 public totalOpened;
    string private _baseTokenURI;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) public balanceOf;
    mapping(address => bool) public hasMinted;
    mapping(uint256 => bool) public opened;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event PackMinted(address indexed player, uint256 indexed tokenId);
    event PackOpened(address indexed player, uint256 indexed tokenId);
    event BaseURIUpdated(string baseTokenURI);

    error NotOwner();
    error SupplySoldOut();
    error WalletLimitReached();
    error PackNotActive();
    error PackAlreadyOpened();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(string memory baseTokenURI_) {
        owner = msg.sender;
        _baseTokenURI = baseTokenURI_;
    }

    function mintPack() external returns (uint256 tokenId) {
        if (totalMinted >= MAX_SUPPLY) revert SupplySoldOut();
        if (hasMinted[msg.sender]) revert WalletLimitReached();

        tokenId = totalMinted + 1;
        totalMinted = tokenId;
        hasMinted[msg.sender] = true;
        balanceOf[msg.sender] += 1;
        _owners[tokenId] = msg.sender;

        emit Transfer(address(0), msg.sender, tokenId);
        emit PackMinted(msg.sender, tokenId);
    }

    function openPack(uint256 tokenId) external {
        address holder = _owners[tokenId];
        if (holder == address(0)) revert PackNotActive();
        if (holder != msg.sender) revert NotOwner();
        if (opened[tokenId]) revert PackAlreadyOpened();

        opened[tokenId] = true;
        totalOpened += 1;
        balanceOf[msg.sender] -= 1;
        delete _owners[tokenId];

        emit PackOpened(msg.sender, tokenId);
        emit Transfer(msg.sender, address(0), tokenId);
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address holder = _owners[tokenId];
        if (holder == address(0) || opened[tokenId]) revert PackNotActive();
        return holder;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        ownerOf(tokenId);
        return string.concat(_baseTokenURI, _toString(tokenId), ".json");
    }

    function setBaseTokenURI(string calldata baseTokenURI_) external onlyOwner {
        _baseTokenURI = baseTokenURI_;
        emit BaseURIUpdated(baseTokenURI_);
    }

    function baseTokenURI() external view returns (string memory) {
        return _baseTokenURI;
    }

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }

        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
