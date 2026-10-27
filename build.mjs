import { mkdir, readFile, readdir, rm, writeFile, cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const contentDir = join(root, "content");
const distDir = join(root, "dist");

const REQUIRED = [
  "home",
  "about",
  "mission",
  "guidelines",
  "help",
  "safety",
  "terms",
  "privacy",
  "delete-account",
  "contact",
];

const PRIMARY = ["about", "mission", "guidelines", "help"];

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeUrl(url) {
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) return url;
  if (url.startsWith("https://") && !url.includes(" ")) return url;
  return null;
}

function inline(raw) {
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let out = "";
  let last = 0;
  for (const match of raw.matchAll(re)) {
    out += escapeHtml(raw.slice(last, match.index));
    if (match[1] != null) {
      out += `<strong>${escapeHtml(match[1])}</strong>`;
    } else {
      const href = safeUrl(match[3]);
      const label = escapeHtml(match[2]);
      out += href ? `<a href="${escapeHtml(href)}">${label}</a>` : label;
    }
    last = match.index + match[0].length;
  }
  out += escapeHtml(raw.slice(last));
  return out;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replaceAll("'", "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseFile(text, file) {
  const src = text.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  if (!src.startsWith("---\n")) throw new Error(`${file}: missing frontmatter`);
  const end = src.indexOf("\n---\n", 4);
  if (end === -1) throw new Error(`${file}: unterminated frontmatter`);
  const meta = {};
  for (const line of src.slice(4, end).split("\n")) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx === -1) throw new Error(`${file}: bad frontmatter line "${line}"`);
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[line.slice(0, idx).trim()] = value;
  }
  return { meta, body: src.slice(end + 5).trim() };
}

function renderBlocks(body) {
  const lines = body.split("\n");
  const blocks = [];
  let i = 0;
  const ids = new Set();

  function takeWhile(test) {
    const group = [];
    while (i < lines.length && test(lines[i])) group.push(lines[i++]);
    return group;
  }

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    if (line.startsWith("### ")) {
      blocks.push({ type: "h3", html: `<h3>${inline(line.slice(4).trim())}</h3>` });
      i += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      const text = line.slice(3).trim();
      let id = slugify(text) || "section";
      let n = 2;
      while (ids.has(id)) id = `${slugify(text)}-${n++}`;
      ids.add(id);
      blocks.push({ type: "h2", id, html: `<h2>${inline(text)}</h2>` });
      i += 1;
      continue;
    }
    if (line.startsWith("> ")) {
      const quote = takeWhile((entry) => entry.startsWith("> "))
        .map((entry) => entry.slice(2).trim())
        .join(" ");
      const banner = blocks.length === 0;
      blocks.push({
        type: "quote",
        html: `<blockquote class="${banner ? "banner" : "quote"}">${inline(quote)}</blockquote>`,
      });
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items = takeWhile((entry) => /^\d+\.\s+/.test(entry));
      const lis = items
        .map((entry) => `<li>${inline(entry.replace(/^\d+\.\s+/, ""))}</li>`)
        .join("");
      blocks.push({ type: "ol", html: `<ol>${lis}</ol>` });
      continue;
    }
    if (line.startsWith("- ")) {
      const items = takeWhile((entry) => entry.startsWith("- "));
      const lis = items.map((entry) => `<li>${inline(entry.slice(2))}</li>`).join("");
      blocks.push({ type: "ul", html: `<ul>${lis}</ul>` });
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^#{2,3} |^> |^- |\d+\.\s+/.test(lines[i])) {
      para.push(lines[i].trim());
      i += 1;
    }
    const text = para.join(" ");
    const warning = text.startsWith("**IMPORTANT:**") || text.startsWith("IMPORTANT:");
    blocks.push({
      type: "p",
      html: `<p${warning ? ' class="warning"' : ""}>${inline(text)}</p>`,
    });
  }
  return blocks;
}

function assemble(blocks, help) {
  if (!help) return blocks.map((block) => block.html).join("\n");
  let html = "";
  let i = 0;
  while (i < blocks.length && blocks[i].type !== "h2") html += `${blocks[i++].html}\n`;
  while (i < blocks.length) {
    const head = blocks[i++];
    let inner = head.html;
    while (i < blocks.length && blocks[i].type !== "h2") inner += blocks[i++].html;
    html += `<section id="${head.id}" data-help-section>${inner}</section>\n`;
  }
  return html;
}

function formatDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`bad date ${iso}`);
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) throw new Error(`bad date ${iso}`);
  return `${Number(match[3])} ${month} ${match[1]}`;
}

function hrefFor(slug) {
  return slug === "home" ? "/" : `/${slug}`;
}

function pageHtml(page, pages) {
  const path = hrefFor(page.slug);
  const canonical = `https://oneplusone.dating${path}`;
  const docTitle =
    page.slug === "home"
      ? "OnePlusOne — Dating, without the parenting part."
      : `${page.title} — OnePlusOne`;
  const statusLabel = page.status === "draft" ? "Draft" : "Published";
  const kicker = page.status === "draft" ? "Draft for review" : "OnePlusOne";
  const primary = PRIMARY.map((slug) => pages.find((item) => item.slug === slug));
  const nav = (items, label) =>
    `<nav aria-label="${label}">${items
      .map(
        (item) =>
          `<a href="${hrefFor(item.slug)}"${item.slug === page.slug ? ' aria-current="page"' : ""}>${escapeHtml(item.navLabel)}</a>`,
      )
      .join("")}</nav>`;

  const helpSearch =
    page.slug === "help"
      ? `<form class="help-search" role="search" action="/help" method="get">
          <label for="help-q">Search help</label>
          <input id="help-q" name="q" type="search" placeholder="Eligibility, First Light, subscription" enterkeyhint="search">
        </form>
        <p id="help-empty" class="help-empty" hidden>Nothing on this page matches that search.</p>`
      : "";

  const cards =
    page.slug === "home"
      ? `<div class="cards">${pages
          .filter((item) => item.slug !== "home")
          .map(
            (item) => `<a class="card" href="${hrefFor(item.slug)}">
              <strong>${escapeHtml(item.navLabel)}</strong>
              <span>${escapeHtml(item.summary)}</span>
            </a>`,
          )
          .join("")}</div>`
      : "";

  const articleInner = `<p class="kicker">${escapeHtml(kicker)}</p>
        <h1>${escapeHtml(page.title)}</h1>
        ${
          page.slug === "home"
            ? `<p class="tagline">${escapeHtml(page.description)}</p>`
            : ""
        }
        <p class="meta">Version ${escapeHtml(page.version)} · ${escapeHtml(page.publishedLabel)} · ${statusLabel}</p>
        ${helpSearch}
        <div class="prose">${page.html}</div>`;

  const main =
    page.slug === "home"
      ? `<header class="hero">${articleInner}</header>\n      ${cards}`
      : `<article class="panel">${articleInner}</article>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(docTitle)}</title>
  <meta name="description" content="${escapeHtml(page.description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${escapeHtml(docTitle)}">
  <meta property="og:description" content="${escapeHtml(page.description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  <meta name="theme-color" content="#FBF6EF">
  <link rel="icon" href="/assets/favicon.png" type="image/png">
  <link rel="stylesheet" href="/assets/site.css">
</head>
<body class="page-${page.slug}${page.status === "draft" ? " is-draft" : ""}">
  <a class="skip" href="#content">Skip to content</a>
  <div class="wrap">
    <header class="site-header">
      <a class="brand" href="/">
        <img src="/assets/mark.png" alt="" width="556" height="410">
        <span>OnePlusOne</span>
      </a>
      ${nav(primary, "Primary")}
    </header>
    <main id="content">
      ${main}
    </main>
    <footer class="site-footer">
      ${nav(pages, "All pages")}
      <p>The iOS and Android apps are in development.</p>
      <p>Dating, without the parenting part.</p>
    </footer>
  </div>
  ${page.slug === "help" ? '<script src="/assets/site.js"></script>' : ""}
</body>
</html>
`;
}

function collectLinks(body) {
  return [...body.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)].map((match) => match[1]);
}

const files = (await readdir(contentDir)).filter((name) => name.endsWith(".md")).sort();
const pages = [];
for (const file of files) {
  const { meta, body } = parseFile(await readFile(join(contentDir, file), "utf8"), file);
  for (const key of ["slug", "version", "published_at", "locale", "title", "status", "description", "summary"]) {
    if (!meta[key]) throw new Error(`${file}: missing ${key}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.published_at)) throw new Error(`${file}: bad published_at`);
  if (meta.locale !== "en") throw new Error(`${file}: locale must be en`);
  if (meta.status !== "published" && meta.status !== "draft") throw new Error(`${file}: bad status`);
  if (meta.slug !== file.replace(/\.md$/, "")) throw new Error(`${file}: slug must match filename`);
  const blocks = renderBlocks(body);
  pages.push({
    ...meta,
    body,
    blocks,
    html: assemble(blocks, meta.slug === "help"),
    publishedLabel: formatDate(meta.published_at),
    navLabel: meta.slug === "home" ? "Home" : meta.title,
  });
}

const slugs = pages.map((page) => page.slug);
for (const slug of REQUIRED) {
  if (!slugs.includes(slug)) throw new Error(`missing page ${slug}`);
}
if (slugs.length !== REQUIRED.length) throw new Error(`unexpected pages: ${slugs.join(", ")}`);

const bySlug = Object.fromEntries(pages.map((page) => [page.slug, page]));
for (const page of pages) {
  for (const link of collectLinks(page.body)) {
    if (!safeUrl(link)) throw new Error(`${page.slug}: unsafe link ${link}`);
    if (!link.startsWith("/")) continue;
    const [path, hash] = link.split("#");
    const slug = path === "/" ? "home" : path.slice(1);
    if (!bySlug[slug]) throw new Error(`${page.slug}: unknown link ${link}`);
    if (hash) {
      const ids = new Set(bySlug[slug].blocks.filter((block) => block.id).map((block) => block.id));
      if (!ids.has(hash)) throw new Error(`${page.slug}: missing #${hash} on ${slug}`);
    }
  }
}

for (const slug of ["terms", "privacy"]) {
  if (bySlug[slug].status !== "draft") throw new Error(`${slug} must stay a draft`);
  if (!bySlug[slug].body.startsWith("> Draft for review.")) throw new Error(`${slug} is missing its draft notice`);
}
if (!bySlug.contact.body.includes("not published yet")) throw new Error("contact page needs the unpublished notice");
if (!bySlug.about.body.includes("Dating, without the parenting part.")) throw new Error("about page lost its tagline");
if (!bySlug["delete-account"].body.includes("does not cancel an active subscription")) {
  throw new Error("delete page lost the subscription warning");
}

const ordered = REQUIRED.map((slug) => bySlug[slug]);

await rm(distDir, { recursive: true, force: true });
await mkdir(join(distDir, "content"), { recursive: true });
await mkdir(join(distDir, "assets", "fonts"), { recursive: true });

for (const page of ordered) {
  const html = pageHtml(page, ordered);
  if (page.slug === "home") {
    await writeFile(join(distDir, "index.html"), html);
  } else {
    const dir = join(distDir, page.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "index.html"), html);
  }
  const json = {
    slug: page.slug,
    version: page.version,
    published_at: page.published_at,
    locale: page.locale,
    title: page.title,
    body: page.body,
    status: page.status,
  };
  await writeFile(join(distDir, "content", `${page.slug}.json`), `${JSON.stringify(json, null, 2)}\n`);
}

await writeFile(
  join(distDir, "content", "index.json"),
  `${JSON.stringify(
    {
      locale: "en",
      pages: ordered.map((page) => ({
        slug: page.slug,
        title: page.title,
        path: hrefFor(page.slug),
        version: page.version,
        published_at: page.published_at,
        status: page.status,
      })),
    },
    null,
    2,
  )}\n`,
);

await writeFile(join(distDir, "robots.txt"), "User-agent: *\nAllow: /\n");
await cp(join(root, "assets", "site.css"), join(distDir, "assets", "site.css"));
await cp(join(root, "assets", "site.js"), join(distDir, "assets", "site.js"));
await cp(join(root, "assets", "mark.png"), join(distDir, "assets", "mark.png"));
await cp(join(root, "assets", "favicon.png"), join(distDir, "assets", "favicon.png"));
for (const font of ["dm-sans-latin.woff2", "fraunces-latin.woff2", "fraunces-latin-italic.woff2"]) {
  await cp(join(root, "assets", "fonts", font), join(distDir, "assets", "fonts", font));
}

console.log(`built ${ordered.length} pages -> ${distDir}`);
