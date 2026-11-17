import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/zilla-slab/latin-600.css';
import '@fontsource/zilla-slab/latin-700.css';
import '@fontsource/schibsted-grotesk/latin-400.css';
import '@fontsource/schibsted-grotesk/latin-500.css';
import '@fontsource/schibsted-grotesk/latin-600.css';
import '@fontsource/schibsted-grotesk/latin-700.css';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';
import { App } from './app';
import './ui/styles/tokens.css';
import './ui/styles/app.css';
import './ui/styles/run-sheet.css';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Missing #root element.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
