// Build step for Vercel: precompiles the JSX in index.html so browsers don't
// download and run the ~3 MB in-browser Babel compiler on every visit.
//
// Source of truth stays index.html (edit it exactly as before). This reads it,
// compiles + minifies the <script type="text/babel"> block with esbuild, drops
// the @babel/standalone <script> tag, and writes the result plus the static
// files to dist/, which Vercel serves (see vercel.json). api/ is unaffected.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const BABEL_BLOCK = /<script type="text\/babel"[^>]*>([\s\S]*?)<\/script>/;
const m = src.match(BABEL_BLOCK);
if (!m) throw new Error('build: no <script type="text/babel"> block found in index.html');

const compiled = esbuild.transformSync(m[1], {
  loader: 'jsx',          // classic runtime => React.createElement / React.Fragment, same as Babel's react preset
  target: 'es2020',
  minify: true,
  legalComments: 'none',
});

let html = src.replace(BABEL_BLOCK, () =>
  '<script>' + compiled.code.replace(/<\/script/gi, '<\\/script') + '</script>');

const BABEL_TAG = /<script src="https:\/\/unpkg\.com\/@babel\/standalone[^>]*><\/script>\r?\n?/;
if (!BABEL_TAG.test(html)) throw new Error('build: @babel/standalone <script> tag not found (expected to remove it)');
html = html.replace(BABEL_TAG, '');

if (/type="text\/babel"/.test(html) || /@babel\/standalone/.test(html)) {
  throw new Error('build: Babel references still present after build');
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, 'index.html'), html);

for (const f of ['ads.txt', 'robots.txt', 'favicon.png', 'logo.png']) {
  const from = path.join(ROOT, f);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(DIST, f));
}

const kb = n => (n / 1024).toFixed(0) + ' KB';
console.log(`build ok: index.html ${kb(src.length)} -> dist/index.html ${kb(html.length)} (app script ${kb(m[1].length)} -> ${kb(compiled.code.length)}), Babel standalone removed`);
