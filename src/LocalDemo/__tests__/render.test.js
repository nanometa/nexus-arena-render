/**
 * UI render smoke tests — verify the components mount and render their initial state
 * without throwing (no browser needed). The full game behaviour is covered by the
 * engine tests; this guards against runtime/render regressions in the React layer.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import LocalDemo from '../LocalDemo';
import App from '../../App';

test('LocalDemo renders the initial board (2000 HP, turn 1) without throwing', () => {
  const html = renderToStaticMarkup(<LocalDemo />);
  expect(html).toContain('Démo locale');
  expect(html).toContain('2000 PV');
  expect(html).toContain('Tour 1');
  expect(html).toContain('Terminer le tour');
});

test('App renders the mode selector with a Local vs Bot option without throwing', () => {
  const html = renderToStaticMarkup(<App />);
  expect(html).toContain('Local vs Bot');
  expect(html).toContain('Multijoueur');
});
