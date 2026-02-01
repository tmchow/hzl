import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In development, read from source. In production, this will be the dist folder.
// For dev, we try the src folder first, then fall back to the build location.
function loadHtml(): string {
  const paths = [
    join(__dirname, 'ui', 'index.html'),           // dist/ui/index.html (prod)
    join(__dirname, '..', 'src', 'ui', 'index.html'), // src/ui/index.html (dev from dist)
  ];

  for (const p of paths) {
    try {
      return readFileSync(p, 'utf-8');
    } catch {
      // Try next path
    }
  }

  throw new Error('Could not find index.html - checked: ' + paths.join(', '));
}

export const DASHBOARD_HTML = loadHtml();
