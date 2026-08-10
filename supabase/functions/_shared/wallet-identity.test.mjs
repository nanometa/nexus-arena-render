import assert from 'node:assert/strict';
import test from 'node:test';
import { walletFromWeb3AuthUser } from './wallet-identity.mjs';

const WALLET = '0x1234567890abcdef1234567890abcdef12345678';

function web3User(overrides = {}) {
  return {
    app_metadata: { provider: 'web3' },
    user_metadata: {
      sub: `web3:ethereum:${WALLET}`,
      custom_claims: { address: WALLET.toUpperCase().replace(/^0X/, '0x') },
    },
    ...overrides,
  };
}

test('reads the authenticated Ethereum address from a Supabase Web3 subject', () => {
  assert.equal(walletFromWeb3AuthUser(web3User()), WALLET);
});

test('rejects non-Web3 authentication providers', () => {
  assert.throws(
    () => walletFromWeb3AuthUser(web3User({ app_metadata: { provider: 'email' } })),
    /provider is invalid/,
  );
});

test('rejects a missing Web3 subject', () => {
  assert.throws(
    () => walletFromWeb3AuthUser(web3User({ user_metadata: { custom_claims: { address: WALLET } } })),
    /identity is missing/,
  );
});

test('rejects an address claim that does not match the authenticated subject', () => {
  assert.throws(
    () => walletFromWeb3AuthUser(web3User({
      user_metadata: {
        sub: `web3:ethereum:${WALLET}`,
        custom_claims: { address: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd' },
      },
    })),
    /identity is inconsistent/,
  );
});
