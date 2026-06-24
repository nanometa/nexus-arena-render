import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import * as serviceWorker from './serviceWorker';
import App from './App';

// NOTE: the Redux store and the multiplayer Main are intentionally NOT imported here.
// They live in src/Components/Main/MultiplayerApp.jsx and are loaded lazily by App.jsx,
// because importing the store opens the socket.io connection as a side effect. Rendering
// <App/> keeps the local "vs Bot" demo completely server-free.
ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
