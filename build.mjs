import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile, cp } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { sunriseSvg } from "./assets/sunrise.mjs";

const root = dirname(fileURLToPath(import.meta.url));
let assetQuery = "";
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

const PRIMARY = [
  ["about", "About"],
  ["/#membership", "Membership"],
  ["safety", "Safety"],
  ["help", "Help"],
];

const POLICY = new Set(["guidelines", "terms", "privacy", "delete-account"]);
const HAND = new Set(["help", "safety", "delete-account"]);
const HOME_SECTIONS = ["mission", "membership", "who-can-join", "safety", "launch-news"];

const STATES = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "District of Columbia"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
];

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
      const text = line.slice(4).trim();
      blocks.push({ type: "h3", text, html: `<h3>${inline(text)}</h3>` });
      i += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      const text = line.slice(3).trim();
      let id = slugify(text) || "section";
      let n = 2;
      while (ids.has(id)) id = `${slugify(text)}-${n++}`;
      ids.add(id);
      blocks.push({ type: "h2", id, text, html: `<h2>${inline(text)}</h2>` });
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
      html: `<p${warning ? ' class="warning"' : ""}>${warning ? '<span class="warning-mark" aria-hidden="true">!</span>' : ""}${inline(text)}</p>`,
    });
  }
  return blocks;
}

function assemble(blocks, sections) {
  if (!sections) return blocks.map((block) => block.html).join("\n");
  let html = "";
  let i = 0;
  while (i < blocks.length && blocks[i].type !== "h2") html += `${blocks[i++].html}\n`;
  while (i < blocks.length) {
    const head = blocks[i++];
    let inner = head.html;
    while (i < blocks.length && blocks[i].type !== "h2") inner += blocks[i++].html;
    html += `<section class="text-card" id="${head.id}" data-help-section>${inner}</section>\n`;
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

function wordmark(onDark) {
  return `<span class="wordmark${onDark ? " on-dark" : ""}">OnePlus<span class="one">One</span></span>`;
}

function arc(fill) {
  return `<svg class="arc" viewBox="0 0 1200 64" width="1200" height="64" preserveAspectRatio="none" aria-hidden="true"><path fill="${fill}" d="M0 64 Q600 0 1200 64 V64 H0 Z"/></svg>`;
}

function navLinks(current) {
  return PRIMARY.map(([href, label]) => {
    const path = href.startsWith("/") ? href : `/${href}`;
    const slug = href.split("#")[0];
    const here = slug === current;
    return `<a href="${href.startsWith("/") ? href : path}"${here ? ' aria-current="page"' : ""}>${label}</a>`;
  }).join("");
}

function shell({ slug, title, description, main, status = "published", canonicalPath = "/" }) {
  const docTitle = slug === "home" ? "OnePlusOne > Dating, without the parenting part." : `${title} — OnePlusOne`;
  const canonical = `https://oneplusone.dating${canonicalPath === "/" ? "/" : canonicalPath}`;
  const launchHref = slug === "home" ? "#launch" : "/#launch";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(docTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${escapeHtml(docTitle)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="https://oneplusone.dating/assets/og.png">
  <meta name="theme-color" content="#FBF6EF">
  <link rel="icon" href="/assets/favicon.png" type="image/png">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  <link rel="stylesheet" href="/assets/site.css?v=${assetQuery}">
</head>
<body class="page-${slug}${status === "draft" ? " is-draft" : ""}">
  <a class="skip" href="#content">Skip to content</a>
  <div class="sky">
    <div class="wrap">
      <header class="site-header">
        <a class="brand" href="/">
          ${sunriseSvg(86, { id: `${slug}-mark` })}
          ${wordmark(false)}
        </a>
        <nav aria-label="Primary">
          ${navLinks(slug)}
          <a class="button" href="${launchHref}">Get launch news</a>
        </nav>
      </header>
    </div>
    ${main}
  </div>
  ${arc("#262C34")}
  <footer class="site-footer">
    <div class="wrap footer-grid">
      <div>
        <a class="brand" href="/">${sunriseSvg(86, { id: `${slug}-foot`, horizon: "#FBF6EF" })}${wordmark(true)}</a>
        <p>Dating, without the parenting part.</p>
      </div>
      <div><h2>Company</h2><ul><li><a href="/about">About</a></li><li><a href="/mission">Our Mission</a></li></ul></div>
      <div><h2>Community</h2><ul><li><a href="/guidelines">Guidelines</a></li><li><a href="/safety">Safety</a></li><li><a href="/help#who-can-join">Who can join</a></li></ul></div>
      <div><h2>Support</h2><ul><li><a href="/help">Help</a></li><li><a href="/contact">Contact</a></li><li><a href="/delete-account">Delete account</a></li></ul></div>
      <div><h2>Legal</h2><ul><li><a href="/terms">Terms</a></li><li><a href="/privacy">Privacy</a></li></ul></div>
    </div>
    <div class="wrap"><p class="footer-note">The iOS and Android apps are in development.</p></div>
  </footer>
  <script type="module" src="/assets/site.js?v=${assetQuery}"></script>
</body>
</html>
`;
}

function groupSections(blocks) {
  const sections = [];
  let section = null;
  let card = null;
  for (const block of blocks) {
    if (block.type === "h2") {
      card = null;
      section = { id: block.id, title: block.text, html: "", cards: [] };
      sections.push(section);
    } else if (block.type === "h3" && section) {
      card = { title: block.text, html: "" };
      section.cards.push(card);
    } else if (card) {
      card.html += block.html;
    } else if (section) {
      section.html += block.html;
    }
  }
  return sections;
}

function promote(section) {
  const match = section.html.match(/^<p>([\s\S]*?)<\/p>/);
  if (!match) return { title: section.title, html: section.html };
  return { title: match[1].replace(/<[^>]+>/g, ""), html: section.html.slice(match[0].length) };
}

function ico(paths, stroke) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function productPreview() {
  const pin = ico(`<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.2"/>`, "#FBD9BD");
  const pass = ico(`<path d="M6 6l12 12M18 6L6 18"/>`, "#4B3E37");
  const info = ico(`<circle cx="12" cy="12" r="8"/><path d="M12 11v5"/><circle cx="12" cy="8" r="1" fill="#7A685C" stroke="none"/>`, "#7A685C");
  const heart = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M12 19.2S4.2 14.4 4.2 9.8A4 4 0 0 1 12 8a4 4 0 0 1 7.8 1.8c0 4.6-7.8 9.4-7.8 9.4z"/></svg>`;
  const back = ico(`<path d="M14.5 6 8.5 12l6 6"/>`, "#2A211D");
  const flag = ico(`<path d="M6 4v16M6 5h10l-2 3.5L16 12H6"/>`, "#C9434F");
  const bag = ico(`<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M9 8V6.5A2.5 2.5 0 0 1 11.5 4h1A2.5 2.5 0 0 1 15 6.5V8"/>`, "#B8432C");
  const spark = ico(`<path d="m12 3 1.5 5.2L19 9.6l-5.5 1.6L12 16.5 10.5 11.2 5 9.6l5.5-1.4L12 3z"/>`, "#B8432C");
  const chat = ico(`<path d="M5 6h14v8H9l-4 3V6z"/>`, "#fff");
  const maren = `<img class="portrait" src="/assets/maren.jpg" alt="">`;
  const adrian = `<img class="portrait" src="/assets/adrian.jpg" alt="">`;
  const chips = ["Hiking", "Cooking", "Live music", "Reading"]
    .map((label) => `<span class="glass-chip">${label}</span>`)
    .join("");
  return `<section class="section product" id="the-app" aria-labelledby="product-title"><div class="wrap">
    <p class="kicker">The experience</p>
    <h2 id="product-title">A little spark starts somewhere.</h2>
    <p class="product-lede">Discover someone who catches your eye. Get to know the person behind the profile. And when the feeling is mutual, see where it goes.</p>
    <div class="phones">
      <figure class="phone">
        <div class="phone-bezel" aria-hidden="true">
          <div class="screen-discover">
            <p class="app-kicker">Near you</p>
            <p class="app-title">Discover</p>
            <div class="deck">
              <div class="deck-back"></div>
              <div class="swipe">
                ${maren}
                <div class="swipe-shade"></div>
                <div class="swipe-info">
                  <p class="swipe-name">Maren, 34</p>
                  <p class="swipe-sub">Architect · 5 ft 7 in</p>
                  <p class="swipe-dist">${pin}<span>2 miles away</span></p>
                  <div class="glass-chips">${chips}</div>
                </div>
              </div>
            </div>
            <div class="round-actions">
              <span class="round pass">${pass}</span>
              <span class="round info">${info}</span>
              <span class="round like">${heart}</span>
            </div>
          </div>
        </div>
        <figcaption><strong>Discover</strong>Someone catches your eye.</figcaption>
      </figure>
      <figure class="phone">
        <div class="phone-bezel" aria-hidden="true">
          <div class="screen-profile">
            <div class="profile-top"><span class="icon-btn">${back}</span><span class="icon-btn">${flag}</span></div>
            <div class="profile-photo">
              ${maren}
              <div class="profile-shade"></div>
              <div class="profile-info">
                <p class="profile-name">Maren, 34</p>
                <p class="profile-dist">${pin}<span>2 miles away</span></p>
              </div>
            </div>
            <div class="profile-body">
              <div class="mini-card">
                <div class="fact"><span class="fact-ico">${bag}</span>Architect</div>
                <div class="fact"><span class="fact-ico">${spark}</span>Studied architecture</div>
              </div>
              <span class="height-pill">5 ft 7 in</span>
              <div class="mini-card">
                <p class="app-kicker">About</p>
                <p class="bio">Weeknight walks, a late table, and a joke that lands a second too late.</p>
              </div>
              <div class="kids-card">
                <p class="app-kicker">Kids</p>
                <p>Open to it</p>
              </div>
            </div>
            <div class="profile-bar">
              <span class="round pass">${pass}</span>
              <span class="round like">${heart}</span>
            </div>
          </div>
        </div>
        <figcaption><strong>Profile</strong>There's always more to someone's story.</figcaption>
      </figure>
      <figure class="phone">
        <div class="phone-bezel" aria-hidden="true">
          <div class="screen-match">
            <div class="match-stage">
              <div class="match-sun">${sunriseSvg(148, { id: "match-sun" })}</div>
              <div class="match-pair">
                <div class="match-photo left">${adrian}</div>
                <div class="match-photo right">${maren}</div>
              </div>
            </div>
            <div class="match-copy">
              <p class="app-kicker">It's mutual</p>
              <p class="app-title">It's a match</p>
              <p>You and Maren liked each other. Don't let the moment cool off.</p>
            </div>
            <div class="match-actions">
              <span class="match-hello">${chat}<span>Say hello to Maren</span></span>
              <span class="match-keep">Keep swiping</span>
            </div>
          </div>
        </div>
        <figcaption><strong>Match</strong>When the feeling is mutual.</figcaption>
      </figure>
    </div>
  </div></section>`;
}

function homeMain(page, facts) {
  const byId = Object.fromEntries(groupSections(page.blocks).map((section) => [section.id, section]));
  for (const id of HOME_SECTIONS) {
    if (!byId[id]) throw new Error(`home is missing ## ${id}`);
  }
  const mission = { ...promote(byId.mission), cards: byId.mission.cards };
  const membership = promote(byId.membership);
  const join = promote(byId["who-can-join"]);
  const launch = promote(byId["launch-news"]);
  const safety = safetyArticles(byId.safety);
  const cards = mission.cards
    .map(
      (card) => `<article class="value"><h3>${escapeHtml(card.title)}</h3>${card.html}</article>`,
    )
    .join("");
  return `<main id="content">
    <div class="wrap hero">
      <p class="pill">The iOS and Android apps are in development</p>
      <div class="hero-mark" data-sunrise-spin data-width="380" data-sun-id="hero-sun">${sunriseSvg(380, { glow: true, id: "hero-sun" })}</div>
      <h1>Dating, without the <em>parenting part.</em></h1>
      <p class="lede">A dating space for adults without children. One person. Another person. A possibility.</p>
      <div class="hero-actions">
        <a class="button" href="#launch">Get launch news</a>
        <a class="button ghost" href="#who-can-join">Who can join?</a>
      </div>
    </div>
    ${arc("#FFFCF8")}
    <div class="surface">
      ${productPreview()}
      <section class="section" id="mission"><div class="wrap">
        <div class="mission-grid">
          <div>
            <p class="kicker">Mission</p>
            <h2>${mission.title}</h2>
          </div>
          <div>${mission.html}</div>
        </div>
        <div class="values">${cards}</div>
      </div></section>
      <section class="section" id="membership"><div class="wrap">
        <h2>${membership.title}</h2>
        ${membership.html}
        <div class="tiers">
          <article class="tier featured">
            <h3>First Light</h3>
            <p class="price">Complimentary</p>
            <p>For the life of your account. No monthly fee.</p>
            <span class="badge">First ${escapeHtml(facts.first_light_cap)} per city. Eligible, verified.</span>
          </article>
          <article class="tier">
            <h3>Early Risers</h3>
            <p class="price">${escapeHtml(facts.early_risers_price)} <span>once</span></p>
            <p>The next ${escapeHtml(facts.early_risers_cap)} eligible members in your launch city.</p>
          </article>
          <article class="tier">
            <h3>Members</h3>
            <p class="price">${escapeHtml(facts.member_price)} <span>/ month</span></p>
            <p>Discover people without children, match when interest is mutual, and start conversations.</p>
          </article>
        </div>
        <p class="fine">A First Light or Early Risers benefit is permanently forfeited if you delete your account. Purchases are subject to store policies and applicable law. Deleting your account does not cancel an App Store or Google Play subscription.</p>
      </div></section>
      <section class="section" id="who-can-join"><div class="wrap"><div class="join-panel">
        <h2>${join.title}</h2>
        ${join.html}
      </div></div></section>
      <section class="section sand" id="safety"><div class="wrap">
        <h2>${escapeHtml(byId.safety.title)}</h2>
        <div class="safety-points">${safety.articles}</div>
        ${safety.note ? `<div class="safety-note">${safety.note}</div>` : ""}
      </div></section>
      <section class="section" id="launch"><div class="wrap"><div class="launch">
        <h2>${launch.title}</h2>
        ${launch.html}
        <form class="launch-form" id="launch-form" novalidate>
          <label class="skip" for="launch-email">Email</label>
          <input id="launch-email" type="email" name="email" placeholder="you@example.com" autocomplete="email" maxlength="50" required>
          <label class="skip" for="launch-state">State</label>
          <select id="launch-state" name="state" autocomplete="address-level1" required>
            <option value="" selected disabled>State</option>
            ${STATES.map(([code, name]) => `<option value="${code}">${escapeHtml(name)}</option>`).join("")}
          </select>
          <button class="button" type="submit">Notify me</button>
        </form>
        <p id="launch-status" class="launch-status" role="status" hidden></p>
        <p class="fine">We'll use your email only for that notice, when OnePlusOne is coming near you soon. We won't send any other mail.</p>
        <p class="pills"><span>App Store · coming soon</span><span>Google Play · coming soon</span></p>
      </div></div></section>
    </div>
  </main>`;
}

function contentMain(page) {
  const headings = page.blocks.filter((block) => block.type === "h2");
  const toc = headings
    .map((block) => `<a href="#${block.id}">${escapeHtml(block.text)}</a>`)
    .join("");
  const search =
    page.slug === "help"
      ? `<form class="help-search" role="search" action="/help" method="get"><label for="help-q">Search help</label><input id="help-q" name="q" type="search" placeholder="Eligibility, First Light, subscription" enterkeyhint="search"></form><p id="help-empty" class="help-empty" hidden>Nothing on this page matches that search.</p>`
      : "";
  const meta = POLICY.has(page.slug)
    ? `<p class="meta">Version ${escapeHtml(page.version)} · ${escapeHtml(page.publishedLabel)} · ${page.status === "draft" ? "Draft" : "Published"}</p>`
    : "";
  const hand = HAND.has(page.slug)
    ? `<aside class="hand"><h2>Still need a hand?</h2><p>Our support team replies by email. <a href="/contact">Contact</a></p></aside>`
    : "";
  const kicker = page.status === "draft" ? `<p class="kicker">Draft for review</p>` : "";
  return `<main id="content">
    <div class="wrap band">
      ${kicker}
      <h1>${escapeHtml(page.title)}</h1>
      <p class="lead">${escapeHtml(page.description)}</p>
      ${search}
    </div>
    ${arc("#FFFCF8")}
    <div class="wrap content-layout">
      <nav class="toc" aria-label="On this page"><p>On this page</p>${toc}</nav>
      <div>
        <div class="prose">${page.html}</div>
        ${meta}
        ${hand}
      </div>
    </div>
  </main>`;
}

function pageHtml(page, facts) {
  const main = page.slug === "home" ? homeMain(page, facts) : contentMain(page);
  return shell({
    slug: page.slug,
    title: page.title,
    description: page.description,
    status: page.status,
    canonicalPath: hrefFor(page.slug),
    main,
  });
}

function safetyArticles(section) {
  const cards = section.cards.map((card) => ({ ...card }));
  let note = section.html;
  const last = cards.at(-1);
  if (last && !note.trim()) {
    const paras = [...last.html.matchAll(/<p>[\s\S]*?<\/p>/g)].map((match) => match[0]);
    if (paras.length > 1 && paras.at(-1).includes("/guidelines")) {
      note = paras.pop();
      last.html = paras.join("");
    }
  }
  if (cards.length !== 3) throw new Error("home safety needs three titled cards");
  const articles = cards
    .map((card) => `<article><h3>${escapeHtml(card.title)}</h3>${card.html}</article>`)
    .join("");
  return { articles, note };
}

function fillFacts(body, facts) {
  return body.replace(/\{\{([a-z_]+)\}\}/g, (match, key) => {
    if (!(key in facts)) throw new Error(`unknown membership token ${match}`);
    return facts[key];
  });
}

const NUMBER_LEAK = /\b50\b|\b150\b|\$10|\$7/;

function collectLinks(body) {
  return [...body.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)].map((match) => match[1]);
}

const facts = JSON.parse(await readFile(join(contentDir, "membership.json"), "utf8"));
for (const key of ["first_light_cap", "early_risers_cap", "early_risers_price", "member_price", "trial", "renewal"]) {
  if (!facts[key]) throw new Error(`membership.json missing ${key}`);
}

const files = (await readdir(contentDir)).filter((name) => name.endsWith(".md")).sort();
const pages = [];
for (const file of files) {
  const raw = await readFile(join(contentDir, file), "utf8");
  if (NUMBER_LEAK.test(raw)) throw new Error(`${file}: membership numbers belong in membership.json`);
  const { meta, body: source } = parseFile(raw, file);
  const body = fillFacts(source, facts);
  if (body.includes("{{")) throw new Error(`${file}: unfilled membership token`);
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
    html: assemble(blocks, meta.slug !== "home"),
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
if (STATES.length !== 51) throw new Error("launch state list must be the 50 states and DC");
if (!bySlug.home.body.includes("Leave your email and your state.")) {
  throw new Error("home lost the launch state line");
}
if (!bySlug.privacy.body.includes("No other mail is sent to that address.")) {
  throw new Error("privacy lost the launch mail limit");
}

const ordered = REQUIRED.map((slug) => bySlug[slug]);

await rm(distDir, { recursive: true, force: true });
await mkdir(join(distDir, "content"), { recursive: true });
await mkdir(join(distDir, "assets", "fonts"), { recursive: true });

const cssBytes = await readFile(join(root, "assets", "site.css"));
const jsBytes = await readFile(join(root, "assets", "site.js"));
const sunBytes = await readFile(join(root, "assets", "sunrise.mjs"));
assetQuery = createHash("sha256").update(cssBytes).update(jsBytes).update(sunBytes).digest("hex").slice(0, 10);

for (const page of ordered) {
  const html = pageHtml(page, facts);
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

const missing = shell({
  slug: "missing",
  title: "That page has set",
  description: "That page has set.",
  canonicalPath: "/",
  main: `<main id="content" class="not-found"><div class="wrap band">
    <div class="mark-set">${sunriseSvg(160, { id: "missing-sun" })}</div>
    <h1>That page has set</h1>
    <p class="lead">The page you asked for is not here.</p>
    <p class="hero-actions"><a class="button" href="/">Home</a><a class="button ghost" href="/help">Help</a></p>
  </div></main>`,
});
await writeFile(join(distDir, "404.html"), missing);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ordered
  .map(
    (page) => `  <url><loc>https://oneplusone.dating${hrefFor(page.slug)}</loc><lastmod>${page.published_at}</lastmod></url>`,
  )
  .join("\n")}
</urlset>
`;
await writeFile(join(distDir, "sitemap.xml"), sitemap);
await writeFile(join(distDir, "robots.txt"), "User-agent: *\nAllow: /\nSitemap: https://oneplusone.dating/sitemap.xml\n");
await writeFile(
  join(distDir, "_headers"),
  `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Content-Security-Policy: default-src 'self'; img-src 'self'; style-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self' https://api.oneplusone.dating; base-uri 'none'; frame-ancestors 'none'

/assets/*
  Cache-Control: public, max-age=604800
`,
);
await writeFile(join(distDir, "_redirects"), "/delete /delete-account 301\n");

await cp(join(root, "assets", "site.css"), join(distDir, "assets", "site.css"));
const versionedJs = jsBytes.toString("utf8").replaceAll(
  'from "./sunrise.mjs"',
  `from "./sunrise.mjs?v=${assetQuery}"`,
);
if (!versionedJs.includes(`sunrise.mjs?v=${assetQuery}`)) {
  throw new Error("site.js is missing the sunrise import to version");
}
await writeFile(join(distDir, "assets", "site.js"), versionedJs);
await cp(join(root, "assets", "sunrise.mjs"), join(distDir, "assets", "sunrise.mjs"));
for (const image of ["favicon.png", "apple-touch-icon.png", "og.png", "maren.jpg", "adrian.jpg"]) {
  await cp(join(root, "assets", image), join(distDir, "assets", image));
}
for (const font of ["dm-sans-latin.woff2", "fraunces-latin.woff2", "fraunces-latin-italic.woff2"]) {
  await cp(join(root, "assets", "fonts", font), join(distDir, "assets", "fonts", font));
}

console.log(`built ${ordered.length} pages -> ${distDir}`);
