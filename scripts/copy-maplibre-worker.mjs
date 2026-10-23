// Copies the MapLibre worker bundle into `public/` so the web build can serve it
// from the site root. MapLibre normally resolves the worker next to its own module
// via `import.meta.url`, which Metro does not support. Runs on postinstall and
// before `expo export`.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
const target = resolve(root, 'public/maplibre-gl-worker.mjs');

if (!existsSync(source)) {
  console.error(`[copy-maplibre-worker] missing ${source}. Run npm install first.`);
  process.exit(1);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log('[copy-maplibre-worker] public/maplibre-gl-worker.mjs updated');
