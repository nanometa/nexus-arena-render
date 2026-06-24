import React from 'react';
import { Provider } from 'react-redux';
import 'semantic-ui-css/semantic.min.css';
import store from '../../Store/store';
import Main from './Main';

/**
 * Wrapper for the original multiplayer experience.
 *
 * The Redux store transitively imports Core -> Client -> `io(ENDPOINT)`, which opens a
 * socket.io connection as a side effect. By isolating the store/Provider here and loading
 * this module lazily (see src/App.jsx), the socket is created ONLY when the player chooses
 * the online mode — the local "vs Bot" demo never triggers any network connection.
 *
 * The original Main component is left untouched.
 */
export default function MultiplayerApp() {
  return (
    <Provider store={store}>
      <Main />
    </Provider>
  );
}
