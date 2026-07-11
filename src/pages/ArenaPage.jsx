import React from 'react';
import LayetMultiplayer from '../LayetGame/LayetMultiplayer';
import { useNexusStore } from '../store/useNexusStore';

export default function ArenaPage() {
  const playerAccount = useNexusStore((state) => state.playerAccount);
  const setPlayerAccount = useNexusStore((state) => state.setPlayerAccount);

  return (
    <div className="bg-[#0f172a]">
      <LayetMultiplayer
        playerAccountOverride={playerAccount}
        onPlayerAccountSync={setPlayerAccount}
        lobbyVariant="arena"
      />
    </div>
  );
}
