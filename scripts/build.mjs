/**
 * Stage a clean package for the Chrome Web Store.
 *
 *   node scripts/build.mjs
 *
 * Copies only what the extension needs to run into `dist/`, then reports the
 * exact zip command. Tests, build scripts, store copy and package.json are all
 * left out — shipping them bloats the upload and gives a reviewer more surface
 * to ask questions about.
 *
 * Zip the *contents* of dist/, not the folder: the Web Store expects
 * manifest.json at the root of the archive.
 */

import { cpSync, rmSync, mkdirSync, existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/** Everything the extension loads at runtime, and nothing else. */
const SHIP = ['manifest.json', 'background.js', 'content.js', 'keys.js', 'src', 'icons'];

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

// ─── Preflight: catch the things the Web Store rejects for ───────────────────

const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));

if (!manifest.icons?.['128']) fail('manifest has no 128x128 icon — the Web Store requires one');
if (!manifest.version) fail('manifest has no version');
if (!manifest.description) fail('manifest has no description');
if (manifest.description.length > 132) fail('description must be 132 characters or fewer');

for (const entry of SHIP) {
  if (!existsSync(join(ROOT, entry))) fail(`missing ${entry} — run scripts/make-icons.mjs first?`);
}

// ─── Stage ───────────────────────────────────────────────────────────────────

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

for (const entry of SHIP) {
  cpSync(join(ROOT, entry), join(DIST, entry), { recursive: true });
}

// ─── Report ──────────────────────────────────────────────────────────────────

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const full = join(dir, item.name);
    return item.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(DIST);
const bytes = files.reduce((sum, file) => sum + statSync(file).size, 0);

console.log(`\n  SF Nav Palette v${manifest.version}`);
console.log(`  ${files.length} files, ${(bytes / 1024).toFixed(1)} KB staged in dist/\n`);
for (const file of files.sort()) console.log(`    ${relative(DIST, file).replace(/\\/g, '/')}`);

console.log('\n  Next — zip the CONTENTS of dist/ (manifest.json must be at the archive root):\n');
console.log('    PowerShell:  Compress-Archive -Path dist/* -DestinationPath sf-nav-palette.zip -Force');
console.log('    bash/zip:    (cd dist && zip -r ../sf-nav-palette.zip .)\n');
