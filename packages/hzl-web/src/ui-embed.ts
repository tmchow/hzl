import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface EmbeddedFile {
  content: Buffer;
  contentType: string;
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function getMimeType(filePath: string): string {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Resolve the ui directory path.
 * Prefers dist/ui/ (contains Vite-built React app + copied legacy.html).
 * Falls back to src/ui/ when dist hasn't been built yet.
 */
function resolveUiDir(): string {
  // When running from compiled JS (dist/), __dirname is dist/ so 'ui' = dist/ui/
  // When running from source (src/) via vitest, __dirname is src/ so we look up to dist/ui/
  const candidates = [
    join(__dirname, 'ui'),              // dist/ui/ when running from dist/
    join(__dirname, '..', 'dist', 'ui'), // dist/ui/ when running from src/ (vitest)
    join(__dirname, '..', 'src', 'ui'),  // src/ui/ fallback (dev without build)
  ];

  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }

  throw new Error(`Could not find ui directory - checked: ${candidates.join(', ')}`);
}

/**
 * Recursively load all files from a directory into a Map keyed by URL path.
 * e.g. dist/ui/index.html -> "/index.html", dist/ui/assets/main-abc.js -> "/assets/main-abc.js"
 */
function loadDirectory(dir: string, prefix = ''): Map<string, EmbeddedFile> {
  const files = new Map<string, EmbeddedFile>();

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const urlPath = prefix + '/' + entry;

    if (statSync(fullPath).isDirectory()) {
      for (const [k, v] of loadDirectory(fullPath, urlPath)) {
        files.set(k, v);
      }
    } else {
      files.set(urlPath, {
        content: readFileSync(fullPath),
        contentType: getMimeType(fullPath),
      });
    }
  }

  return files;
}

const uiDir = resolveUiDir();

/** All files from dist/ui/ keyed by URL path (e.g. "/index.html", "/assets/main-abc.js") */
export const UI_FILES: Map<string, EmbeddedFile> = loadDirectory(uiDir);

/** Legacy dashboard HTML for the HZL_LEGACY_DASHBOARD=1 feature toggle */
export const LEGACY_DASHBOARD_HTML: string = (() => {
  const legacyPath = join(uiDir, 'legacy.html');
  if (existsSync(legacyPath)) {
    return readFileSync(legacyPath, 'utf-8');
  }
  // Fallback: try src/ui/legacy.html when running from dist
  const srcLegacy = join(__dirname, '..', 'src', 'ui', 'legacy.html');
  if (existsSync(srcLegacy)) {
    return readFileSync(srcLegacy, 'utf-8');
  }
  return '<html><body>Legacy dashboard not found.</body></html>';
})();
