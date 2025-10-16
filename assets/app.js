const DATA_URL = 'data/items.json';

const els = {
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
  meta: document.getElementById('meta'),
  search: document.getElementById('search'),
  type: document.getElementById('typeFilter'),
  tag: document.getElementById('tagFilter'),
  time: document.getElementById('timeFilter'),
  sort: document.getElementById('sortFilter'),
  refresh: document.getElementById('refreshBtn'),
  toggleTheme: document.getElementById('toggleTheme'),
  featured: document.getElementById('featured'),
  featuredPlayer: document.getElementById('featuredPlayer'),
  modal: document.getElementById('playerModal'),
  modalBody: document.getElementById('modalBody'),
};

const state = {
  raw: { items: [] },
  q: '',
  type: '',
  tag: '',
  time: '', // '7d' | '30d' | '1y' | '5y'
  sort: 'hot', // 'latest' | 'hot'
  read: new Set(JSON.parse(localStorage.getItem('read-ids') || '[]')),
};

function saveRead() {
  localStorage.setItem('read-ids', JSON.stringify([...state.read]));
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function escapeHtml(s) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s).replace(/[&<>"']/g, (c) => map[c]);
}

function toEmbedUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    // YouTube
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      let id = '';
      if (host.includes('youtu.be')) {
        id = u.pathname.replace(/^\//, '').split('/')[0];
      } else if (u.pathname.startsWith('/watch')) {
        id = u.searchParams.get('v') || '';
      } else if (u.pathname.startsWith('/shorts/')) {
        id = u.pathname.split('/')[2] || u.pathname.split('/')[1] || '';
      }
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    // Bilibili
    if (host.includes('bilibili.com')) {
      const m = u.pathname.match(/\/video\/(BV[\w]+)/i);
      const bvid = u.searchParams.get('bvid') || (m ? m[1] : '');
      if (bvid) return `https://player.bilibili.com/player.html?bvid=${bvid}&page=1&high_quality=1&autoplay=1`;
    }
  } catch (e) { /* noop */ }
  return null;
}

function openPlayer(src) {
  if (!els.modal || !els.modalBody) return;
  els.modalBody.innerHTML = `
    <div class="video-embed">
      <iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>
    </div>`;
  els.modal.classList.remove('hidden');
}

function closePlayer() {
  if (!els.modal || !els.modalBody) return;
  els.modal.classList.add('hidden');
  els.modalBody.innerHTML = '';
}

function render(items) {
  els.grid.innerHTML = '';
  els.empty.classList.toggle('hidden', items.length > 0);
  for (const it of items) {
    const card = document.createElement('article');
    card.className = 'card' + (state.read.has(it.id) ? ' read' : '');
    const typeBadge = `<span class="badge">${it.type}</span>`;
    const tags = (it.tags || []).map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join('');
    const playBtn = it.type === 'video' ? '<div class="actions"><button class="btn" data-action="play">▶ 播放</button></div>' : '';
    card.innerHTML = `
      <div class="meta-line">
        ${typeBadge}
        <span>${escapeHtml(it.source || '')}</span>
        <span>·</span>
        <span>${fmtDate(it.publishedAt)}</span>
      </div>
      <h3><a href="${it.url}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a></h3>
      <div class="summary">${escapeHtml(it.summary || '')}</div>
      <div class="tags">${tags}</div>
      ${playBtn}
    `;
    card.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.dataset && t.dataset.action === 'play') {
        e.stopPropagation();
        const src = toEmbedUrl(it.url);
        if (src) openPlayer(src);
        return;
      }
      state.read.add(it.id); saveRead(); card.classList.add('read');
    });
    els.grid.appendChild(card);
  }
}

function updateFeatured(items) {
  if (!els.featured || !els.featuredPlayer) return;
  const vid = items.find((x) => x.type === 'video') || state.raw.items.find((x) => x.type === 'video');
  if (!vid) { els.featured.classList.add('hidden'); els.featuredPlayer.innerHTML = ''; return; }
  const src = toEmbedUrl(vid.url);
  if (!src) { els.featured.classList.add('hidden'); els.featuredPlayer.innerHTML = ''; return; }
  els.featured.classList.remove('hidden');
  els.featuredPlayer.innerHTML = `<iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
}

function filterItems() {
  const q = state.q.trim().toLowerCase();
  const now = Date.now();
  let cutoff = 0;
  if (state.time === '7d') cutoff = now - 7 * 24 * 3600 * 1000;
  else if (state.time === '30d') cutoff = now - 30 * 24 * 3600 * 1000;
  else if (state.time === '1y') cutoff = new Date(new Date().getFullYear() - 1, new Date().getMonth(), new Date().getDate()).getTime();
  else if (state.time === '5y') cutoff = new Date(new Date().getFullYear() - 5, 0, 1).getTime();

  const filtered = state.raw.items.filter((it) => {
    const byType = !state.type || it.type === state.type;
    const byTag = !state.tag || (it.tags || []).includes(state.tag);
    const byQ = !q || (it.title + ' ' + (it.summary || '')).toLowerCase().includes(q);
    const t = it.publishedAt ? new Date(it.publishedAt).getTime() : now;
    const byTime = cutoff === 0 || t >= cutoff;
    return byType && byTag && byQ && byTime;
  });
  const ordered = sortItems(filtered, state.sort);
  render(ordered);
  updateFeatured(ordered);
  const counts = { paper: 0, news: 0, video: 0 };
  for (const it of state.raw.items) { if (counts[it.type] !== undefined) counts[it.type]++; }
  els.meta.textContent = `共 ${ordered.length} 条（总源：${state.raw.count}，生成：${state.raw.generatedAt || ''}｜论文${counts.paper}·新闻${counts.news}·视频${counts.video}）`;
}

async function loadData(force) {
  const url = force ? `${DATA_URL}?_=${Date.now()}` : DATA_URL;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('加载数据失败');
    const data = await res.json();
    if (!data || !Array.isArray(data.items) || data.items.length === 0) {
      const seedEl = document.getElementById('seed-data');
      if (seedEl?.textContent) {
        state.raw = JSON.parse(seedEl.textContent);
        state.time = '5y';
        if (els.time) els.time.value = '5y';
      } else {
        state.raw = data || { items: [] };
      }
    } else {
      state.raw = data;
    }
    filterItems();
  } catch (e) {
    const seedEl = document.getElementById('seed-data');
    if (seedEl?.textContent) {
      state.raw = JSON.parse(seedEl.textContent);
      state.time = '5y';
      if (els.time) els.time.value = '5y';
      filterItems();
    } else {
      throw e;
    }
  }
}

function setupEvents() {
  els.search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { state.q = e.target.value; filterItems(); }
  });
  els.type.addEventListener('change', (e) => { state.type = e.target.value; filterItems(); });
  els.tag.addEventListener('change', (e) => { state.tag = e.target.value; filterItems(); });
  els.time.addEventListener('change', (e) => { state.time = e.target.value; filterItems(); });
  if (els.sort) els.sort.addEventListener('change', (e) => { state.sort = e.target.value; filterItems(); });
  els.refresh.addEventListener('click', async () => {
    els.refresh.disabled = true; els.refresh.textContent = '刷新中…';
    try { await loadData(true); } finally { els.refresh.disabled = false; els.refresh.textContent = '刷新'; }
  });
  els.toggleTheme.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = cur === 'light' ? 'dark' : 'light';
  });
  if (els.modal) {
    els.modal.addEventListener('click', (e) => { if (e.target.dataset && e.target.dataset.close) closePlayer(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePlayer(); });
  }
}

(async function init() {
  setupEvents();
  if (!state.time) state.time = '30d';
  if (!state.sort) state.sort = 'hot';
  if (els.time) els.time.value = state.time;
  if (els.sort) els.sort.value = state.sort;
  try { await loadData(false); } catch (e) { console.error(e); els.empty.classList.remove('hidden'); }
})();

function sortItems(items, sort) {
  const now = Date.now();
  if (sort === 'latest') {
    return [...items].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
  }
  function hotScore(it) {
    const t = it.publishedAt ? new Date(it.publishedAt).getTime() : now;
    const days = Math.max(0, (now - t) / (24 * 3600 * 1000));
    let score = 1 / (1 + days);
    if (it.type === 'paper') score *= 1.12; else if (it.type === 'news') score *= 1.05; else if (it.type === 'video') score *= 1.02;
    const text = ((it.title || '') + ' ' + (it.summary || '')).toLowerCase();
    if (/(survey|综述)/.test(text)) score *= 1.15;
    if (/(benchmark|dataset|数据集)/.test(text)) score *= 1.10;
    if (/(embodied ai|具身智能)/.test(text)) score *= 1.08;
    if (/(autonomous driving|self-driving|自动驾驶|自動駕駛)/.test(text)) score *= 1.06;
    return score;
  }
  return [...items].sort((a, b) => hotScore(b) - hotScore(a));
}

