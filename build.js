#!/usr/bin/env node
/*
 * Static blog build script — zero dependencies.
 *
 * Reads Markdown posts from content/*.md (each with a frontmatter block) and
 * regenerates everything derived from them:
 *   - posts/<slug>.html   (full article pages, with SEO meta + JSON-LD)
 *   - posts.js            (the index used by blog.html for search/filter)
 *   - tags/<slug>.html    (a permalink page per tag)
 *   - sitemap.xml
 *   - rss.xml
 *
 * Usage:  node build.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const SITE = "https://galaviel.com";
const CONTENT_DIR = path.join(ROOT, "content");
const POSTS_DIR = path.join(ROOT, "posts");
const TAGS_DIR = path.join(ROOT, "tags");

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeXml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Transliterate a tag into a URL-safe ASCII slug. Falls back to a hashed,
// percent-free token when the tag is non-Latin (e.g. Hebrew), so tag page
// filenames stay portable across hosts.
function tagSlug(tag) {
  const ascii = tag
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) return ascii;
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = (hash * 31 + tag.charCodeAt(i)) >>> 0;
  }
  return "tag-" + hash.toString(36);
}

const HE_MONTHS = [
  "בינואר", "בפברואר", "במרץ", "באפריל", "במאי", "ביוני",
  "ביולי", "באוגוסט", "בספטמבר", "באוקטובר", "בנובמבר", "בדצמבר"
];

function formatHebrewDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${HE_MONTHS[m - 1]} ${y}`;
}

function rfc822(iso) {
  return new Date(iso + "T00:00:00Z").toUTCString();
}

// ---------------------------------------------------------------------------
// Frontmatter parser
// ---------------------------------------------------------------------------

function parseFrontmatter(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    throw new Error("missing frontmatter block (--- ... ---)");
  }
  const meta = {};
  match[1].split("\n").forEach((line) => {
    if (!line.trim()) return;
    const idx = line.indexOf(":");
    if (idx === -1) return;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    meta[key] = value;
  });
  return { meta, body: match[2] };
}

// ---------------------------------------------------------------------------
// Minimal Markdown renderer (supports the subset used by this blog)
// ---------------------------------------------------------------------------

function renderInline(text) {
  // Protect inline code spans first, then escape, then apply emphasis/links.
  const codeSpans = [];
  text = text.replace(/`([^`]+)`/g, (_, code) => {
    codeSpans.push(code);
    return "\uE000" + (codeSpans.length - 1) + "\uE000";
  });

  text = escapeHtml(text);

  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    return `<a href="${escapeHtml(url)}">${label}</a>`;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");

  text = text.replace(/\uE000(\d+)\uE000/g, (_, i) => {
    return "<code>" + escapeHtml(codeSpans[Number(i)]) + "</code>";
  });

  return text;
}

function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;

  function flushList(tag, items) {
    out.push(`<${tag}>`);
    items.forEach((it) => out.push(`  <li>${renderInline(it)}</li>`));
    out.push(`</${tag}>`);
  }

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (/^```/.test(line)) {
      const code = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    // Blockquote (one or more consecutive "> " lines)
    if (/^>\s?/.test(line)) {
      const quote = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote><p>${renderInline(quote.join(" "))}</p></blockquote>`);
      continue;
    }

    // Headings
    let h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      flushList("ul", items);
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      flushList("ol", items);
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph (accumulate until blank / block boundary)
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^#{2,4}\s+/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${renderInline(para.join(" "))}</p>`);
  }

  return out.join("\n        ");
}

// ---------------------------------------------------------------------------
// Page templates
// ---------------------------------------------------------------------------

function postPage(post) {
  const tagsMeta = post.tags
    .map((t) => `  <meta property="article:tag" content="${escapeHtml(t)}" />`)
    .join("\n");
  const tagChips = post.tags
    .map((t) => `          <span>#${escapeHtml(t)}</span>`)
    .join("\n");
  const jsonLd = JSON.stringify(
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      headline: post.title,
      description: post.excerpt,
      datePublished: post.date,
      dateModified: post.date,
      inLanguage: "he",
      image: `${SITE}/logo.png`,
      url: `${SITE}/posts/${post.slug}.html`,
      mainEntityOfPage: `${SITE}/posts/${post.slug}.html`,
      keywords: post.tags.join(", "),
      author: { "@type": "Person", name: "Gal Aviel", url: `${SITE}/` },
      publisher: { "@type": "Person", name: "Gal Aviel" }
    },
    null,
    2
  ).replace(/\n/g, "\n  ");

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <title>${escapeHtml(post.title)} – גל אביאל</title>
  <meta name="description" content="${escapeHtml(post.excerpt)}" />
  <meta name="theme-color" content="#080815" />
  <meta name="author" content="Gal Aviel" />
  <link rel="canonical" href="${SITE}/posts/${post.slug}.html" />

  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="גל אביאל" />
  <meta property="og:title" content="${escapeHtml(post.title)}" />
  <meta property="og:description" content="${escapeHtml(post.excerpt)}" />
  <meta property="og:url" content="${SITE}/posts/${post.slug}.html" />
  <meta property="og:image" content="${SITE}/logo.png" />
  <meta property="og:locale" content="he_IL" />
  <meta property="article:published_time" content="${post.date}" />
  <meta property="article:author" content="Gal Aviel" />
${tagsMeta}

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(post.title)}" />
  <meta name="twitter:description" content="${escapeHtml(post.excerpt)}" />
  <meta name="twitter:image" content="${SITE}/logo.png" />

  <link rel="icon" href="../logo.png" />
  <link rel="apple-touch-icon" href="../logo.png" />
  <link rel="alternate" type="application/rss+xml" title="הבלוג של גל אביאל" href="../rss.xml" />

  <script type="application/ld+json">
  ${jsonLd}
  </script>

  <link rel="stylesheet" href="../blog.css" />
</head>

<body>
  <a class="skip-link" href="#main-content">דלג לתוכן</a>

  <div class="nav-wrap">
    <div class="container">
      <nav aria-label="ניווט ראשי">
        <a class="brand" href="../index.html" aria-label="גל אביאל — דף הבית">
          <img src="../logo.png" alt="" />
          <span>גל אביאל</span>
        </a>
        <div class="nav-links">
          <a href="../index.html">בית</a>
          <a href="../blog.html">בלוג</a>
          <a href="mailto:gal@galaviel.com">צור קשר</a>
        </div>
        <a class="button button-primary button-small" href="../blog.html">כל הפוסטים</a>
      </nav>
    </div>
  </div>

  <main id="main-content">
    <article class="article-wrap">
      <a class="back-link" href="../blog.html">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        חזרה לבלוג
      </a>

      <header class="article-header">
        <div class="post-meta">
          <time datetime="${post.date}">${formatHebrewDate(post.date)}</time>
          <span>•</span>
          <span>${post.readingTime} דק׳ קריאה</span>
        </div>
        <h1>${escapeHtml(post.title)}</h1>
        <div class="post-tags">
${tagChips}
        </div>
      </header>

      <div class="article-body">
        ${post.html}
      </div>

      <footer class="article-footer">
        <p>נכתב על ידי גל אביאל. יש לכם מחשבה או תיקון? <a href="mailto:gal@galaviel.com">כתבו לי</a>.</p>
      </footer>
    </article>
  </main>

  <footer>
    <div class="container">
      <div class="footer-row">
        <p>© 2026 גל אביאל.</p>
        <div class="footer-links">
          <a href="../index.html">בית</a>
          <a href="../blog.html">בלוג</a>
          <a href="../privacy.html">פרטיות</a>
        </div>
      </div>
    </div>
  </footer>
</body>
</html>
`;
}

function tagPage(tag, slug, posts) {
  const cards = posts
    .map(
      (p) => `        <a class="post-card" href="../posts/${p.slug}.html">
          <div class="post-meta">
            <time datetime="${p.date}">${formatHebrewDate(p.date)}</time>
            <span>•</span>
            <span>${p.readingTime} דק׳ קריאה</span>
          </div>
          <h2>${escapeHtml(p.title)}</h2>
          <p class="excerpt">${escapeHtml(p.excerpt)}</p>
        </a>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <title>תגית: ${escapeHtml(tag)} – הבלוג של גל אביאל</title>
  <meta name="description" content="כל הפוסטים בתגית ${escapeHtml(tag)} בבלוג של גל אביאל." />
  <meta name="theme-color" content="#080815" />
  <link rel="canonical" href="${SITE}/tags/${slug}.html" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="תגית: ${escapeHtml(tag)}" />
  <meta property="og:description" content="כל הפוסטים בתגית ${escapeHtml(tag)}." />
  <meta property="og:url" content="${SITE}/tags/${slug}.html" />
  <meta property="og:image" content="${SITE}/logo.png" />

  <link rel="icon" href="../logo.png" />
  <link rel="alternate" type="application/rss+xml" title="הבלוג של גל אביאל" href="../rss.xml" />

  <link rel="stylesheet" href="../blog.css" />
</head>

<body>
  <a class="skip-link" href="#main-content">דלג לתוכן</a>

  <div class="nav-wrap">
    <div class="container">
      <nav aria-label="ניווט ראשי">
        <a class="brand" href="../index.html" aria-label="גל אביאל — דף הבית">
          <img src="../logo.png" alt="" />
          <span>גל אביאל</span>
        </a>
        <div class="nav-links">
          <a href="../index.html">בית</a>
          <a href="../blog.html">בלוג</a>
          <a href="mailto:gal@galaviel.com">צור קשר</a>
        </div>
        <a class="button button-primary button-small" href="../blog.html">כל הפוסטים</a>
      </nav>
    </div>
  </div>

  <main id="main-content">
    <div class="container">
      <header class="blog-header">
        <span class="eyebrow">תגית</span>
        <h1>#<span class="gradient-text">${escapeHtml(tag)}</span></h1>
        <p>${posts.length} פוסטים בתגית הזו.</p>
      </header>

      <div class="post-list">
${cards}
      </div>
    </div>
  </main>

  <footer>
    <div class="container">
      <div class="footer-row">
        <p>© 2026 גל אביאל.</p>
        <div class="footer-links">
          <a href="../index.html">בית</a>
          <a href="../blog.html">בלוג</a>
          <a href="../privacy.html">פרטיות</a>
        </div>
      </div>
    </div>
  </footer>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function build() {
  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  const posts = files.map((file) => {
    const slug = file.replace(/\.md$/, "");
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), "utf8");
    let parsed;
    try {
      parsed = parseFrontmatter(raw);
    } catch (e) {
      throw new Error(`${file}: ${e.message}`);
    }
    const meta = parsed.meta;

    ["title", "date", "excerpt"].forEach((req) => {
      if (!meta[req]) throw new Error(`${file}: missing required field "${req}"`);
    });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date)) {
      throw new Error(`${file}: date must be YYYY-MM-DD`);
    }

    const tags = (meta.tags || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const wordCount = parsed.body.trim().split(/\s+/).length;
    const readingTime = meta.readingTime
      ? Number(meta.readingTime)
      : Math.max(1, Math.round(wordCount / 200));

    return {
      slug,
      title: meta.title,
      date: meta.date,
      excerpt: meta.excerpt,
      tags,
      readingTime,
      html: renderMarkdown(parsed.body)
    };
  });

  // Newest first.
  posts.sort((a, b) => b.date.localeCompare(a.date));

  // 1) Per-post HTML pages.
  if (!fs.existsSync(POSTS_DIR)) fs.mkdirSync(POSTS_DIR);
  posts.forEach((post) => {
    fs.writeFileSync(path.join(POSTS_DIR, `${post.slug}.html`), postPage(post));
  });

  // 2) posts.js index.
  const indexEntries = posts.map((p) => ({
    title: p.title,
    url: `posts/${p.slug}.html`,
    date: p.date,
    excerpt: p.excerpt,
    tags: p.tags,
    readingTime: p.readingTime
  }));
  const postsJs =
    "/*\n" +
    " * AUTO-GENERATED by build.js — do not edit by hand.\n" +
    " * Add or edit posts in content/*.md, then run: node build.js\n" +
    " */\n" +
    "var POSTS = " +
    JSON.stringify(indexEntries, null, 2) +
    ";\n";
  fs.writeFileSync(path.join(ROOT, "posts.js"), postsJs);

  // 3) Tag pages + tag map.
  if (!fs.existsSync(TAGS_DIR)) fs.mkdirSync(TAGS_DIR);
  const tagMap = {}; // tag -> { slug, posts: [] }
  posts.forEach((p) => {
    p.tags.forEach((t) => {
      if (!tagMap[t]) tagMap[t] = { slug: tagSlug(t), posts: [] };
      tagMap[t].posts.push(p);
    });
  });
  // Clear stale tag pages.
  fs.readdirSync(TAGS_DIR)
    .filter((f) => f.endsWith(".html"))
    .forEach((f) => fs.unlinkSync(path.join(TAGS_DIR, f)));
  Object.keys(tagMap).forEach((tag) => {
    const { slug, posts: tagPosts } = tagMap[tag];
    fs.writeFileSync(path.join(TAGS_DIR, `${slug}.html`), tagPage(tag, slug, tagPosts));
  });
  // Expose the tag->slug map to the client for chip links.
  const tagSlugMap = {};
  Object.keys(tagMap).forEach((t) => (tagSlugMap[t] = tagMap[t].slug));
  fs.writeFileSync(
    path.join(ROOT, "tags.js"),
    "/* AUTO-GENERATED by build.js — tag name to permalink slug. */\n" +
      "var TAG_SLUGS = " +
      JSON.stringify(tagSlugMap, null, 2) +
      ";\n"
  );

  // 4) sitemap.xml
  const staticUrls = [
    { loc: `${SITE}/`, changefreq: "monthly", priority: "1.0" },
    { loc: `${SITE}/blog.html`, changefreq: "weekly", priority: "0.9" },
    { loc: `${SITE}/privacy.html`, changefreq: "yearly", priority: "0.3" }
  ];
  const postUrls = posts.map((p) => ({
    loc: `${SITE}/posts/${p.slug}.html`,
    lastmod: p.date,
    priority: "0.7"
  }));
  const tagUrls = Object.keys(tagMap).map((t) => ({
    loc: `${SITE}/tags/${tagMap[t].slug}.html`,
    changefreq: "weekly",
    priority: "0.5"
  }));
  const allUrls = staticUrls.concat(postUrls, tagUrls);
  const sitemap =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    allUrls
      .map((u) => {
        let s = "  <url>\n    <loc>" + u.loc + "</loc>\n";
        if (u.lastmod) s += "    <lastmod>" + u.lastmod + "</lastmod>\n";
        if (u.changefreq) s += "    <changefreq>" + u.changefreq + "</changefreq>\n";
        if (u.priority) s += "    <priority>" + u.priority + "</priority>\n";
        s += "  </url>";
        return s;
      })
      .join("\n") +
    "\n</urlset>\n";
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), sitemap);

  // 5) rss.xml
  const items = posts
    .map(
      (p) => `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${SITE}/posts/${p.slug}.html</link>
      <guid>${SITE}/posts/${p.slug}.html</guid>
      <pubDate>${rfc822(p.date)}</pubDate>
      <description>${escapeXml(p.excerpt)}</description>
${p.tags.map((t) => `      <category>${escapeXml(t)}</category>`).join("\n")}
    </item>`
    )
    .join("\n");
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>הבלוג של גל אביאל</title>
    <link>${SITE}/blog.html</link>
    <description>מחשבות על פיתוח תוכנה, מוצר ובניית אפליקציות iOS.</description>
    <language>he</language>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
  fs.writeFileSync(path.join(ROOT, "rss.xml"), rss);

  console.log(
    `Built ${posts.length} posts, ${Object.keys(tagMap).length} tag pages, sitemap.xml, rss.xml.`
  );
}

build();
