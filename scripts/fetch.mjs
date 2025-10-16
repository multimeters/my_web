// Fetches robotics/autonomous driving/embodied AI content from arXiv, RSS, YouTube RSS,
// and Bilibili (via RSSHub). Summarizes items and writes to data/items.json.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { XMLParser } from 'fast-xml-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const DATA_DIR = path.join(repoRoot, 'data');
const DATA_FILE = path.join(DATA_DIR, 'items.json');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  trimValues: true,
  parseTagValue: true,
});

const fetchFn = globalThis.fetch ?? (await import('node-fetch')).default;

const nowIso = () => new Date().toISOString();

function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function takeSentences(text, maxChars = 400) {
  if (!text) return '';
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?。！？])\s+/)
    .filter(Boolean);
  const out = [];
  let total = 0;
  for (const s of sentences) {
    if (total + s.length > maxChars && out.length > 0) break;
    out.push(s);
    total += s.length;
    if (total >= maxChars) break;
  }
  return out.join(' ');
}

function tagger(title = '', summary = '') {
  const text = `${title} ${summary}`.toLowerCase();
  const tags = new Set();
  if (/autonomous driving|self-driving|自动驾驶|自動駕駛/.test(text)) tags.add('Autonomous Driving');
  if (/\brobot\b|robotics|机器人/.test(text)) tags.add('Robotics');
  if (/embodied|具身智能/.test(text)) tags.add('Embodied AI');
  if (/(large language model|\bllm\b)/.test(text)) tags.add('LLM');
  if (/reinforcement learning|\brl\b/.test(text)) tags.add('RL');
  if (/vision|perception|视觉/.test(text)) tags.add('Vision');
  if (/planning|mpc|slam|mapping/.test(text)) tags.add('Planning');
  return Array.from(tags);
}

function normalizeItem({ id, title, url, publishedAt, summary, source, type }) {
  const clean = stripHtml(summary);
  const brief = takeSentences(clean, 420);
  const tags = tagger(title, brief);
  return {
    id: id || url || title,
    title: title?.trim() || '(untitled)',
    url,
    publishedAt: publishedAt || nowIso(),
    summary: brief,
    source,
    type, // 'paper' | 'news' | 'video'
    tags,
  };
}

async function fetchText(url) {
  const res = await fetchFn(url, { headers: { 'User-Agent': 'robotics-daily/0.1' } });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return res.text();
}

async function fetchArxiv(query, maxResults = 25) {
  const base = 'http://export.arxiv.org/api/query';
  const url = `${base}?search_query=${encodeURIComponent(query)}&sortBy=lastUpdatedDate&max_results=${maxResults}`;
  const xml = await fetchText(url);
  const data = parser.parse(xml);
  const feed = data.feed || {};
  const entries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];
  return entries.map((e) => {
    const link = Array.isArray(e.link)
      ? (e.link.find((l) => l.rel === 'alternate')?.href || e.link[0]?.href)
      : (e.link?.href || e.id);
    const summary = e.summary || e.title;
    return normalizeItem({
      id: e.id,
      title: e.title,
      url: link,
      publishedAt: e.published || e.updated,
      summary,
      source: 'arXiv',
      type: 'paper',
    });
  });
}

async function fetchRss(url, { source, type }) {
  const xml = await fetchText(url);
  const data = parser.parse(xml);
  // RSS 2.0
  if (data.rss?.channel?.item) {
    const items = Array.isArray(data.rss.channel.item) ? data.rss.channel.item : [data.rss.channel.item];
    return items.map((it) => normalizeItem({
      id: it.guid?.['#text'] || it.link || it.title,
      title: it.title,
      url: it.link,
      publishedAt: it.pubDate,
      summary: it.description || it.content || it['content:encoded'] || it.title,
      source,
      type,
    }));
  }
  // Atom
  if (data.feed?.entry) {
    const items = Array.isArray(data.feed.entry) ? data.feed.entry : [data.feed.entry];
    return items.map((e) => normalizeItem({
      id: e.id || (Array.isArray(e.link) ? e.link[0]?.href : e.link?.href) || e.title,
      title: e.title?.text || e.title,
      url: Array.isArray(e.link) ? e.link[0]?.href : e.link?.href,
      publishedAt: e.published || e.updated,
      summary: e.summary?.text || e.summary || e.title,
      source,
      type,
    }));
  }
  return [];
}

const SOURCES = [
  // arXiv queries
  { kind: 'arxiv', query: 'cat:cs.RO OR (all:"autonomous driving") OR (all:robotics) OR (all:"embodied ai")', label: 'arXiv' },
  // YouTube search RSS (public)
  { kind: 'rss', url: 'https://www.youtube.com/feeds/videos.xml?search_query=autonomous+driving', source: 'YouTube: Autonomous Driving', type: 'video' },
  { kind: 'rss', url: 'https://www.youtube.com/feeds/videos.xml?search_query=embodied+ai', source: 'YouTube: Embodied AI', type: 'video' },
  { kind: 'rss', url: 'https://www.youtube.com/feeds/videos.xml?search_query=robotics', source: 'YouTube: Robotics', type: 'video' },
  // Bilibili via RSSHub (public instance; may rate-limit)
  { kind: 'rss', url: 'https://rsshub.app/bilibili/keyword/%E8%87%AA%E5%8A%A8%E9%A9%BE%E9%A9%B6', source: 'Bilibili: 自动驾驶', type: 'video' },
  { kind: 'rss', url: 'https://rsshub.app/bilibili/keyword/%E6%9C%BA%E5%99%A8%E4%BA%BA', source: 'Bilibili: 机器人', type: 'video' },
  { kind: 'rss', url: 'https://rsshub.app/bilibili/keyword/%E5%85%B7%E8%BA%AB%E6%99%BA%E8%83%BD', source: 'Bilibili: 具身智能', type: 'video' },
  // News/blogs
  { kind: 'rss', url: 'https://www.therobotreport.com/feed/', source: 'The Robot Report', type: 'news' },
  { kind: 'rss', url: 'https://techcrunch.com/tag/robotics/feed/', source: 'TechCrunch Robotics', type: 'news' },
  { kind: 'rss', url: 'https://spectrum.ieee.org/topic/robotics/fulltext/feed', source: 'IEEE Spectrum Robotics', type: 'news' },
  { kind: 'rss', url: 'https://blogs.nvidia.com/blog/category/robotics/feed/', source: 'NVIDIA Blog: Robotics', type: 'news' },
  { kind: 'rss', url: 'https://blog.waymo.com/feeds/posts/default', source: 'Waymo Blog', type: 'news' },
];

async function gatherAll() {
  const results = [];
  for (const s of SOURCES) {
    try {
      if (s.kind === 'arxiv') {
        const items = await fetchArxiv(s.query, 35);
        results.push(...items);
      } else if (s.kind === 'rss') {
        const items = await fetchRss(s.url, { source: s.source, type: s.type });
        results.push(...items);
      }
      await delay(500);
    } catch (err) {
      console.error('Source error:', s, err.message);
    }
  }
  return results;
}

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = (it.url || it.title).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

function sortByDateDesc(items) {
  return [...items].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
}

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const all = await gatherAll();
  const unique = dedupe(all);
  const sorted = sortByDateDesc(unique);
  const payload = {
    generatedAt: nowIso(),
    count: sorted.length,
    items: sorted,
  };
  await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Wrote ${sorted.length} items -> ${path.relative(repoRoot, DATA_FILE)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

