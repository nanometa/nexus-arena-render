/**
 * Local demo — basic deterministic bot.
 *
 * On its turn the bot will (in order):
 *   1. draw (already done automatically at the start of its turn by the engine),
 *   2. summon the strongest summonable normal card (one normal summon per turn),
 *   3. attack: destroy the strongest enemy card it can beat, or attack directly
 *      when the opponent's field is empty (it avoids suicidal attacks),
 *   4. end its turn.
 *
 * Pure: it only drives the engine's pure action functions and returns the new state.
 * The v1 bot does not summon legendary cards (it never pays sacrifices); this is
 * documented and intentional for the first deterministic test.
 */

import {
  SIDES,
  summon,
  attack,
  endTurn,
  canSummon,
  legalTargets,
  findOnField,
} from './gameLogic';
import { RARITY, ELEMENTS } from './cards';

const oppOf = (side) => (side === SIDES.PLAYER ? SIDES.BOT : SIDES.PLAYER);

/** Effective attack power against a card, including the FIRE +100 bonus. */
function effectiveAttackPower(card) {
  return card.power + (card.element === ELEMENTS.FIRE ? 100 : 0);
}

/** Index in hand of the best normal card the bot can summon, or -1. */
export function chooseSummonIndex(state, side) {
  if (state.flags.summonedThisTurn) return -1;
  const player = state.players[side];
  let bestIndex = -1;
  let bestPower = -1;
  player.hand.forEach((card, i) => {
    if (card.rarity === RARITY.LEGENDARY) return; // v1: bot skips legendaries
    const check = canSummon(state, side, i);
    if (check.ok && card.power > bestPower) {
      bestPower = card.power;
      bestIndex = i;
    }
  });
  return bestIndex;
}

/**
 * Pick an attack for `attackerInstanceId`.
 * @returns {{ target: string|null }|null} target=null means direct attack; null means "hold".
 */
export function chooseAttack(state, side, attackerInstanceId) {
  const targeting = legalTargets(state, side);
  if (targeting.direct) return { target: null };

  const attackerFound = findOnField(state.players[side], attackerInstanceId);
  if (!attackerFound) return null;
  const attacker = attackerFound.card;

  const oppPlayer = state.players[oppOf(side)];
  const attackPower = effectiveAttackPower(attacker);
  let best = null;
  let bestTargetPower = -1;
  for (const id of targeting.targets) {
    const found = findOnField(oppPlayer, id);
    if (!found) continue;
    const targetCard = found.card;
    // Only attack when the bot wins the exchange (no suicidal trades), accounting for FIRE.
    if (attackPower > targetCard.power) {
      if (
        targetCard.power > bestTargetPower ||
        (targetCard.power === bestTargetPower && (best === null || id < best))
      ) {
        bestTargetPower = targetCard.power;
        best = id;
      }
    }
  }
  return best ? { target: best } : null;
}

/**
 * Play a full automatic turn for `side` and return the resulting state (ends with
 * endTurn, unless the side wins mid-turn). Precondition: state.activeSide === side and
 * game not over. Used by the bot (side=bot) and by the full-match simulation test.
 */
export function playAutoTurn(state, side) {
  let s = state;
  if (s.activeSide !== side || s.result) return s;

  // 2. summon
  const idx = chooseSummonIndex(s, side);
  if (idx !== -1) {
    const r = summon(s, side, idx);
    if (r.ok) s = r.state;
  }

  // 3. attacks — re-evaluate after each attack (a kill can open a direct attack)
  let guard = 0;
  while (!s.result && guard < 64) {
    guard++;
    const me = s.players[side];
    let acted = false;
    for (const card of me.field) {
      if (!card || card.attackedThisTurn) continue;
      const choice = chooseAttack(s, side, card.instanceId);
      if (choice) {
        const r = attack(s, side, card.instanceId, choice.target);
        if (r.ok) {
          s = r.state;
          acted = true;
          break;
        }
      }
    }
    if (!acted) break;
  }

  // 4. end turn (only if the game is not already decided)
  if (!s.result) {
    const r = endTurn(s, side);
    if (r.ok) s = r.state;
  }

  return s;
}

/**
 * Play the full bot turn. Precondition: state.activeSide === bot and game not over.
 */
export function playBotTurn(state) {
  return playAutoTurn(state, SIDES.BOT);
}
