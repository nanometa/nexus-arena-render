const GAME_SERVER_URL = process.env.REACT_APP_GAME_SERVER_URL || 'http://localhost:8000';

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with ${response.status}`);
  }
  return data;
}

export async function fetchPackStatus() {
  const response = await fetch(`${GAME_SERVER_URL}/api/packs/status`);
  return readResponse(response);
}

export async function fetchInventory(walletAddress) {
  const params = new URLSearchParams({ walletAddress });
  const response = await fetch(`${GAME_SERVER_URL}/api/packs/inventory?${params.toString()}`);
  return readResponse(response);
}

export async function createPlayerSession({ walletAddress, displayName, message, signature }) {
  const response = await fetch(`${GAME_SERVER_URL}/api/player/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ walletAddress, displayName, message, signature }),
  });
  return readResponse(response);
}

export async function fetchPlayerDashboard(walletAddress) {
  const params = new URLSearchParams({ walletAddress });
  const response = await fetch(`${GAME_SERVER_URL}/api/player/dashboard?${params.toString()}`);
  return readResponse(response);
}

export async function registerPackMint({ walletAddress, tokenId, txHash, displayName }) {
  const response = await fetch(`${GAME_SERVER_URL}/api/packs/register-mint`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ walletAddress, tokenId, txHash, displayName }),
  });
  return readResponse(response);
}

export async function registerPackOpen({ walletAddress, tokenId, txHash, displayName }) {
  const response = await fetch(`${GAME_SERVER_URL}/api/packs/open`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ walletAddress, tokenId, txHash, displayName }),
  });
  return readResponse(response);
}
