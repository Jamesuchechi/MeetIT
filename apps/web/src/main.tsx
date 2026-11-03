import React from 'react';
import ReactDOM from 'react-dom/client';
import { Button } from '@meetit/ui';
import './style.css';

function App() {
  return (
    <main>
      <p className="eyebrow">MEETIT · FOUNDATIONS</p>
      <h1>Meetings that keep you connected.</h1>
      <p className="intro">
        The MeetIT workspace is ready. Room creation and calling are coming in
        the next phase.
      </p>
      <Button>Get started</Button>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
