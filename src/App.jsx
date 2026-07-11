import React from 'react';
import NexusWeb3Provider from './providers/NexusWeb3Provider';
import AppRouter from './router/AppRouter';

export default function App() {
  return (
    <NexusWeb3Provider>
      <AppRouter />
    </NexusWeb3Provider>
  );
}
