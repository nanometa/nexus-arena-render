import React, { useState } from 'react';
import LayetMultiplayer from './LayetGame/LayetMultiplayer';
import './App.css';

const GAME_TITLE = 'NEXUS ARENA';

export default function App() {
  const [mode, setMode] = useState('multiplayer-page2');

  if (mode === 'multiplayer-page2') {
    return <LayetMultiplayer onExit={() => setMode(null)} />;
  }

  return (
    <div className="mode-select">
      <div className="mode-select__panel">
        <p className="mode-select__eyebrow">Board Control TCG</p>
        <h1>{GAME_TITLE}</h1>
        <p className="mode-select__subtitle">Online card duel arena</p>
        <div className="mode-select__buttons">
          <button className="mode-btn mode-btn--primary" onClick={() => setMode('multiplayer-page2')}>
            Play
          </button>
        </div>
      </div>
    </div>
  );
}
