'use strict';

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  files: [],      // [{filename, channel, period, rows:[{code,name,price,inventory,soldQty,salesAmt,channel,period}]}]
  charts: {},     // chart instances keyed by id
  activeTab: 1,
};

// ── CSV / File Loading ───────────────────────────────────────────────────────
async function loadFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const bytes = new Uint8Array(e.target.result);
        const text = new TextDecoder('shift-jis').decode(bytes);
        resolve(parseCSV(text, file.name));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function parseCSV(text, filename) {
  const lines = text.split(/\r?\n/);
  const meta = extractMeta(filename);
  const rows = [];

  // Skip header row (index 0)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = parseCSVLine(line);
    if (fields.length < 10) continue;

    const code = fields[0].trim();
    // Filter out non-standard codes (gift wrapping etc.)
    if (!/^\d{7,}$/.test(code)) continue;

    const name = fields[1].trim();
    if (!name) continue;

    rows.push({
      code,
      name,
      price:     parseNum(fields[2]),
      inventory: parseNum(fields[4]),
      soldQty:   parseNum(fields[8]),
      salesAmt:  parseNum(fields[9]),
      channel:   meta.channel,
      period:    meta.period,
    });
  }

  return { filename, channel: meta.channel, period: meta.period, rows };
}

function parseCSVLine(line) {
  const fields = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { fields.push(cur); cur = ''; }
    else { cur += c; }
  }
  fields.push(cur);
  return fields;
}

function parseNum(str) {
  if (!str) return 0;
  const n = parseInt(str.replace(/[,\s"]/g, ''), 10);
  return isNaN(n) ? 0 : n;
}

// ファイル名から「チャネル」と「期間」を抽出
// 例: "楽天・26年５月.csv" → {channel:"楽天", period:"26年５月"}
function extractMeta(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const m = base.match(/^(.+?)[・\s_\-](.+)$/);
  if (m) return { channel: m[1].trim(), period: m[2].trim() };
  return { channel: base, period: '' };
}

// ── Product Grouping ─────────────────────────────────────────────────────────
// ルシアン公式サイト (lecien.co.jp/inner) の商品ラインナップをもとに定義。
// 商品名にキーワードが含まれていればそのグループ名を返す（上から順に先勝ち）。
// どれにも該当しない場合はアンダースコア/スペース末尾除去でフォールバック。
const PRODUCT_KEYWORDS = [
  // ─ 肩らっくす / カタラックス ─
  ['肩らっくす',                   '肩らっくす'],
  ['カタラックス',                  '肩らっくす'],
  // ─ menca. ─
  ['menca',                        'menca.'],
  ['メンカ',                        'menca.'],
  // ─ スポーツまもり ─
  ['スポーツまもり',                'スポーツまもり'],
  // ─ メイクキープ ─
  ['MAKE KEEP',                    'メイクキープ'],
  ['メイクキープ',                  'メイクキープ'],
  // ─ リフレッシュクーラー ─
  ['Refresh Cooler',               'リフレッシュクーラー'],
  ['リフレッシュクーラー',           'リフレッシュクーラー'],
  // ─ マジカルフィット Beauty ─
  ['マジカルフィット',              'マジカルフィット Beauty'],
  ['Magical Fit',                  'マジカルフィット Beauty'],
  // ─ パワーシェイプ ─
  ['パワーシェイプ',                'パワーシェイプ'],
  ['Powr Shape',                   'パワーシェイプ'],
  ['Power Shape',                  'パワーシェイプ'],
  // ─ ビューティーボディシェイパー ─
  ['ビューティーボディシェイパー',   'ビューティーボディシェイパー'],
  ['ビューティーボディ',            'ビューティーボディシェイパー'],
  // ─ シルエット ─
  ['シルエット',                   'シルエット'],
  // ─ 部活ブラ ─
  ['部活ブラ',                     '部活ブラ'],
  // ─ ハツブラ（ファーストブラ）─
  ['ハツブラ',                     'ハツブラ'],
  ['ファーストブラ',                'ハツブラ'],
  ['初めてブラ',                   'ハツブラ'],
  // ─ キレイ魅せ ─
  ['キレイ魅せ',                   'キレイ魅せ'],
  // ─ 肌フィット ─
  ['肌フィット',                    '肌フィット'],
  // ─ ふんわりアップ ─
  ['ふんわりアップ',               'ふんわりアップ'],
  // ─ グラマー（大きめバスト）─
  ['グラマー',                     'グラマー'],
  // ─ ナイトスタイル ─
  ['ナイトスタイル',               'ナイトスタイル'],
  // ─ シャレタ（シニア）─
  ['シャレタ',                     'シャレタ'],
  // ─ グッドチョイス ─
  ['グッドチョイス',               'グッドチョイス'],
  // ─ 一生涯フィッティング ─
  ['一生涯',                       '一生涯フィッティング'],
  // ─ クロスメッシュ ─
  ['クロスメッシュ',               'クロスメッシュ'],
  // ─ Frameey（iff）─
  ['Frameey',                      'Frameey'],
  // ─ PEACH JOHN コラボ ─
  ['PEACH JOHN',                   'PEACH JOHN'],
];

function groupName(name) {
  if (!name) return '';
  const lower = name.toLowerCase();

  // 1. キーワードマッチ（商品名に含まれるキーワードでグループ判定）
  for (const [kw, label] of PRODUCT_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) return label;
  }

  // 2. フォールバック：アンダースコア区切りなら末尾2セグメント除去、
  //    スペース区切りなら末尾2トークン除去
  const t = name.trim();
  if (t.includes('_')) {
    const parts = t.split('_');
    if (parts.length >= 3) return parts.slice(0, -2).join('_');
    if (parts.length === 2) return parts[0];
    return t;
  }
  const tokens = t.split(/\s+/);
  if (tokens.length >= 4) return tokens.slice(0, -2).join(' ');
  if (tokens.length === 3) return tokens.slice(0, -1).join(' ');
  return t;
}

// ── Data Helpers ─────────────────────────────────────────────────────────────
function getChannels() {
  return [...new Set(state.files.map(f => f.channel))].sort();
}
function getPeriods() {
  return [...new Set(state.files.map(f => f.period))].sort();
}

function filteredRows(channel, period) {
  return state.files
    .filter(f => (!channel || f.channel === channel) && (!period || f.period === period))
    .flatMap(f => f.rows);
}

function byChannel(rows) {
  const m = {};
  for (const r of rows) {
    if (!m[r.channel]) m[r.channel] = { channel: r.channel, qty: 0, amount: 0 };
    m[r.channel].qty    += r.soldQty;
    m[r.channel].amount += r.salesAmt;
  }
  return Object.values(m);
}

function byProduct(rows) {
  const m = {};
  for (const r of rows) {
    const g = groupName(r.name);
    if (!m[g]) m[g] = { name: g, qty: 0, amount: 0 };
    m[g].qty    += r.soldQty;
    m[g].amount += r.salesAmt;
  }
  return Object.values(m);
}

// ── Selectors update ─────────────────────────────────────────────────────────
function updateSelectors() {
  const channels = getChannels();
  const periods  = getPeriods();

  const chOpts = '<option value="">全チャネル</option>' +
    channels.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  const prOpts = '<option value="">全期間</option>' +
    periods.map(p => `<option value="${escHtml(p)}">${escHtml(p)}</option>`).join('');

  ['t1-channel','t2-channel','t3-channel'].forEach(id => {
    const sel = document.getElementById(id), cur = sel.value;
    sel.innerHTML = chOpts;
    if (cur) sel.value = cur;
  });
  ['t1-period','t2-period'].forEach(id => {
    const sel = document.getElementById(id), cur = sel.value;
    sel.innerHTML = prOpts;
    if (cur) sel.value = cur;
  });
}

// ── Render helpers ───────────────────────────────────────────────────────────
function destroyChart(id) {
  if (state.charts[id]) { state.charts[id].destroy(); state.charts[id] = null; }
}

function setChartHeight(wrapId, items, rowPx = 32, min = 320) {
  const h = Math.max(min, items * rowPx + 80);
  document.getElementById(wrapId).style.height = h + 'px';
  return h;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmt(n) { return n.toLocaleString('ja-JP'); }

// ── Tab 1: Overall Sales ─────────────────────────────────────────────────────
function renderTab1() {
  const ch = document.getElementById('t1-channel').value;
  const pr = document.getElementById('t1-period').value;
  const rows = filteredRows(ch, pr);

  const totalAmt  = rows.reduce((s, r) => s + r.salesAmt, 0);
  const totalQty  = rows.reduce((s, r) => s + r.soldQty, 0);
  const prodCount = new Set(rows.map(r => groupName(r.name))).size;
  const skuCount  = rows.length;

  document.getElementById('t1-cards').innerHTML = `
    <div class="card"><div class="card-val">${fmt(totalAmt)}円</div><div class="card-lbl">売上金額合計</div></div>
    <div class="card"><div class="card-val">${fmt(totalQty)}個</div><div class="card-lbl">売上数量合計</div></div>
    <div class="card"><div class="card-val">${prodCount}</div><div class="card-lbl">商品種類数</div></div>
    <div class="card"><div class="card-val">${skuCount}</div><div class="card-lbl">SKU数</div></div>
  `;

  const chData = byChannel(rows);
  if (chData.length === 0) return;

  destroyChart('chart1');
  document.querySelector('#tab-1 .chart-wrap').style.height = '350px';
  const ctx = document.getElementById('chart1').getContext('2d');
  state.charts['chart1'] = new Chart(ctx, {
    data: {
      labels: chData.map(c => c.channel),
      datasets: [
        {
          type: 'bar', label: '売上金額 (円)',
          data: chData.map(c => c.amount),
          backgroundColor: 'rgba(59,130,246,.8)',
          yAxisID: 'y',
        },
        {
          type: 'bar', label: '売上数量 (個)',
          data: chData.map(c => c.qty),
          backgroundColor: 'rgba(16,185,129,.8)',
          yAxisID: 'y1',
        }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        title: { display: true, text: 'チャネル別売上' },
      },
      scales: {
        y:  { position: 'left',  title: { display: true, text: '売上金額 (円)' } },
        y1: { position: 'right', title: { display: true, text: '売上数量 (個)' }, grid: { drawOnChartArea: false } },
      }
    }
  });
}

// ── Tab 2: Per-Product Sales ──────────────────────────────────────────────────
function renderTab2() {
  const ch     = document.getElementById('t2-channel').value;
  const pr     = document.getElementById('t2-period').value;
  const metric = document.getElementById('t2-metric').value;
  const topn   = parseInt(document.getElementById('t2-topn').value) || 0;
  const search = document.getElementById('t2-search').value.trim();

  let rows = filteredRows(ch, pr);
  let products = byProduct(rows);

  // Search filter (comma-separated OR)
  if (search) {
    const terms = search.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    products = products.filter(p => terms.some(t => p.name.toLowerCase().includes(t)));
  }

  // Sort descending
  const key = metric === 'qty' ? 'qty' : 'amount';
  products.sort((a, b) => b[key] - a[key]);

  if (topn > 0) products = products.slice(0, topn);

  if (products.length === 0) {
    destroyChart('chart2');
    document.getElementById('t2-chart-wrap').innerHTML = '<div class="empty-state">データがありません</div>';
    return;
  }

  setChartHeight('t2-chart-wrap', products.length);

  destroyChart('chart2');
  // Re-create canvas if needed
  let canvas = document.getElementById('chart2');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'chart2';
    document.getElementById('t2-chart-wrap').innerHTML = '';
    document.getElementById('t2-chart-wrap').appendChild(canvas);
  }

  const label = metric === 'qty' ? '売上数量 (個)' : '売上金額 (円)';
  const ctx = canvas.getContext('2d');
  state.charts['chart2'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: products.map(p => p.name.length > 45 ? p.name.slice(0, 45) + '…' : p.name),
      datasets: [{
        label,
        data: products.map(p => p[key]),
        backgroundColor: 'rgba(59,130,246,.8)',
        borderColor: 'rgba(59,130,246,1)',
        borderWidth: 1,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: `商品別${label}（降順）` },
        tooltip: {
          callbacks: {
            label: (item) => {
              const p = products[item.dataIndex];
              return [`${label}：${fmt(item.raw)}`, `売上金額：${fmt(p.amount)}円`, `売上数量：${fmt(p.qty)}個`];
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: label } },
        y: { ticks: { font: { size: 11 } } }
      }
    }
  });
}

// ── Tab 3: Inventory Analysis ─────────────────────────────────────────────────
function renderTab3() {
  const ch   = document.getElementById('t3-channel').value;
  const topn = parseInt(document.getElementById('t3-topn').value) || 0;

  const relevantFiles = state.files.filter(f => !ch || f.channel === ch);
  if (relevantFiles.length === 0) return;

  // Distinct periods loaded for this channel → used to compute monthly avg
  const periods = [...new Set(relevantFiles.map(f => f.period))].sort();
  const periodCount = periods.length || 1;
  const latestPeriod = periods[periods.length - 1];

  // Inventory: from the latest period
  const invRows = relevantFiles.filter(f => f.period === latestPeriod).flatMap(f => f.rows);

  // Sales: across all periods
  const allRows = relevantFiles.flatMap(f => f.rows);

  // Total sold per SKU code across all periods
  const salesMap = {};
  for (const r of allRows) {
    salesMap[r.code] = (salesMap[r.code] || 0) + r.soldQty;
  }

  // Aggregate inventory per SKU code (in case same SKU appears in multiple files)
  const invMap = {};
  for (const r of invRows) {
    if (!invMap[r.code]) invMap[r.code] = { code: r.code, name: r.name, inventory: 0 };
    invMap[r.code].inventory += r.inventory;
  }

  // Compute months remaining
  const items = Object.values(invMap)
    .filter(inv => inv.inventory > 0)
    .map(inv => {
      const totalSold   = salesMap[inv.code] || 0;
      const monthlyRate = totalSold / periodCount;
      const monthsLeft  = monthlyRate > 0 ? inv.inventory / monthlyRate : Infinity;
      return {
        code: inv.code,
        name: inv.name,
        inventory: inv.inventory,
        monthlyRate: Math.round(monthlyRate * 10) / 10,
        monthsLeft: monthsLeft === Infinity ? Infinity : Math.round(monthsLeft * 10) / 10,
      };
    });

  // Sort ascending (shortest life first = most urgent)
  items.sort((a, b) => {
    const am = a.monthsLeft === Infinity ? 99999 : a.monthsLeft;
    const bm = b.monthsLeft === Infinity ? 99999 : b.monthsLeft;
    return am - bm;
  });

  const displayed = topn > 0 ? items.slice(0, topn) : items;

  if (displayed.length === 0) {
    destroyChart('chart3');
    document.getElementById('t3-chart-wrap').innerHTML = '<div class="empty-state">データがありません</div>';
    document.getElementById('t3-table').innerHTML = '';
    return;
  }

  setChartHeight('t3-chart-wrap', displayed.length, 28);

  // Bar colors by urgency
  const colors = displayed.map(it => {
    const m = it.monthsLeft === Infinity ? 9999 : it.monthsLeft;
    if (m < 1) return 'rgba(239,68,68,.85)';
    if (m < 2) return 'rgba(249,115,22,.85)';
    if (m < 3) return 'rgba(234,179,8,.85)';
    return 'rgba(16,185,129,.85)';
  });

  destroyChart('chart3');
  let canvas = document.getElementById('chart3');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'chart3';
    document.getElementById('t3-chart-wrap').innerHTML = '';
    document.getElementById('t3-chart-wrap').appendChild(canvas);
  }

  const ctx = canvas.getContext('2d');
  state.charts['chart3'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: displayed.map(it => it.name.length > 40 ? it.name.slice(0, 40) + '…' : it.name),
      datasets: [{
        label: '残り在庫月数',
        data: displayed.map(it => it.monthsLeft === Infinity ? null : it.monthsLeft),
        backgroundColor: colors,
        borderColor: colors.map(c => c.replace('.85)', '1)')),
        borderWidth: 1,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: `残り在庫月数ランキング（昇順）　基準期間：${latestPeriod}` },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const it = displayed[items[0].dataIndex];
              return [
                `在庫数：${fmt(it.inventory)}個`,
                `月間販売数：${it.monthlyRate}個`,
              ];
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: '残り月数' } },
        y: { ticks: { font: { size: 10 } } },
      }
    }
  });

  // Table
  renderTab3Table(displayed);
}

function renderTab3Table(items) {
  const tbody = items.map(it => {
    const m = it.monthsLeft === Infinity ? '∞' : it.monthsLeft;
    const cls = it.monthsLeft < 1 ? 'row-red' : it.monthsLeft < 2 ? 'row-orange' : it.monthsLeft < 3 ? 'row-yellow' : '';
    return `<tr class="${cls}">
      <td title="${escHtml(it.name)}">${escHtml(it.name.length > 60 ? it.name.slice(0,60)+'…' : it.name)}</td>
      <td>${fmt(it.inventory)}</td>
      <td>${it.monthlyRate}</td>
      <td>${m}</td>
    </tr>`;
  }).join('');

  document.getElementById('t3-table').innerHTML = `
    <table>
      <thead><tr><th>SKU名</th><th>在庫数</th><th>月間販売数</th><th>残り月数</th></tr></thead>
      <tbody>${tbody}</tbody>
    </table>
  `;
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', +b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.getElementById(`tab-${tab}`).classList.remove('hidden');
  renderActiveTab();
}

function renderActiveTab() {
  if (state.files.length === 0) return;
  if (state.activeTab === 1) renderTab1();
  else if (state.activeTab === 2) renderTab2();
  else if (state.activeTab === 3) renderTab3();
}

// ── File management ──────────────────────────────────────────────────────────
async function addFile(file) {
  const btn = document.querySelector('.btn-primary');
  btn.textContent = '読み込み中…';
  btn.disabled = true;
  try {
    const data = await loadFile(file);
    // Replace if same filename
    const idx = state.files.findIndex(f => f.filename === data.filename);
    if (idx >= 0) state.files[idx] = data; else state.files.push(data);
    renderUI();
  } catch (e) {
    alert(`読み込みエラー: ${e.message}`);
  } finally {
    btn.textContent = 'ファイルを選択';
    btn.disabled = false;
  }
}

function removeFile(i) {
  state.files.splice(i, 1);
  renderUI();
}

function renderUI() {
  const hasFIles = state.files.length > 0;
  document.getElementById('files-section').classList.toggle('hidden', !hasFIles);
  document.getElementById('analysis-section').classList.toggle('hidden', !hasFIles);

  if (!hasFIles) return;

  // Files list
  document.getElementById('files-list').innerHTML = state.files.map((f, i) => `
    <div class="file-card">
      <span class="file-channel">${escHtml(f.channel)}</span>
      <span class="file-period">${escHtml(f.period)}</span>
      <span class="file-rows">${f.rows.length}件</span>
      <span class="file-name" title="${escHtml(f.filename)}">${escHtml(f.filename)}</span>
      <button class="btn-remove" onclick="removeFile(${i})">✕</button>
    </div>
  `).join('');

  updateSelectors();
  renderActiveTab();
}

// ── Event listeners ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // File input
  document.getElementById('file-input').addEventListener('change', async (e) => {
    for (const f of e.target.files) await addFile(f);
    e.target.value = '';
  });

  // Drag & drop
  const dz = document.getElementById('dropzone');
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', async (e) => {
    e.preventDefault(); dz.classList.remove('over');
    for (const f of e.dataTransfer.files) {
      if (f.name.toLowerCase().endsWith('.csv')) await addFile(f);
    }
  });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(+btn.dataset.tab));
  });

  // Tab 1 controls
  ['t1-channel','t1-period'].forEach(id =>
    document.getElementById(id).addEventListener('change', renderTab1));

  // Tab 2 controls
  ['t2-channel','t2-period','t2-metric','t2-topn'].forEach(id =>
    document.getElementById(id).addEventListener('change', renderTab2));
  document.getElementById('t2-search').addEventListener('input', renderTab2);

  // Tab 3 controls
  ['t3-channel','t3-topn'].forEach(id =>
    document.getElementById(id).addEventListener('change', renderTab3));
});
