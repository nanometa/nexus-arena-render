import { Client } from 'boardgame.io/client';
import { INVALID_MOVE } from 'boardgame.io/core';
import {
  LayetDuel,
  PLAYER_ID,
  BOT_ID,
  BOARD_SIZE,
  CARDS_PER_PLAYER,
  ELEMENT_BONUS,
  BOT_THINK_DELAY_MS,
  getPlacementPreview,
  isLegalPlacement,
  publicView,
  resolveCapture,
} from '../game';
import { LayetDuelMultiplayer } from '../game.multiplayer';

test('undo and redo are disabled for every duel mode', () => {
  expect(LayetDuel.disableUndo).toBe(true);
  expect(LayetDuelMultiplayer.disableUndo).toBe(true);
});

test('setup creates a 4x4 board and hidden-ready 8-card hands from the catalog', () => {
  const client = Client({ game: LayetDuel, numPlayers: 2, playerID: PLAYER_ID });
  client.start();
  const state = client.getState();

  expect(state.G.catalogTotal).toBe(176);
  expect(BOARD_SIZE).toBe(16);
  expect(CARDS_PER_PLAYER).toBe(25);
  expect(state.G.board).toHaveLength(BOARD_SIZE);
  expect(state.G.players[PLAYER_ID].hand).toHaveLength(8);
  expect(state.G.players[BOT_ID].hand).toHaveLength(8);
  expect(state.G.players[PLAYER_ID].deck).toHaveLength(17);
  expect(state.G.players[BOT_ID].deck).toHaveLength(17);
  expect(state.G.players[BOT_ID].hand[0].hidden).toBe(true);
});

test('player views never expose deck order, opponent hands, or opponent draws', () => {
  const G = LayetDuel.setup({ random: { Shuffle: (items) => items.slice() } });
  const opponentDrawnCard = G.players[BOT_ID].deck[0];
  G.lastAction = {
    type: 'draw',
    owner: BOT_ID,
    card: opponentDrawnCard,
    drawn: [opponentDrawnCard],
  };
  G.history = [G.lastAction];

  const view = publicView(G, PLAYER_ID);
  expect(view.players[PLAYER_ID].hand[0].hidden).not.toBe(true);
  expect(view.players[PLAYER_ID].deck.every((card) => card.hidden)).toBe(true);
  expect(view.players[BOT_ID].hand.every((card) => card.hidden)).toBe(true);
  expect(view.players[BOT_ID].deck.every((card) => card.hidden)).toBe(true);
  expect(view.lastAction.card).toEqual({ hidden: true });
  expect(view.history[0].drawn).toEqual([{ hidden: true }]);

  const spectatorView = publicView(G, null);
  expect(spectatorView.players[PLAYER_ID].hand.every((card) => card.hidden)).toBe(true);
  expect(spectatorView.players[BOT_ID].hand.every((card) => card.hidden)).toBe(true);
});

test('element advantage adds the configured capture bonus', () => {
  const fire = { element: 'fire', score: 500 };
  const nature = { element: 'nature', score: 520 };
  const result = resolveCapture(fire, nature);

  expect(result.attacker.total).toBe(500 + ELEMENT_BONUS);
  expect(result.defender.total).toBe(520);
  expect(result.captured).toBe(true);
});

test('playing a card queues the bot, then its dedicated move answers without player auto-draw', () => {
  const client = Client({ game: LayetDuel, numPlayers: 2, playerID: PLAYER_ID });
  client.start();
  const firstCard = client.getState().G.players[PLAYER_ID].hand[0];

  client.moves.playCard(firstCard.uid, 0);
  const pendingState = client.getState();

  expect(BOT_THINK_DELAY_MS).toBe(1500);
  expect(pendingState.G.botPending).toBe(true);
  expect(pendingState.G.history).toHaveLength(1);
  expect(pendingState.G.placements).toBe(1);
  expect(pendingState.G.players[BOT_ID].played).toHaveLength(0);

  client.moves.botPlay();
  const state = client.getState();

  expect(state.G.history).toHaveLength(2);
  expect(state.G.placements).toBe(2);
  expect(state.G.board.filter((cell) => cell.card)).toHaveLength(2);
  expect(state.G.players[PLAYER_ID].played).toHaveLength(1);
  expect(state.G.players[BOT_ID].played).toHaveLength(1);
  expect(state.G.players[PLAYER_ID].hand).toHaveLength(7);
  expect(state.G.players[PLAYER_ID].deck).toHaveLength(17);
  expect(state.G.players[BOT_ID].deck).toHaveLength(16);
  expect(state.G.history[0].drawn).toHaveLength(0);
  expect(state.G.history[1].drawn).toHaveLength(0);
  expect(state.G.turnNumber).toBe(2);
});

test('AI duel completes a full board with one legal bot response per player turn', () => {
  const client = Client({ game: LayetDuel, numPlayers: 2, playerID: PLAYER_ID });
  client.start();

  for (let round = 0; round < BOARD_SIZE / 2; round += 1) {
    const before = client.getState().G;
    const playerCard = before.players[PLAYER_ID].hand[0];
    const emptyCell = before.board.find((cell) => !cell.card);

    expect(playerCard).toBeDefined();
    expect(emptyCell).toBeDefined();
    client.moves.playCard(playerCard.uid, emptyCell.index);
    if (!client.getState().G.winner) client.moves.botPlay();
  }

  const state = client.getState();
  expect(state.G.placements).toBe(BOARD_SIZE);
  expect(state.G.board.every((cell) => Boolean(cell.card))).toBe(true);
  expect(state.G.players[PLAYER_ID].played).toHaveLength(BOARD_SIZE / 2);
  expect(state.G.players[BOT_ID].played).toHaveLength(BOARD_SIZE / 2);
  expect(state.G.history.filter((action) => action.type === 'play')).toHaveLength(BOARD_SIZE);
  expect([PLAYER_ID, BOT_ID, 'draw']).toContain(state.G.winner);
  expect(state.G.phase).toBe('finished');
});

test('player draws manually once per round and must sacrifice when hand exceeds eight', () => {
  const client = Client({ game: LayetDuel, numPlayers: 2, playerID: PLAYER_ID });
  client.start();
  const before = client.getState().G;

  client.moves.drawCard();
  const afterDraw = client.getState().G;

  expect(afterDraw.players[PLAYER_ID].hand).toHaveLength(9);
  expect(afterDraw.players[PLAYER_ID].deck).toHaveLength(16);
  expect(afterDraw.drawsThisTurn[PLAYER_ID]).toBe(true);
  expect(afterDraw.sacrificeRequired).toBe(PLAYER_ID);
  expect(afterDraw.history[0].type).toBe('draw');

  const blockedPlay = LayetDuel.moves.playCard(
    { G: afterDraw, playerID: PLAYER_ID },
    afterDraw.players[PLAYER_ID].hand[0].uid,
    0
  );
  expect(blockedPlay).toBe(INVALID_MOVE);
  expect(afterDraw.placements).toBe(before.placements);

  const sacrificedUid = afterDraw.players[PLAYER_ID].hand[0].uid;
  client.moves.sacrificeCard(sacrificedUid);
  const afterSacrifice = client.getState().G;

  expect(afterSacrifice.players[PLAYER_ID].hand).toHaveLength(8);
  expect(afterSacrifice.players[PLAYER_ID].sacrificed).toHaveLength(1);
  expect(afterSacrifice.sacrificeRequired).toBe(null);
  expect(afterSacrifice.history[0].type).toBe('sacrifice');
});

test('placement is free on any empty cell and blocked only on occupied cells', () => {
  const G = LayetDuel.setup({
    random: { Shuffle: (items) => items.slice() },
  });

  expect(isLegalPlacement(G.board, 15)).toBe(true);

  G.board[0] = {
    index: 0,
    owner: PLAYER_ID,
    card: { uid: 'p-fire', id: 'p-fire', element: 'fire', score: 500 },
    lastCapturedBy: null,
  };

  expect(isLegalPlacement(G.board, 0)).toBe(false);
  expect(isLegalPlacement(G.board, 1)).toBe(true);
  expect(isLegalPlacement(G.board, 4)).toBe(true);
  expect(isLegalPlacement(G.board, 15)).toBe(true);
});

test('placing next to a weaker enemy can capture the neighbor', () => {
  const G = LayetDuel.setup({
    random: { Shuffle: (items) => items.slice() },
  });
  G.players[PLAYER_ID].hand = [{ uid: 'p-fire', id: 'p-fire', element: 'fire', score: 500 }];
  G.players[PLAYER_ID].deck = [];
  G.players[BOT_ID].hand = [];
  G.players[BOT_ID].deck = [];
  G.board[1] = {
    index: 1,
    owner: BOT_ID,
    card: { uid: 'b-nature', id: 'b-nature', element: 'nature', score: 520 },
    lastCapturedBy: null,
  };

  const ctx = { G, playerID: PLAYER_ID };
  LayetDuel.moves.playCard(ctx, 'p-fire', 0);

  expect(G.board[1].owner).toBe(PLAYER_ID);
  expect(G.history[0].captures).toHaveLength(1);
});

test('capture preview and move resolution apply recursive chain reactions', () => {
  const G = LayetDuel.setup({
    random: { Shuffle: (items) => items.slice() },
  });
  const fireCard = { uid: 'p-fire', id: 'p-fire', element: 'fire', score: 500 };
  G.players[PLAYER_ID].hand = [fireCard];
  G.players[PLAYER_ID].deck = [];
  G.players[BOT_ID].hand = [];
  G.players[BOT_ID].deck = [];
  G.board[1] = {
    index: 1,
    owner: BOT_ID,
    card: { uid: 'b-nature', id: 'b-nature', element: 'nature', score: 520 },
    lastCapturedBy: null,
  };
  G.board[2] = {
    index: 2,
    owner: BOT_ID,
    card: { uid: 'b-earth', id: 'b-earth', element: 'earth', score: 540 },
    lastCapturedBy: null,
  };

  const preview = getPlacementPreview(G.board, PLAYER_ID, fireCard, 0);
  expect(preview.legal).toBe(true);
  expect(preview.captures.map((capture) => capture.index)).toEqual([1, 2]);
  expect(preview.capturedPower).toBe(1060);

  LayetDuel.moves.playCard({ G, playerID: PLAYER_ID }, 'p-fire', 0);

  expect(G.board[1].owner).toBe(PLAYER_ID);
  expect(G.board[2].owner).toBe(PLAYER_ID);
  expect(G.history[0].captures).toHaveLength(2);
  expect(G.history[0].chainTriggered).toBe(true);
});
