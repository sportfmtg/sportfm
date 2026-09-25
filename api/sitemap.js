// /sitemap.xml — the home page plus every published article's /a/<id> page,
// so search engines can discover them (the SPA has no crawlable article links).

const SUPABASE_URL = "https://mmiegwjrzxbyguczcnku.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1taWVnd2pyenhieWd1Y3pjbmt1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMDc5NjUsImV4cCI6MjA5Nzg4Mzk2NX0.q53UjckFFquySvy46MYm1IXd8TZ4_eI1sbcjVecsV5Q";
const SITE = "https://sportfmtg.com";
const PAGE = 1000;       // Supabase's per-request row cap
const MAX_PAGES = 40;    // safety cap: 40,000 articles (sitemaps allow 50,000 URLs)

const xmlEsc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

module.exports = async (req, res) => {
  const rows = [];
  try {
    for (let p = 0; p < MAX_PAGES; p++) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/articles?published=eq.true&select=id,created_at,updated_at&order=created_at.desc`,
        { headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON, Range: `${p * PAGE}-${p * PAGE + PAGE - 1}` } }
      );
      const page = await r.json();
      if (!Array.isArray(page) || page.length === 0) break;
      rows.push(...page);
      if (page.length < PAGE) break;
    }
  } catch (e) { /* serve what we have — at least the home page */ }

  const urls = [`  <url><loc>${SITE}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`];
  for (const a of rows) {
    const last = a.updated_at || a.created_at;
    urls.push(`  <url><loc>${SITE}/a/${xmlEsc(a.id)}</loc>${last ? `<lastmod>${new Date(last).toISOString()}</lastmod>` : ''}</url>`);
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
};
