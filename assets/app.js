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
};

const state = {
  raw: { items: [] },
  q: '',
  type: '',
  tag: '',
  time: '', // '', '7d','30d','1y','5y'
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

function render(items) {
  els.grid.innerHTML = '';
  els.empty.classList.toggle('hidden', items.length > 0);
  for (const it of items) {
    const card = document.createElement('article');
    card.className = 'card' + (state.read.has(it.id) ? ' read' : '');
    const typeBadge = `<span class="badge">${it.type}</span>`;
    const tags = (it.tags || []).map((t) => `<span class="badge">${escapeHtml(t)}</span>`).join('');
    card.innerHTML = `
      <div class="meta-line">
        ${typeBadge}
        <span>${escapeHtml(it.source || '')}</span>
        <span>路</span>
        <span>${fmtDate(it.publishedAt)}</span>
      </div>
      <h3><a href="${it.url}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a></h3>
      <div class="summary">${escapeHtml(it.summary || '')}</div>
      <div class="tags">${tags}</div>
    `;
    card.addEventListener('click', () => {
      state.read.add(it.id);
      saveRead();
      card.classList.add('read');
    });
    els.grid.appendChild(card);
  }
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
  const counts = { paper: 0, news: 0, video: 0 };
  for (const it of state.raw.items) { if (counts[it.type] !== undefined) counts[it.type]++; }
  els.meta.textContent = `共 ${ordered.length} 条（总源：${state.raw.count}，生成：${state.raw.generatedAt || ''}｜论文${counts.paper}·新闻${counts.news}·视频${counts.video}）`;
}async function loadData(force) {
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
}function setupEvents() {
  els.search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      state.q = e.target.value;
      filterItems();
    }
  });
  els.type.addEventListener('change', (e) => {
    state.type = e.target.value;
    filterItems();
  });
  els.tag.addEventListener('change', (e) => {
    state.tag = e.target.value;
    filterItems();
  });
  els.time.addEventListener('change', (e) => {
    state.time = e.target.value;
    filterItems();
  });
  if (els.sort) {
    els.sort.addEventListener('change', (e) => {
      state.sort = e.target.value;
      filterItems();
    });
  }
  els.refresh.addEventListener('click', async () => {
    els.refresh.disabled = true;
    els.refresh.textContent = '鍒锋柊涓€?;
    try {
      await loadData(true);
    } finally {
      els.refresh.disabled = false;
      els.refresh.textContent = '鍒锋柊';
    }
  });
  els.toggleTheme.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = cur === 'light' ? 'dark' : 'light';
  });
}

(async function init() {
  setupEvents();
  // 榛樿锛氳繎30澶?+ 鐑棬浼樺厛锛堣嚜鍔ㄢ€滄渶杩戠儹闂ㄢ€濓級
  if (!state.time) state.time = '30d';
  if (!state.sort) state.sort = 'hot';
  if (els.time) els.time.value = state.time;
  if (els.sort) els.sort.value = state.sort;
  try {
    await loadData(false);
  } catch (e) {
    console.error(e);
    els.empty.classList.remove('hidden');
  }
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
    if (it.type === 'paper') score *= 1.12;
    else if (it.type === 'news') score *= 1.05;
    else if (it.type === 'video') score *= 1.02;
    const text = ((it.title || '') + ' ' + (it.summary || '')).toLowerCase();
    if (/(survey|缁艰堪)/.test(text)) score *= 1.15;
    if (/(benchmark|dataset|鏁版嵁闆?/.test(text)) score *= 1.1;
    if (/(embodied ai|鍏疯韩鏅鸿兘)/.test(text)) score *= 1.08;
    if (/(autonomous driving|self-driving|鑷姩椹鹃┒|鑷嫊椐曢)/.test(text)) score *= 1.06;
    return score;
  }
  return [...items].sort((a, b) => hotScore(b) - hotScore(a));
}


