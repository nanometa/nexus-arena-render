/**
 * GameCard component tests (server-render, no browser needed).
 * Covers dynamic data display, the separate layers, CSS state classes,
 * the face-down / empty variants, and the icon fallback.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GameCard from '../GameCard';
import { CHARACTERS, SAMPLE_LEGENDARY } from '../../engine/cards';

const html = (el) => renderToStaticMarkup(el);

test('renders all dynamic fields (name, element, power, rarity, ability)', () => {
  const out = html(<GameCard card={CHARACTERS.NYRA} />);
  expect(out).toContain('Nyra'); // name
  expect(out).toContain('Électrique'); // element label
  expect(out).toContain('500'); // power
  expect(out).toContain('Normale'); // rarity label
  expect(out).toContain('Foudre'); // ability (ELECTRIC effect label)
});

test('loads the artwork via an <img> with the card artwork path (object-fit layer)', () => {
  const out = html(<GameCard card={CHARACTERS.PYRA} />);
  expect(out).toContain('game-card__art');
  expect(out).toContain('pyra-fire-duelist-premium-v2.png');
  expect(out).toContain('game-card__frame-layer'); // separate frame layer
  expect(out).toContain('game-card__icon-layer'); // separate elemental-icon layer
});

test('shows the emoji icon fallback for the element', () => {
  expect(html(<GameCard card={CHARACTERS.NYRA} />)).toContain('⚡');
  expect(html(<GameCard card={CHARACTERS.NERIS} />)).toContain('💧');
});

test('applies CSS state classes from props', () => {
  const out = html(
    <GameCard card={CHARACTERS.GORAM} selectable selected canAttack />
  );
  expect(out).toContain('is-selectable');
  expect(out).toContain('is-selected');
  expect(out).toContain('can-attack');
});

test('hasAttacked shows the attacked class + badge; disabled/target classes apply', () => {
  const attacked = html(<GameCard card={CHARACTERS.SYLVA} hasAttacked />);
  expect(attacked).toContain('has-attacked');
  expect(attacked).toContain('game-card__badge--attacked');

  expect(html(<GameCard card={CHARACTERS.SYLVA} disabled />)).toContain('is-disabled');
  expect(html(<GameCard card={CHARACTERS.SYLVA} target />)).toContain('is-target');
  expect(html(<GameCard card={CHARACTERS.SYLVA} summoned />)).toContain('is-summoned');
});

test('legendary card gets the legendary class and rarity label', () => {
  const out = html(<GameCard card={SAMPLE_LEGENDARY} />);
  expect(out).toContain('game-card--legendary');
  expect(out).toContain('Légendaire');
});

test('face-down variant renders the card back and no name', () => {
  const out = html(<GameCard faceDown />);
  expect(out).toContain('game-card--back');
  expect(out).not.toContain('game-card__name');
});

test('empty variant renders an empty slot', () => {
  const out = html(<GameCard empty />);
  expect(out).toContain('game-card--empty');
  expect(out).toContain('Emplacement libre');
});
