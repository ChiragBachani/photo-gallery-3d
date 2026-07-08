// Copies a curated selection of photos from the Photography Portfolio Site,
// downscales them to max 1280px with sips (macOS built-in), and writes
// public/gallery-data.json describing every photo (room, caption, aspect).
// Originals are never modified.

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', '..', 'Photography Portfolio Site', 'src', 'photos');
const OUT = join(__dirname, '..', 'public', 'photos');
const MAX_PX = 1280;
const QUALITY = 'normal'; // sips jpeg quality preset

const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));

// room key -> { folder(s), count } — first N files from manifest order
const selection = [
  { room: 'recognized', folder: 'recognized-works', count: 7 },
  { room: 'astro', folder: 'astrophotography', count: 12 },
  { room: 'concerts', folder: 'concerts', count: 12 },
  { room: 'travel', folder: 'travel-new-zealand', count: 4, section: 'New Zealand' },
  { room: 'travel', folder: 'travel-australia', count: 4, section: 'Australia' },
  { room: 'travel', folder: 'travel-kenya', count: 4, section: 'Kenya' },
  { room: 'travel', folder: 'travel-tanzania', count: 4, section: 'Tanzania' },
  { room: 'travel', folder: 'travel-israel', count: 4, section: 'Israel' },
  { room: 'travel', folder: 'travel-jordan', count: 4, section: 'Jordan' },
  { room: 'portraits', folder: 'headshots', count: 8, section: 'Headshots' },
  { room: 'portraits', folder: 'senior-pictures', count: 6, section: 'Senior Pictures' },
  { room: 'culture', folder: 'indian-culture', count: 6 },
];

const captionByFolder = {
  'recognized-works': 'Recognized Works',
  astrophotography: 'Astrophotography',
  concerts: 'Concerts',
  headshots: 'Headshots',
  'senior-pictures': 'Senior & Grad Pictures',
  'indian-culture': 'Indian Culture in America',
};

if (existsSync(OUT)) rmSync(OUT, { recursive: true });
mkdirSync(OUT, { recursive: true });

function sipsProps(file) {
  const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' });
  const w = Number(out.match(/pixelWidth: (\d+)/)[1]);
  const h = Number(out.match(/pixelHeight: (\d+)/)[1]);
  return { w, h };
}

const photos = [];
let idx = 0;
for (const sel of selection) {
  const files = (manifest[sel.folder] || []).slice(0, sel.count);
  if (files.length < sel.count) console.warn(`warn: ${sel.folder} has only ${files.length} files`);
  for (const f of files) {
    const src = join(SRC, sel.folder, f);
    const outName = `${String(idx).padStart(3, '0')}.jpg`;
    const dst = join(OUT, outName);
    // resample so the longest edge is MAX_PX (never upscales beyond source much; fine for textures)
    execFileSync('sips', ['-Z', String(MAX_PX), '-s', 'format', 'jpeg', '-s', 'formatOptions', QUALITY, src, '--out', dst], { stdio: 'ignore' });
    const { w, h } = sipsProps(dst);
    photos.push({
      file: `photos/${outName}`,
      w, h,
      room: sel.room,
      section: sel.section || null,
      caption: sel.section ? `${sel.section}` : captionByFolder[sel.folder],
    });
    idx++;
  }
}

writeFileSync(join(__dirname, '..', 'public', 'gallery-data.json'), JSON.stringify({ photos }, null, 1));
console.log(`prepared ${photos.length} photos -> public/photos`);
