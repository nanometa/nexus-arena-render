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

// NOTE: default element is WATER on purpose. WATER's effect only triggers at the end of
// the turn a card is *summoned* (summonedThisTurn), so cards placed directly on the field
// in these structural/combat tests have no effect on combat math — keeping the base-combat
// assertions valid. Per-element effects are covered explicitly in the "elemental effects" block.
const fieldCard = (id, power, extra = {}) => ({
  instanceId: id,
  key: 'TST',
  name: `Card_${id}`,
  element: 'WATER',
  power,
  basePower: power,
  rarity: 'normal',
  ability: '',
  artwork: '',
  attackedThisTurn: false,
  summonedThisTurn: false,
  earthShieldUsed: false,
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


// ---- elemental effects (mission section 6) --------------------------------
describe('elemental effects', () => {
  // FIRE: +100 effective power when attacking a card (not on a direct attack).
  describe('FIRE', () => {
    test('gains +100 when attacking a card: turns a loss into a win', () => {
      const s = scenario({
        playerField: [fieldCard('f1', 600, { element: 'FIRE' })],
        botField: [fieldCard('b1', 650, { element: 'WATER' })],
      });
      const r = attack(s, SIDES.PLAYER, 'f1', 'b1');
      expect(r.ok).toBe(true);
      // 600 (+100) = 700 > 650 -> target destroyed, overflow 50
      expect(r.state.players.bot.field.filter(Boolean)).toHaveLength(0);
      expect(r.state.players.player.field.filter(Boolean)).toHaveLength(1);
      expect(r.state.players.bot.hp).toBe(2000 - 50);
    });

    test('+100 can force a mutual-destruction tie', () => {
      const s = scenario({
        playerField: [fieldCard('f1', 600, { element: 'FIRE' })],
        botField: [fieldCard('b1', 700, { element: 'WATER' })],
      });
      const r = attack(s, SIDES.PLAYER, 'f1', 'b1');
      // 600 (+100) = 700 == 700 -> both destroyed, no damage
      expect(r.state.players.player.field.filter(Boolean)).toHaveLength(0);
      expect(r.state.players.bot.field.filter(Boolean)).toHaveLength(0);
      expect(r.state.players.bot.hp).toBe(2000);
      expect(r.state.players.player.hp).toBe(2000);
    });

    test('does NOT apply the +100 bonus on a direct attack', () => {
      const s = scenario({ playerField: [fieldCard('f1', 600, { element: 'FIRE' })], botField: [] });
      const r = attack(s, SIDES.PLAYER, 'f1', null);
      expect(r.state.players.bot.hp).toBe(2000 - 600); // base power only
    });
  });

  // ELECTRIC: +100 extra HP damage when its attack destroys the target.
  describe('ELECTRIC', () => {
    test('deals +100 extra HP when it destroys the target', () => {
      const s = scenario({
        playerField: [fieldCard('e1', 800, { element: 'ELECTRIC' })],
        botField: [fieldCard('b1', 500, { element: 'WATER' })],
      });
      const r = attack(s, SIDES.PLAYER, 'e1', 'b1');
      // overflow 300 + electric 100
      expect(r.state.players.bot.field.filter(Boolean)).toHaveLength(0);
      expect(r.state.players.bot.hp).toBe(2000 - 300 - 100);
    });

    test('no +100 bonus on a direct attack (no target destroyed)', () => {
      const s = scenario({ playerField: [fieldCard('e1', 500, { element: 'ELECTRIC' })], botField: [] });
      const r = attack(s, SIDES.PLAYER, 'e1', null);
      expect(r.state.players.bot.hp).toBe(2000 - 500);
    });
  });

  // WATER: heals its owner +100 at the end of the turn it was summoned.
  describe('WATER', () => {
    test('normal heal: +100 below the starting HP', () => {
      const s = scenario({ playerHand: [fieldCard('w1', 450, { element: 'WATER' })] });
      s.players.player.hp = 1500;
      const summoned = summon(s, SIDES.PLAYER, 0).state;
      const afterEnd = endTurn(summoned, SIDES.PLAYER).state;
      expect(afterEnd.players.player.hp).toBe(1600);
      const log = afterEnd.log.join('\n');
      expect(log).toContain('Eau :');
      expect(log).not.toContain('surcharge de vie'); // normal heal, no overheal note
    });

    test('overheal: heals +100 ABOVE the starting HP (2000 -> 2100)', () => {
      const s = scenario({ playerHand: [fieldCard('w1', 450, { element: 'WATER' })] });
      s.players.player.hp = 2000;
      const summoned = summon(s, SIDES.PLAYER, 0).state;
      const afterEnd = endTurn(summoned, SIDES.PLAYER).state;
      expect(afterEnd.players.player.hp).toBe(2100); // overheal allowed
      expect(afterEnd.log.join('\n')).toContain('(surcharge de vie)');
    });

    test('overheal is hard-capped at 2300 PV', () => {
      const s = scenario({ playerHand: [fieldCard('w1', 450, { element: 'WATER' })] });
      s.players.player.hp = 2250;
      const summoned = summon(s, SIDES.PLAYER, 0).state;
      const afterEnd = endTurn(summoned, SIDES.PLAYER).state;
      expect(afterEnd.players.player.hp).toBe(2300); // 2250 + 100 -> capped at 2300
      expect(afterEnd.log.join('\n')).toContain('(surcharge de vie)');
    });

    test('at the 2300 cap: no further heal, and the log never says "de 0 PV"', () => {
      const s = scenario({ playerHand: [fieldCard('w1', 450, { element: 'WATER' })] });
      s.players.player.hp = 2300;
      const summoned = summon(s, SIDES.PLAYER, 0).state;
      const afterEnd = endTurn(summoned, SIDES.PLAYER).state;
      expect(afterEnd.players.player.hp).toBe(2300); // unchanged at the cap
      const log = afterEnd.log.join('\n');
      expect(log).toContain('Eau :'); // WATER still logged
      expect(log).toContain('vie déjà au maximum'); // dedicated at-cap message
      expect(log).not.toContain('de 0 PV'); // never "soigne ... de 0 PV"
    });

    test('only heals the turn it is summoned, not later turns', () => {
      const s = scenario({ playerHand: [fieldCard('w1', 450, { element: 'WATER' })] });
      s.players.player.hp = 1500;
      let st = summon(s, SIDES.PLAYER, 0).state;
      st = endTurn(st, SIDES.PLAYER).state; // heal -> 1600, now bot's turn
      st = endTurn(st, SIDES.BOT).state; // back to player; flag reset at turn start
      st = endTurn(st, SIDES.PLAYER).state; // no heal this time
      expect(st.players.player.hp).toBe(1600);
    });
  });

  // EARTH: survives the first destruction at power 100, dies the second time.
  describe('EARTH', () => {
    test('survives the first lethal hit (power -> 100, no overflow), dies the second', () => {
      const s = scenario({
        playerField: [
          fieldCard('att', 900, { element: 'WATER' }),
          fieldCard('att2', 200, { element: 'WATER' }),
        ],
        botField: [fieldCard('rock', 700, { element: 'EARTH' })],
      });
      const r1 = attack(s, SIDES.PLAYER, 'att', 'rock');
      const rock = r1.state.players.bot.field.find((c) => c && c.instanceId === 'rock');
      expect(rock).toBeTruthy(); // survived
      expect(rock.power).toBe(100);
      expect(rock.earthShieldUsed).toBe(true);
      expect(r1.state.players.bot.hp).toBe(2000); // no overflow on the saved hit

      const r2 = attack(r1.state, SIDES.PLAYER, 'att2', 'rock');
      expect(r2.state.players.bot.field.filter(Boolean)).toHaveLength(0); // now destroyed
      expect(r2.state.players.bot.hp).toBe(2000 - 100); // overflow 200-100
    });
  });

  // NATURE: ALWAYS draws a card on summon when the deck is not empty.
  describe('NATURE', () => {
    test('always draws 1 on summon when the deck is not empty', () => {
      const s = scenario({ playerHand: [fieldCard('n1', 400, { element: 'NATURE' })] });
      s.players.player.deck = [fieldCard('seed', 300)];
      const r = summon(s, SIDES.PLAYER, 0);
      expect(r.ok).toBe(true);
      expect(r.state.players.player.hand).toHaveLength(1);
      expect(r.state.players.player.hand[0].instanceId).toBe('seed');
      expect(r.state.players.player.deck).toHaveLength(0);
      expect(r.state.log.join('\n')).toContain('Nature :');
    });

    test('still draws even when the hand is full (>= handSize)', () => {
      const fillers = Array.from({ length: 6 }, (_, i) => fieldCard(`x${i}`, 100));
      const s = scenario({ playerHand: [fieldCard('n1', 400, { element: 'NATURE' }), ...fillers] });
      s.players.player.deck = [fieldCard('seed', 300)];
      const r = summon(s, SIDES.PLAYER, 0); // hand 7 -> 6 after summon, then ALWAYS draw -> 7
      expect(r.ok).toBe(true);
      expect(r.state.players.player.hand).toHaveLength(7);
      expect(r.state.players.player.deck).toHaveLength(0); // drew the seed
      expect(r.state.players.player.hand.some((c) => c.instanceId === 'seed')).toBe(true);
    });

    test('does NOT draw only when the deck is empty (logs pioche vide)', () => {
      const s = scenario({ playerHand: [fieldCard('n1', 400, { element: 'NATURE' })] });
      s.players.player.deck = [];
      const r = summon(s, SIDES.PLAYER, 0);
      expect(r.ok).toBe(true);
      expect(r.state.players.player.hand).toHaveLength(0);
      expect(r.state.players.player.deck).toHaveLength(0);
      expect(r.state.log.join('\n')).toContain('pioche vide');
    });
  });

  // SHADOW: drains 100 HP from the owner of a card it destroys.
  describe('SHADOW', () => {
    test('attacker drains 100 extra when it destroys the target', () => {
      const s = scenario({
        playerField: [fieldCard('s1', 800, { element: 'SHADOW' })],
        botField: [fieldCard('b1', 500, { element: 'WATER' })],
      });
      const r = attack(s, SIDES.PLAYER, 's1', 'b1');
      // overflow 300 + shadow 100
      expect(r.state.players.bot.field.filter(Boolean)).toHaveLength(0);
      expect(r.state.players.bot.hp).toBe(2000 - 300 - 100);
    });

    test('no drain on a direct attack (no card destroyed)', () => {
      const s = scenario({ playerField: [fieldCard('s1', 500, { element: 'SHADOW' })], botField: [] });
      const r = attack(s, SIDES.PLAYER, 's1', null);
      expect(r.state.players.bot.hp).toBe(2000 - 500);
    });

    test('drains when it destroys an attacker as a defender', () => {
      const s = scenario({
        playerField: [fieldCard('p1', 300, { element: 'WATER' })],
        botField: [fieldCard('sd', 800, { element: 'SHADOW' })],
      });
      const r = attack(s, SIDES.PLAYER, 'p1', 'sd');
      // attacker loses: overflow 500 + shadow 100 against the attacker's owner
      expect(r.state.players.player.field.filter(Boolean)).toHaveLength(0);
      expect(r.state.players.player.hp).toBe(2000 - 500 - 100);
      expect(r.state.players.bot.field.filter(Boolean)).toHaveLength(1);
    });
  });

  // Interactions: EARTH's survival blocks the ELECTRIC/SHADOW on-kill bonuses.
  describe('EARTH interaction', () => {
    test('EARTH survival blocks the ELECTRIC bonus (no destruction)', () => {
      const s = scenario({
        playerField: [fieldCard('e1', 800, { element: 'ELECTRIC' })],
        botField: [fieldCard('rock', 700, { element: 'EARTH' })],
      });
      const r = attack(s, SIDES.PLAYER, 'e1', 'rock');
      const rock = r.state.players.bot.field.find((c) => c && c.instanceId === 'rock');
      expect(rock).toBeTruthy(); // EARTH survived
      expect(rock.power).toBe(100);
      expect(r.state.players.bot.hp).toBe(2000); // no overflow, no electric bonus
    });

    test('EARTH survival blocks the SHADOW drain (no destruction)', () => {
      const s = scenario({
        playerField: [fieldCard('s1', 800, { element: 'SHADOW' })],
        botField: [fieldCard('rock', 700, { element: 'EARTH' })],
      });
      const r = attack(s, SIDES.PLAYER, 's1', 'rock');
      expect(r.state.players.bot.field.filter(Boolean)).toHaveLength(1); // survived
      expect(r.state.players.bot.hp).toBe(2000); // no drain
    });
  });
});


// ---- full playable loop: effects actually fire in real bot-vs-bot play -----
describe('full match exercises every elemental effect', () => {
  // Deterministic: fixed seeds + seeded RNG => identical games => identical logs.
  const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
  const makeDeck = (template, n = 18) => Array.from({ length: n }, () => ({ ...template }));

  function runFullMatch(opts) {
    let s = createInitialState(opts);
    let guard = 0;
    while (!s.result && guard < 100) {
      guard++;
      s = playAutoTurn(s, s.activeSide);
      expect(s.turn).toBeLessThanOrEqual(8);
      expect(s.players.player.hp).toBeGreaterThanOrEqual(0);
      expect(s.players.bot.hp).toBeGreaterThanOrEqual(0);
    }
    expect([RESULT.PLAYER, RESULT.BOT, RESULT.DRAW]).toContain(s.result);
    return s;
  }

  test('every default match terminates start -> victory/defeat/draw within 8 turns', () => {
    for (const seed of SEEDS) {
      const s = runFullMatch({ seed });
      expect(s.winnerReason).toBeTruthy();
    }
  });

  // Each effect is driven through the REAL engine (real summon/attack/endTurn via the bot
  // simulation), with crafted decks so the trigger is deterministic, and verified by its log
  // marker. This proves the effects are wired into actual gameplay, not just unit-tested.
  test('FIRE marker fires when a FIRE card attacks a card', () => {
    const s = runFullMatch({
      seed: 1,
      playerDeck: makeDeck(CHARACTERS.PYRA), // FIRE 600
      botDeck: makeDeck(CHARACTERS.SYLVA), // NATURE 400 (something to attack)
    });
    expect(s.log.join('\n')).toContain('Feu :');
  });

  test('ELECTRIC marker fires when its attack destroys the target', () => {
    const s = runFullMatch({
      seed: 1,
      playerDeck: makeDeck(CHARACTERS.NYRA), // ELECTRIC 500
      botDeck: makeDeck(CHARACTERS.SYLVA), // NATURE 400 (gets destroyed)
    });
    expect(s.log.join('\n')).toContain('Foudre :');
  });

  test('SHADOW marker fires when its attack destroys the target', () => {
    const s = runFullMatch({
      seed: 1,
      playerDeck: makeDeck(CHARACTERS.NOX), // SHADOW 800
      botDeck: makeDeck(CHARACTERS.SYLVA), // NATURE 400 (gets destroyed)
    });
    expect(s.log.join('\n')).toContain('Ombre :');
  });

  test('EARTH marker fires when an EARTH card survives a lethal hit', () => {
    const s = runFullMatch({
      seed: 1,
      playerDeck: makeDeck(CHARACTERS.NOX), // SHADOW 800 attacker
      botDeck: makeDeck(CHARACTERS.GORAM), // EARTH 700 survives the first hit
    });
    expect(s.log.join('\n')).toContain('Terre :');
  });

  test('WATER marker fires at the end of the turn a WATER card is summoned', () => {
    const s = runFullMatch({
      seed: 1,
      playerDeck: makeDeck(CHARACTERS.NERIS), // WATER 450
      botDeck: makeDeck(CHARACTERS.NERIS),
    });
    expect(s.log.join('\n')).toContain('Eau :');
  });

  test('NATURE marker fires on summon in a real match (always draws)', () => {
    const s = runFullMatch({
      seed: 1,
      playerDeck: makeDeck(CHARACTERS.SYLVA), // NATURE 400
      botDeck: makeDeck(CHARACTERS.SYLVA),
    });
    expect(s.log.join('\n')).toContain('Nature :');
  });
});
