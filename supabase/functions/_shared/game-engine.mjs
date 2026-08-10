export const PLAYER_IDS = ['0', '1'];
export const HAND_SIZE = 8;
export const BOARD_ROWS = 4;
export const BOARD_COLS = 4;
export const BOARD_SIZE = BOARD_ROWS * BOARD_COLS;
export const ELEMENT_BONUS = 35;

export const ELEMENT_ADVANTAGE = {
  fire: 'nature',
  nature: 'earth',
  earth: 'electric',
  electric: 'water',
  water: 'shadow',
  shadow: 'fire',
};

const clone = (value) => JSON.parse(JSON.stringify(value));

function shuffle(cards) {
  const next = cards.slice();
  for (let index = next.length - 1; index > 0; index -= 1) {
    const bytes = new Uint32Array(1);
    crypto.getRandomValues(bytes);
    const target = bytes[0] % (index + 1);
    [next[index], next[target]] = [next[target], next[index]];
  }
  return next;
}

function cardInstance(card, owner, index) {
  return {
    id: card.id || card.card_id,
    name: card.name,
    element: card.element,
    tier: card.tier,
    rarity: card.rarity,
    score: Number(card.score || 0),
    image: card.image,
    uid: `${owner}-${card.id || card.card_id}-${index}`,
  };
}

function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, (_, index) => ({
    index,
    owner: null,
    card: null,
    lastCapturedBy: null,
  }));
}

function drawInitialHand(player) {
  while (player.hand.length < HAND_SIZE && player.deck.length > 0) {
    player.hand.push(player.deck.shift());
  }
}

export function createGameState({ cards0, cards1, name0, name1 }) {
  if (!Array.isArray(cards0) || cards0.length < 20 || !Array.isArray(cards1) || cards1.length < 20) {
    throw new Error('Both players need a complete 20-card inventory');
  }
  const players = {
    0: {
      label: name0 || 'Player 1',
      hand: [],
      deck: shuffle(cards0.slice(0, 20)).map((card, index) => cardInstance(card, '0', index)),
      played: [],
      sacrificed: [],
    },
    1: {
      label: name1 || 'Player 2',
      hand: [],
      deck: shuffle(cards1.slice(0, 20)).map((card, index) => cardInstance(card, '1', index)),
      played: [],
      sacrificed: [],
    },
  };
  drawInitialHand(players[0]);
  drawInitialHand(players[1]);

  return {
    mode: 'multiplayer',
    status: 'playing',
    winner: null,
    board: emptyBoard(),
    rows: BOARD_ROWS,
    cols: BOARD_COLS,
    phase: 'selectCard',
    placements: 0,
    turnNumber: 1,
    currentPlayer: '0',
    drawsThisTurn: { 0: false, 1: false },
    sacrificeRequired: null,
    score: { 0: { cards: 0, power: 0 }, 1: { cards: 0, power: 0 } },
    players,
    lastAction: null,
    history: [],
  };
}

function neighborIndexes(index) {
  const row = Math.floor(index / BOARD_COLS);
  const col = index % BOARD_COLS;
  return [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ]
    .filter(([nextRow, nextCol]) =>
      nextRow >= 0 && nextRow < BOARD_ROWS && nextCol >= 0 && nextCol < BOARD_COLS
    )
    .map(([nextRow, nextCol]) => nextRow * BOARD_COLS + nextCol);
}

function computeScore(board) {
  return board.reduce(
    (score, cell) => {
      if (cell.owner === null || !cell.card) return score;
      score[cell.owner].cards += 1;
      score[cell.owner].power += Number(cell.card.score || 0);
      return score;
    },
    { 0: { cards: 0, power: 0 }, 1: { cards: 0, power: 0 } }
  );
}

function captureChain(state, owner, startIndex) {
  const captures = [];
  const queue = [startIndex];
  const visited = new Set(queue);
  while (queue.length) {
    const attackerIndex = queue.shift();
    const attacker = state.board[attackerIndex];
    if (!attacker?.card || attacker.owner !== owner) continue;
    neighborIndexes(attackerIndex).forEach((targetIndex) => {
      const target = state.board[targetIndex];
      if (!target?.card || target.owner === owner) return;
      const bonus = ELEMENT_ADVANTAGE[attacker.card.element] === target.card.element
        ? ELEMENT_BONUS
        : 0;
      if (Number(attacker.card.score) + bonus <= Number(target.card.score)) return;
      const previousOwner = target.owner;
      target.owner = owner;
      target.lastCapturedBy = owner;
      captures.push({
        attackerIndex,
        index: targetIndex,
        card: target.card,
        previousOwner,
        newOwner: owner,
        elementalAdvantage: bonus > 0,
        result: {
          attacker: { base: attacker.card.score, bonus, total: attacker.card.score + bonus },
          defender: { base: target.card.score, bonus: 0, total: target.card.score },
          captured: true,
        },
      });
      if (!visited.has(targetIndex)) {
        visited.add(targetIndex);
        queue.push(targetIndex);
      }
    });
  }
  return captures;
}

function finishGame(state) {
  state.score = computeScore(state.board);
  const left = state.score[0];
  const right = state.score[1];
  if (left.cards !== right.cards) state.winner = left.cards > right.cards ? '0' : '1';
  else if (left.power !== right.power) state.winner = left.power > right.power ? '0' : '1';
  else state.winner = 'draw';
  state.status = state.winner === 'draw' ? 'draw' : 'finished';
  state.phase = 'finished';
}

function maybeFinish(state) {
  state.score = computeScore(state.board);
  const noSpace = state.placements >= BOARD_SIZE;
  const p0Done = !state.players[0].hand.length && !state.players[0].deck.length;
  const p1Done = !state.players[1].hand.length && !state.players[1].deck.length;
  if (noSpace || p0Done || p1Done) finishGame(state);
}

function assertTurn(state, playerID) {
  if (!PLAYER_IDS.includes(playerID)) throw new Error('Invalid player seat');
  if (state.winner) throw new Error('Match is already complete');
  if (state.currentPlayer !== playerID) throw new Error('It is not your turn');
}

export function applyGameMove(inputState, playerID, move, args = {}) {
  const state = clone(inputState);
  assertTurn(state, playerID);
  const player = state.players[playerID];
  let action;

  if (move === 'drawCard') {
    if (state.drawsThisTurn[playerID] || !player.deck.length || state.sacrificeRequired) {
      throw new Error('Draw is not available');
    }
    const card = player.deck.shift();
    player.hand.push(card);
    state.drawsThisTurn[playerID] = true;
    state.sacrificeRequired = player.hand.length > HAND_SIZE ? playerID : null;
    state.phase = state.sacrificeRequired ? 'sacrificeCard' : 'selectCard';
    action = { type: 'draw', owner: playerID, card, drawn: [card], mustSacrifice: Boolean(state.sacrificeRequired) };
  } else if (move === 'sacrificeCard') {
    if (state.sacrificeRequired !== playerID) throw new Error('No sacrifice is required');
    const index = player.hand.findIndex((card) => card.uid === args.cardUid);
    if (index < 0) throw new Error('Card not found in hand');
    const card = player.hand.splice(index, 1)[0];
    player.sacrificed.push(card);
    state.sacrificeRequired = player.hand.length > HAND_SIZE ? playerID : null;
    state.phase = state.sacrificeRequired ? 'sacrificeCard' : 'selectCard';
    action = { type: 'sacrifice', owner: playerID, card, sacrificed: card };
  } else if (move === 'playCard') {
    if (state.sacrificeRequired === playerID) throw new Error('Sacrifice a card before playing');
    const cellIndex = Number(args.cellIndex);
    if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= BOARD_SIZE) {
      throw new Error('Invalid board cell');
    }
    if (state.board[cellIndex].card) throw new Error('Board cell is occupied');
    const index = player.hand.findIndex((card) => card.uid === args.cardUid);
    if (index < 0) throw new Error('Card not found in hand');
    const card = player.hand.splice(index, 1)[0];
    state.board[cellIndex] = { index: cellIndex, owner: playerID, card, lastCapturedBy: null };
    const captures = captureChain(state, playerID, cellIndex);
    player.played.push(card);
    state.placements += 1;
    action = { type: 'play', owner: playerID, card, cellIndex, captures, chainTriggered: captures.length > 1, drawn: [] };
    maybeFinish(state);
    if (!state.winner) {
      state.currentPlayer = playerID === '0' ? '1' : '0';
      state.turnNumber += 1;
      state.drawsThisTurn = { 0: false, 1: false };
      state.phase = 'selectCard';
    }
  } else if (move === 'surrender') {
    state.winner = playerID === '0' ? '1' : '0';
    state.status = 'surrendered';
    state.phase = 'finished';
    action = { type: 'surrender', owner: playerID, winner: state.winner };
  } else {
    throw new Error('Unsupported move');
  }

  state.lastAction = action;
  state.history.unshift(action);
  return state;
}

export function publicGameView(state, playerID) {
  const view = clone(state);
  Object.entries(view.players).forEach(([owner, player]) => {
    if (owner !== playerID) {
      player.hand = player.hand.map((_, index) => ({ uid: `hidden-hand-${owner}-${index}`, hidden: true }));
    }
    player.deck = player.deck.map((_, index) => ({ uid: `hidden-deck-${owner}-${index}`, hidden: true }));
  });
  const redact = (action) => {
    if (!action || action.type !== 'draw' || action.owner === playerID) return action;
    return { ...action, card: { hidden: true }, drawn: [{ hidden: true }] };
  };
  view.lastAction = redact(view.lastAction);
  view.history = view.history.map(redact);
  return view;
}
