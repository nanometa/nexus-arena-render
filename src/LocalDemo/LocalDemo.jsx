import React, { useReducer, useState, useEffect, useRef } from 'react';
import {
  createInitialState,
  summon,
  attack,
  endTurn,
  canSummon,
  canAttack,
  legalTargets,
  applyResult,
  SIDES,
  RESULT,
} from './engine/gameLogic';
import { RARITY } from './engine/cards';
import { playBotTurn } from './engine/bot';
import './LocalDemo.css';

const BOT_DELAY_MS = 700;

function reducer(state, action) {
  switch (action.type) {
    case 'RESET':
      return createInitialState(action.opts || {});
    case 'SUMMON':
      return applyResult(state, summon(state, SIDES.PLAYER, action.handIndex, action.opts || {}));
    case 'ATTACK':
      return applyResult(state, attack(state, SIDES.PLAYER, action.attackerId, action.targetId));
    case 'END_TURN':
      return applyResult(state, endTurn(state, SIDES.PLAYER));
    case 'BOT_PLAY':
      return playBotTurn(state);
    default:
      return state;
  }
}

/** Presentational card with a CSS element-colored placeholder + optional artwork image. */
function CardView({ card, faceDown, selected, selectable, isTarget, badge, onClick }) {
  if (faceDown) {
    return <div className="demo-card demo-card--back" aria-label="carte cachée" />;
  }
  if (!card) {
    return <div className="demo-card demo-card--empty">Emplacement libre</div>;
  }
  const cls = [
    'demo-card',
    `elem-${card.element}`,
    card.rarity === RARITY.LEGENDARY ? 'demo-card--legendary' : '',
    selected ? 'is-selected' : '',
    selectable ? 'is-selectable' : '',
    isTarget ? 'is-target' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} onClick={onClick} role={onClick ? 'button' : undefined}>
      {/* artwork is loaded if available; otherwise the CSS placeholder (background) shows */}
      <img
        className="demo-card__art"
        src={card.artwork}
        alt=""
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
      <div className="demo-card__overlay">
        <div className="demo-card__top">
          <span className="demo-card__name">{card.name}</span>
          <span className="demo-card__elem">{card.element}</span>
        </div>
        <div className="demo-card__bottom">
          <span className="demo-card__power">{card.power}</span>
          {card.rarity === RARITY.LEGENDARY && <span className="demo-card__rarity">★ Légendaire</span>}
        </div>
      </div>
      {badge && <span className="demo-card__badge">{badge}</span>}
    </div>
  );
}

function HpBar({ side, hp, max }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  return (
    <div className={`hpbar hpbar--${side}`}>
      <div className="hpbar__label">
        {side === SIDES.PLAYER ? 'Joueur' : 'Bot'} — {hp} PV
      </div>
      <div className="hpbar__track">
        <div className="hpbar__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function LocalDemo({ onExit }) {
  const [game, dispatch] = useReducer(reducer, undefined, () => createInitialState());
  const [selectedAttacker, setSelectedAttacker] = useState(null);
  const botTurnRef = useRef(-1);

  const isPlayerTurn = game.activeSide === SIDES.PLAYER && !game.result;

  // The bot plays its whole turn automatically (no socket, no server).
  useEffect(() => {
    if (game.result) return undefined;
    if (game.activeSide !== SIDES.BOT) return undefined;
    if (botTurnRef.current === game.turn) return undefined; // already scheduled for this turn
    botTurnRef.current = game.turn;
    const id = setTimeout(() => dispatch({ type: 'BOT_PLAY' }), BOT_DELAY_MS);
    return () => clearTimeout(id);
  }, [game.activeSide, game.turn, game.result]);

  // Clear the attack selection whenever the turn changes.
  useEffect(() => {
    setSelectedAttacker(null);
  }, [game.turn, game.activeSide, game.result]);

  const player = game.players[SIDES.PLAYER];
  const bot = game.players[SIDES.BOT];
  const targeting = selectedAttacker && isPlayerTurn ? legalTargets(game, SIDES.PLAYER) : null;

  const handleNewGame = () => {
    botTurnRef.current = -1;
    setSelectedAttacker(null);
    dispatch({ type: 'RESET', opts: {} });
  };

  const handleSummon = (handIndex) => {
    if (!isPlayerTurn) return;
    const card = player.hand[handIndex];
    if (!card) return;
    if (card.rarity === RARITY.LEGENDARY) {
      // Auto-sacrifice the 2 weakest own field cards (the default deck has no legendary;
      // this keeps the legendary rule playable if such a card ever appears).
      const own = player.field.filter(Boolean).slice().sort((a, b) => a.power - b.power);
      if (own.length < 2) {
        dispatch({ type: 'SUMMON', handIndex }); // engine will reject -> sets lastError
        return;
      }
      dispatch({
        type: 'SUMMON',
        handIndex,
        opts: { sacrificeInstanceIds: [own[0].instanceId, own[1].instanceId] },
      });
      return;
    }
    dispatch({ type: 'SUMMON', handIndex });
  };

  const handleSelectAttacker = (instanceId) => {
    if (!isPlayerTurn) return;
    if (selectedAttacker === instanceId) {
      setSelectedAttacker(null);
      return;
    }
    if (canAttack(game, SIDES.PLAYER, instanceId).ok) {
      setSelectedAttacker(instanceId);
    }
  };

  const handleAttackTarget = (targetId) => {
    if (!selectedAttacker) return;
    dispatch({ type: 'ATTACK', attackerId: selectedAttacker, targetId });
    setSelectedAttacker(null);
  };

  const handleDirectAttack = () => {
    if (!selectedAttacker) return;
    dispatch({ type: 'ATTACK', attackerId: selectedAttacker, targetId: null });
    setSelectedAttacker(null);
  };

  const handleEndTurn = () => {
    if (!isPlayerTurn) return;
    setSelectedAttacker(null);
    dispatch({ type: 'END_TURN' });
  };

  const resultText =
    game.result === RESULT.PLAYER
      ? 'Victoire !'
      : game.result === RESULT.BOT
      ? 'Défaite…'
      : game.result === RESULT.DRAW
      ? 'Égalité'
      : '';

  const renderField = (side) => {
    const p = game.players[side];
    return (
      <div className="field-row">
        {p.field.map((card, i) => {
          if (side === SIDES.PLAYER) {
            const selectable =
              isPlayerTurn && card && canAttack(game, SIDES.PLAYER, card.instanceId).ok;
            return (
              <CardView
                key={`pf-${i}`}
                card={card}
                selectable={selectable}
                selected={card && selectedAttacker === card.instanceId}
                badge={card && card.attackedThisTurn ? '✔' : null}
                onClick={card ? () => handleSelectAttacker(card.instanceId) : undefined}
              />
            );
          }
          // bot field
          const isTarget = targeting && !targeting.direct && card && targeting.targets.includes(card.instanceId);
          return (
            <CardView
              key={`bf-${i}`}
              card={card}
              isTarget={isTarget}
              onClick={isTarget ? () => handleAttackTarget(card.instanceId) : undefined}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="local-demo">
      <header className="ld-header">
        <h1>Démo locale — Joueur vs Bot</h1>
        <div className="ld-header__meta">
          <span className="ld-turn">Tour {game.turn} / {game.config.maxTurns}</span>
          <span className={`ld-active ld-active--${game.activeSide}`}>
            {game.result ? 'Partie terminée' : isPlayerTurn ? 'À vous de jouer' : 'Tour du bot…'}
          </span>
          <button className="ld-btn" onClick={handleNewGame}>Rejouer</button>
          {onExit && <button className="ld-btn ld-btn--ghost" onClick={onExit}>Menu</button>}
        </div>
      </header>

      {/* BOT side */}
      <section className="side side--bot">
        <div className="side__info">
          <HpBar side={SIDES.BOT} hp={bot.hp} max={game.config.startingHp} />
          <div className="counts">
            <span>Main : {bot.hand.length}</span>
            <span>Pioche : {bot.deck.length}</span>
            <span>Cimetière : {bot.graveyard.length}</span>
          </div>
        </div>
        <div className="hand hand--bot">
          {bot.hand.map((_, i) => (
            <CardView key={`bh-${i}`} faceDown />
          ))}
        </div>
        {renderField(SIDES.BOT)}
      </section>

      {/* center controls */}
      <section className="center">
        {targeting && targeting.direct && (
          <button className="ld-btn ld-btn--attack" onClick={handleDirectAttack}>
            Attaque directe
          </button>
        )}
        {selectedAttacker && targeting && !targeting.direct && (
          <span className="center__hint">Choisissez une carte ennemie à attaquer</span>
        )}
        <button className="ld-btn ld-btn--end" onClick={handleEndTurn} disabled={!isPlayerTurn}>
          Terminer le tour
        </button>
        {game.lastError && <span className="center__error">⚠ {game.lastError}</span>}
      </section>

      {/* PLAYER side */}
      <section className="side side--player">
        {renderField(SIDES.PLAYER)}
        <div className="hand hand--player">
          {player.hand.map((card, i) => {
            const summonable =
              card.rarity === RARITY.LEGENDARY
                ? isPlayerTurn &&
                  !game.flags.summonedThisTurn &&
                  player.field.filter(Boolean).length >= 2
                : isPlayerTurn && canSummon(game, SIDES.PLAYER, i).ok;
            return (
              <div className="hand-card" key={`ph-${card.instanceId}`}>
                <CardView card={card} />
                <button
                  className="ld-btn ld-btn--summon"
                  disabled={!summonable}
                  onClick={() => handleSummon(i)}
                >
                  Invoquer
                </button>
              </div>
            );
          })}
        </div>
        <div className="side__info">
          <HpBar side={SIDES.PLAYER} hp={player.hp} max={game.config.startingHp} />
          <div className="counts">
            <span>Main : {player.hand.length}</span>
            <span>Pioche : {player.deck.length}</span>
            <span>Cimetière : {player.graveyard.length}</span>
          </div>
        </div>
      </section>

      {/* log */}
      <section className="log">
        <h2>Journal</h2>
        <ul>
          {game.log.slice(-8).reverse().map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </section>

      {/* result overlay */}
      {game.result && (
        <div className="result-overlay">
          <div className={`result-card result-card--${game.result}`}>
            <h2>{resultText}</h2>
            <p>{game.winnerReason}</p>
            <button className="ld-btn ld-btn--attack" onClick={handleNewGame}>Rejouer</button>
            {onExit && <button className="ld-btn ld-btn--ghost" onClick={onExit}>Retour au menu</button>}
          </div>
        </div>
      )}
    </div>
  );
}
