import { INVALID_MOVE } from 'boardgame.io/core';
import {
  BOT_ID,
  BOARD_COLS,
  BOARD_ROWS,
  GAME_PHASES,
  PLAYER_ID,
  createDrawFlags,
  drawOneCard,
  drawToHand,
  emptyBoard,
  makeDeck,
  maybeFinish,
  placeCard,
  publicView,
  sacrificeFromHand,
} from './game';
import { CARD_TOTAL } from './cards.generated';

function createPlayers(random) {
  const usedIds = new Set();
  const players = {
    [PLAYER_ID]: {
      label: 'Player 1',
      hand: [],
      deck: makeDeck(random, usedIds, PLAYER_ID),
      played: [],
      sacrificed: [],
    },
    [BOT_ID]: {
      label: 'Player 2',
      hand: [],
      deck: makeDeck(random, usedIds, BOT_ID),
      played: [],
      sacrificed: [],
    },
  };

  drawToHand(players[PLAYER_ID]);
  drawToHand(players[BOT_ID]);

  return players;
}

function isActivePlayer(ctx, playerID) {
  return Boolean(playerID && ctx?.currentPlayer === playerID);
}

function isValidCardUID(cardUid, playerID) {
  return (
    typeof cardUid === 'string' &&
    cardUid.length > 2 &&
    cardUid.length <= 128 &&
    cardUid.startsWith(`${playerID}-`)
  );
}

function isValidCellIndex(cellIndex) {
  return Number.isInteger(cellIndex) && cellIndex >= 0 && cellIndex < BOARD_ROWS * BOARD_COLS;
}

function finishTurnIfReady(G, events) {
  if (G.winner) {
    G.phase = GAME_PHASES.FINISHED;
    return;
  }

  G.turnNumber += 1;
  G.drawsThisTurn = createDrawFlags();
  G.phase = GAME_PHASES.SELECT_CARD;
  events?.endTurn();
}

export const LayetDuelMultiplayer = {
  name: 'layet-vm-board-control-multiplayer',
  disableUndo: true,
  setup: ({ random }) => {
    const players = createPlayers(random);

    return {
      mode: 'multiplayer',
      catalogTotal: CARD_TOTAL,
      status: 'playing',
      winner: null,
      board: emptyBoard(),
      rows: BOARD_ROWS,
      cols: BOARD_COLS,
      phase: GAME_PHASES.SELECT_CARD,
      placements: 0,
      turnNumber: 1,
      drawsThisTurn: createDrawFlags(),
      sacrificeRequired: null,
      score: {
        [PLAYER_ID]: { cards: 0, power: 0 },
        [BOT_ID]: { cards: 0, power: 0 },
      },
      players,
      lastAction: null,
      history: [],
    };
  },
  playerView: ({ G, playerID }) => publicView(G, playerID),
  turn: {},
  moves: {
    drawCard({ G, ctx, playerID }) {
      if (G.winner) return INVALID_MOVE;
      if (!isActivePlayer(ctx, playerID)) return INVALID_MOVE;
      if (G.sacrificeRequired) return INVALID_MOVE;

      const action = drawOneCard(G, playerID);
      if (!action) return INVALID_MOVE;

      G.lastAction = action;
      G.history.unshift(action);
    },
    sacrificeCard({ G, ctx, playerID }, cardUid) {
      if (G.winner) return INVALID_MOVE;
      if (!isActivePlayer(ctx, playerID)) return INVALID_MOVE;
      if (!isValidCardUID(cardUid, playerID)) return INVALID_MOVE;

      const action = sacrificeFromHand(G, playerID, cardUid);
      if (!action) return INVALID_MOVE;

      G.lastAction = action;
      G.history.unshift(action);
    },
    playCard({ G, ctx, events, playerID }, cardUid, cellIndex) {
      if (G.winner) return INVALID_MOVE;
      if (!isActivePlayer(ctx, playerID)) return INVALID_MOVE;
      if (G.sacrificeRequired === playerID) return INVALID_MOVE;
      if (!isValidCardUID(cardUid, playerID) || !isValidCellIndex(cellIndex)) return INVALID_MOVE;

      const action = placeCard(G, playerID, cardUid, cellIndex);
      if (!action) return INVALID_MOVE;

      G.lastAction = action;
      G.history.unshift(action);
      maybeFinish(G);

      finishTurnIfReady(G, events);
    },
    surrender({ G, ctx, playerID }) {
      if (G.winner) return INVALID_MOVE;
      if (!isActivePlayer(ctx, playerID)) return INVALID_MOVE;

      const opponentID = playerID === PLAYER_ID ? BOT_ID : PLAYER_ID;
      G.winner = opponentID;
      G.status = 'surrendered';
      G.phase = GAME_PHASES.FINISHED;
      G.lastAction = {
        type: 'surrender',
        owner: playerID,
        winner: opponentID,
      };
      G.history.unshift(G.lastAction);
    },
  },
  endIf: ({ G }) => {
    if (!G.winner) return undefined;
    return { winner: G.winner };
  },
};
