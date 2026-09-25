// /a/<id> — a real, crawlable page for every published article.
//
// The main site is a single-page app: article "URLs" are #hash fragments that
// search engines can't index, and the bare page this endpoint used to return
// (a meta-refresh stub) had nothing on it for Google to index either. Now this
// renders the full article server-side — title, summary, photo, sanitized
// body, Open Graph/Twitter tags for link previews, canonical URL and NewsArticle
// structured data — so each article can be found, indexed and shared on its own.
// Listed in /sitemap.xml (api/sitemap.js).

const SUPABASE_URL = "https://mmiegwjrzxbyguczcnku.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1taWVnd2pyenhieWd1Y3pjbmt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDc5NjUsImV4cCI6MjA5Nzg4Mzk2NX0.q53UjckFFquySvy46MYm1IXd8TZ4_eI1sbcjVecsV5Q";
const SITE = "https://sportfmtg.com";
const DEFAULT_IMAGE = SITE + "/logo.png";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function safeUrl(u){
  try { const x = new URL(String(u)); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : ''; }
  catch { return ''; }
}
function fmtDate(iso){
  try { return new Date(iso).toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric', timeZone:'UTC' }); }
  catch { return ''; }
}

// Built-in allowlist sanitizer for article HTML (no dependencies, so it behaves
// identically locally and on Vercel). It REBUILDS the markup instead of trying
// to strip bad parts: only the tags below survive, each with only the
// attributes listed; everything else — unknown tags, comments, scripts and
// their contents, every other attribute (all on* handlers, style, srcset…) —
// is dropped, and all text is escaped. Fails closed: anything it can't parse
// cleanly ends up as escaped text, never as markup. The page also sends a
// Content-Security-Policy with script-src 'none' as a second layer.
const ALLOWED_TAGS = new Set(['p','br','strong','b','em','i','u','a','ul','ol','li','blockquote','h2','h3','h4','img','figure','figcaption','hr']);
const VOID_TAGS = new Set(['br','hr','img']);
const DROP_WITH_CONTENT = /<(script|style|iframe|object|embed|noscript|template|svg|math|form|textarea|title|head)\b[\s\S]*?(?:<\/\1\s*>|$)/gi;

function safeHref(v){
  v = String(v == null ? '' : v).trim().replace(/&amp;/gi, '&');
  if (/&(?:#|colon|tab|newline)/i.test(v)) return '';        // entity-obfuscated schemes
  if (/[\u0000-\u0020\u007f-\u009f]/.test(v)) return '';      // whitespace / control chars anywhere
  if (!/^(?:https?:\/\/|mailto:|tel:)/i.test(v)) return '';    // literal allowed scheme only
  return v.length <= 2000 ? v : '';
}
function safeSrc(v){ const u = safeHref(v); return /^https?:\/\//i.test(u) ? u : ''; }
function escText(t){
  return String(t).replace(/&(?!(?:[a-zA-Z]{2,8}|#\d{1,7}|#x[0-9a-fA-F]{1,6});)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function parseAttrs(str){
  const out = {}; const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g; let m;
  while ((m = re.exec(str))) { const k = m[1].toLowerCase(); if (!(k in out)) out[k] = m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : ''; }
  return out;
}
function sanitizeBodyHtml(html){
  const cleaned = String(html).replace(DROP_WITH_CONTENT, '');
  const stack = []; let out = '';
  for (const tok of cleaned.split(/(<[^<>]*>)/)) {
    if (!tok) continue;
    if (tok[0] !== '<') { out += escText(tok); continue; }
    const m = tok.match(/^<(\/?)([a-zA-Z][a-zA-Z0-9]*)([\s\S]*?)\/?>$/);
    if (!m) continue;                                   // comment, doctype, junk
    const closing = m[1] === '/', name = m[2].toLowerCase();
    if (!ALLOWED_TAGS.has(name)) continue;
    if (closing) {
      if (VOID_TAGS.has(name)) continue;
      const i = stack.lastIndexOf(name); if (i < 0) continue;
      while (stack.length > i) out += '</' + stack.pop() + '>';
      continue;
    }
    const attrs = parseAttrs(m[3]);
    if (name === 'a') {
      const href = safeHref(attrs.href);
      if (!href) continue;
      out += '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">'; stack.push('a');
    } else if (name === 'img') {
      const src = safeSrc(attrs.src); if (!src) continue;
      out += '<img src="' + esc(src) + '" alt="' + esc(String(attrs.alt || '').slice(0, 200)) + '" loading="lazy">';
    } else if (VOID_TAGS.has(name)) {
      out += '<' + name + '>';
    } else { out += '<' + name + '>'; stack.push(name); }
  }
  while (stack.length) out += '</' + stack.pop() + '>';
  return out;
}

// Bodies are either HTML (from the editor) or plain text: blank-line
// separated paragraphs, with a line "[img: https://…]" meaning an image —
// the same two formats the site's own article view understands.
function renderBody(body){
  const text = String(body || '');
  if (/(<[a-z][^>]*>)/i.test(text)) return sanitizeBodyHtml(text);
  return text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(b => {
    const m = b.match(/^\[img:\s*(\S+?)\s*\]$/);
    if (m) { const u = safeUrl(m[1]); return u ? `<img src="${esc(u)}" alt="" loading="lazy">` : ''; }
    const linked = esc(b).replace(/(https?:\/\/[^\s<]+)/g, u => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
    return `<p>${linked.replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
}

const CSS = `
*{box-sizing:border-box}body{margin:0;font-family:'Barlow',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#14182a;background:#fff;line-height:1.65}
a{color:#0B245E}header.top{background:#0B245E;padding:14px 20px}header.top a{color:#fff;text-decoration:none;font-weight:800;letter-spacing:.04em;font-size:18px}
header.top span{color:#EF003F}main{max-width:760px;margin:0 auto;padding:28px 20px 60px}
.tag{display:inline-block;background:#EF003F;color:#fff;font-size:12px;font-weight:800;letter-spacing:.06em;padding:3px 10px;border-radius:4px;text-transform:uppercase}
h1{font-size:34px;line-height:1.15;margin:14px 0 10px;color:#0B245E}.dek{font-size:19px;color:#4a5168;margin:0 0 14px}
.by{font-size:13.5px;color:#6b7180;margin-bottom:22px}.hero{width:100%;height:auto;border-radius:12px;margin:0 0 24px;display:block}
.prose{font-size:18px}.prose p{margin:0 0 18px}.prose img{max-width:100%;height:auto;border-radius:10px;margin:8px 0 22px;display:block}
.cta{margin-top:36px;padding:18px 20px;background:#f4f6fb;border-radius:12px;font-size:15px}.cta a{font-weight:700}
footer{border-top:1px solid #e6e8ef;padding:22px 20px;text-align:center;font-size:13.5px;color:#6b7180}footer a{margin:0 8px}
@media(max-width:600px){h1{font-size:27px}.prose{font-size:17px}}`;

async function handler(req, res){
  const id = String((req.query && req.query.id) || '');

  let a = null;
  if (UUID_RE.test(id)) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/articles?id=eq.${id}&published=eq.true&limit=1` +
        `&select=id,title,dek,body,image_url,author,category,tag,read_time,created_at,updated_at`,
        { headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON } }
      );
      const rows = await r.json();
      a = Array.isArray(rows) ? rows[0] : null;
    } catch (e) { /* fall through to not-found */ }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'none'; img-src https: http: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; form-action 'none'");

  if (!a) {
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    res.status(404).send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Article introuvable — SportFM</title><meta name="robots" content="noindex"><style>${CSS}</style></head>
<body><header class="top"><a href="${SITE}/">SPORT<span>FM</span></a></header>
<main><h1>Article introuvable</h1><p>Cet article n'existe pas ou n'est plus disponible.</p><p><a href="${SITE}/">← Retour à SportFM</a></p></main></body></html>`);
    return;
  }

  const url = `${SITE}/a/${a.id}`;
  const image = safeUrl(a.image_url) || DEFAULT_IMAGE;
  const plain = String(a.body || '').replace(/<[^>]+>/g, ' ').replace(/\[img:[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
  const desc = (a.dek || plain.slice(0, 160) || 'SportFM — la référence sportive au Togo et en Afrique.').slice(0, 300);
  const author = a.author || 'Rédaction SportFM';
  const published = a.created_at ? new Date(a.created_at).toISOString() : undefined;
  const modified = a.updated_at ? new Date(a.updated_at).toISOString() : published;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: a.title,
    description: desc,
    image: [image],
    datePublished: published,
    dateModified: modified,
    author: { '@type': 'Person', name: author },
    publisher: { '@type': 'Organization', name: 'SportFM', logo: { '@type': 'ImageObject', url: DEFAULT_IMAGE } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: 'fr',
  };

  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400');
  res.status(200).send(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(a.title)} — SportFM</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/png" href="/favicon.png">
<meta property="og:type" content="article">
<meta property="og:site_name" content="SportFM">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${esc(a.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(url)}">
${published ? `<meta property="article:published_time" content="${esc(published)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(a.title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<header class="top"><a href="${SITE}/">SPORT<span>FM</span> 91.9</a></header>
<main>
  <article>
    ${a.tag || a.category ? `<span class="tag">${esc(a.tag || a.category)}</span>` : ''}
    <h1>${esc(a.title)}</h1>
    ${a.dek ? `<p class="dek">${esc(a.dek)}</p>` : ''}
    <div class="by">${esc(author)}${a.read_time ? ' · ' + esc(a.read_time) : ''}${a.created_at ? ' · ' + esc(fmtDate(a.created_at)) : ''}</div>
    ${safeUrl(a.image_url) ? `<img class="hero" src="${esc(safeUrl(a.image_url))}" alt="${esc(a.title)}">` : ''}
    <div class="prose">
${renderBody(a.body)}
    </div>
  </article>
  <div class="cta">⚽ Plus d'actualités, résultats en direct et la radio 91.9 FM : <a href="${SITE}/">retrouvez tout SportFM</a> — ou <a href="${SITE}/#article=${esc(a.id)}">lisez et commentez cet article sur le site</a>.</div>
</main>
<footer>© SportFM · Lomé, Togo · <a href="${SITE}/">Accueil</a> · <a href="https://www.youtube.com/@sportfmtg/videos">YouTube</a> · <a href="https://www.instagram.com/sportfmtg/">Instagram</a> · <a href="https://www.tiktok.com/@sportfmtg">TikTok</a></footer>
</body>
</html>`);
}

module.exports = async (req, res) => {
  try { await handler(req, res); }
  catch (e) {
    // Never leave a bare platform error page; keep a short reason in a header so it's diagnosable.
    try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Share-Error', String(e && e.message || e).replace(/[^\x20-\x7e]/g, ' ').slice(0, 180));
      res.status(500).send('<!doctype html><meta charset="utf-8"><title>Erreur — SportFM</title><p>Une erreur est survenue. <a href="' + SITE + '/">Retour à SportFM</a></p>');
    } catch (_) {}
  }
};
