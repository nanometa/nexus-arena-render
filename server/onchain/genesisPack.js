const { ethers } = require('ethers');

const DEFAULT_LITVM_RPC_URL = 'https://liteforge.rpc.caldera.xyz/http';
const DEFAULT_LITVM_CHAIN_ID = 4441;

const GENESIS_PACK_ABI = [
  'event PackMinted(address indexed player, uint256 indexed tokenId)',
  'event PackOpened(address indexed player, uint256 indexed tokenId)',
  'function MAX_SUPPLY() view returns (uint256)',
  'function CARDS_PER_PACK() view returns (uint256)',
  'function totalMinted() view returns (uint256)',
  'function totalOpened() view returns (uint256)',
  'function hasMinted(address player) view returns (bool)',
  'function opened(uint256 tokenId) view returns (bool)',
  'function ownerOf(uint256 tokenId) view returns (address)',
];

function getGenesisPackConfig() {
  return {
    address: process.env.GENESIS_PACK_ADDRESS || process.env.REACT_APP_GENESIS_PACK_ADDRESS || '',
    rpcUrl: process.env.LITVM_RPC_URL || DEFAULT_LITVM_RPC_URL,
    chainId: Number(process.env.LITVM_CHAIN_ID || DEFAULT_LITVM_CHAIN_ID),
    strict: process.env.PACK_CHAIN_STRICT === 'true' || process.env.NODE_ENV === 'production',
  };
}

function getGenesisPackStatus() {
  const config = getGenesisPackConfig();
  return {
    enabled: Boolean(config.address),
    hasAddress: Boolean(config.address),
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
    strict: config.strict,
  };
}

function getProvider(config = getGenesisPackConfig()) {
  return new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
}

function getContract(config = getGenesisPackConfig()) {
  if (!config.address) return null;
  return new ethers.Contract(config.address, GENESIS_PACK_ABI, getProvider(config));
}

function normalizeAddress(address) {
  if (!ethers.isAddress(address)) return '';
  return ethers.getAddress(address).toLowerCase();
}

function parsePackEvent(receipt, contractAddress, eventName) {
  const iface = new ethers.Interface(GENESIS_PACK_ABI);
  const normalizedContract = normalizeAddress(contractAddress);

  for (const log of receipt.logs || []) {
    if (normalizeAddress(log.address) !== normalizedContract) continue;
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === eventName) {
        return {
          player: normalizeAddress(parsed.args.player),
          tokenId: parsed.args.tokenId.toString(),
        };
      }
    } catch (error) {
      // Ignore logs from the same tx that do not match this ABI.
    }
  }

  return null;
}

async function getReceipt(txHash) {
  if (!txHash || !ethers.isHexString(txHash, 32)) return null;
  const config = getGenesisPackConfig();
  const receipt = await getProvider(config).getTransactionReceipt(txHash);
  return { config, receipt };
}

async function verifyPackMinted({ walletAddress, tokenId, txHash }) {
  const config = getGenesisPackConfig();
  if (!config.address) {
    return { verified: false, status: 'disabled', reason: 'GENESIS_PACK_ADDRESS is not configured' };
  }

  const receiptResult = await getReceipt(txHash);
  if (!receiptResult?.receipt) {
    return { verified: false, status: 'pending', reason: 'Mint transaction receipt not found yet' };
  }

  const event = parsePackEvent(receiptResult.receipt, config.address, 'PackMinted');
  const wallet = normalizeAddress(walletAddress);
  if (!event || event.player !== wallet || event.tokenId !== String(tokenId)) {
    return { verified: false, status: 'failed', reason: 'Mint transaction does not match wallet/token' };
  }

  return { verified: true, status: 'verified', event };
}

async function verifyPackOpened({ walletAddress, tokenId, txHash }) {
  const config = getGenesisPackConfig();
  if (!config.address) {
    return { verified: false, status: 'disabled', reason: 'GENESIS_PACK_ADDRESS is not configured' };
  }

  const receiptResult = await getReceipt(txHash);
  if (!receiptResult?.receipt) {
    return { verified: false, status: 'pending', reason: 'Open transaction receipt not found yet' };
  }

  const event = parsePackEvent(receiptResult.receipt, config.address, 'PackOpened');
  const wallet = normalizeAddress(walletAddress);
  if (!event || event.player !== wallet || event.tokenId !== String(tokenId)) {
    return { verified: false, status: 'failed', reason: 'Open transaction does not match wallet/token' };
  }

  return { verified: true, status: 'verified', event };
}

async function readPackDropStats() {
  const contract = getContract();
  if (!contract) return null;

  const [maxSupply, cardsPerPack, totalMinted, totalOpened] = await Promise.all([
    contract.MAX_SUPPLY(),
    contract.CARDS_PER_PACK(),
    contract.totalMinted(),
    contract.totalOpened(),
  ]);

  return {
    maxSupply: Number(maxSupply),
    cardsPerPack: Number(cardsPerPack),
    totalMinted: Number(totalMinted),
    totalOpened: Number(totalOpened),
  };
}

module.exports = {
  GENESIS_PACK_ABI,
  getGenesisPackConfig,
  getGenesisPackStatus,
  normalizeAddress,
  readPackDropStats,
  verifyPackMinted,
  verifyPackOpened,
};
