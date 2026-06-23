'use strict';

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  files: [],      // [{filename, channel, period, type, date, sortKey, rows:[...]}]
  charts: {},
  activeTab: 1,
};

// ファイル一覧の開閉状態（コードで管理することでHTML差分に依存しない）
let filesListOpen = false;

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
      price:         parseNum(fields[2]),
      inventory:     parseNum(fields[4]),
      freeInventory: parseNum(fields[6]),
      soldQty:       parseNum(fields[8]),
      salesAmt:      parseNum(fields[9]),
      channel:       meta.channel,
      period:        meta.period,
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
  const dM = norm.match(/^(\d+)年(\d+)月(\d+)日/);
  if (dM) {
    const yr = 2000 + parseInt(dM[1]), mo = parseInt(dM[2]), dy = parseInt(dM[3]);
    const date    = new Date(yr, mo - 1, dy);
    const sortKey = `${yr}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}`;
    return { channel, period, type: 'weekly', date, sortKey };
  }

  // 週次ファイル（日付範囲）: X年X月X-X / X年X月X～X (例: 26年5月1-7)
  const rM = norm.match(/^(\d+)年(\d+)月(\d+)[－\-～~]/);
  if (rM) {
    const yr = 2000 + parseInt(rM[1]), mo = parseInt(rM[2]), dy = parseInt(rM[3]);
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
  ['t2-period'].forEach(id => {
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

// ── Tab 1: Overall Sales (月次売上金額推移 折れ線グラフ) ─────────────────────
function renderTab1() {
  const ch   = document.getElementById('t1-channel').value;
  const rows = filteredRows(ch, '');  // 全期間

  const totalAmt  = rows.reduce((s, r) => s + r.salesAmt, 0);
  const prodCount = new Set(rows.map(r => groupName(r.name))).size;
  const skuCount  = rows.length;

  document.getElementById('t1-cards').innerHTML = `
    <div class="card"><div class="card-val">${fmt(totalAmt)}円</div><div class="card-lbl">売上金額合計</div></div>
    <div class="card"><div class="card-val">${prodCount}</div><div class="card-lbl">商品種類数</div></div>
    <div class="card"><div class="card-val">${skuCount}</div><div class="card-lbl">SKU数</div></div>
  `;

  const mFiles = state.files.filter(f => f.type === 'monthly');
  if (mFiles.length === 0) return;

  // sortKey → period ラベルのマッピング（月次ファイルのみ）
  const periodMap = {};
  mFiles.forEach(f => { periodMap[f.sortKey] = f.period; });
  const sortedKeys   = Object.keys(periodMap).sort();
  const periodLabels = sortedKeys.map(k => periodMap[k]);

  // チャネルリスト（全選択時は全チャネル、個別選択時はそのチャネルのみ）
  const channels = ch
    ? [ch]
    : [...new Set(mFiles.map(f => f.channel))].sort();

  const datasets = channels.map((channel, i) => ({
    label: channel,
    data: sortedKeys.map(sk =>
      mFiles
        .filter(f => f.channel === channel && f.sortKey === sk)
        .reduce((s, f) => s + f.rows.reduce((ss, r) => ss + r.salesAmt, 0), 0)
    ),
    borderColor:     CHART_COLORS[i % CHART_COLORS.length],
    backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '33',
    tension: 0.3, fill: false, pointRadius: 5,
  }));

  destroyChart('chart1');
  document.querySelector('#tab-1 .chart-wrap').style.height = '350px';
  const ctx = document.getElementById('chart1').getContext('2d');
  state.charts['chart1'] = new Chart(ctx, {
    type: 'line',
    data: { labels: periodLabels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        title: { display: true, text: ch ? `${ch} 月次売上金額推移` : 'チャネル別 月次売上金額推移' },
      },
      scales: {
        y: { title: { display: true, text: '売上金額 (円)' } },
        x: { title: { display: true, text: '期間' } },
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
// 分子: 最新月次ファイルのフリー在庫数（列6）
// 分母: 最新週次ファイルの受注数量合計 × 4（週→月換算）
function renderTab3() {
  const ch   = document.getElementById('t3-channel').value;
  const topn = parseInt(document.getElementById('t3-topn').value) || 0;
  const infoEl = document.getElementById('t3-latest-info');

  // ── 分子: 最新月次ファイルのフリー在庫数 ──
  const mFiles = state.files.filter(f => f.type === 'monthly' && (!ch || f.channel === ch));
  if (mFiles.length === 0) {
    destroyChart('chart3');
    document.getElementById('t3-chart-wrap').innerHTML = '<div class="empty-state">月次ファイルが読み込まれていません</div>';
    document.getElementById('t3-table').innerHTML = '';
    if (infoEl) infoEl.textContent = '';
    return;
  }

  const latestMonthKey    = mFiles.reduce((mx, f) => f.sortKey > mx ? f.sortKey : mx, '');
  const invRows           = mFiles.filter(f => f.sortKey === latestMonthKey).flatMap(f => f.rows);
  const latestMonthPeriod = mFiles.find(f => f.sortKey === latestMonthKey).period;

  // ── 分母: チャネルごとの最新週次ファイルの受注数量を合算 ──
  const wFiles = state.files.filter(f => f.type === 'weekly' && (!ch || f.channel === ch));
  const weeklyRateMap = {};  // SKUコード → 最新週次合計受注数量
  let latestWeekPeriod = null;

  if (wFiles.length > 0) {
    const weeklyChannels = [...new Set(wFiles.map(f => f.channel))];
    for (const wch of weeklyChannels) {
      const chFiles    = wFiles.filter(f => f.channel === wch);
      const latestWKey = chFiles.reduce((mx, f) => f.sortKey > mx ? f.sortKey : mx, '');
      const latestRows = chFiles.filter(f => f.sortKey === latestWKey).flatMap(f => f.rows);
      for (const r of latestRows) {
        weeklyRateMap[r.code] = (weeklyRateMap[r.code] || 0) + r.soldQty;
      }
      if (!latestWeekPeriod) {
        const lf = chFiles.find(f => f.sortKey === latestWKey);
        if (lf) latestWeekPeriod = lf.period;
      }
    }
  }

  // 在庫基準の表示
  if (infoEl) {
    const wInfo = latestWeekPeriod ? ` ／ 週次: ${latestWeekPeriod} × 4` : ' ／ 週次未読込';
    infoEl.textContent = `在庫基準: ${latestMonthPeriod}${wInfo}`;
  }

  // SKU別フリー在庫数を集計（旧データ互換: freeInventoryがなければinventoryで代替）
  const invMap = {};
  for (const r of invRows) {
    if (!invMap[r.code]) invMap[r.code] = { code: r.code, name: r.name, inventory: 0 };
    invMap[r.code].inventory += (r.freeInventory !== undefined ? r.freeInventory : r.inventory);
  }

  const items = Object.values(invMap)
    .filter(inv => inv.inventory > 0)
    .map(inv => {
      const weeklySold  = weeklyRateMap[inv.code] || 0;
      const monthlyRate = weeklySold * 4;
      const monthsLeft  = monthlyRate > 0 ? inv.inventory / monthlyRate : Infinity;
      return {
        code: inv.code,
        name: inv.name,
        inventory:   inv.inventory,
        monthlyRate: Math.round(monthlyRate * 10) / 10,
        monthsLeft:  monthsLeft === Infinity ? Infinity : Math.round(monthsLeft * 10) / 10,
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
        title: { display: true, text: `残り在庫月数（在庫基準：${latestMonthPeriod}）` },
        tooltip: {
          callbacks: {
            afterBody: (items) => {
              const it = displayed[items[0].dataIndex];
              return [`フリー在庫：${fmt(it.inventory)}個`, `月間推定販売数：${it.monthlyRate}個`];
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
      <thead><tr><th>SKU名</th><th>フリー在庫数</th><th>月間推定販売数（週次×4）</th><th>残り月数</th></tr></thead>
      <tbody>${tbody}</tbody>
    </table>
  `;
}

// ── Tab 4: Weekly Trend ───────────────────────────────────────────────────────
// sortKey "2026-05-01" → "5/1" 形式に変換（フォールバック用）
function fmtWeekLabel(sortKey) {
  const m = sortKey.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${parseInt(m[1])}/${parseInt(m[2])}` : sortKey;
}

// sortKey の配列に対応する表示ラベルをperiod文字列で返す（なければfmtWeekLabel）
function wfPeriodLabels(wf, dates) {
  const map = {};
  wf.forEach(f => { if (!map[f.sortKey]) map[f.sortKey] = f.period; });
  return dates.map(d => map[d] || fmtWeekLabel(d));
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
    data: { labels: wfPeriodLabels(wf, dates), datasets },
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
    data: { labels: wfPeriodLabels(activeWf, dates), datasets },
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

// ── LocalStorage Persistence ──────────────────────────────────────────────────
const STORAGE_KEY = 'ec-app-files';

function saveFilesToStorage() {
  try {
    const data = state.files.map(f => ({
      filename: f.filename,
      channel:  f.channel,
      period:   f.period,
      type:     f.type,
      sortKey:  f.sortKey,
      rows:     f.rows,
      // date は sortKey から復元するため保存しない
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('ファイル保存失敗:', e.message);
  }
}

function loadFilesFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length === 0) return;
    state.files = data.map(f => {
      let date = null;
      if (f.type === 'weekly' && f.sortKey && /^\d{4}-\d{2}-\d{2}$/.test(f.sortKey)) {
        const [yr, mo, dy] = f.sortKey.split('-').map(Number);
        date = new Date(yr, mo - 1, dy);
      }
      return { ...f, date };
    });
    renderUI();
  } catch (e) {
    console.warn('ファイル読み込み失敗:', e.message);
    localStorage.removeItem(STORAGE_KEY);
  }
}

// ── File management ──────────────────────────────────────────────────────────
// forceType: 'monthly' | 'weekly' | undefined — ドロップゾーン由来の型強制
async function addFile(file, forceType) {
  try {
    const data = await loadFile(file);
    if (forceType) data.type = forceType;
    const idx = state.files.findIndex(f => f.filename === data.filename);
    if (idx >= 0) state.files[idx] = data; else state.files.push(data);
    renderUI();
    saveFilesToStorage();
  } catch (e) {
    alert(`読み込みエラー: ${e.message}`);
  }
}

function removeFile(i) {
  state.files.splice(i, 1);
  renderUI();
  saveFilesToStorage();
}

function renderUI() {
  const hasFiles = state.files.length > 0;
  document.getElementById('files-section').classList.toggle('hidden', !hasFiles);
  document.getElementById('analysis-section').classList.toggle('hidden', !hasFiles);

  if (!hasFiles) return;

  // ファイル件数サマリーを更新
  const monthly = state.files.filter(f => f.type === 'monthly').length;
  const weekly  = state.files.filter(f => f.type === 'weekly').length;
  let summaryText;
  if (monthly > 0 && weekly > 0) summaryText = `月次 ${monthly}件 ・ 週次 ${weekly}件`;
  else if (weekly > 0)  summaryText = `週次 ${weekly}件`;
  else                  summaryText = `月次 ${monthly}件`;
  document.getElementById('files-summary').textContent = summaryText;

  // ファイルカード一覧を更新
  document.getElementById('files-list').innerHTML = state.files.map((f, i) => `
    <div class="file-card">
      <span class="file-channel">${escHtml(f.channel)}</span>
      <span class="file-period${f.type === 'weekly' ? ' file-period--weekly' : ''}">${escHtml(f.period)}</span>
      <span class="file-rows">${f.rows.length}件</span>
      <span class="file-name" title="${escHtml(f.filename)}">${escHtml(f.filename)}</span>
      <button class="btn-remove" onclick="removeFile(${i})">✕</button>
    </div>
  `).join('');

  // 開閉状態を確実に反映（HTML側のキャッシュ状態に依存しない）
  applyFilesListState();

  updateSelectors();
  buildTab4Controls();
  renderActiveTab();
}

function applyFilesListState() {
  const list  = document.getElementById('files-list');
  const caret = document.querySelector('#files-toggle .toggle-caret');
  if (list)  list.classList.toggle('hidden', !filesListOpen);
  if (caret) caret.textContent = filesListOpen ? '▼' : '▶';
}

// ── Event listeners ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // ドロップゾーンの共通セットアップ（fileType でファイル種別を強制）
  function setupDropzone(dzId, inputId, fileType) {
    const input = document.getElementById(inputId);
    const dz    = document.getElementById(dzId);
    input.addEventListener('change', async (e) => {
      for (const f of e.target.files) await addFile(f, fileType);
      e.target.value = '';
    });
    dz.addEventListener('dragover',  (e) => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', ()  => dz.classList.remove('over'));
    dz.addEventListener('drop', async (e) => {
      e.preventDefault(); dz.classList.remove('over');
      for (const f of e.dataTransfer.files) {
        if (f.name.toLowerCase().endsWith('.csv')) await addFile(f, fileType);
      }
    });
  }
  setupDropzone('dropzone-monthly', 'file-input-monthly', 'monthly');
  setupDropzone('dropzone-weekly',  'file-input-weekly',  'weekly');

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(+btn.dataset.tab));
  });

  // Tab 1 controls
  document.getElementById('t1-channel').addEventListener('change', renderTab1);

  // Tab 2 controls
  ['t2-channel','t2-period','t2-metric','t2-topn'].forEach(id =>
    document.getElementById(id).addEventListener('change', renderTab2));
  document.getElementById('t2-search').addEventListener('input', renderTab2);

  // Tab 3 controls
  ['t3-channel','t3-topn'].forEach(id =>
    document.getElementById(id).addEventListener('change', renderTab3));

  // Tab 4 controls（null ガード付き：HTML キャッシュ不整合でもクラッシュしない）
  const el4m  = document.getElementById('t4-metric');
  const el4m2 = document.getElementById('t4-metric2');
  const el4ps = document.getElementById('t4-prod-search');
  const el4ch = document.getElementById('t4-channels');
  const el4pr = document.getElementById('t4-products');
  if (el4m)  el4m.addEventListener('change', renderTab4a);
  if (el4m2) el4m2.addEventListener('change', renderTab4b);
  if (el4ps) el4ps.addEventListener('input', (e) => { buildTab4Products(e.target.value); renderTab4b(); });
  document.querySelectorAll('input[name="t4-view"]').forEach(r => r.addEventListener('change', renderTab4b));
  if (el4ch) el4ch.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') { buildTab4Products(); renderTab4b(); }
  });
  if (el4pr) el4pr.addEventListener('change', (e) => {
    if (e.target.type === 'checkbox') renderTab4b();
  });

  // ファイル一覧の開閉トグル
  document.getElementById('files-toggle').addEventListener('click', () => {
    filesListOpen = !filesListOpen;
    applyFilesListState();
  });

  // 前回保存したファイルを復元
  loadFilesFromStorage();
});
