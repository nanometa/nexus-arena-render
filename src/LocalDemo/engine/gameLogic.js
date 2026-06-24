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
 * Mutating helpers operate on a deep-cloned state and return a NEW state. Action
 * functions return { state, ok, error } so the UI/bot/tests can detect rejected moves
 * (the protections required by the task).
 */

import {
  buildDefaultDeck,
  RARITY,
  LEGENDARY_SACRIFICES,
} from './cards';

export const SIDES = { PLAYER: 'player', BOT: 'bot' };
export const RESULT = { PLAYER: 'player', BOT: 'bot', DRAW: 'draw' };

export const DEFAULT_CONFIG = {
  startingHp: 2000,
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
    rarity: template.rarity,
    ability: template.ability,
    artwork: template.artwork,
    attackedThisTurn: false,
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
    if (c) c.attackedThisTurn = false;
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
  player.field[slot] = card;
  next.flags.summonedThisTurn = true;
  next.log.push(`${sideLabel(side)} invoque ${card.name} (puissance ${card.power}).`);

  return { state: next, ok: true };
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
    // direct attack
    defenderPlayer.hp -= attacker.power;
    attacker.attackedThisTurn = true;
    next.log.push(
      `${sideLabel(attackerSide)} : ${attacker.name} attaque directement (-${attacker.power} PV).`
    );
  } else {
    const target = findOnField(defenderPlayer, targetInstanceId);
    const t = target.card;
    if (attacker.power > t.power) {
      defenderPlayer.graveyard.push(t);
      defenderPlayer.field[target.index] = null;
      defenderPlayer.hp -= attacker.power - t.power;
      attacker.attackedThisTurn = true;
      next.log.push(
        `${attacker.name} détruit ${t.name} (-${attacker.power - t.power} PV pour ${sideLabel(defenderSide)}).`
      );
    } else if (attacker.power < t.power) {
      const idx = findOnField(attackerPlayer, attackerInstanceId).index;
      attackerPlayer.graveyard.push(attacker);
      attackerPlayer.field[idx] = null;
      attackerPlayer.hp -= t.power - attacker.power;
      next.log.push(
        `${t.name} repousse ${attacker.name} (-${t.power - attacker.power} PV pour ${sideLabel(attackerSide)}).`
      );
    } else {
      // equal: both destroyed, no damage
      const idx = findOnField(attackerPlayer, attackerInstanceId).index;
      attackerPlayer.graveyard.push(attacker);
      attackerPlayer.field[idx] = null;
      defenderPlayer.graveyard.push(t);
      defenderPlayer.field[target.index] = null;
      next.log.push(`${attacker.name} et ${t.name} se détruisent mutuellement.`);
    }
  }

  // clamp + immediate win check
  clampHp(next);
  resolveImmediateWin(next);
  return { state: next, ok: true };
}

export function endTurn(state, side) {
  if (state.result) return { state, ok: false, error: 'La partie est terminée.' };
  if (side !== state.activeSide) return { state, ok: false, error: "Ce n'est pas votre tour." };

  const next = clone(state);
  next.lastError = null;
  next.log.push(`${sideLabel(side)} termine le tour ${next.turn}.`);

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
