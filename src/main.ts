import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/cormorant-garamond/latin-600-italic.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';

import { readParams } from './app/params';
import { canRender } from './render/renderer';
import { showFallback } from './ui/fallback';

async function boot() {
  const params = readParams();
  const app = document.getElementById('app')!;
  if (!canRender()) {
    showFallback(app, 'no-webgl');
    return;
  }
  try {
    if (params.dev === 'tints') {
      const { startTintBoard } = await import('./ui/tintBoard');
      startTintBoard();
    } else {
      const { startStudio } = await import('./app/studio');
      await startStudio(params);
    }
    app.dataset.state = 'ready';
  } catch (err) {
    console.error(err);
    showFallback(app, 'error');
  }
}

void boot();
