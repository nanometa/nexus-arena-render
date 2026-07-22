const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeLeaderboardProfileNames } = require('../ranked-results');

test('leaderboard uses the current wallet profile name instead of stale match metadata', () => {
  const leaderboardRows = [
    {
      wallet_address: '0x84c0',
      display_name: 'Pilot D970',
      points: 6,
    },
  ];
  const profiles = [
    {
      wallet_address: '0x84c0',
      display_name: 'NTM',
    },
  ];

  assert.deepEqual(mergeLeaderboardProfileNames(leaderboardRows, profiles), [
    {
      wallet_address: '0x84c0',
      display_name: 'NTM',
      points: 6,
    },
  ]);
});

test('leaderboard keeps its saved name when no profile name is available', () => {
  const leaderboardRows = [
    {
      wallet_address: '0x0f2c',
      display_name: 'Pilot 0F2C',
      points: 3,
    },
  ];

  assert.equal(
    mergeLeaderboardProfileNames(leaderboardRows, [])[0].display_name,
    'Pilot 0F2C'
  );
});
