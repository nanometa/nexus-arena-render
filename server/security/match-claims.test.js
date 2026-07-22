const test = require('node:test');
const assert = require('node:assert/strict');

const { reserveWalletSeat } = require('./match-claims');

test('one wallet cannot reserve both seats in the same match', () => {
  const walletAddress = '0x2222222222222222222222222222222222222222';
  reserveWalletSeat({
    matchID: 'self_play_block_test',
    playerID: '0',
    walletAddress,
    now: 1000,
  });

  assert.throws(
    () =>
      reserveWalletSeat({
        matchID: 'self_play_block_test',
        playerID: '1',
        walletAddress,
        now: 2000,
      }),
    /same wallet/i
  );

  assert.doesNotThrow(() =>
    reserveWalletSeat({
      matchID: 'self_play_block_test',
      playerID: '1',
      walletAddress: '0x3333333333333333333333333333333333333333',
      now: 2000,
    })
  );
});
