const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const solc = require('solc');
const { ethers } = require('ethers');

dotenv.config({ path: path.resolve(__dirname, '..', '.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });

const rpcUrl = process.env.LITVM_RPC_URL || 'https://liteforge.rpc.caldera.xyz/http';
const chainId = Number(process.env.LITVM_CHAIN_ID || 4441);
const privateKey =
  process.env.GENESIS_PACK_DEPLOYER_PRIVATE_KEY ||
  process.env.LITVM_RELAYER_PRIVATE_KEY ||
  process.env.MATCH_REGISTRY_RELAYER_PRIVATE_KEY;
const baseTokenURI = process.env.GENESIS_PACK_BASE_URI || '';

if (!privateKey) {
  throw new Error('GENESIS_PACK_DEPLOYER_PRIVATE_KEY or LITVM_RELAYER_PRIVATE_KEY is required');
}

const contractPath = path.resolve(__dirname, '..', 'contracts', 'GenesisPack.sol');
const source = fs.readFileSync(contractPath, 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'GenesisPack.sol': {
      content: source,
    },
  },
  settings: {
    optimizer: {
      enabled: true,
      runs: 200,
    },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object'],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = output.errors || [];
const fatalErrors = errors.filter((error) => error.severity === 'error');
if (fatalErrors.length > 0) {
  fatalErrors.forEach((error) => console.error(error.formattedMessage));
  throw new Error('Solidity compilation failed');
}

const compiled = output.contracts['GenesisPack.sol'].GenesisPack;
const provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
const wallet = new ethers.Wallet(privateKey, provider);
const factory = new ethers.ContractFactory(compiled.abi, compiled.evm.bytecode.object, wallet);

(async () => {
  console.log(`Deploying GenesisPack to LitVM chain ${chainId} from ${wallet.address}...`);
  const contract = await factory.deploy(baseTokenURI);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const deploymentTx = contract.deploymentTransaction();

  console.log(`GENESIS_PACK_ADDRESS=${address}`);
  console.log(`REACT_APP_GENESIS_PACK_ADDRESS=${address}`);
  if (deploymentTx?.hash) {
    console.log(`TX=${deploymentTx.hash}`);
    console.log(`Explorer=https://liteforge.explorer.caldera.xyz/tx/${deploymentTx.hash}`);
  }
})();
