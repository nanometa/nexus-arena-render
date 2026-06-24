/**
 * Local demo — engine unit tests (Jest, via react-scripts test).
 * Covers: deck building/validation, summon rules, combat, every protection,
 * end-of-game (immediate win / turn-limit win / draw) and a full simulated match.
 */

import {
  buildDefaultDeck,
  validateDeck,
  CHARACTERS,
  SAMPLE_LEGENDARY,
  DECK_SIZE,
} from '../cards';

import {
  createInitialState,
  summon,
  attack,
  endTurn,
  canSummon,
  SIDES,
  RESULT,
} from '../gameLogic';

import { playAutoTurn, playBotTurn, chooseSummonIndex } from '../bot';

// ---- helpers ---------------------------------------------------------------
const clone = (s) => JSON.parse(JSON.stringify(s));

const fieldCard = (id, power, extra = {}) => ({
  instanceId: id,
  key: 'TST',
  name: `Card_${id}`,
  element: 'FIRE',
  power,
  rarity: 'normal',
  ability: '',
  artwork: '',
  attackedThisTurn: false,
  ...extra,
});

// A controlled state: player active, turn 1, both 2000 HP, given fields/hands.
function scenario({ playerField = [], botField = [], playerHand = [], summoned = false } = {}) {
  const s = clone(createInitialState({ seed: 1 }));
  const pad = (arr) => {
    const f = arr.slice(0, 4);
    while (f.length < 4) f.push(null);
    return f;
  };
  s.players.player.field = pad(playerField);
  s.players.bot.field = pad(botField);
  s.players.player.hand = playerHand;
  s.players.bot.hand = [];
  s.players.player.hp = 2000;
  s.players.bot.hp = 2000;
  s.activeSide = SIDES.PLAYER;
  s.turn = 1;
  s.result = null;
  s.flags.summonedThisTurn = summoned;
  return s;
}

// ---- deck data -------------------------------------------------------------
describe('cards / deck', () => {
  test('default deck has 18 cards and is valid', () => {
    const deck = buildDefaultDeck();
    expect(deck).toHaveLength(DECK_SIZE);
    const res = validateDeck(deck);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  test('rejects wrong size', () => {
    expect(validateDeck(buildDefaultDeck().slice(0, 17)).valid).toBe(false);
  });

  test('rejects more than 3 copies of a normal card', () => {
    const deck = buildDefaultDeck();
    const sylvaIdx = deck.findIndex((c) => c.key === 'SYLVA');
    deck[sylvaIdx] = { ...CHARACTERS.NYRA }; // NYRA -> 4, SYLVA -> 2
    const res = validateDeck(deck);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes('NYRA'))).toBe(true);
  });

  test('rejects more than 1 legendary', () => {
    const deck = buildDefaultDeck();
    deck[0] = { ...SAMPLE_LEGENDARY };
    deck[1] = { ...SAMPLE_LEGENDARY };
    const res = validateDeck(deck);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.toLowerCase().includes('légendaire'))).toBe(true);
  });
});

// ---- initial state ---------------------------------------------------------
describe('initial state', () => {
  test('2000 HP, 4 empty slots, hands of 6 (+1 draw for the starting side)', () => {
    const s = createInitialState({ seed: 7 });
    expect(s.players.player.hp).toBe(2000);
    expect(s.players.bot.hp).toBe(2000);
    expect(s.players.player.field).toEqual([null, null, null, null]);
    expect(s.players.bot.field).toEqual([null, null, null, null]);
    // starting side (player) drew 1 at the start of turn 1
    expect(s.players.player.hand).toHaveLength(7);
    expect(s.players.bot.hand).toHaveLength(6);
    expect(s.players.player.deck).toHaveLength(DECK_SIZE - 7);
    expect(s.turn).toBe(1);
    expect(s.result).toBeNull();
  });
});

// ---- summon rules + protections -------------------------------------------
describe('summon', () => {
  test('summons a card to the field and flags the turn', () => {
    const s = scenario({ playerHand: [fieldCard('h1', 500)] });
    const r = summon(s, SIDES.PLAYER, 0);
    expect(r.ok).toBe(true);
    expect(r.state.flags.summonedThisTurn).toBe(true);
    expect(r.state.players.player.field.filter(Boolean)).toHaveLength(1);
    expect(r.state.players.player.hand).toHaveLength(0);
  });

  test('marks the summoned card summonedThisTurn, reset at the start of the next own turn', () => {
    const s = scenario({ playerHand: [fieldCard('h1', 500)] });
    const summoned = summon(s, SIDES.PLAYER, 0).state;
    expect(summoned.players.player.field.find(Boolean).summonedThisTurn).toBe(true);
    // player -> bot -> player ; beginActiveTurn resets the player's per-turn flags
    const botTurn = endTurn(summoned, SIDES.PLAYER).state;
    const backToPlayer = endTurn(botTurn, SIDES.BOT).state;
    expect(backToPlayer.players.player.field.find(Boolean).summonedThisTurn).toBe(false);
  });

  test('PROTECTION: only one normal summon per turn', () => {
    const s = scenario({ playerHand: [fieldCard('h1', 500), fieldCard('h2', 400)] });
    const r1 = summon(s, SIDES.PLAYER, 0);
    expect(r1.ok).toBe(true);
    const r2 = summon(r1.state, SIDES.PLAYER, 0);
    expect(r2.ok).toBe(false);
    expect(r2.error).toMatch(/une seule invocation/i);
  });

  test('PROTECTION: cannot summon when field already has 4 cards', () => {
    const s = scenario({
      playerField: [fieldCard('p1', 100), fieldCard('p2', 100), fieldCard('p3', 100), fieldCard('p4', 100)],
      playerHand: [fieldCard('h1', 500)],
    });
    const check = canSummon(s, SIDES.PLAYER, 0);
    expect(check.ok).toBe(false);
    expect(check.error).toMatch(/plein/i);
    expect(summon(s, SIDES.PLAYER, 0).ok).toBe(false);
  });

  test('legendary requires exactly 2 sacrifices', () => {
    const legendaryHand = fieldCard('leg1', 1200, { key: 'NOX_PRIME', rarity: 'legendary' });
    const s = scenario({
      playerField: [fieldCard('p1', 300), fieldCard('p2', 300)],
      playerHand: [legendaryHand],
    });
    // no sacrifices -> rejected
    expect(summon(s, SIDES.PLAYER, 0).ok).toBe(false);
    // 1 sacrifice -> rejected
    expect(summon(s, SIDES.PLAYER, 0, { sacrificeInstanceIds: ['p1'] }).ok).toBe(false);
    // 2 sacrifices -> ok
    const r = summon(s, SIDES.PLAYER, 0, { sacrificeInstanceIds: ['p1', 'p2'] });
    expect(r.ok).toBe(true);
    expect(r.state.players.player.graveyard).toHaveLength(2);
    expect(r.state.players.player.field.filter(Boolean)).toHaveLength(1);
    expect(r.state.players.player.field.find((c) => c && c.rarity === 'legendary')).toBeTruthy();
  });
});

// ---- combat ----------------------------------------------------------------
describe('combat', () => {
  test('stronger attacker destroys weaker target and deals difference', () => {
    const s = scenario({ playerField: [fieldCard('p1', 800)], botField: [fieldCard('b1', 500)] });
    const r = attack(s, SIDES.PLAYER, 'p1', 'b1');
    expect(r.ok).toBe(true);
    expect(r.state.players.bot.field.filter(Boolean)).toHaveLength(0);
    expect(r.state.players.bot.hp).toBe(2000 - 300);
    expect(r.state.players.player.field[0].attackedThisTurn).toBe(true);
  });

  test('equal power: both destroyed, no damage', () => {
    const s = scenario({ playerField: [fieldCard('p1', 500)], botField: [fieldCard('b1', 500)] });
    const r = attack(s, SIDES.PLAYER, 'p1', 'b1');
    expect(r.state.players.player.field.filter(Boolean)).toHaveLength(0);
    expect(r.state.players.bot.field.filter(Boolean)).toHaveLength(0);
    expect(r.state.players.bot.hp).toBe(2000);
    expect(r.state.players.player.hp).toBe(2000);
  });

  test('weaker attacker is destroyed and its owner takes the difference', () => {
    const s = scenario({ playerField: [fieldCard('p1', 400)], botField: [fieldCard('b1', 600)] });
    const r = attack(s, SIDES.PLAYER, 'p1', 'b1');
    expect(r.state.players.player.field.filter(Boolean)).toHaveLength(0);
    expect(r.state.players.player.hp).toBe(2000 - 200);
    expect(r.state.players.bot.field.filter(Boolean)).toHaveLength(1);
  });

  test('direct attack only when opponent field is empty', () => {
    const direct = scenario({ playerField: [fieldCard('p1', 500)], botField: [] });
    const r = attack(direct, SIDES.PLAYER, 'p1', null);
    expect(r.ok).toBe(true);
    expect(r.state.players.bot.hp).toBe(2000 - 500);

    const blocked = scenario({ playerField: [fieldCard('p1', 500)], botField: [fieldCard('b1', 100)] });
    expect(attack(blocked, SIDES.PLAYER, 'p1', null).ok).toBe(false);
  });

  test('PROTECTION: a card cannot attack twice in the same turn', () => {
    const s = scenario({ playerField: [fieldCard('p1', 500)], botField: [] });
    const r1 = attack(s, SIDES.PLAYER, 'p1', null);
    expect(r1.ok).toBe(true);
    const r2 = attack(r1.state, SIDES.PLAYER, 'p1', null);
    expect(r2.ok).toBe(false);
    expect(r2.error).toMatch(/déjà attaqué/i);
  });
});

// ---- end of game -----------------------------------------------------------
describe('end of game', () => {
  test('immediate win when opponent HP reaches 0', () => {
    const s = scenario({ playerField: [fieldCard('p1', 500)], botField: [] });
    s.players.bot.hp = 400;
    const r = attack(s, SIDES.PLAYER, 'p1', null);
    expect(r.state.players.bot.hp).toBe(0);
    expect(r.state.result).toBe(RESULT.PLAYER);
    expect(r.state.winnerReason).toMatch(/immédiate/i);
  });

  test('PROTECTION: no actions after the match is over', () => {
    const s = scenario({ playerField: [fieldCard('p1', 500)], botField: [] });
    s.players.bot.hp = 100;
    const won = attack(s, SIDES.PLAYER, 'p1', null).state;
    expect(won.result).toBe(RESULT.PLAYER);
    expect(attack(won, SIDES.PLAYER, 'p1', null).ok).toBe(false);
    expect(endTurn(won, SIDES.PLAYER).ok).toBe(false);
    expect(summon(won, SIDES.PLAYER, 0).ok).toBe(false);
  });

  test('draw after turn 8 with equal HP, and turns never exceed the limit', () => {
    let s = createInitialState({ seed: 3 });
    let guard = 0;
    while (!s.result && guard < 50) {
      guard++;
      // both sides just end their turn without attacking -> HP stays equal
      const r = endTurn(s, s.activeSide);
      s = r.state;
      expect(s.turn).toBeLessThanOrEqual(8);
    }
    expect(s.turn).toBe(8);
    expect(s.result).toBe(RESULT.DRAW);
  });

  test('turn-limit win goes to the higher HP', () => {
    let s = createInitialState({ seed: 5 });
    s = clone(s);
    s.players.bot.hp = 1500; // player will have more HP at the end
    let guard = 0;
    while (!s.result && guard < 50) {
      guard++;
      s = endTurn(s, s.activeSide).state;
    }
    expect(s.result).toBe(RESULT.PLAYER);
  });
});

// ---- bot + full match ------------------------------------------------------
describe('bot and full match', () => {
  test('bot picks the strongest summonable card', () => {
    const s = scenario({ playerHand: [] });
    s.activeSide = SIDES.BOT;
    s.players.bot.hand = [fieldCard('b_w', 300), fieldCard('b_s', 700), fieldCard('b_m', 500)];
    const idx = chooseSummonIndex(s, SIDES.BOT);
    expect(s.players.bot.hand[idx].power).toBe(700);
  });

  test('playBotTurn summons, may attack, and ends the bot turn', () => {
    const s = scenario({ playerHand: [] });
    s.activeSide = SIDES.BOT;
    s.players.bot.hand = [fieldCard('b1', 700)];
    const after = playBotTurn(s);
    // bot summoned and ended its turn -> it is now the player's turn (or game over)
    expect(after.result === null ? after.activeSide : 'over').not.toBe(SIDES.BOT);
  });

  test('a full auto-vs-auto match always terminates with a valid result within 8 turns', () => {
    let s = createInitialState({ seed: 42 });
    let guard = 0;
    while (!s.result && guard < 100) {
      guard++;
      s = playAutoTurn(s, s.activeSide);
      expect(s.turn).toBeLessThanOrEqual(8);
      expect(s.players.player.hp).toBeGreaterThanOrEqual(0);
      expect(s.players.bot.hp).toBeGreaterThanOrEqual(0);
    }
    expect([RESULT.PLAYER, RESULT.BOT, RESULT.DRAW]).toContain(s.result);
  });

  test('several seeds all terminate cleanly', () => {
    for (const seed of [1, 2, 13, 99, 1000, 7777]) {
      let s = createInitialState({ seed });
      let guard = 0;
      while (!s.result && guard < 100) {
        guard++;
        s = playAutoTurn(s, s.activeSide);
      }
      expect([RESULT.PLAYER, RESULT.BOT, RESULT.DRAW]).toContain(s.result);
    }
  });
});
