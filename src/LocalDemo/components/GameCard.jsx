import React from 'react';
import {
  ELEMENT_META,
  RARITY_META,
  RARITY,
  FRAME_BASE,
  ELEMENT_ICON_BASE,
} from '../engine/cards';
import './GameCard.css';

/**
 * Reusable, dynamic card component.
 *
 * Layered structure (each concern is a separate, independent layer):
 *   1. artwork  — <img object-fit:cover> ; fallback = element-colored CSS gradient.
 *   2. frame    — transparent PNG frame ; fallback = CSS border (rarity/element colored).
 *   3. icon     — elemental icon PNG ; fallback = emoji (ELEMENT_META.icon).
 *   4. text     — name / element / power / rarity / ability — ALWAYS rendered as DOM text,
 *                 never baked into an image.
 *
 * Visual states are driven purely by CSS classes toggled from boolean props:
 *   selectable, selected, summoned, canAttack, hasAttacked, destroyed, disabled, target.
 *
 * No image is ever generated or modified here; missing assets degrade gracefully.
 */
const hideOnError = (e) => {
  e.currentTarget.style.display = 'none';
};

export default function GameCard({
  card,
  faceDown = false,
  empty = false,
  selectable = false,
  selected = false,
  summoned = false,
  canAttack = false,
  hasAttacked = false,
  destroyed = false,
  disabled = false,
  target = false,
  onClick,
  ariaLabel,
}) {
  if (faceDown) {
    return <div className="game-card game-card--back" aria-label="carte cachée" />;
  }
  if (empty || !card) {
    return <div className="game-card game-card--empty">Emplacement libre</div>;
  }

  const elementMeta = ELEMENT_META[card.element] || { label: card.element, icon: '◆' };
  const rarityMeta = RARITY_META[card.rarity] || { label: card.rarity };
  const isLegendary = card.rarity === RARITY.LEGENDARY;
  const elementKey = String(card.element || '').toLowerCase();

  const className = [
    'game-card',
    `elem-${card.element}`,
    isLegendary ? 'game-card--legendary' : '',
    selectable ? 'is-selectable' : '',
    selected ? 'is-selected' : '',
    summoned ? 'is-summoned' : '',
    canAttack ? 'can-attack' : '',
    hasAttacked ? 'has-attacked' : '',
    destroyed ? 'is-destroyed' : '',
    disabled ? 'is-disabled' : '',
    target ? 'is-target' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const frameSrc = `${FRAME_BASE}/${elementKey}-frame.png`;
  const iconSrc = `${ELEMENT_ICON_BASE}/${elementKey}.png`;

  return (
    <div
      className={className}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label={ariaLabel || `${card.name} (${elementMeta.label}, ${card.power})`}
    >
      {/* Layer 1 — artwork (fallback: element-colored gradient on .game-card) */}
      <div className="game-card__art-layer">
        <img
          className="game-card__art"
          src={card.artwork}
          alt=""
          loading="lazy"
          onError={hideOnError}
        />
      </div>

      {/* Layer 2 — transparent PNG frame (fallback: CSS border) */}
      <div className="game-card__frame-layer">
        <img className="game-card__frame" src={frameSrc} alt="" onError={hideOnError} />
      </div>

      {/* Layer 3 — elemental icon (fallback: emoji) */}
      <div className="game-card__icon-layer" title={elementMeta.label}>
        <span className="game-card__icon-fallback" aria-hidden="true">
          {elementMeta.icon}
        </span>
        <img className="game-card__icon" src={iconSrc} alt="" onError={hideOnError} />
      </div>

      {/* Layer 4 — text (never embedded in an image) */}
      <div className="game-card__text-layer">
        <div className="game-card__name">{card.name}</div>
        <div className="game-card__meta">
          <span className="game-card__element">{elementMeta.label}</span>
          <span className={`game-card__rarity game-card__rarity--${card.rarity}`}>
            {rarityMeta.label}
          </span>
        </div>
        <div className="game-card__ability">{card.ability}</div>
        <div className="game-card__power" aria-label="puissance">
          {card.power}
        </div>
      </div>

      {hasAttacked && (
        <span className="game-card__badge game-card__badge--attacked" title="A déjà attaqué">
          ✔
        </span>
      )}
      {summoned && !hasAttacked && (
        <span className="game-card__badge game-card__badge--summoned" title="Invoquée ce tour">
          ✦
        </span>
      )}
    </div>
  );
}
