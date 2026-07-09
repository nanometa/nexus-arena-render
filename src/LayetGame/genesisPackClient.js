import { ethers } from 'ethers';

export const GENESIS_PACK_ADDRESS = process.env.REACT_APP_GENESIS_PACK_ADDRESS || '';
export const LITVM_CHAIN_ID = Number(process.env.REACT_APP_LITVM_CHAIN_ID || 4441);
export const LITVM_CHAIN_HEX = `0x${LITVM_CHAIN_ID.toString(16)}`;
export const LITVM_RPC_URL =
  process.env.REACT_APP_LITVM_RPC_URL || 'https://liteforge.rpc.caldera.xyz/http';

export const GENESIS_PACK_ABI = [
  'event PackMinted(address indexed player, uint256 indexed tokenId)',
  'event PackOpened(address indexed player, uint256 indexed tokenId)',
  'function MAX_SUPPLY() view returns (uint256)',
  'function CARDS_PER_PACK() view returns (uint256)',
  'function totalMinted() view returns (uint256)',
  'function totalOpened() view returns (uint256)',
  'function hasMinted(address player) view returns (bool)',
  'function mintPack() external returns (uint256 tokenId)',
  'function openPack(uint256 tokenId) external',
];

export function hasWalletProvider() {
  return typeof window !== 'undefined' && Boolean(window.ethereum);
}

export function shortAddress(address) {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function walletErrorMessage(error) {
  const message = error?.shortMessage || error?.reason || error?.message || 'Wallet error';
  if (message.includes('user rejected') || message.includes('User denied')) {
    return 'Transaction cancelled in wallet';
  }
  if (message.includes('GENESIS_PACK_ADDRESS')) return message;
  return message.replace('execution reverted: ', '');
}

async function switchToLitVM() {
  if (!hasWalletProvider()) return;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: LITVM_CHAIN_HEX }],
    });
  } catch (error) {
    if (error?.code !== 4902) throw error;
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: LITVM_CHAIN_HEX,
          chainName: 'LitVM Testnet',
          nativeCurrency: {
            name: 'LitVM',
            symbol: 'LIT',
            decimals: 18,
          },
          rpcUrls: [LITVM_RPC_URL],
          blockExplorerUrls: ['https://liteforge.explorer.caldera.xyz'],
        },
      ],
    });
  }
}

export async function connectWallet() {
  if (!hasWalletProvider()) {
    throw new Error('Install MetaMask or another EVM wallet');
  }

  await switchToLitVM();
  const provider = new ethers.BrowserProvider(window.ethereum);
  const accounts = await provider.send('eth_requestAccounts', []);
  return ethers.getAddress(accounts[0]);
}

async function getPackContract() {
  if (!GENESIS_PACK_ADDRESS) {
    throw new Error('GENESIS_PACK_ADDRESS is not configured yet');
  }

  await switchToLitVM();
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return new ethers.Contract(GENESIS_PACK_ADDRESS, GENESIS_PACK_ABI, signer);
}

function readEvent(receipt, name) {
  const iface = new ethers.Interface(GENESIS_PACK_ABI);
  for (const log of receipt.logs || []) {
    if (GENESIS_PACK_ADDRESS && log.address.toLowerCase() !== GENESIS_PACK_ADDRESS.toLowerCase()) {
      continue;
    }
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === name) return parsed;
    } catch (error) {
      // Ignore logs that are not GenesisPack events.
    }
  }
  return null;
}

export async function readDropState(walletAddress) {
  if (!GENESIS_PACK_ADDRESS || !hasWalletProvider()) return null;
  const provider = new ethers.BrowserProvider(window.ethereum);
  const contract = new ethers.Contract(GENESIS_PACK_ADDRESS, GENESIS_PACK_ABI, provider);
  const [maxSupply, cardsPerPack, totalMinted, totalOpened, hasMinted] = await Promise.all([
    contract.MAX_SUPPLY(),
    contract.CARDS_PER_PACK(),
    contract.totalMinted(),
    contract.totalOpened(),
    walletAddress ? contract.hasMinted(walletAddress) : false,
  ]);

  return {
    maxSupply: Number(maxSupply),
    cardsPerPack: Number(cardsPerPack),
    totalMinted: Number(totalMinted),
    totalOpened: Number(totalOpened),
    hasMinted,
  };
}

export async function mintGenesisPack() {
  const contract = await getPackContract();
  const tx = await contract.mintPack();
  const receipt = await tx.wait();
  const event = readEvent(receipt, 'PackMinted');
  const tokenId = event?.args?.tokenId?.toString();

  if (!tokenId) {
    throw new Error('PackMinted event not found');
  }

  return {
    tokenId,
    txHash: tx.hash,
  };
}

export async function openGenesisPack(tokenId) {
  const contract = await getPackContract();
  const tx = await contract.openPack(tokenId);
  const receipt = await tx.wait();
  const event = readEvent(receipt, 'PackOpened');
  const openedTokenId = event?.args?.tokenId?.toString();

  if (!openedTokenId) {
    throw new Error('PackOpened event not found');
  }

  return {
    tokenId: openedTokenId,
    txHash: tx.hash,
  };
}
