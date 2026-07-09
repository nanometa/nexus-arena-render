const { ethers } = require('ethers');

const DEFAULT_LITVM_RPC_URL = 'https://liteforge.rpc.caldera.xyz/http';
const DEFAULT_LITVM_CHAIN_ID = 4441;

const MATCH_REGISTRY_ABI = [
  'function recordMatch(bytes32 matchIDHash, bytes32 matchHash, bytes32 winnerHash, uint16 player0Cards, uint16 player1Cards, uint32 player0Power, uint32 player1Power, uint64 playedAt) external',
  'function results(bytes32 matchIDHash) view returns (bytes32 matchHash, bytes32 winnerHash, uint16 player0Cards, uint16 player1Cards, uint32 player0Power, uint32 player1Power, uint64 playedAt, address recorder)',
];

function canonicalJSONString(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJSONString).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJSONString(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashText(value) {
  return ethers.keccak256(ethers.toUtf8Bytes(String(value)));
}

function hashMatchPayload(payload) {
  return ethers.keccak256(ethers.toUtf8Bytes(canonicalJSONString(payload)));
}

function getMatchRegistryConfig() {
  return {
    address: process.env.MATCH_REGISTRY_ADDRESS || '',
    privateKey:
      process.env.MATCH_REGISTRY_RELAYER_PRIVATE_KEY ||
      process.env.LITVM_RELAYER_PRIVATE_KEY ||
      '',
    rpcUrl: process.env.LITVM_RPC_URL || DEFAULT_LITVM_RPC_URL,
    chainId: Number(process.env.LITVM_CHAIN_ID || DEFAULT_LITVM_CHAIN_ID),
    waitForConfirmation: process.env.LITVM_WAIT_FOR_CONFIRMATION === 'true',
  };
}

function getMatchRegistryStatus() {
  const config = getMatchRegistryConfig();
  return {
    enabled: Boolean(config.address && config.privateKey),
    hasAddress: Boolean(config.address),
    hasRelayer: Boolean(config.privateKey),
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
  };
}

async function recordMatchOnChain(result) {
  const config = getMatchRegistryConfig();
  if (!config.address || !config.privateKey) {
    return {
      status: 'disabled',
      reason: 'MATCH_REGISTRY_ADDRESS and MATCH_REGISTRY_RELAYER_PRIVATE_KEY are required',
    };
  }

  const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  const contract = new ethers.Contract(config.address, MATCH_REGISTRY_ABI, wallet);

  const tx = await contract.recordMatch(
    result.matchIDHash,
    result.matchHash,
    result.winnerHash,
    result.score.player0.cards,
    result.score.player1.cards,
    result.score.player0.power,
    result.score.player1.power,
    result.playedAt
  );

  if (!config.waitForConfirmation) {
    return {
      status: 'submitted',
      txHash: tx.hash,
      explorerUrl: `https://liteforge.explorer.caldera.xyz/tx/${tx.hash}`,
    };
  }

  const receipt = await tx.wait();
  return {
    status: receipt?.status === 1 ? 'confirmed' : 'submitted',
    txHash: tx.hash,
    blockNumber: receipt?.blockNumber,
    explorerUrl: `https://liteforge.explorer.caldera.xyz/tx/${tx.hash}`,
  };
}

module.exports = {
  canonicalJSONString,
  getMatchRegistryStatus,
  hashMatchPayload,
  hashText,
  recordMatchOnChain,
};
