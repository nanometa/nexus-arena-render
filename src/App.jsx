import React, { useState, Suspense } from 'react';
import LocalDemo from './LocalDemo/LocalDemo';
import './App.css';

// Online mode is lazy-loaded: its module tree (Redux store -> Core -> Client) opens the
// socket.io connection as an import side effect, so we only load it on demand. The local
// demo therefore runs with zero network/socket usage.
const MultiplayerApp = React.lazy(() => import('./Components/Main/MultiplayerApp'));

export default function App() {
  const [mode, setMode] = useState(null); // null | 'local' | 'online'

  if (mode === 'local') {
    return <LocalDemo onExit={() => setMode(null)} />;
  }

  if (mode === 'online') {
    return (
      <Suspense fallback={<div className="mode-loading">Chargement du mode en ligne…</div>}>
        <MultiplayerApp />
      </Suspense>
    );
  }

  return (
    <div className="mode-select">
      <div className="mode-select__panel">
        <h1>LAYET</h1>
        <p className="mode-select__subtitle">Démo — jeu de cartes</p>
        <div className="mode-select__buttons">
          <button className="mode-btn mode-btn--primary" onClick={() => setMode('local')}>
            Local vs Bot
          </button>
          <button className="mode-btn" onClick={() => setMode('online')}>
            Multijoueur (original)
          </button>
        </div>
        <p className="mode-note">
          « Local vs Bot » fonctionne entièrement hors-ligne, sans serveur ni WebSocket.
          <br />
          Le mode multijoueur nécessite le serveur de référence.
        </p>
      </div>
    </div>
  );
}
