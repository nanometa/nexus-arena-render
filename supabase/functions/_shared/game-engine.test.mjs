import assert from 'node:assert/strict';
import test from 'node:test';
import { applyGameMove, createGameState, publicGameView } from './game-engine.mjs';

function cards(element, start = 0) {
  return Array.from({ length: 20 }, (_, index) => ({
    id: `${element}-${start + index}`,
    name: `${element} ${index}`,
    element,
    tier: '400-490',
    rarity: 'common',
    score: 400 + index,
    image: `/cards/${element}-${index}.png`,
  }));
}

test('creates two complete private decks and eight-card hands', () => {
  const state = createGameState({
    cards0: cards('water'),
    cards1: cards('fire', 100),
    name0: 'Alpha',
    name1: 'Beta',
  });
  assert.equal(state.board.length, 16);
  assert.equal(state.players['0'].hand.length, 8);
  assert.equal(state.players['1'].hand.length, 8);
  assert.equal(state.players['0'].deck.length, 12);
  assert.equal(state.currentPlayer, '0');
});

test('redacts the opponent hand and every deck order', () => {
  const state = createGameState({ cards0: cards('water'), cards1: cards('fire', 100) });
  const view = publicGameView(state, '0');
  assert.equal(view.players['0'].hand[0].hidden, undefined);
  assert.equal(view.players['1'].hand[0].hidden, true);
  assert.equal(view.players['0'].deck[0].hidden, true);
  assert.equal(view.players['1'].deck[0].hidden, true);
});

test('accepts one legal play and rejects an out-of-turn replay', () => {
  const state = createGameState({ cards0: cards('water'), cards1: cards('fire', 100) });
  const cardUid = state.players['0'].hand[0].uid;
  const next = applyGameMove(state, '0', 'playCard', { cardUid, cellIndex: 0 });
  assert.equal(next.board[0].owner, '0');
  assert.equal(next.currentPlayer, '1');
  assert.throws(
    () => applyGameMove(next, '0', 'playCard', { cardUid: next.players['0'].hand[0].uid, cellIndex: 1 }),
    /not your turn/
  );
});

test('never mutates the previous state when applying a move', () => {
  const state = createGameState({ cards0: cards('water'), cards1: cards('fire', 100) });
  const initialHand = state.players['0'].hand.length;
  applyGameMove(state, '0', 'playCard', { cardUid: state.players['0'].hand[0].uid, cellIndex: 0 });
  assert.equal(state.players['0'].hand.length, initialHand);
  assert.equal(state.board[0].card, null);
});
