/**
 * Local demo — pure game-logic engine.
 *
 * No React, no Redux, no socket: just deterministic pure functions over a plain state
 * object. This is what makes the demo testable and server-free.
 *
 * Demo rules implemented:
 *  - 2000 HP per player
 *  - initial hand of 6, draw 1 at the start of each turn
 *  - 4 field slots max per player
 *  - one normal summon per turn
 *  - a card may attack the turn it is summoned (no summoning sickness)
 *  - each card may attack once per turn
 *  - direct attack only allowed when the opponent's field is empty
 *  - legendary card costs 2 sacrifices to summon
 *  - max 8 turns (one player's turn each); turn counter 1..8
 *  - immediate win if opponent HP reaches 0
 *  - after turn 8: highest HP wins, equal HP = draw
 *
 * Deterministic elemental effects (mission section 6), keyed by card.element:
 *  - ELECTRIC: when it attacks and DESTROYS the target card, the defender loses +100 HP.
 *  - FIRE:     +100 effective power while attacking a CARD (not on a direct attack).
 *  - WATER:    at the end of the turn it was summoned, heals its owner +100 HP — overheal
 *              ABOVE startingHp is allowed, hard-capped at config.overhealCap (2300).
 *  - EARTH:    the first time it would be destroyed, it survives at power 100 (no overflow).
 *  - NATURE:   on summon, always draws 1 card if the deck is not empty.
 *  - SHADOW:   when it destroys an opposing card in combat, that card's owner loses +100 HP.
 * EARTH's survival blocks the ELECTRIC/SHADOW "on destroy" bonuses (no real destruction).
 *
 * Mutating helpers operate on a deep-cloned state and return a NEW state. Action
 * functions return { state, ok, error } so the UI/bot/tests can detect rejected moves
 * (the protections required by the task).
 */

import {
  buildDefaultDeck,
  RARITY,
  ELEMENTS,
  LEGENDARY_SACRIFICES,
} from './cards';

export const SIDES = { PLAYER: 'player', BOT: 'bot' };
export const RESULT = { PLAYER: 'player', BOT: 'bot', DRAW: 'draw' };

export const DEFAULT_CONFIG = {
  startingHp: 2000,
  overhealCap: 2300, // WATER may overheal above startingHp, up to this hard cap
  handSize: 6,
  fieldSlots: 4,
  maxTurns: 8,
};

// ---------------------------------------------------------------------------
// Small deterministic RNG (mulberry32) so tests can run reproducible matches.
// ---------------------------------------------------------------------------
export function makeRng(seed = 123456789) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}

const clone = (state) => JSON.parse(JSON.stringify(state));
const otherSide = (side) => (side === SIDES.PLAYER ? SIDES.BOT : SIDES.PLAYER);
const fieldCount = (player) => player.field.filter((c) => c !== null).length;
const firstEmptySlot = (player) => player.field.findIndex((c) => c === null);

function instantiate(template, side, index) {
  return {
    instanceId: `${side}-${template.key}-${index}`,
    key: template.key,
    name: template.name,
    element: template.element,
    power: template.power,
    basePower: template.power,
    rarity: template.rarity,
    ability: template.ability,
    artwork: template.artwork,
    attackedThisTurn: false,
    summonedThisTurn: false,
    earthShieldUsed: false, // EARTH effect: consumed the first time the card would be destroyed
  };
}

function makePlayer(deckTemplates, side, config, rng) {
  const instances = deckTemplates.map((t, i) => instantiate(t, side, i));
  shuffleInPlace(instances, rng);
  const hand = instances.slice(0, config.handSize);
  const deck = instances.slice(config.handSize);
  return {
    hp: config.startingHp,
    deck,
    hand,
    field: new Array(config.fieldSlots).fill(null),
    graveyard: [],
  };
}

/**
 * Begin the active side's turn: draw 1, reset its per-turn flags.
 * Internal — mutates the passed (already-cloned) state.
 */
function beginActiveTurn(state) {
  const player = state.players[state.activeSide];
  // reset attack flags for the active side's field cards
  player.field.forEach((c) => {
    if (c) {
      c.attackedThisTurn = false;
      c.summonedThisTurn = false;
    }
  });
  state.flags.summonedThisTurn = false;
  // draw 1
  if (player.deck.length > 0) {
    const drawn = player.deck.shift();
    player.hand.push(drawn);
    state.log.push(`Tour ${state.turn} — ${sideLabel(state.activeSide)} pioche ${drawn.name}.`);
  } else {
    state.log.push(`Tour ${state.turn} — ${sideLabel(state.activeSide)} ne peut pas piocher (pioche vide).`);
  }
}

export function sideLabel(side) {
  return side === SIDES.PLAYER ? 'Joueur' : 'Bot';
}

/**
 * Create the initial state and begin turn 1 for the starting side.
 */
export function createInitialState(opts = {}) {
  const config = { ...DEFAULT_CONFIG, ...(opts.config || {}) };
  const rng = opts.rng || makeRng(opts.seed != null ? opts.seed : Date.now() % 2147483647);
  const startingSide = opts.startingSide || SIDES.PLAYER;

  const playerDeck = opts.playerDeck || buildDefaultDeck();
  const botDeck = opts.botDeck || buildDefaultDeck();

  const state = {
    config,
    turn: 1,
    activeSide: startingSide,
    players: {
      [SIDES.PLAYER]: makePlayer(playerDeck, SIDES.PLAYER, config, rng),
      [SIDES.BOT]: makePlayer(botDeck, SIDES.BOT, config, rng),
    },
    flags: { summonedThisTurn: false },
    result: null,
    winnerReason: null,
    lastError: null,
    log: [],
  };

  state.log.push(`Début de la partie — ${sideLabel(startingSide)} commence.`);
  beginActiveTurn(state);
  return state;
}

// ---------------------------------------------------------------------------
// Queries (also used by the UI to enable/disable controls and by the bot).
// ---------------------------------------------------------------------------

export function findOnField(player, instanceId) {
  const index = player.field.findIndex((c) => c && c.instanceId === instanceId);
  return index === -1 ? null : { index, card: player.field[index] };
}

export function canSummon(state, side, handIndex, opts = {}) {
  if (state.result) return { ok: false, error: 'La partie est terminée.' };
  if (side !== state.activeSide) return { ok: false, error: "Ce n'est pas votre tour." };
  if (state.flags.summonedThisTurn) {
    return { ok: false, error: 'Une seule invocation normale par tour.' };
  }
  const player = state.players[side];
  const card = player.hand[handIndex];
  if (!card) return { ok: false, error: 'Carte introuvable dans la main.' };

  if (card.rarity === RARITY.LEGENDARY) {
    const sacrifices = opts.sacrificeInstanceIds || [];
    if (sacrifices.length !== LEGENDARY_SACRIFICES) {
      return {
        ok: false,
        error: `Une carte légendaire nécessite ${LEGENDARY_SACRIFICES} sacrifices.`,
      };
    }
    const uniqueSac = new Set(sacrifices);
    if (uniqueSac.size !== LEGENDARY_SACRIFICES) {
      return { ok: false, error: 'Sacrifices invalides (doublon).' };
    }
    for (const id of sacrifices) {
      if (!findOnField(player, id)) {
        return { ok: false, error: 'Sacrifice introuvable sur le terrain.' };
      }
    }
    return { ok: true };
  }

  // normal card: need a free slot
  if (fieldCount(player) >= state.config.fieldSlots) {
    return { ok: false, error: `Terrain plein (max ${state.config.fieldSlots}).` };
  }
  return { ok: true };
}

export function canAttack(state, side, attackerInstanceId) {
  if (state.result) return { ok: false, error: 'La partie est terminée.' };
  if (side !== state.activeSide) return { ok: false, error: "Ce n'est pas votre tour." };
  const player = state.players[side];
  const found = findOnField(player, attackerInstanceId);
  if (!found) return { ok: false, error: 'Attaquant introuvable sur le terrain.' };
  if (found.card.attackedThisTurn) {
    return { ok: false, error: 'Cette carte a déjà attaqué ce tour.' };
  }
  return { ok: true };
}

/**
 * Legal attack targets for an attacker. If the opponent has any cards, only those
 * cards are valid targets. If the opponent's field is empty, a direct attack (null) is allowed.
 */
export function legalTargets(state, side) {
  const opp = state.players[otherSide(side)];
  const cards = opp.field.filter((c) => c !== null).map((c) => c.instanceId);
  if (cards.length === 0) return { direct: true, targets: [] };
  return { direct: false, targets: cards };
}

// ---------------------------------------------------------------------------
// Actions (return { state, ok, error }).
// ---------------------------------------------------------------------------

export function summon(state, side, handIndex, opts = {}) {
  const check = canSummon(state, side, handIndex, opts);
  if (!check.ok) return { state, ok: false, error: check.error };

  const next = clone(state);
  next.lastError = null;
  const player = next.players[side];
  const card = player.hand[handIndex];

  // Legendary: pay sacrifices first (frees slots), then place.
  if (card.rarity === RARITY.LEGENDARY) {
    for (const id of opts.sacrificeInstanceIds) {
      const found = findOnField(player, id);
      if (found) {
        player.graveyard.push(found.card);
        player.field[found.index] = null;
        next.log.push(`${sideLabel(side)} sacrifie ${found.card.name}.`);
      }
    }
  }

  const slot = firstEmptySlot(player);
  if (slot === -1) {
    // Should not happen after checks, but guard anyway.
    return { state, ok: false, error: `Terrain plein (max ${next.config.fieldSlots}).` };
  }

  player.hand.splice(handIndex, 1);
  card.attackedThisTurn = false; // can attack the turn it is summoned
  card.summonedThisTurn = true;
  player.field[slot] = card;
  next.flags.summonedThisTurn = true;
  next.log.push(`${sideLabel(side)} invoque ${card.name} (puissance ${card.power}).`);

  // NATURE effect: on summon, ALWAYS draw 1 card if the deck is not empty.
  if (card.element === ELEMENTS.NATURE) {
    if (player.deck.length > 0) {
      const drawn = player.deck.shift();
      player.hand.push(drawn);
      next.log.push(`Nature : ${card.name} fait piocher ${drawn.name} à ${sideLabel(side)}.`);
    } else {
      next.log.push(`Nature : ${card.name} ne peut pas piocher (pioche vide).`);
    }
  }

  return { state: next, ok: true };
}

// ---------------------------------------------------------------------------
// Combat destruction helper (applies the EARTH survival effect).
// ---------------------------------------------------------------------------

/**
 * Send the field card at `index` (owned by `ownerSide`) to the graveyard.
 * EARTH effect: the first time the card would be destroyed it survives instead,
 * its power drops to 100 and its shield is consumed.
 * @returns {boolean} true if the card was actually destroyed, false if it survived.
 */
function tryDestroy(state, ownerSide, index) {
  const player = state.players[ownerSide];
  const card = player.field[index];
  if (!card) return false;
  if (card.element === ELEMENTS.EARTH && !card.earthShieldUsed) {
    card.earthShieldUsed = true;
    card.power = 100;
    state.log.push(`Terre : ${card.name} résiste à la destruction et tombe à 100 puissance.`);
    return false;
  }
  player.graveyard.push(card);
  player.field[index] = null;
  return true;
}

export function attack(state, side, attackerInstanceId, targetInstanceId = null) {
  const check = canAttack(state, side, attackerInstanceId);
  if (!check.ok) return { state, ok: false, error: check.error };

  const targeting = legalTargets(state, side);
  if (targetInstanceId === null) {
    if (!targeting.direct) {
      return { state, ok: false, error: "Attaque directe interdite : l'adversaire a des cartes." };
    }
  } else if (!targeting.targets.includes(targetInstanceId)) {
    return { state, ok: false, error: 'Cible invalide.' };
  }

  const next = clone(state);
  next.lastError = null;
  const attackerSide = side;
  const defenderSide = otherSide(side);
  const attackerPlayer = next.players[attackerSide];
  const defenderPlayer = next.players[defenderSide];
  const attacker = findOnField(attackerPlayer, attackerInstanceId).card;

  if (targetInstanceId === null) {
    // direct attack — base power, no FIRE bonus (FIRE only triggers against a card)
    defenderPlayer.hp -= attacker.power;
    attacker.attackedThisTurn = true;
    next.log.push(
      `${sideLabel(attackerSide)} : ${attacker.name} attaque directement (-${attacker.power} PV).`
    );
  } else {
    const target = findOnField(defenderPlayer, targetInstanceId);
    const t = target.card;
    attacker.attackedThisTurn = true;

    // FIRE effect: +100 effective power for this attack against a card.
    let atkPower = attacker.power;
    if (attacker.element === ELEMENTS.FIRE) {
      atkPower += 100;
      next.log.push(
        `Feu : ${attacker.name} gagne +100 puissance pour cette attaque (${attacker.power} → ${atkPower}).`
      );
    }

    if (atkPower > t.power) {
      const overflow = atkPower - t.power;
      const destroyed = tryDestroy(next, defenderSide, target.index);
      if (destroyed) {
        defenderPlayer.hp -= overflow;
        next.log.push(
          `${attacker.name} détruit ${t.name} (-${overflow} PV pour ${sideLabel(defenderSide)}).`
        );
        // ELECTRIC: on a kill, the attacker deals +100 extra HP damage.
        if (attacker.element === ELEMENTS.ELECTRIC) {
          defenderPlayer.hp -= 100;
          next.log.push(`Foudre : ${attacker.name} inflige +100 PV à ${sideLabel(defenderSide)}.`);
        }
        // SHADOW: when it destroys a card, that card's owner loses 100 HP.
        if (attacker.element === ELEMENTS.SHADOW) {
          defenderPlayer.hp -= 100;
          next.log.push(`Ombre : ${attacker.name} draine 100 PV à ${sideLabel(defenderSide)}.`);
        }
      }
      // EARTH shield case: target survived -> no overflow, no on-kill bonus.
    } else if (atkPower < t.power) {
      const overflow = t.power - atkPower;
      const idx = findOnField(attackerPlayer, attackerInstanceId).index;
      const destroyed = tryDestroy(next, attackerSide, idx);
      if (destroyed) {
        attackerPlayer.hp -= overflow;
        next.log.push(
          `${t.name} repousse ${attacker.name} (-${overflow} PV pour ${sideLabel(attackerSide)}).`
        );
        // SHADOW (defender): the blocking card destroyed the attacker.
        if (t.element === ELEMENTS.SHADOW) {
          attackerPlayer.hp -= 100;
          next.log.push(`Ombre : ${t.name} draine 100 PV à ${sideLabel(attackerSide)}.`);
        }
      }
      // EARTH shield case: attacker survived -> no overflow.
    } else {
      // equal effective power: both should be destroyed, no overflow damage.
      const idx = findOnField(attackerPlayer, attackerInstanceId).index;
      const attackerDestroyed = tryDestroy(next, attackerSide, idx);
      const targetDestroyed = tryDestroy(next, defenderSide, target.index);
      next.log.push(`${attacker.name} et ${t.name} s'affrontent à puissance égale.`);
      // SHADOW triggers for whichever side actually destroyed the opposing card.
      if (attacker.element === ELEMENTS.SHADOW && targetDestroyed) {
        defenderPlayer.hp -= 100;
        next.log.push(`Ombre : ${attacker.name} draine 100 PV à ${sideLabel(defenderSide)}.`);
      }
      if (t.element === ELEMENTS.SHADOW && attackerDestroyed) {
        attackerPlayer.hp -= 100;
        next.log.push(`Ombre : ${t.name} draine 100 PV à ${sideLabel(attackerSide)}.`);
      }
    }
  }

  // clamp + immediate win check
  clampHp(next);
  resolveImmediateWin(next);
  return { state: next, ok: true };
}

/**
 * WATER effect: at the end of the turn it was summoned, each WATER card on the active side
 * heals its owner +100 HP. Overheal ABOVE startingHp is allowed, hard-capped at
 * config.overhealCap. Logs never say "0 PV": at the cap a distinct message is used, and any
 * heal that ends above startingHp is flagged as "(surcharge de vie)".
 */
function applyWaterHeal(state, side) {
  const player = state.players[side];
  const baseMax = state.config.startingHp; // 2000
  const overhealCap = state.config.overhealCap != null ? state.config.overhealCap : baseMax;
  player.field.forEach((c) => {
    if (c && c.element === ELEMENTS.WATER && c.summonedThisTurn) {
      const before = player.hp;
      player.hp = Math.min(overhealCap, player.hp + 100);
      const healed = player.hp - before;
      if (healed <= 0) {
        state.log.push(
          `Eau : ${c.name} ne soigne pas ${sideLabel(side)} (vie déjà au maximum, ${overhealCap} PV).`
        );
      } else if (player.hp > baseMax) {
        state.log.push(`Eau : ${c.name} soigne ${sideLabel(side)} de ${healed} PV (surcharge de vie).`);
      } else {
        state.log.push(`Eau : ${c.name} soigne ${sideLabel(side)} de ${healed} PV.`);
      }
    }
  });
}

export function endTurn(state, side) {
  if (state.result) return { state, ok: false, error: 'La partie est terminée.' };
  if (side !== state.activeSide) return { state, ok: false, error: "Ce n'est pas votre tour." };

  const next = clone(state);
  next.lastError = null;
  next.log.push(`${sideLabel(side)} termine le tour ${next.turn}.`);

  // WATER effect resolves at end of turn (before the turn-limit HP comparison).
  applyWaterHeal(next, side);

  // Turn limit: turns are individual player turns, counter 1..maxTurns.
  if (next.turn >= next.config.maxTurns) {
    finishByHp(next);
    return { state: next, ok: true };
  }

  next.turn += 1;
  next.activeSide = otherSide(next.activeSide);
  beginActiveTurn(next);
  return { state: next, ok: true };
}

// ---------------------------------------------------------------------------
// End-of-game helpers.
// ---------------------------------------------------------------------------

function clampHp(state) {
  for (const side of [SIDES.PLAYER, SIDES.BOT]) {
    if (state.players[side].hp < 0) state.players[side].hp = 0;
  }
}

function resolveImmediateWin(state) {
  if (state.result) return;
  const pHp = state.players[SIDES.PLAYER].hp;
  const bHp = state.players[SIDES.BOT].hp;
  if (pHp <= 0 && bHp <= 0) {
    state.result = RESULT.DRAW;
    state.winnerReason = 'Les deux joueurs tombent à 0 PV — égalité.';
  } else if (bHp <= 0) {
    state.result = RESULT.PLAYER;
    state.winnerReason = 'PV de l’adversaire à 0 — victoire immédiate du Joueur.';
  } else if (pHp <= 0) {
    state.result = RESULT.BOT;
    state.winnerReason = 'PV du Joueur à 0 — victoire immédiate du Bot.';
  }
}

function finishByHp(state) {
  const pHp = state.players[SIDES.PLAYER].hp;
  const bHp = state.players[SIDES.BOT].hp;
  if (pHp > bHp) {
    state.result = RESULT.PLAYER;
    state.winnerReason = `Fin après ${state.config.maxTurns} tours — le Joueur a le plus de PV (${pHp} vs ${bHp}).`;
  } else if (bHp > pHp) {
    state.result = RESULT.BOT;
    state.winnerReason = `Fin après ${state.config.maxTurns} tours — le Bot a le plus de PV (${bHp} vs ${pHp}).`;
  } else {
    state.result = RESULT.DRAW;
    state.winnerReason = `Fin après ${state.config.maxTurns} tours — PV identiques (${pHp}) : égalité.`;
  }
  state.log.push(state.winnerReason);
}

/**
 * Convenience for the reducer: apply an engine result, recording lastError on rejection.
 */
export function applyResult(prevState, result) {
  if (result.ok) return result.state;
  return { ...prevState, lastError: result.error };
}
