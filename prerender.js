// Crawlable, JavaScript-free HTML for build.js.
//
// Why this exists: the site is a single-page app — every article, score and
// show is drawn by JavaScript after the page loads. Without JS (or before it
// runs), the homepage used to be ~50 words ending in "Chargement du site…",
// which is exactly what AdSense rejects as "ads on screens without publisher
// content / under construction". So at build time we fetch real content and
// write it into the page itself:
//
//   homeRoot()     -> goes inside <div id="root"> of index.html. React clears
//                     it and mounts the full app as soon as JS runs; people and
//                     crawlers both get the same HTML first (no cloaking).
//   staticPage()   -> standalone pages: /a-propos, /contact, /confidentialite.
//
// Content comes from Supabase at build time (every deploy). If the fetch fails
// the build still succeeds, just without the article/show lists.

const SITE = 'https://sportfmtg.com';
const EMAIL = 'radiosportfmtg@gmail.com';
const PHONE_DISPLAY = '+228 92 03 60 31';
const PHONE_TEL = '+22892036031';
const SOCIAL = [
  ['YouTube', 'https://www.youtube.com/@sportfmtg/videos'],
  ['Instagram', 'https://www.instagram.com/sportfmtg/'],
  ['TikTok', 'https://www.tiktok.com/@sportfmtg'],
];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function httpsUrl(u) {
  try { const x = new URL(String(u)); return x.protocol === 'https:' ? x.href : ''; } catch { return ''; }
}
function oneLine(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
function fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); }
  catch { return ''; }
}

async function fetchJson(url, key) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, { headers: { apikey: key, Authorization: 'Bearer ' + key }, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!Array.isArray(j)) throw new Error('unexpected response');
    return j;
  } finally { clearTimeout(t); }
}

async function loadContent(supabaseUrl, anonKey) {
  const out = { articles: [], shows: [], warnings: [] };
  try {
    out.articles = await fetchJson(
      `${supabaseUrl}/rest/v1/articles?published=eq.true&order=created_at.desc&limit=30` +
      `&select=id,title,dek,tag,category,author,created_at,image_url`, anonKey);
  } catch (e) { out.warnings.push('articles: ' + e.message); }
  try {
    out.shows = await fetchJson(
      `${supabaseUrl}/rest/v1/shows?order=sort_order.asc&select=name,tag,schedule,description`, anonKey);
  } catch (e) { out.warnings.push('shows: ' + e.message); }
  return out;
}

const ABOUT_HTML = `
<p>SportFM est la radio sportive de référence au Togo. Depuis 25 ans, notre équipe couvre à l'antenne sur <strong>91.9 FM</strong> à Lomé,
sur ce site et sur nos réseaux sociaux l'actualité du football togolais et africain, les compétitions internationales et
l'ensemble des disciplines sportives : handball, basket, athlétisme, sports de combat et bien d'autres.</p>
<p>Nos journalistes publient chaque jour des articles, interviews, résultats et classements, et nos émissions donnent la parole
aux acteurs du sport et aux auditeurs, en français et en langues nationales (éwé, mina, tem et plus).</p>`;

function contactBlock() {
  return `<p><strong>E-mail :</strong> <a href="mailto:${EMAIL}">${EMAIL}</a><br>
<strong>Téléphone :</strong> <a href="tel:${PHONE_TEL}">${PHONE_DISPLAY}</a><br>
<strong>Studio :</strong> Lomé, Togo — 91.9 FM</p>
<p>Suivez-nous : ${SOCIAL.map(([n, u]) => `<a href="${u}" rel="noopener">${n}</a>`).join(' · ')}</p>`;
}

function showsList(shows) {
  if (!shows.length) return '';
  return `<ul class="pr-shows">${shows.map(s => `
  <li><strong>${esc(oneLine(s.name))}</strong>${s.schedule ? ` — <span class="pr-meta">${esc(oneLine(s.schedule))}</span>` : ''}${
    s.description ? `<br><span>${esc(oneLine(s.description))}</span>` : ''}</li>`).join('')}
</ul>`;
}

const FOOTER_LINKS = `<a href="/">Accueil</a> · <a href="/a-propos">À propos</a> · <a href="/contact">Contact</a> · <a href="/confidentialite">Confidentialité</a>`;

// ---------- homepage content inside #root ----------
function homeRoot({ articles, shows }) {
  const cards = articles.map(a => {
    const img = httpsUrl(a.image_url);
    const meta = [a.author ? esc(oneLine(a.author)) : 'Rédaction SportFM', a.created_at ? esc(fmtDate(a.created_at)) : '', esc(oneLine(a.tag || a.category))].filter(Boolean).join(' · ');
    return `
    <article class="pr-card">
      ${img ? `<a href="/a/${esc(a.id)}" tabindex="-1" aria-hidden="true"><img src="${esc(img)}" alt="" loading="lazy" decoding="async" width="160" height="100"></a>` : ''}
      <div>
        <h3><a href="/a/${esc(a.id)}">${esc(oneLine(a.title))}</a></h3>
        ${a.dek ? `<p>${esc(oneLine(a.dek))}</p>` : ''}
        <div class="pr-meta">${meta}</div>
      </div>
    </article>`;
  }).join('');

  return `
  <!-- Pre-rendered at build time (prerender.js): real content for people and
       crawlers before JavaScript runs. React replaces it when the app mounts. -->
  <div id="prerender">
  <style>
    #prerender{font-family:'Barlow',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#14182a;line-height:1.55;background:#fff}
    #prerender a{color:#0B245E}
    #prerender .pr-top{background:#0B245E;color:#fff;padding:14px 20px}
    #prerender .pr-top a{color:#fff;text-decoration:none;font-weight:800;letter-spacing:.04em;font-size:18px}
    #prerender .pr-top span{color:#EF003F}
    #prerender .pr-top nav{margin-top:6px;font-size:14px}
    #prerender .pr-top nav a{font-weight:600;font-size:14px;margin-right:14px}
    #prerender main{max-width:980px;margin:0 auto;padding:24px 20px 40px}
    #prerender h1{font-size:28px;line-height:1.2;margin:0 0 12px;color:#0B245E}
    #prerender h2{font-size:21px;margin:32px 0 12px;color:#0B245E}
    #prerender .pr-card{display:flex;gap:14px;padding:12px 0;border-bottom:1px solid #eef0f4}
    #prerender .pr-card img{width:160px;height:100px;object-fit:cover;border-radius:8px;flex-shrink:0;background:#eef0f4}
    #prerender .pr-card h3{font-size:17px;margin:0 0 4px;line-height:1.3}
    #prerender .pr-card p{margin:0 0 4px;font-size:15px;color:#3a3f4a}
    #prerender .pr-meta{font-size:13px;color:#6b7180}
    #prerender .pr-shows{padding-left:18px}#prerender .pr-shows li{margin-bottom:8px}
    #prerender footer{border-top:1px solid #e6e8ef;padding:20px;text-align:center;font-size:14px;color:#6b7180}
    @media(max-width:600px){#prerender .pr-card img{width:96px;height:64px}}
  </style>
  <header class="pr-top">
    <a href="/">SPORT<span>FM</span> 91.9</a>
    <nav><a href="#actualites">Actualités</a><a href="#emissions">Émissions</a><a href="/a-propos">À propos</a><a href="/contact">Contact</a></nav>
  </header>
  <main>
    <h1>SportFM 91.9 FM — la radio sportive de référence au Togo et en Afrique</h1>
    ${ABOUT_HTML}
    ${articles.length ? `<h2 id="actualites">Dernières actualités</h2>${cards}` : ''}
    ${shows.length ? `<h2 id="emissions">Nos émissions</h2>${showsList(shows)}` : ''}
    <h2>Nous contacter</h2>
    ${contactBlock()}
  </main>
  <footer>© SportFM · Lomé, Togo · ${FOOTER_LINKS}</footer>
  </div>`;
}

// ---------- standalone static pages ----------
const PAGE_CSS = `*{box-sizing:border-box}body{margin:0;font-family:'Barlow',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#14182a;background:#fff;line-height:1.65}
a{color:#0B245E}header.top{background:#0B245E;padding:14px 20px}header.top a{color:#fff;text-decoration:none;font-weight:800;letter-spacing:.04em;font-size:18px}
header.top span{color:#EF003F}main{max-width:760px;margin:0 auto;padding:28px 20px 60px}
.kicker{font-size:13px;font-weight:800;letter-spacing:.08em;color:#EF003F;text-transform:uppercase}
h1{font-size:32px;line-height:1.15;margin:8px 0 14px;color:#0B245E}h2{font-size:20px;margin:28px 0 8px;color:#0B245E}
p,li{font-size:16.5px}.muted{color:#6b7180;font-size:14px}.cta{margin-top:30px;padding:16px 18px;background:#f4f6fb;border-radius:12px}
footer{border-top:1px solid #e6e8ef;padding:22px 20px;text-align:center;font-size:14px;color:#6b7180}
@media(max-width:600px){h1{font-size:26px}}`;

function staticPage({ path, title, description, kicker, h1, body }) {
  const url = SITE + path;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/png" href="/favicon.png">
<meta property="og:type" content="website"><meta property="og:site_name" content="SportFM">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/logo.png">
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${PAGE_CSS}</style>
</head>
<body>
<header class="top"><a href="/">SPORT<span>FM</span> 91.9</a></header>
<main>
<div class="kicker">${esc(kicker)}</div>
<h1>${esc(h1)}</h1>
${body}
</main>
<footer>© SportFM · Lomé, Togo · ${FOOTER_LINKS}</footer>
</body>
</html>
`;
}

function aboutPage({ shows }) {
  return staticPage({
    path: '/a-propos', title: 'À propos de SportFM — 91.9 FM, Lomé',
    description: 'SportFM 91.9 FM, la radio sportive de référence au Togo depuis 25 ans : actualités, résultats, classements et émissions sportives.',
    kicker: 'À propos', h1: 'SportFM, la voix du sport au Togo',
    body: `${ABOUT_HTML}
<h2>Ce que vous trouverez sur SportFM</h2>
<ul>
<li>L'actualité sportive du Togo et du continent africain, publiée chaque jour par notre rédaction.</li>
<li>Les résultats et classements des championnats togolais (D1, D2) et des grandes compétitions.</li>
<li>La radio en direct sur 91.9 FM et sur le site, avec nos émissions de débat, magazines et directs.</li>
<li>Des interviews, portraits et reportages au plus près des clubs, des athlètes et des supporters.</li>
</ul>
${shows.length ? `<h2>Nos émissions</h2>${showsList(shows)}` : ''}
<h2>Nous contacter</h2>
${contactBlock()}
<div class="cta">⚽ <a href="/">Retrouvez toute l'actualité sur la page d'accueil</a> · <a href="/contact">Écrire à la rédaction</a></div>`,
  });
}

function contactPage() {
  return staticPage({
    path: '/contact', title: 'Contact — SportFM 91.9 FM',
    description: 'Contactez la rédaction de SportFM 91.9 FM à Lomé : e-mail, téléphone, réseaux sociaux, publicité et partenariats.',
    kicker: 'Contact', h1: 'Contactez SportFM',
    body: `<p>Une question, une information, une suggestion d'article ou d'émission ? Notre équipe vous répond.</p>
${contactBlock()}
<h2>Formulaire de contact</h2>
<p>Vous pouvez aussi nous écrire directement depuis le site : <a href="/#contact">ouvrir le formulaire de contact</a>.</p>
<h2>Publicité et partenariats</h2>
<p>Annonceurs et entreprises : <a href="/#spot">réservez un spot radio</a> sur le 91.9 FM ou <a href="/#partenaire">devenez partenaire de SportFM</a>.</p>
<p class="muted">Pour toute question sur vos données personnelles, consultez notre <a href="/confidentialite">politique de confidentialité</a>.</p>`,
  });
}

function privacyPage() {
  return staticPage({
    path: '/confidentialite', title: 'Politique de confidentialité — SportFM',
    description: 'Comment SportFM (sportfmtg.com) collecte et utilise vos données : formulaires, mesure d\'audience, cookies et publicité.',
    kicker: 'Confidentialité', h1: 'Politique de confidentialité',
    body: `<p class="muted">Dernière mise à jour : 27 septembre 2026</p>
<h2>Qui sommes-nous</h2>
<p>SportFM (91.9 FM, Lomé, Togo) édite le site sportfmtg.com : actualités sportives, résultats, classements, émissions et écoute de la radio en direct. Pour toute question sur vos données, écrivez-nous à <a href="mailto:${EMAIL}">${EMAIL}</a> ou via notre <a href="/contact">page Contact</a>.</p>
<h2>Les données que nous recevons</h2>
<p><strong>Formulaires.</strong> Quand vous nous écrivez (Contact), réservez un spot, devenez partenaire ou commentez un article, nous enregistrons ce que vous saisissez : nom, e-mail, téléphone (si fourni), message et, pour les demandes commerciales, les détails de votre projet. Ces données servent uniquement à vous répondre et à traiter votre demande.</p>
<p><strong>Cookies et outils tiers.</strong> La mesure d'audience décrite ci-dessous est active pour tous les visiteurs. Pour le suivi des erreurs et la publicité, une bannière vous demande, lors de votre première visite, d'accepter ou de refuser ces outils ; s'ils sont refusés, aucun d'eux n'est chargé et le site fonctionne normalement. Vous pouvez changer d'avis à tout moment via le lien « Cookies » en bas de page du site.</p>
<p><strong>Mesure d'audience.</strong> Nous utilisons Google Analytics pour comprendre comment le site est utilisé (pages vues, parcours) afin de l'améliorer. Il est actif pour tous les visiteurs ; votre adresse IP est anonymisée, la personnalisation publicitaire est désactivée, et des cookies de mesure peuvent être déposés sur votre appareil. Vous pouvez vous y opposer en installant le <a href="https://tools.google.com/dlpage/gaoptout" rel="noopener">module de désactivation de Google Analytics</a>. Avec votre accord uniquement, nous utilisons en complément PostHog, un second outil de mesure d'audience.</p>
<p><strong>Suivi des erreurs.</strong> Avec votre accord, nous utilisons Sentry pour détecter les bugs techniques ; il peut enregistrer des informations sur les erreurs rencontrées et, le cas échéant, une relecture anonymisée de la session. L'équipe qui utilise l'espace d'administration est également suivie par Sentry pour les erreurs de cet outil interne.</p>
<p><strong>Publicité.</strong> Avec votre accord, le site charge le service Google AdSense. Google et ses partenaires peuvent utiliser des cookies pour diffuser des annonces en fonction de vos visites sur ce site et sur d'autres sites. Vous pouvez désactiver la publicité personnalisée dans les <a href="https://adssettings.google.com" rel="noopener">paramètres des annonces Google</a> et en savoir plus sur <a href="https://policies.google.com/technologies/ads" rel="noopener">l'utilisation des données par Google</a>.</p>
<p><strong>Stockage sur votre appareil.</strong> Pour accélérer le site, nous gardons localement un cache des articles récents ; nous retenons aussi votre choix concernant les cookies, le nom que vous utilisez pour commenter, et un identifiant aléatoire de session (sans lien avec votre identité) qui sert à compter les visiteurs présents.</p>
<h2>Hébergement et prestataires</h2>
<p>Le site est hébergé par Vercel ; les données des formulaires sont stockées chez Supabase. Les prestataires cités ci-dessus (PostHog, Sentry, Google) traitent des données pour notre compte ou selon leurs propres politiques.</p>
<h2>Durée de conservation</h2>
<p>Nous conservons vos données le temps nécessaire aux finalités décrites ci-dessus, puis les supprimons ou les anonymisons.</p>
<h2>Vos droits</h2>
<p>Vous pouvez demander l'accès, la rectification ou la suppression des données vous concernant, ou vous opposer à leur traitement, en nous écrivant à <a href="mailto:${EMAIL}">${EMAIL}</a>. Nous ne vendons pas vos données personnelles.</p>
<h2>Modifications</h2>
<p>Cette politique peut évoluer ; la date de dernière mise à jour figure en haut de cette page.</p>`,
  });
}

module.exports = { loadContent, homeRoot, aboutPage, contactPage, privacyPage };
