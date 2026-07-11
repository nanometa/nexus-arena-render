import React from 'react';
import { useNavigate } from 'react-router-dom';
import LayetMultiplayer from '../LayetGame/LayetMultiplayer';
import { useNexusStore } from '../store/useNexusStore';

export default function ArenaPage() {
  const navigate = useNavigate();
  const playerAccount = useNexusStore((state) => state.playerAccount);
  const setPlayerAccount = useNexusStore((state) => state.setPlayerAccount);

  return (
    <div className="bg-[#0f172a]">
      <LayetMultiplayer
        onExit={() => navigate('/')}
        playerAccountOverride={playerAccount}
        onPlayerAccountSync={setPlayerAccount}
        lobbyVariant="arena"
      />
    </div>
  );
}
