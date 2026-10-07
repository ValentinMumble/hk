import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './App';
import {installHaptics} from './haptic';
import './styles.css';

installHaptics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
