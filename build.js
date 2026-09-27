// Build step for Vercel.
//
// 1. Precompiles the JSX in index.html so browsers don't download and run the
//    ~3 MB in-browser Babel compiler on every visit.
// 2. Pre-renders real content (latest articles, shows, about, contact) into
//    <div id="root"> so the page has content before/without JavaScript — see
//    prerender.js for why (AdSense "screens without publisher-content").
// 3. Generates the static pages /a-propos, /contact and /confidentialite.
//
// Source of truth stays index.html (edit it exactly as before). Output goes to
// dist/, which Vercel serves (see vercel.json). api/ is unaffected.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const pre = require('./prerender');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');

(async () => {
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

  // ---- 1. compile JSX ----
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

  // ---- 2. pre-render content into #root ----
  const supaUrl = (src.match(/const SUPABASE_URL\s*=\s*"([^"]+)"/) || [])[1];
  const supaKey = (src.match(/const SUPABASE_ANON\s*=\s*"([^"]+)"/) || [])[1];
  const content = (supaUrl && supaKey)
    ? await pre.loadContent(supaUrl, supaKey)
    : { articles: [], shows: [], warnings: ['Supabase config not found in index.html'] };
  for (const w of content.warnings) console.warn('build: prerender warning —', w);

  const ROOT_BLOCK = /<div id="root">[\s\S]*?<\/div>(\s*<script>)/;
  if (!ROOT_BLOCK.test(html)) throw new Error('build: <div id="root"> block not found');
  html = html.replace(ROOT_BLOCK, (_, after) => `<div id="root">${pre.homeRoot(content)}\n</div>${after}`);

  // ---- 3. write output ----
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, 'index.html'), html);
  fs.writeFileSync(path.join(DIST, 'a-propos.html'), pre.aboutPage(content));
  fs.writeFileSync(path.join(DIST, 'contact.html'), pre.contactPage());
  fs.writeFileSync(path.join(DIST, 'confidentialite.html'), pre.privacyPage());

  for (const f of ['ads.txt', 'robots.txt', 'favicon.png', 'logo.png']) {
    const from = path.join(ROOT, f);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(DIST, f));
  }

  const kb = n => (n / 1024).toFixed(0) + ' KB';
  console.log(`build ok: index.html ${kb(src.length)} -> dist/index.html ${kb(html.length)} (app script ${kb(m[1].length)} -> ${kb(compiled.code.length)}), ` +
    `prerendered ${content.articles.length} articles + ${content.shows.length} shows, static pages: a-propos, contact, confidentialite`);
})().catch(e => { console.error(e); process.exit(1); });
