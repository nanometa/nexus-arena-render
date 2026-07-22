import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../../App';
import LayetGame, { LayetBoard } from '../../LayetGame/LayetGame';
import { LayetDuel, PLAYER_ID, BOT_ID } from '../../LayetGame/game';

test('LayetBoard renders the initial duel shell without throwing', () => {
  const G = LayetDuel.setup({
    random: { Shuffle: (items) => items.slice() },
  });
  G.players[BOT_ID].hand = G.players[BOT_ID].hand.map((_, index) => ({
    uid: `hidden-${index}`,
    hidden: true,
  }));

  const html = renderToStaticMarkup(
    <LayetBoard G={G} moves={{ playCard: jest.fn() }} reset={jest.fn()} playerID={PLAYER_ID} />
  );

  expect(html).toContain('NEXUS ARENA');
  expect(html).toContain('Deck');
  expect(html).toContain('Player');
  expect((html.match(/class="lg-hand-card/g) || []).length).toBe(8);
});

test('AI duel client renders the local player hand face-up', () => {
  const html = renderToStaticMarkup(<LayetGame sceneVariant="page2" />);

  expect((html.match(/class="lg-hand-card/g) || []).length).toBe(8);
  expect((html.match(/\/assets\/cards\/generated-filtered\//g) || []).length).toBeGreaterThanOrEqual(8);
});

test('LayetBoard colors the local viewer blue and the opponent red', () => {
  const G = LayetDuel.setup({
    random: { Shuffle: (items) => items.slice() },
  });
  G.board[0] = {
    ...G.board[0],
    owner: BOT_ID,
    card: G.players[BOT_ID].hand[0],
  };
  G.board[1] = {
    ...G.board[1],
    owner: PLAYER_ID,
    card: G.players[PLAYER_ID].hand[0],
  };

  const html = renderToStaticMarkup(
    <LayetBoard G={G} moves={{ playCard: jest.fn() }} reset={jest.fn()} playerID={BOT_ID} />
  );

  expect(html).toContain('is-bot is-viewer');
  expect(html).toContain('is-player is-opponent');
});

test('App renders the mode selector with the duel option without throwing', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('NEXUS ARENA');
  expect(html).toContain('Play');
  expect(html).not.toContain('Page 1 - Duel actuel');
  expect(html).not.toContain('Page 2 - Scene full-screen');
  expect(html).not.toContain('Multiplayer - Scene full-screen');
  expect(html).not.toContain('Ancien multijoueur');
});
