// Builds the CrazyGames upload: ONE self-contained index.html (styles, fonts, code, PeerJS and
// every data file embedded), zipped as crazygames/borderwise-crazygames.zip.
// It loads nothing else, so it works however the portal serves or frames the files.
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import * as esbuild from 'esbuild';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist'); fs.rmSync(DIST, { recursive: true, force: true }); fs.mkdirSync(DIST);
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// 1. code: bundle the ES modules into one classic script
const bundle = await esbuild.build({ entryPoints: [path.join(ROOT, 'js/main.js')], bundle: true, format: 'iife', minify: true, target: ['es2019'], write: false, legalComments: 'none' });
const js = bundle.outputFiles[0].text;
// 2. styles with the fonts inlined
const css = rd('css/style.css').replace(/url\('\.\.\/fonts\/([^']+)'\)/g, (_, f) => `url('data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, 'fonts', f)).toString('base64')}')`);
// 3. data files as inert JSON blocks
const dataFiles = []; const walk = (d) => { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { const p = d + '/' + e.name; if (e.isDirectory()) walk(p); else if (p.endsWith('.json')) dataFiles.push(p); } }; walk('data');
dataFiles.sort();
const safe = (s) => s.replace(/<\//g, '<\\/'); // never close the <script> early
const dataTags = dataFiles.map((p) => `<script type="application/json" data-path="${p}">${safe(JSON.stringify(JSON.parse(rd(p))))}</script>`).join('\n');
const peer = rd('js/vendor/peerjs.min.js').replace(/<\/script/gi, '<\\/script');
// 4. page
let html = rd('index.html');
html = html.replace(/<link rel="preload"[^>]*>\n?/, '');
html = html.replace('<link rel="stylesheet" href="css/style.css">', `<style>${css}</style>`);
html = html.replace('<script type="module" src="js/main.js"></script>', `${dataTags}\n<script>${peer}</script>\n<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
{ const m = html.match(/<(script|link|img)\b[^>]*\b(src|href)="(?!data:|https:)[^"]+"[^>]*>/); if (m) throw new Error('external reference left in index.html: ' + m[0]); }
fs.writeFileSync(path.join(DIST, 'index.html'), html);
// 5. zip (index.html at the root)
const zip = path.join(ROOT, 'crazygames', 'borderwise-crazygames.zip'); fs.rmSync(zip, { force: true });
execFileSync('python3', ['-c', `import zipfile; z=zipfile.ZipFile(${JSON.stringify(zip)},'w',zipfile.ZIP_DEFLATED,compresslevel=9); z.write(${JSON.stringify(path.join(DIST, 'index.html'))}, 'index.html'); z.close()`]);
console.log(`index.html ${(html.length / 1048576).toFixed(2)} MB (${dataFiles.length} data files embedded), zip ${(fs.statSync(zip).size / 1048576).toFixed(2)} MB -> ${zip}`);
