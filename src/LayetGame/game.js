import { INVALID_MOVE } from 'boardgame.io/core';
import { CARD_CATALOG, CARD_TOTAL } from './cards.generated';

export const PLAYER_ID = '0';
export const BOT_ID = '1';
export const HAND_SIZE = 8;
export const BOARD_COLS = 4;
export const BOARD_ROWS = 4;
export const BOARD_SIZE = BOARD_ROWS * BOARD_COLS;
export const CARDS_PER_PLAYER = 25;
export const ELEMENT_BONUS = 35;

export const GAME_PHASES = {
  SELECT_CARD: 'selectCard',
  PLACE_CARD: 'placeCard',
  RESOLVE_CAPTURES: 'resolveCaptures',
  DRAW_CARD: 'drawCard',
  SACRIFICE_CARD: 'sacrificeCard',
  FINISHED: 'finished',
};

export const ELEMENT_META = {
  fire: { label: 'Fire', color: '#ff5a2f' },
  water: { label: 'Water', color: '#38bdf8' },
  earth: { label: 'Earth', color: '#d6a44f' },
  nature: { label: 'Nature', color: '#60d36f' },
  shadow: { label: 'Shadow', color: '#bb5cff' },
  electric: { label: 'Electric', color: '#62e7ff' },
};

export const ELEMENT_ADVANTAGE = {
  fire: 'nature',
  nature: 'earth',
  earth: 'electric',
  electric: 'water',
  water: 'shadow',
  shadow: 'fire',
};

const DECK_PLAN = [
  ['300-390', '400-490'],
  ['300-390', '400-490'],
  ['400-490'],
  ['400-490'],
  ['400-490', '500-590'],
  ['500-590'],
  ['500-590'],
  ['500-590', '600-680'],
  ['600-680'],
  ['600-680'],
  ['600-680', '700-740'],
  ['700-740'],
  ['700-740'],
  ['700-740', '750'],
  ['300-390', '400-490'],
  ['400-490', '500-590'],
  ['500-590'],
  ['500-590', '600-680'],
  ['600-680'],
  ['600-680', '700-740'],
  ['700-740'],
  ['700-740', '750'],
  ['300-390', '400-490', '500-590'],
  ['400-490', '500-590', '600-680'],
  ['500-590', '600-680', '700-740'],
];

const NEIGHBOR_OFFSETS = [
  { row: -1, col: 0, label: 'haut' },
  { row: 1, col: 0, label: 'bas' },
  { row: 0, col: -1, label: 'gauche' },
  { row: 0, col: 1, label: 'droite' },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function cardInstance(card, owner, index) {
  return {
    ...card,
    uid: `${owner}-${card.id}-${index}`,
  };
}

function pickFromTiers(random, usedIds, tiers) {
  const candidates = random.Shuffle(
    CARD_CATALOG.filter((card) => tiers.includes(card.tier) && !usedIds.has(card.id))
  );
  const picked = candidates[0];
  if (picked) {
    usedIds.add(picked.id);
    return picked;
  }

  const fallback = random.Shuffle(CARD_CATALOG.filter((card) => !usedIds.has(card.id)))[0];
  usedIds.add(fallback.id);
  return fallback;
}

export function makeDeck(random, usedIds, owner) {
  return DECK_PLAN.map((tiers, index) =>
    cardInstance(pickFromTiers(random, usedIds, tiers), owner, index)
  );
}

export function drawToHand(player) {
  const drawn = [];
  while (player.hand.length < HAND_SIZE && player.deck.length > 0) {
    const card = player.deck.shift();
    player.hand.push(card);
    drawn.push(card);
  }
  return drawn;
}

export function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, (_, index) => ({
    index,
    owner: null,
    card: null,
    lastCapturedBy: null,
  }));
}

function ownerLabel(owner) {
  return owner === PLAYER_ID ? 'Player' : 'Bot';
}

export function createDrawFlags() {
  return {
    [PLAYER_ID]: false,
    [BOT_ID]: false,
  };
}

export function getNeighborIndexes(index) {
  const row = Math.floor(index / BOARD_COLS);
  const col = index % BOARD_COLS;
  return NEIGHBOR_OFFSETS.map((offset) => ({
    ...offset,
    row: row + offset.row,
    col: col + offset.col,
  }))
    .filter((pos) => pos.row >= 0 && pos.row < BOARD_ROWS && pos.col >= 0 && pos.col < BOARD_COLS)
    .map((pos) => ({
      index: pos.row * BOARD_COLS + pos.col,
      label: pos.label,
    }));
}

export function isLegalPlacement(board, cellIndex) {
  if (cellIndex < 0 || cellIndex >= BOARD_SIZE || board[cellIndex].card) return false;
  return true;
}

export function battleValue(attacker, defender) {
  const bonus = ELEMENT_ADVANTAGE[attacker.element] === defender.element ? ELEMENT_BONUS : 0;
  return {
    base: attacker.score,
    bonus,
    total: attacker.score + bonus,
  };
}

export function resolveCapture(attackerCard, defenderCard) {
  const attacker = battleValue(attackerCard, defenderCard);
  const defender = {
    base: defenderCard.score,
    bonus: 0,
    total: defenderCard.score,
  };
  return {
    attacker,
    defender,
    captured: attacker.total > defender.total,
  };
}

export function computeScore(board) {
  return board.reduce(
    (score, cell) => {
      if (!cell.owner || !cell.card) return score;
      score[cell.owner].cards += 1;
      score[cell.owner].power += cell.card.score;
      return score;
    },
    {
      [PLAYER_ID]: { cards: 0, power: 0 },
      [BOT_ID]: { cards: 0, power: 0 },
    }
  );
}

function createEmptyPreview(legal = false) {
  return {
    legal,
    captures: [],
    capturedPower: 0,
    adjacentAllies: 0,
    adjacentEnemies: 0,
    elementalInteractions: [],
    captureIndexes: [],
  };
}

function cloneBoardForSimulation(board) {
  return board.map((cell) => ({
    index: cell.index,
    owner: cell.owner,
    card: cell.card,
    lastCapturedBy: cell.lastCapturedBy,
  }));
}

function countInitialAdjacency(board, owner, cellIndex) {
  return getNeighborIndexes(cellIndex).reduce(
    (summary, neighbor) => {
      const target = board[neighbor.index];
      if (!target.card) return summary;
      if (target.owner === owner) summary.adjacentAllies += 1;
      else summary.adjacentEnemies += 1;
      return summary;
    },
    { adjacentAllies: 0, adjacentEnemies: 0 }
  );
}

function simulateCaptureChain(board, owner, card, cellIndex) {
  const simulated = cloneBoardForSimulation(board);
  const preview = createEmptyPreview(true);
  const adjacency = countInitialAdjacency(board, owner, cellIndex);
  preview.adjacentAllies = adjacency.adjacentAllies;
  preview.adjacentEnemies = adjacency.adjacentEnemies;

  simulated[cellIndex] = {
    index: cellIndex,
    owner,
    card,
    lastCapturedBy: null,
  };

  const queue = [cellIndex];
  const enqueued = new Set(queue);

  while (queue.length > 0) {
    const attackerIndex = queue.shift();
    const attackerCell = simulated[attackerIndex];
    if (!attackerCell?.card || attackerCell.owner !== owner) continue;

    getNeighborIndexes(attackerIndex).forEach((neighbor) => {
      const target = simulated[neighbor.index];
      if (!target.card || target.owner === owner) return;

      const result = resolveCapture(attackerCell.card, target.card);
      const elementalAdvantage =
        ELEMENT_ADVANTAGE[attackerCell.card.element] === target.card.element;

      if (elementalAdvantage) {
        preview.elementalInteractions.push({
          attackerIndex,
          defenderIndex: neighbor.index,
          attackerElement: attackerCell.card.element,
          defenderElement: target.card.element,
          bonus: ELEMENT_BONUS,
        });
      }

      if (!result.captured) return;

      const capture = {
        attackerIndex,
        attackerCard: attackerCell.card,
        index: neighbor.index,
        direction: neighbor.label,
        card: target.card,
        previousOwner: target.owner,
        newOwner: owner,
        result,
        elementalAdvantage,
      };

      target.owner = owner;
      target.lastCapturedBy = owner;
      preview.captures.push(capture);
      preview.captureIndexes.push(neighbor.index);
      preview.capturedPower += target.card.score;

      if (!enqueued.has(neighbor.index)) {
        queue.push(neighbor.index);
        enqueued.add(neighbor.index);
      }
    });
  }

  return preview;
}

export function getPlacementPreview(board, owner, card, cellIndex) {
  if (!card || cellIndex < 0 || cellIndex >= BOARD_SIZE) {
    return createEmptyPreview(false);
  }

  const legal = isLegalPlacement(board, cellIndex);

  if (!legal) {
    return createEmptyPreview(false);
  }

  return simulateCaptureChain(board, owner, card, cellIndex);
}

function applyCaptures(G, owner, preview) {
  preview.captures.forEach((capture) => {
    const target = G.board[capture.index];
    target.owner = owner;
    target.lastCapturedBy = owner;
  });

  return preview.captures;
}

export function drawOneCard(G, owner) {
  const player = G.players[owner];
  if (!player || player.deck.length === 0 || G.drawsThisTurn[owner]) return null;
  if (G.sacrificeRequired && G.sacrificeRequired !== owner) return null;

  G.phase = GAME_PHASES.DRAW_CARD;
  const card = player.deck.shift();
  player.hand.push(card);
  G.drawsThisTurn[owner] = true;

  const mustSacrifice = player.hand.length > HAND_SIZE;
  if (mustSacrifice) {
    G.phase = GAME_PHASES.SACRIFICE_CARD;
    G.sacrificeRequired = owner;
  }

  return {
    type: 'draw',
    owner,
    ownerLabel: ownerLabel(owner),
    card,
    drawn: [card],
    mustSacrifice,
    handSize: player.hand.length,
  };
}

export function sacrificeFromHand(G, owner, cardUid) {
  const player = G.players[owner];
  if (!player || G.sacrificeRequired !== owner) return null;

  const cardIndex = player.hand.findIndex((card) => card.uid === cardUid);
  if (cardIndex === -1) return null;

  G.phase = GAME_PHASES.SACRIFICE_CARD;
  const sacrificed = player.hand.splice(cardIndex, 1)[0];
  player.sacrificed.push(sacrificed);

  if (player.hand.length <= HAND_SIZE) {
    G.sacrificeRequired = null;
    G.phase = GAME_PHASES.SELECT_CARD;
  }

  return {
    type: 'sacrifice',
    owner,
    ownerLabel: ownerLabel(owner),
    card: sacrificed,
    sacrificed,
    handSize: player.hand.length,
  };
}

export function placeCard(G, owner, cardUid, cellIndex) {
  if (G.sacrificeRequired === owner) return null;

  const player = G.players[owner];
  const cardIndex = player.hand.findIndex((card) => card.uid === cardUid);
  if (cardIndex === -1) return null;
  const preview = getPlacementPreview(G.board, owner, player.hand[cardIndex], cellIndex);
  if (!preview.legal) return null;

  G.phase = GAME_PHASES.PLACE_CARD;
  const card = player.hand.splice(cardIndex, 1)[0];
  G.board[cellIndex] = {
    index: cellIndex,
    owner,
    card,
    lastCapturedBy: null,
  };

  G.phase = GAME_PHASES.RESOLVE_CAPTURES;
  const captures = applyCaptures(G, owner, preview);
  player.played.push(card);
  G.placements += 1;

  return {
    type: 'play',
    owner,
    ownerLabel: ownerLabel(owner),
    card,
    cellIndex,
    captures,
    capturedPower: preview.capturedPower,
    elementalInteractions: preview.elementalInteractions,
    chainTriggered: captures.length > 1,
    phaseTrail: [
      GAME_PHASES.SELECT_CARD,
      GAME_PHASES.PLACE_CARD,
      GAME_PHASES.RESOLVE_CAPTURES,
    ],
    drawn: [],
  };
}

function botPrepareRound(G) {
  const bot = G.players[BOT_ID];
  if (!bot) return;

  drawOneCard(G, BOT_ID);

  while (G.sacrificeRequired === BOT_ID && bot.hand.length > HAND_SIZE) {
    const lowestValueCard = bot.hand
      .slice()
      .sort((a, b) => a.score - b.score || a.uid.localeCompare(b.uid))[0];
    if (!lowestValueCard) break;
    sacrificeFromHand(G, BOT_ID, lowestValueCard.uid);
  }
}

function simulateMove(board, owner, card, cellIndex) {
  const preview = getPlacementPreview(board, owner, card, cellIndex);
  if (!preview.legal) return null;
  const counterRisk = getNeighborIndexes(cellIndex).reduce((risk, neighbor) => {
    const target = board[neighbor.index];
    if (!target.card || target.owner === owner) return risk;
    return ELEMENT_ADVANTAGE[target.card.element] === card.element ? risk + 1 : risk;
  }, 0);

  return {
    captures: preview.captures.length,
    capturedPower: preview.capturedPower,
    adjacency: preview.adjacentAllies + preview.adjacentEnemies,
    counterRisk,
    value:
      preview.captures.length * 10000 +
      preview.capturedPower * 4 +
      card.score +
      preview.adjacentAllies * 80 +
      preview.adjacentEnemies * 35 -
      counterRisk * 650,
  };
}

function chooseBotMove(G) {
  const bot = G.players[BOT_ID];
  const emptyCells = G.board.filter((cell) => !cell.card).map((cell) => cell.index);
  const options = [];

  bot.hand.forEach((card) => {
    emptyCells.forEach((cellIndex) => {
      const result = simulateMove(G.board, BOT_ID, card, cellIndex);
      if (result) options.push({ card, cellIndex, result });
    });
  });

  if (options.length === 0) return null;
  return options.sort((a, b) => {
    if (b.result.captures !== a.result.captures) return b.result.captures - a.result.captures;
    if (b.result.capturedPower !== a.result.capturedPower) {
      return b.result.capturedPower - a.result.capturedPower;
    }
    if (a.result.counterRisk !== b.result.counterRisk) {
      return a.result.counterRisk - b.result.counterRisk;
    }
    if (b.result.value !== a.result.value) return b.result.value - a.result.value;
    return b.card.score - a.card.score;
  })[0];
}

export function finishGame(G) {
  const score = computeScore(G.board);
  G.score = score;

  if (score[PLAYER_ID].cards > score[BOT_ID].cards) {
    G.winner = PLAYER_ID;
    G.status = 'victory';
  } else if (score[BOT_ID].cards > score[PLAYER_ID].cards) {
    G.winner = BOT_ID;
    G.status = 'defeat';
  } else if (score[PLAYER_ID].power > score[BOT_ID].power) {
    G.winner = PLAYER_ID;
    G.status = 'victory';
  } else if (score[BOT_ID].power > score[PLAYER_ID].power) {
    G.winner = BOT_ID;
    G.status = 'defeat';
  } else {
    G.winner = 'draw';
    G.status = 'draw';
  }
}

export function maybeFinish(G) {
  const noBoardSpace = G.placements >= BOARD_SIZE;
  const playerDone = G.players[PLAYER_ID].hand.length === 0 && G.players[PLAYER_ID].deck.length === 0;
  const botDone = G.players[BOT_ID].hand.length === 0 && G.players[BOT_ID].deck.length === 0;

  G.score = computeScore(G.board);
  if (noBoardSpace || playerDone || botDone) finishGame(G);
}

export function publicView(G, playerID) {
  const view = clone(G);
  const opponentID = playerID === BOT_ID ? PLAYER_ID : BOT_ID;
  if (view.players[opponentID]) {
    view.players[opponentID].hand = view.players[opponentID].hand.map((_, index) => ({
      uid: `hidden-${opponentID}-${index}`,
      hidden: true,
    }));
    view.players[opponentID].deck = Array.from(
      { length: view.players[opponentID].deck.length },
      (_, index) => ({ uid: `hidden-deck-${opponentID}-${index}`, hidden: true })
    );
  }
  return view;
}

export const LayetDuel = {
  name: 'layet-vm-board-control',
  setup: ({ random }) => {
    const usedIds = new Set();
    const playerDeck = makeDeck(random, usedIds, PLAYER_ID);
    const botDeck = makeDeck(random, usedIds, BOT_ID);
    const players = {
      [PLAYER_ID]: {
        label: 'Player',
        hand: [],
        deck: playerDeck,
        played: [],
        sacrificed: [],
      },
      [BOT_ID]: {
        label: 'Bot',
        hand: [],
        deck: botDeck,
        played: [],
        sacrificed: [],
      },
    };

    drawToHand(players[PLAYER_ID]);
    drawToHand(players[BOT_ID]);

    return {
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
  turn: {
    order: {
      first: () => 0,
      next: () => 0,
    },
  },
  moves: {
    drawCard({ G, playerID }) {
      if (G.winner) return INVALID_MOVE;
      if (playerID !== PLAYER_ID) return INVALID_MOVE;
      if (G.sacrificeRequired) return INVALID_MOVE;

      const action = drawOneCard(G, PLAYER_ID);
      if (!action) return INVALID_MOVE;

      G.lastAction = action;
      G.history.unshift(action);
    },
    sacrificeCard({ G, playerID }, cardUid) {
      if (G.winner) return INVALID_MOVE;
      if (playerID !== PLAYER_ID) return INVALID_MOVE;

      const action = sacrificeFromHand(G, PLAYER_ID, cardUid);
      if (!action) return INVALID_MOVE;

      G.lastAction = action;
      G.history.unshift(action);
    },
    playCard({ G, playerID }, cardUid, cellIndex) {
      if (G.winner) return INVALID_MOVE;
      if (playerID !== PLAYER_ID) return INVALID_MOVE;
      if (G.sacrificeRequired === PLAYER_ID) return INVALID_MOVE;

      const playerAction = placeCard(G, PLAYER_ID, cardUid, cellIndex);
      if (!playerAction) return INVALID_MOVE;

      G.lastAction = playerAction;
      G.history.unshift(playerAction);
      maybeFinish(G);
      if (G.winner) {
        G.phase = GAME_PHASES.FINISHED;
        return;
      }

      botPrepareRound(G);
      const botChoice = chooseBotMove(G);
      if (botChoice) {
        const botAction = placeCard(G, BOT_ID, botChoice.card.uid, botChoice.cellIndex);
        G.lastAction = botAction;
        G.history.unshift(botAction);
      }

      G.turnNumber += 1;
      G.drawsThisTurn = createDrawFlags();
      maybeFinish(G);
      G.phase = G.winner ? GAME_PHASES.FINISHED : GAME_PHASES.SELECT_CARD;
    },
  },
  endIf: ({ G }) => {
    if (!G.winner) return undefined;
    return { winner: G.winner };
  },
};
