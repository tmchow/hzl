import { accessSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// In development, read from source. In production, this will be the dist folder.
// For dev, we try the src folder first, then fall back to the build location.
function resolveUiPath(relativePath: string): string {
  const paths = [
    join(__dirname, 'ui', relativePath), // dist/ui/* (prod)
    join(__dirname, '..', 'src', 'ui', relativePath), // src/ui/* (dev from dist)
  ];

  for (const p of paths) {
    try {
      accessSync(p);
      return p;
    } catch {
      // Try next path
    }
  }

  throw new Error(`Could not find ${relativePath} - checked: ${paths.join(', ')}`);
}

function loadUiText(relativePath: string): string {
  return readFileSync(resolveUiPath(relativePath), 'utf-8');
}

function loadUiBinary(relativePath: string): Buffer {
  return readFileSync(resolveUiPath(relativePath));
}

export const DASHBOARD_HTML = loadUiText('index.html');
export const DASHBOARD_SITE_MANIFEST = loadUiText('site.webmanifest');
export const DASHBOARD_SERVICE_WORKER = loadUiText('sw.js');
export const DASHBOARD_FAVICON_PNG_96 = loadUiBinary('favicon-96x96.png');
export const DASHBOARD_FAVICON_ICO = loadUiBinary('favicon.ico');
export const DASHBOARD_APPLE_TOUCH_ICON = loadUiBinary('apple-touch-icon.png');
export const DASHBOARD_WEB_APP_ICON_192 = loadUiBinary('web-app-manifest-192x192.png');
export const DASHBOARD_WEB_APP_ICON_512 = loadUiBinary('web-app-manifest-512x512.png');
