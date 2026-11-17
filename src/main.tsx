import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import './ui/styles/tokens.css';
import './ui/styles/app.css';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Missing #root element.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
