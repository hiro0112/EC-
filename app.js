'use strict';

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  files: [],      // [{filename, channel, period, type, date, sortKey, rows:[...]}]
  charts: {},
  activeTab: 1,
};

// 折れ線グラフ用カラーパレット（Tab 4）
const CHART_COLORS = [
  '#3b82f6','#10b981','#ef4444','#f97316',
  '#8b5cf6','#ec4899','#eab308','#0ea5e9','#a855f7','#14b8a6',
  '#6366f1','#f43f5e','#84cc16','#06b6d4','#d946ef',
];

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

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const fields = parseCSVLine(line);
    if (fields.length < 10) continue;
    const code = fields[0].trim();
    if (!/^\d{7,}$/.test(code)) continue;
    const name = fields[1].trim();
    if (!name) continue;
    rows.push({
      code, name,
      price:     parseNum(fields[2]),
      inventory: parseNum(fields[4]),
      soldQty:   parseNum(fields[8]),
      salesAmt:  parseNum(fields[9]),
      channel:   meta.channel,
      period:    meta.period,
    });
  }

  return {
    filename,
    channel: meta.channel,
    period:  meta.period,
    type:    meta.type,
    date:    meta.date,
    sortKey: meta.sortKey,
    rows,
  };
}

function parseCSVLine(line) {
  const fields = [];
  let cur = '', inQ = false;
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

// ファイル名からメタ情報を抽出
// 週次: "アマゾン・26年5月1日.csv"  → type:'weekly',  sortKey:'2026-05-01'
// 月次: "楽天・26年５月.csv"         → type:'monthly', sortKey:'2026-05'
function extractMeta(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const m = base.match(/^(.+?)[・\s_\-](.+)$/);
  if (!m) return { channel: base, period: base, type: 'monthly', date: null, sortKey: base };

  const channel = m[1].trim();
  const period  = m[2].trim();
  // 全角数字を半角に正規化
  const norm = period.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 48));

  // 週次ファイル: X年X月X日
  const dM = norm.match(/^(\d+)年(\d+)月(\d+)日$/);
  if (dM) {
    const yr = 2000 + parseInt(dM[1]), mo = parseInt(dM[2]), dy = parseInt(dM[3]);
    const date    = new Date(yr, mo - 1, dy);
    const sortKey = `${yr}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}`;
    return { channel, period, type: 'weekly', date, sortKey };
  }

  // 月次ファイル: X年X月
  const mM = norm.match(/^(\d+)年(\d+)月/);
  if (mM) {
    const yr = 2000 + parseInt(mM[1]), mo = parseInt(mM[2]);
    const sortKey = `${yr}-${String(mo).padStart(2,'0')}`;
    return { channel, period, type: 'monthly', date: null, sortKey };
  }

  return { channel, period, type: 'monthly', date: null, sortKey: period };
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

  // 2. フォールバック：アンダースコア区切りなら末尾2セグメント除去
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
// Tab ①②: 月次ファイルのみ
function getChannels() {
  return [...new Set(state.files.filter(f => f.type === 'monthly').map(f => f.channel))].sort();
}
function getPeriods() {
  return [...new Set(state.files.filter(f => f.type === 'monthly').map(f => f.period))].sort();
}
function filteredRows(channel, period) {
  return state.files
    .filter(f => f.type === 'monthly' && (!channel || f.channel === channel) && (!period || f.period === period))
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
  // Tab ①②: 月次ファイルのチャネル・期間のみ
  const channels = getChannels();
  const periods  = getPeriods();

  const chOpts = '<option value="">全チャネル</option>' +
    channels.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  const prOpts = '<option value="">全期間</option>' +
    periods.map(p => `<option value="${escHtml(p)}">${escHtml(p)}</option>`).join('');

  ['t1-channel','t2-channel'].forEach(id => {
    const sel = document.getElementById(id), cur = sel.value;
    sel.innerHTML = chOpts;
    if (cur) sel.value = cur;
  });
  ['t1-period','t2-period'].forEach(id => {
    const sel = document.getElementById(id), cur = sel.value;
    sel.innerHTML = prOpts;
    if (cur) sel.value = cur;
  });

  // Tab ③: 月次・週次ファイル両方のチャネル
  const allChannels = [...new Set(state.files.map(f => f.channel))].sort();
  const t3chOpts = '<option value="">全チャネル</option>' +
    allChannels.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
  const t3sel = document.getElementById('t3-channel');
  const t3cur = t3sel.value;
  t3sel.innerHTML = t3chOpts;
  if (t3cur) t3sel.value = t3cur;
}

// ── Render helpers ───────────────────────────────────────────────────────────
function destroyChart(id) {
  if (state.charts[id]) { state.charts[id].destroy(); state.charts[id] = null; }
}

function setChartHeight(wrapId, items, rowPx, min) {
  rowPx = rowPx || 32;
  min   = min   || 320;
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

  if (search) {
    const terms = search.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
    products = products.filter(p => terms.some(t => p.name.toLowerCase().includes(t)));
  }

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

  // 月次・週次ファイルすべてを対象（最新 sortKey のファイルを在庫として使用）
  const relevantFiles = state.files.filter(f => !ch || f.channel === ch);
  if (relevantFiles.length === 0) return;

  // sortKey で最新ファイルを特定（ISO 日付文字列で比較）
  const latestKey = relevantFiles.reduce((mx, f) => f.sortKey > mx ? f.sortKey : mx, '');
  const invRows   = relevantFiles.filter(f => f.sortKey === latestKey).flatMap(f => f.rows);
  const latestPeriod = relevantFiles.find(f => f.sortKey === latestKey).period;

  // 在庫基準期間を表示
  const infoEl = document.getElementById('t3-latest-info');
  if (infoEl) infoEl.textContent = `在庫基準: ${latestPeriod}`;

  // 月次ファイルのみで月間販売ペースを算出
  const salesFiles  = state.files.filter(f => f.type === 'monthly' && (!ch || f.channel === ch));
  const periodCount = new Set(salesFiles.map(f => f.period)).size || 1;
  const salesMap    = {};
  for (const r of salesFiles.flatMap(f => f.rows)) {
    salesMap[r.code] = (salesMap[r.code] || 0) + r.soldQty;
  }

  const invMap = {};
  for (const r of invRows) {
    if (!invMap[r.code]) invMap[r.code] = { code: r.code, name: r.name, inventory: 0 };
    invMap[r.code].inventory += r.inventory;
  }

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
              return [`在庫数：${fmt(it.inventory)}個`, `月間販売数：${it.monthlyRate}個`];
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

// ── Tab 4: Weekly Trend ───────────────────────────────────────────────────────
// sortKey "2026-05-01" → "5/1" 形式に変換
function fmtWeekLabel(sortKey) {
  const m = sortKey.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${parseInt(m[1])}/${parseInt(m[2])}` : sortKey;
}

function renderTab4() {
  const wf = state.files.filter(f => f.type === 'weekly');
  if (wf.length === 0) {
    destroyChart('chart4a');
    destroyChart('chart4b');
    const msgA = '<div class="empty-state">週次ファイルが読み込まれていません<br><small>例：アマゾン・26年5月1日.csv</small></div>';
    document.getElementById('t4a-chart-wrap').innerHTML = msgA;
    document.getElementById('t4b-chart-wrap').innerHTML = '';
    return;
  }
  buildTab4Controls();
  renderTab4a();
  renderTab4b();
}

// ① 全体売上 週次推移（チャネル別折れ線）
function renderTab4a() {
  const metric = document.getElementById('t4-metric').value;
  const wf = state.files.filter(f => f.type === 'weekly');
  if (wf.length === 0) return;

  const channels = [...new Set(wf.map(f => f.channel))].sort();
  const dates    = [...new Set(wf.map(f => f.sortKey))].sort();
  const label    = metric === 'qty' ? '売上数量 (個)' : '売上金額 (円)';

  const datasets = channels.map((ch, i) => ({
    label: ch,
    data: dates.map(d =>
      wf.filter(f => f.channel === ch && f.sortKey === d)
        .reduce((s, f) => s + f.rows.reduce((ss, r) => ss + (metric === 'qty' ? r.soldQty : r.salesAmt), 0), 0)
    ),
    borderColor: CHART_COLORS[i % CHART_COLORS.length],
    backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '33',
    tension: 0.3, fill: false, pointRadius: 5,
  }));

  destroyChart('chart4a');
  const wrap = document.getElementById('t4a-chart-wrap');
  wrap.style.height = '350px';
  if (!wrap.querySelector('canvas')) {
    const c = document.createElement('canvas'); c.id = 'chart4a';
    wrap.innerHTML = ''; wrap.appendChild(c);
  }
  state.charts['chart4a'] = new Chart(document.getElementById('chart4a').getContext('2d'), {
    type: 'line',
    data: { labels: dates.map(fmtWeekLabel), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        title: { display: true, text: `チャネル別 週次${label}推移` },
      },
      scales: {
        y: { title: { display: true, text: label } },
        x: { title: { display: true, text: '週' } },
      }
    }
  });
}

// ② 商品別 週次推移（チャネル・商品フィルタ付き折れ線）
function renderTab4b() {
  const metric   = document.getElementById('t4-metric2').value;
  const viewMode = (document.querySelector('input[name="t4-view"]:checked') || {}).value || 'total';
  const wf = state.files.filter(f => f.type === 'weekly');
  if (wf.length === 0) return;

  const chChecked   = [...document.querySelectorAll('#t4-channels input:checked')].map(cb => cb.value);
  const activeChannels = chChecked.length ? chChecked : [...new Set(wf.map(f => f.channel))].sort();
  const prodChecked = [...document.querySelectorAll('#t4-products input:checked')].map(cb => cb.value);

  const wrap = document.getElementById('t4b-chart-wrap');

  if (prodChecked.length === 0) {
    destroyChart('chart4b');
    wrap.style.height = '80px';
    wrap.innerHTML = '<div class="empty-state">商品を選択してください</div>';
    return;
  }

  const activeWf = wf.filter(f => activeChannels.includes(f.channel));
  const dates    = [...new Set(activeWf.map(f => f.sortKey))].sort();
  const label    = metric === 'qty' ? '売上数量 (個)' : '売上金額 (円)';

  const datasets = [];
  let ci = 0;

  for (const prod of prodChecked) {
    if (viewMode === 'each') {
      for (const ch of activeChannels) {
        const data = dates.map(d =>
          activeWf.filter(f => f.channel === ch && f.sortKey === d)
            .reduce((s, f) => s + f.rows.filter(r => groupName(r.name) === prod)
              .reduce((ss, r) => ss + (metric === 'qty' ? r.soldQty : r.salesAmt), 0), 0)
        );
        datasets.push({
          label: `${prod}（${ch}）`,
          data,
          borderColor: CHART_COLORS[ci % CHART_COLORS.length],
          backgroundColor: CHART_COLORS[ci % CHART_COLORS.length] + '33',
          tension: 0.3, fill: false, pointRadius: 5,
        });
        ci++;
      }
    } else {
      const data = dates.map(d =>
        activeWf.filter(f => f.sortKey === d)
          .reduce((s, f) => s + f.rows.filter(r => groupName(r.name) === prod)
            .reduce((ss, r) => ss + (metric === 'qty' ? r.soldQty : r.salesAmt), 0), 0)
      );
      datasets.push({
        label: prod,
        data,
        borderColor: CHART_COLORS[ci % CHART_COLORS.length],
        backgroundColor: CHART_COLORS[ci % CHART_COLORS.length] + '33',
        tension: 0.3, fill: false, pointRadius: 5,
      });
      ci++;
    }
  }

  destroyChart('chart4b');
  wrap.style.height = '350px';
  if (!wrap.querySelector('canvas')) {
    const c = document.createElement('canvas'); c.id = 'chart4b';
    wrap.innerHTML = ''; wrap.appendChild(c);
  }
  state.charts['chart4b'] = new Chart(document.getElementById('chart4b').getContext('2d'), {
    type: 'line',
    data: { labels: dates.map(fmtWeekLabel), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        title: { display: true, text: `商品別 週次${label}推移` },
      },
      scales: {
        y: { title: { display: true, text: label } },
        x: { title: { display: true, text: '週' } },
      }
    }
  });
}

// チャネルチェックボックスを構築（週次ファイルのチャネル一覧）
function buildTab4Controls() {
  const wf = state.files.filter(f => f.type === 'weekly');
  if (wf.length === 0) return;

  const channels = [...new Set(wf.map(f => f.channel))].sort();
  const chDiv    = document.getElementById('t4-channels');
  const prevCh   = new Set([...chDiv.querySelectorAll('input:checked')].map(cb => cb.value));

  chDiv.innerHTML = channels.map(ch => `
    <label class="cb-label">
      <input type="checkbox" value="${escHtml(ch)}" ${(prevCh.size === 0 || prevCh.has(ch)) ? 'checked' : ''}>
      ${escHtml(ch)}
    </label>
  `).join('');

  buildTab4Products();
}

// 商品チェックボックスを構築（検索フィルタ対応・選択状態を保持）
function buildTab4Products(search) {
  const wf = state.files.filter(f => f.type === 'weekly');
  if (wf.length === 0) return;

  const chChecked = [...document.querySelectorAll('#t4-channels input:checked')].map(cb => cb.value);
  const activeCh  = chChecked.length ? chChecked : [...new Set(wf.map(f => f.channel))];

  let products = byProduct(wf.filter(f => activeCh.includes(f.channel)).flatMap(f => f.rows))
    .sort((a, b) => b.amount - a.amount)
    .map(p => p.name);

  const term = (search !== undefined ? search : (document.getElementById('t4-prod-search') || {}).value || '').trim().toLowerCase();
  if (term) products = products.filter(p => p.toLowerCase().includes(term));

  const prodDiv  = document.getElementById('t4-products');
  const prevProd = new Set([...prodDiv.querySelectorAll('input:checked')].map(cb => cb.value));

  prodDiv.innerHTML = products.map(p => `
    <label class="cb-label">
      <input type="checkbox" value="${escHtml(p)}" ${prevProd.has(p) ? 'checked' : ''}>
      <span title="${escHtml(p)}">${escHtml(p.length > 40 ? p.slice(0,40)+'…' : p)}</span>
    </label>
  `).join('');
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
  if      (state.activeTab === 1) renderTab1();
  else if (state.activeTab === 2) renderTab2();
  else if (state.activeTab === 3) renderTab3();
  else if (state.activeTab === 4) renderTab4();
}

// ── File management ──────────────────────────────────────────────────────────
async function addFile(file) {
  const btn = document.querySelector('.btn-primary');
  btn.textContent = '読み込み中…';
  btn.disabled = true;
  try {
    const data = await loadFile(file);
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
  const hasFiles = state.files.length > 0;
  document.getElementById('files-section').classList.toggle('hidden', !hasFiles);
  document.getElementById('analysis-section').classList.toggle('hidden', !hasFiles);

  if (!hasFiles) return;

  document.getElementById('files-list').innerHTML = state.files.map((f, i) => `
    <div class="file-card">
      <span class="file-channel">${escHtml(f.channel)}</span>
      <span class="file-period${f.type === 'weekly' ? ' file-period--weekly' : ''}">${escHtml(f.period)}</span>
      <span class="file-rows">${f.rows.length}件</span>
      <span class="file-name" title="${escHtml(f.filename)}">${escHtml(f.filename)}</span>
      <button class="btn-remove" onclick="removeFile(${i})">✕</button>
    </div>
  `).join('');

  updateSelectors();
  buildTab4Controls();
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

  // Tab 4 controls
  document.getElementById('t4-metric').addEventListener('change', renderTab4a);
  document.getElementById('t4-metric2').addEventListener('change', renderTab4b);
  document.getElementById('t4-prod-search').addEventListener('input', (e) => {
    buildTab4Products(e.target.value);
    renderTab4b();
  });
  document.querySelectorAll('input[name="t4-view"]').forEach(r =>
    r.addEventListener('change', renderTab4b));

  // Tab 4 チャネル選択（イベント委譲）
  document.getElementById('t4-channels').addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') { buildTab4Products(); renderTab4b(); }
  });
  // Tab 4 商品選択（イベント委譲）
  document.getElementById('t4-products').addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') renderTab4b();
  });
});
