// Serves an HTML shell with per-article Open Graph tags so link
// previews on Facebook/WhatsApp show the article's title, summary and
// photo instead of the generic SportFM homepage. Crawlers don't run
// JS, so this must be a real server response — the SPA can't do it.
// Real visitors are bounced into the app via meta-refresh + JS redirect.

const SUPABASE_URL = "https://mmiegwjrzxbyguczcnku.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1taWVnd2pyenhieWd1Y3pjbmt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDc5NjUsImV4cCI6MjA5Nzg4Mzk2NX0.q53UjckFFquySvy46MYm1IXd8TZ4_eI1sbcjVecsV5Q";
const SITE = "https://sportfmtg.com";
const DEFAULT_IMAGE = SITE + "/logo.png";

function esc(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

module.exports = async (req, res) => {
  const id = (req.query.id || '').toString();
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  let title = 'SportFM — 91.9 FM';
  let desc = 'La référence sport au Togo — radio, web et réseaux sociaux.';
  let image = DEFAULT_IMAGE;
  let target = SITE + '/';

  if (uuidRe.test(id)) {
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/articles?id=eq.${id}&select=title,dek,image_url&published=eq.true`,
        { headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON } }
      );
      const rows = await r.json();
      const a = Array.isArray(rows) ? rows[0] : null;
      if (a) {
        title = a.title || title;
        desc = a.dek || desc;
        image = a.image_url || DEFAULT_IMAGE;
        target = `${SITE}/#article=${id}`;
      }
    } catch (e) { /* fall back to defaults */ }
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
  res.status(200).send(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="SportFM">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(target)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
<script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
<p>Redirection vers <a href="${esc(target)}">${esc(title)}</a>…</p>
</body>
</html>`);
};
