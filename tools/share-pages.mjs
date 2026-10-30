// Makes a small page for every published issue at /i/<num>/ so a shared link shows that issue's cover and title
// (WhatsApp, iMessage and Google don't run the site's JavaScript and ignore everything after the #).
// People who open one get sent straight on to the real issue at /#<num>.
// Also writes sitemap.xml. Run from the site folder: node tools/share-pages.mjs
// The share-pages GitHub robot runs this every hour and commits whatever changed.
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";

const SITE = "https://community-corner.org";
const DB = "https://yamagpbcprjeltjbukad.supabase.co";
const KEY = "sb_publishable_gQ3GGYaJV8Q3nxx2uI7O_g_v2TAr1G3";   // the public key the site itself uses
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const when = (d) => d ? new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";

const res = await fetch(`${DB}/rest/v1/issues?select=num,title,date,hebrew,fun,columns&published=eq.true&order=num.desc`, { headers: { apikey: KEY } });
if (!res.ok) throw new Error(`Supabase said ${res.status}`);
const issues = await res.json();
if (!issues.length) throw new Error("No issues came back: not touching anything");

function page(i) {
  const name = `Community Corner #${i.num}${i.title ? ": " + i.title : ""}`;
  const cover = `${DB}/storage/v1/object/public/issues/${i.num}/cover.jpg`;
  const url = `${SITE}/i/${i.num}/`;
  const cols = (i.columns || []).map((c) => c.name).filter(Boolean);
  const q = i.fun?.parsha?.question;
  const desc = [`The weekly paper for Pomona, Monsey, Wesley Hills and Montebello${i.hebrew ? ", " + i.hebrew : ""}.`,
    cols.length ? `Inside: ${cols.slice(0, 6).join(", ")}.` : "", q ? `Parsha Question: ${q}` : ""].filter(Boolean).join(" ").slice(0, 300);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="The Community Corner">
<meta property="og:title" content="${esc(name)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${cover}">
<meta property="og:image:width" content="720">
<meta property="og:image:height" content="960">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "PublicationIssue", issueNumber: String(i.num), name, datePublished: i.date || undefined, image: cover, url, isPartOf: { "@type": "Periodical", name: "The Community Corner", url: SITE } }).replace(/</g, "\\u003c")}</script>
<script>location.replace("/#${i.num}")</script>
<style>body{margin:0;background:#0B1F3A;color:#fff;font:600 17px/1.5 Arial,sans-serif;text-align:center;padding:40px 16px}img{width:min(320px,80vw);border:4px solid #fff;display:block;margin:0 auto 20px}h1{margin:0 0 6px;font-size:30px}a{display:inline-block;margin-top:18px;background:#F2D06B;color:#0B1F3A;padding:14px 26px;text-decoration:none;font-weight:800}</style>
</head><body>
<img src="${cover}" alt="Cover of issue ${i.num}" width="720" height="960">
<h1>${esc(name)}</h1>
<p>${esc([when(i.date), i.hebrew].filter(Boolean).join(" · "))}</p>
${cols.length ? `<p>Inside: ${esc(cols.join(", "))}</p>` : ""}
<a href="/#${i.num}">Read this issue</a>
</body></html>
`;
}

let changed = 0;
const keep = new Set();
for (const i of issues) {
  const dir = `i/${i.num}`, file = `${dir}/index.html`, html = page(i);
  keep.add(String(i.num));
  if (existsSync(file) && readFileSync(file, "utf8") === html) continue;
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, html);
  changed++;
}
// an issue that was unpublished loses its page
if (existsSync("i")) for (const d of readdirSync("i")) if (!keep.has(d)) { rmSync(`i/${d}`, { recursive: true }); changed++; }

const today = new Date().toISOString().slice(0, 10);
const urls = [{ loc: `${SITE}/`, mod: issues[0].date || today }, ...issues.map((i) => ({ loc: `${SITE}/i/${i.num}/`, mod: i.date }))];
writeFileSync("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc>${u.mod ? `<lastmod>${u.mod}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`);
console.log(`${issues.length} issues, ${changed} share pages written or removed`);
