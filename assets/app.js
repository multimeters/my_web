const DATA_URL = 'data/items.json';

const els = {
  grid: document.getElementById('grid'),
  empty: document.getElementById('empty'),
  meta: document.getElementById('meta'),
  search: document.getElementById('search'),
  type: document.getElementById('typeFilter'),
  tag: document.getElementById('tagFilter'),
  refresh: document.getElementById('refreshBtn'),
  toggleTheme: document.getElementById('toggleTheme'),
};

const state = {
  raw: { items: [] },
  q: '',
  type: '',
  tag: '',
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

function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }

function render(items) {
  els.grid.innerHTML = '';
  els.empty.classList.toggle('hidden', items.length > 0);
  for (const it of items) {
    const card = document.createElement('article');
    card.className = 'card' + (state.read.has(it.id) ? ' read' : '');
    const typeBadge = `<span class="badge">${it.type}</span>`;
    const tags = (it.tags || []).map(t => `<span class="badge">${escapeHtml(t)}</span>`).join('');
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
    `;
    card.addEventListener('click', (e) => {
      // mark as read when user clicks inside card (but keep link behavior)
      state.read.add(it.id); saveRead(); card.classList.add('read');
    });
    els.grid.appendChild(card);
  }
}

function filterItems() {
  const q = state.q.trim().toLowerCase();
  const filtered = state.raw.items.filter(it => {
    const byType = !state.type || it.type === state.type;
    const byTag = !state.tag || (it.tags || []).includes(state.tag);
    const byQ = !q || (it.title + ' ' + (it.summary||'')).toLowerCase().includes(q);
    return byType && byTag && byQ;
  });
  render(filtered);
  els.meta.textContent = `共 ${filtered.length} 条（来源总计：${state.raw.count}，生成时间：${state.raw.generatedAt || ''}）`;
}

async function loadData(force) {
  const url = force ? `${DATA_URL}?_=${Date.now()}` : DATA_URL;
  const res = await fetch(url);
  if (!res.ok) throw new Error('加载数据失败');
  state.raw = await res.json();
  filterItems();
}

function setupEvents() {
  els.search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { state.q = e.target.value; filterItems(); }
  });
  els.type.addEventListener('change', (e) => { state.type = e.target.value; filterItems(); });
  els.tag.addEventListener('change', (e) => { state.tag = e.target.value; filterItems(); });
  els.refresh.addEventListener('click', async () => {
    els.refresh.disabled = true; els.refresh.textContent = '刷新中…';
    try { await loadData(true); } finally { els.refresh.disabled = false; els.refresh.textContent = '刷新'; }
  });
  els.toggleTheme.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = cur === 'light' ? 'dark' : 'light';
  });
}

(async function init() {
  setupEvents();
  try { await loadData(false); } catch (e) { console.error(e); els.empty.classList.remove('hidden'); }
})();

