import './styles/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('renderer: #root missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
