import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Client } from 'boardgame.io/react';
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { AnimatePresence, motion } from 'framer-motion';
import { Howl } from 'howler';
import {
  LayetDuel,
  PLAYER_ID,
  BOT_ID,
  ELEMENT_META,
  ELEMENT_BONUS,
  BOT_THINK_DELAY_MS,
  getPlacementPreview,
} from './game';
import './LayetGame.css';

const CARD_BACK = '/assets/cards/backs/card-back-deck-thumbnail.png';
const GAME_TITLE = 'NEXUS ARENA';
const SFX_DATA_URI =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';
const SFX = {};

function playSfx(name) {
  if (typeof window === 'undefined') return;
  if (!SFX[name]) {
    SFX[name] = new Howl({
      src: [SFX_DATA_URI],
      volume: name === 'capture' ? 0.22 : 0.14,
      rate: name === 'capture' ? 0.72 : name === 'draw' ? 1.25 : 1,
    });
  }
  SFX[name].stop();
  SFX[name].play();
}

const PARTICLE_COUNT = 28;

function CardFace({ card, hidden = false, compact = false }) {
  if (hidden) {
    return (
      <div className={['lg-card', 'lg-card--hidden', compact ? 'lg-card--compact' : ''].join(' ')}>
        <img src={CARD_BACK} alt="" />
      </div>
    );
  }

  if (!card) return <div className="lg-card lg-card--empty" />;

  const meta = ELEMENT_META[card.element] || { color: '#ffffff' };
  return (
    <motion.div
      className={['lg-card', compact ? 'lg-card--compact' : ''].filter(Boolean).join(' ')}
      style={{ '--element-color': meta.color }}
      initial={{ opacity: 0, scale: 0.92, rotateX: compact ? -10 : 0 }}
      animate={{ opacity: 1, scale: 1, rotateX: 0 }}
      exit={{ opacity: 0, scale: 0.86 }}
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
    >
      <img className="lg-card__image" src={card.image} alt="" loading="lazy" />
    </motion.div>
  );
}

function HandCard({ card, selected, disabled, sacrificeMode, onClick }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `hand-${card.uid}`,
    data: { card },
    disabled,
  });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <motion.button
      type="button"
      ref={setNodeRef}
      className={[
        'lg-hand-card',
        selected ? 'is-selected' : '',
        sacrificeMode ? 'is-sacrifice-mode' : '',
        isDragging ? 'is-dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      onClick={onClick}
      disabled={disabled}
      whileHover={{ y: sacrificeMode ? -7 : -12, scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      {...listeners}
      {...attributes}
    >
      <CardFace card={card} />
    </motion.button>
  );
}

function DeckStack({ count, label, hidden = true, onClick, disabled = false, actionLabel }) {
  const content = (
    <>
      <div className="lg-deck-stack__cards" aria-hidden="true">
        {count > 0 ? (
          <CardFace card={{ hidden: true }} hidden={hidden} compact />
        ) : (
          <div className="lg-card lg-card--empty lg-card--compact" />
        )}
      </div>
      <div className="lg-deck-stack__label">
        <span>{label}</span>
        <strong>{count}</strong>
        {actionLabel && <small>{actionLabel}</small>}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={['lg-deck-stack', 'is-clickable', count === 0 ? 'is-empty' : '']
          .filter(Boolean)
          .join(' ')}
        onClick={onClick}
        disabled={disabled}
      >
        {content}
      </button>
    );
  }

  return (
    <div className={['lg-deck-stack', count === 0 ? 'is-empty' : ''].filter(Boolean).join(' ')}>
      {content}
    </div>
  );
}

function ScorePanel({ G, variant, viewerID = PLAYER_ID }) {
  const opponentID = viewerID === PLAYER_ID ? BOT_ID : PLAYER_ID;
  const player = G.score[viewerID] || { cards: 0, power: 0 };
  const opponent = G.score[opponentID] || { cards: 0, power: 0 };
  const totalPower = player.power + opponent.power;
  const isPage2 = variant === 'page2';
  const playerShare = totalPower > 0 ? (player.power / totalPower) * 100 : 50;
  const opponentShare = 100 - playerShare;
  const playerMeterShare = playerShare;
  const botMeterShare = opponentShare;
  const playerMainScore = isPage2 ? `${Math.round(playerShare)}%` : player.cards;
  const botMainScore = isPage2 ? `${Math.round(opponentShare)}%` : opponent.cards;

  return (
    <div
      className={['lg-score', isPage2 ? 'lg-score--page2' : ''].filter(Boolean).join(' ')}
      style={{
        '--player-share': `${playerMeterShare}%`,
        '--bot-share': `${botMeterShare}%`,
      }}
    >
      <div className="lg-score__side lg-score__side--player">
        {!isPage2 && <span className="lg-score__name">Player</span>}
        <strong>{playerMainScore}</strong>
        {!isPage2 && <small>{player.power} power</small>}
      </div>
      <div className="lg-score__meter" aria-hidden="true">
        <span className="lg-score__fill lg-score__fill--player" />
        <span className="lg-score__fill lg-score__fill--bot" />
      </div>
      {!isPage2 && (
        <div className="lg-score__center" aria-hidden="true">
          <span>{player.cards}</span>
          <i />
          <span>{opponent.cards}</span>
        </div>
      )}
      <div className="lg-score__side lg-score__side--bot">
        {!isPage2 && <span className="lg-score__name">Opponent</span>}
        <strong>{botMainScore}</strong>
        {!isPage2 && <small>{opponent.power} power</small>}
      </div>
    </div>
  );
}

function BoardCell({ cell, viewerID, selectedCard, preview, isPreviewTarget, recentCapture, onPlace, onHover }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `cell-${cell.index}`,
    data: { cellIndex: cell.index, legal: !cell.card && Boolean(preview?.legal) },
  });
  const ownerClass = !cell.owner
    ? 'is-empty'
    : [
        cell.owner === PLAYER_ID ? 'is-player' : 'is-bot',
        cell.owner === viewerID ? 'is-viewer' : 'is-opponent',
      ].join(' ');
  const isSelectableEmpty = Boolean(!cell.card && selectedCard);
  const isLegal = Boolean(isSelectableEmpty && preview?.legal);
  const isIllegal = Boolean(isSelectableEmpty && !preview?.legal);
  const captureCount = preview?.captures?.length || 0;
  const hasElementBonus = Boolean(preview?.elementalInteractions?.length);
  const canPlace = isLegal;

  return (
    <button
      type="button"
      className={[
        'lg-board-cell',
        ownerClass,
        cell.lastCapturedBy ? 'was-captured' : '',
        isLegal ? 'is-legal' : '',
        isIllegal ? 'is-illegal' : '',
        captureCount > 0 ? 'will-capture' : '',
        isPreviewTarget ? 'is-preview-captured' : '',
        recentCapture ? 'is-recent-capture' : '',
        isOver ? 'is-drop-over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      ref={setNodeRef}
      onClick={() => canPlace && onPlace(cell.index)}
      disabled={!canPlace}
      onMouseEnter={() => canPlace && onHover(cell.index)}
      onMouseLeave={() => onHover(null)}
    >
      {cell.card ? (
        <>
          <AnimatePresence mode="popLayout">
            <CardFace key={`${cell.card.uid}-${cell.owner}`} card={cell.card} compact />
          </AnimatePresence>
          {recentCapture && <span className="lg-board-cell__burst">CAPTURE</span>}
        </>
      ) : (
        <>
          <span className="lg-board-cell__slot" />
          {captureCount > 0 && <span className="lg-board-cell__badge">+{captureCount}</span>}
          {hasElementBonus && <span className="lg-board-cell__bonus">+{ELEMENT_BONUS}</span>}
        </>
      )}
    </button>
  );
}

function TacticalBoard({ G, viewerID, selectedCard, previewByCell, previewCaptureIndexes, recentCaptureIndexes, onPlace, onHover }) {
  return (
    <section className="lg-board-shell">
      <div className="lg-portal-ring" aria-hidden="true" />
      <div className="lg-board">
        {G.board.map((cell) => (
          <BoardCell
            key={cell.index}
            cell={cell}
            viewerID={viewerID}
            selectedCard={selectedCard}
            preview={previewByCell[cell.index]}
            isPreviewTarget={previewCaptureIndexes.has(cell.index)}
            recentCapture={recentCaptureIndexes.has(cell.index)}
            onPlace={onPlace}
            onHover={onHover}
          />
        ))}
      </div>
    </section>
  );
}

export function LayetBoard({ G, ctx, moves, reset, onExit, onMatchEnd, sceneVariant, playerID = PLAYER_ID }) {
  const viewerID = G.players?.[playerID] ? playerID : PLAYER_ID;
  const opponentID = viewerID === PLAYER_ID ? BOT_ID : PLAYER_ID;
  const player = G.players[viewerID];
  const isMultiplayer = G.mode === 'multiplayer';
  const isViewerTurn = !isMultiplayer || ctx?.currentPlayer === viewerID;
  const [selectedUid, setSelectedUid] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [activeDragCard, setActiveDragCard] = useState(null);
  const matchEndReportedRef = useRef(false);
  const botPlayMoveRef = useRef(moves.botPlay);
  botPlayMoveRef.current = moves.botPlay;
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const mustSacrifice = G.sacrificeRequired === viewerID;
  const isBotThinking = !isMultiplayer && Boolean(G.botPending);
  const canInteract = isViewerTurn && !isBotThinking;
  const selectedCard = useMemo(
    () => (mustSacrifice ? null : player.hand.find((card) => card.uid === selectedUid) || null),
    [player.hand, selectedUid, mustSacrifice]
  );
  const previewByCell = useMemo(() => {
    if (!selectedCard) return {};
    return Object.fromEntries(
      G.board.map((cell) => [
        cell.index,
        getPlacementPreview(G.board, viewerID, selectedCard, cell.index),
      ])
    );
  }, [G.board, selectedCard, viewerID]);
  const hoverPreview = hoveredCell === null ? null : previewByCell[hoveredCell];
  const previewCaptureIndexes = useMemo(
    () => new Set(hoverPreview?.captureIndexes || []),
    [hoverPreview]
  );
  const recentCaptureIndexes = useMemo(() => {
    const captures = G.history?.[0]?.captures || [];
    return new Set(captures.map((capture) => capture.index));
  }, [G.history]);
  const isDone = Boolean(G.winner);
  const canDraw =
    !isDone &&
    canInteract &&
    !mustSacrifice &&
    !G.drawsThisTurn?.[viewerID] &&
    player.deck.length > 0;
  const resultTitle =
    G.winner === viewerID ? 'Victory' : G.winner === opponentID ? 'Defeat' : G.winner === 'draw' ? 'Draw' : '';
  const turnLabel = isDone
    ? 'Match Complete'
    : isBotThinking
      ? 'Opponent Turn'
      : isViewerTurn
      ? 'Your Turn'
      : 'Opponent Turn';

  const placeSelected = (cellIndex) => {
    if (!selectedCard || isDone || mustSacrifice || !canInteract) return;
    const preview = previewByCell[cellIndex];
    playSfx(preview?.captures?.length > 0 ? 'capture' : 'place');
    moves.playCard(selectedCard.uid, cellIndex);
    setSelectedUid(null);
    setHoveredCell(null);
  };

  const drawFromDeck = () => {
    if (!canDraw) return;
    playSfx('draw');
    moves.drawCard();
    setSelectedUid(null);
    setHoveredCell(null);
  };

  const handleHandCardClick = (card) => {
    if (isDone || !canInteract) return;
    if (mustSacrifice) {
      playSfx('sacrifice');
      moves.sacrificeCard(card.uid);
      setSelectedUid(null);
      setHoveredCell(null);
      return;
    }
    setSelectedUid(card.uid);
  };

  const handleDragStart = (event) => {
    if (!canInteract) return;
    const card = event.active?.data?.current?.card;
    if (!card) return;
    setActiveDragCard(card);
    if (!mustSacrifice) setSelectedUid(card.uid);
  };

  const handleDragEnd = (event) => {
    const card = event.active?.data?.current?.card;
    const cellIndex = event.over?.data?.current?.cellIndex;
    setActiveDragCard(null);
    if (!card || cellIndex === undefined || isDone || mustSacrifice || !canInteract) return;

    const preview = getPlacementPreview(G.board, viewerID, card, cellIndex);
    if (!preview.legal) return;
    playSfx(preview.captures.length > 0 ? 'capture' : 'place');
    moves.playCard(card.uid, cellIndex);
    setSelectedUid(null);
    setHoveredCell(null);
  };

  useEffect(() => {
    return () => Object.values(SFX).forEach((sound) => sound.stop());
  }, []);

  useEffect(() => {
    if (canInteract) return;
    setSelectedUid(null);
    setHoveredCell(null);
  }, [canInteract]);

  useEffect(() => {
    if (isMultiplayer || !G.botPending || G.winner) return undefined;

    const timeoutID = window.setTimeout(() => {
      botPlayMoveRef.current?.();
    }, BOT_THINK_DELAY_MS);

    return () => window.clearTimeout(timeoutID);
  }, [G.botPending, G.winner, isMultiplayer]);

  useEffect(() => {
    if (!G.winner) {
      matchEndReportedRef.current = false;
      return;
    }
    if (matchEndReportedRef.current || !onMatchEnd) return;
    matchEndReportedRef.current = true;
    onMatchEnd({
      winner: G.winner,
      viewerID,
      opponentID,
      viewerScore: G.score[viewerID],
      opponentScore: G.score[opponentID],
    });
  }, [G.score, G.winner, onMatchEnd, opponentID, viewerID]);

  useEffect(() => {
    if (sceneVariant !== 'page2' || typeof window === 'undefined') return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const preventZoomWheel = (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
    };
    const preventZoomKeys = (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (!['+', '-', '=', '_', '0'].includes(event.key) && !['NumpadAdd', 'NumpadSubtract', 'Digit0'].includes(event.code)) return;
      event.preventDefault();
    };
    const preventGestureZoom = (event) => {
      event.preventDefault();
    };

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    window.addEventListener('wheel', preventZoomWheel, { passive: false });
    window.addEventListener('keydown', preventZoomKeys);
    window.addEventListener('gesturestart', preventGestureZoom);
    window.addEventListener('gesturechange', preventGestureZoom);
    window.addEventListener('gestureend', preventGestureZoom);
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener('wheel', preventZoomWheel);
      window.removeEventListener('keydown', preventZoomKeys);
      window.removeEventListener('gesturestart', preventGestureZoom);
      window.removeEventListener('gesturechange', preventGestureZoom);
      window.removeEventListener('gestureend', preventGestureZoom);
    };
  }, [sceneVariant]);

  return (
    <main
      className={[
        'layet-game',
        sceneVariant === 'page2' ? 'layet-game--page2' : '',
        recentCaptureIndexes.size > 0 ? 'has-impact' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="lg-particles" aria-hidden="true">
        {Array.from({ length: PARTICLE_COUNT }, (_, index) => (
          <span
            key={index}
            style={{
              '--i': index,
              '--x': `${(index * 37) % 100}%`,
              '--y': `${(index * 53) % 100}%`,
              '--s': `${2 + (index % 3)}px`,
              '--h': `${185 + index * 18}`,
              '--dx': `${((index % 5) - 2) * 18}px`,
              '--dy': `${((index % 7) - 3) * 16}px`,
              '--duration': `${8 + (index % 7)}s`,
            }}
          />
        ))}
      </div>
      <section className="lg-arena">
        <header className="lg-topbar">
          <div>
            <p className="lg-kicker">Board Control TCG</p>
            <h1>{GAME_TITLE}</h1>
          </div>
          <ScorePanel G={G} variant={sceneVariant} viewerID={viewerID} />
          {(isMultiplayer || isBotThinking) && <div className="lg-turn-chip">{turnLabel}</div>}
          <div className="lg-actions">
            <button type="button" onClick={reset}>
              Restart
            </button>
            {onExit && (
              <button type="button" onClick={onExit}>
                Menu
              </button>
            )}
          </div>
        </header>

        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="lg-mid">
            <TacticalBoard
              G={G}
              viewerID={viewerID}
              selectedCard={selectedCard}
              previewByCell={previewByCell}
              previewCaptureIndexes={previewCaptureIndexes}
              recentCaptureIndexes={recentCaptureIndexes}
              onPlace={placeSelected}
              onHover={setHoveredCell}
            />
          </div>

        <section className="lg-player">
          <div className="lg-hand">
            <DeckStack
              count={player.deck.length}
              label="Deck"
              onClick={drawFromDeck}
              disabled={!canDraw}
              actionLabel={
                mustSacrifice ? 'SACRIFICE' : canDraw ? 'DRAW' : ''
              }
            />
            {player.hand.map((card) => (
              <HandCard
                key={card.uid}
                card={card}
                selected={selectedUid === card.uid}
                sacrificeMode={mustSacrifice}
                disabled={isDone || !canInteract}
                onClick={() => handleHandCardClick(card)}
              />
            ))}
          </div>
        </section>
          <DragOverlay>
            {activeDragCard ? (
              <div className="lg-drag-overlay">
                <CardFace card={activeDragCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </section>

      {isDone && (
        <div className={`lg-result lg-result--${resultTitle.toLowerCase()}`} role="dialog" aria-modal="true" aria-labelledby="match-result-title">
          <div className="lg-result__panel">
            <div className="lg-result__flare" aria-hidden="true" />
            <div className="lg-result__particles" aria-hidden="true">
              {Array.from({ length: 12 }, (_, index) => <span key={index} />)}
            </div>
            <div className="lg-result__content">
              <p className="lg-result__eyebrow">Duel complete</p>
              <h2 id="match-result-title">{resultTitle}</h2>
              <p className="lg-result__message">
                {resultTitle === 'Victory'
                  ? 'The arena answers to your command.'
                  : resultTitle === 'Defeat'
                    ? 'Reform your deck and return stronger.'
                    : 'Power held in perfect balance.'}
              </p>

              <div className="lg-result__score" aria-label={`Final score ${G.score[viewerID].cards} to ${G.score[opponentID].cards}`}>
                <div className="lg-result__score-side is-player">
                  <small>You</small>
                  <strong>{G.score[viewerID].cards}</strong>
                </div>
                <span className="lg-result__score-separator">:</span>
                <div className="lg-result__score-side is-opponent">
                  <small>Opponent</small>
                  <strong>{G.score[opponentID].cards}</strong>
                </div>
              </div>

              <div className="lg-result__power">
                <span><small>Your power</small><strong>{G.score[viewerID].power}</strong></span>
                <i aria-hidden="true" />
                <span><small>Rival power</small><strong>{G.score[opponentID].power}</strong></span>
              </div>

              <div className="lg-result__actions">
                <button className="lg-result__primary" type="button" onClick={reset}>
                  Play again
                </button>
                {onExit && (
                  <button className="lg-result__secondary" type="button" onClick={onExit}>
                    Return to arena
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const LayetClient = Client({
  game: LayetDuel,
  board: LayetBoard,
  numPlayers: 2,
  debug: false,
});

export default function LayetGame({ onExit, sceneVariant }) {
  return <LayetClient playerID={PLAYER_ID} onExit={onExit} sceneVariant={sceneVariant} />;
}
