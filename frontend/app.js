/**
 * CRYPTONITE — Real-Time Crypto Dashboard Engine
 * Uses backend proxy (CoinGecko) for ISP-safe real market data
 * Prices in both USD and IDR with live exchange rate
 */
// Serverless: connecting directly to Binance Public API

const COINS = [
  { sym:'BTCUSDT', name:'Bitcoin', base:'BTC' },
  { sym:'ETHUSDT', name:'Ethereum', base:'ETH' },
  { sym:'SOLUSDT', name:'Solana', base:'SOL' },
  { sym:'BNBUSDT', name:'BNB', base:'BNB' },
  { sym:'XRPUSDT', name:'XRP', base:'XRP' },
  { sym:'ADAUSDT', name:'Cardano', base:'ADA' }
];

const S = {
  active: 'BTCUSDT',
  tf: '1h',
  exchange: 'binance',
  ws: null, obWs: null, tradeWs: null,
  chart: null, candles: null,
  prices: {}, pricesIDR: {}, changes: {}, changesIDR: {},
  highs: {}, lows: {}, volumes: {},
  openPrices:{}, wavg:{}, prevClose:{}, qvol:{}, tradeCount:{}, bidP:{}, askP:{},
  alerts: JSON.parse(localStorage.getItem('cn_alerts')||'[]'),
  soundOn: true,
  msgCount: 0, connectTime: 0, uptimeTimer: null, rateTimer: null,
  currency: 'IDR',
  usdidr: 17780, // fallback rate, updated live
  dataSource: 'loading',
  chartStyle: 'candles',
  activeRange: 'all'
};

let pollTimer = null;

// ══════ FORMAT HELPERS ══════
const fmtP = (p, b) => {
  let n = parseFloat(p);
  if (isNaN(n)) return S.currency === 'IDR' ? 'Rp —' : '$—';

  if (S.currency === 'IDR') {
    n = n * S.usdidr;
    if (n < 1) return 'Rp ' + n.toFixed(4);
    if (n < 100) return 'Rp ' + n.toFixed(2);
    return 'Rp ' + Math.round(n).toLocaleString('id-ID');
  }

  if (b === 'ADA' || b === 'XRP') return '$' + n.toFixed(4);
  if (n < 1) return '$' + n.toFixed(6);
  if (n < 100) return '$' + n.toFixed(2);
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtV = v => {
  const n = parseFloat(v);
  if (isNaN(n)) return '—';
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(1);
};

const fmtAmt = (a) => {
  const n = parseFloat(a);
  if (n >= 1000) return n.toFixed(0);
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(5);
};

const getBase = s => (COINS.find(c => c.sym === s) || { base: '?' }).base;

// ══════ INIT ══════
function init() {
  buildWatchlist();
  buildAlertPairOptions();
  initChart();
  startDataFetch();
  startMetrics();
  bindEvents();
  renderAlerts();
  if (typeof lucide !== 'undefined') lucide.createIcons();
}
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();

// ══════ BUILD WATCHLIST ══════
function buildWatchlist() {
  const el = document.getElementById('watchlist');
  if (!el) return;
  el.innerHTML = COINS.map((c, i) => `
    <div class="coin-card${i === 0 ? ' active' : ''}" data-sym="${c.sym}" id="card-${c.sym}">
      <div class="cc-left"><span class="cc-name">${c.name}</span><span class="cc-symbol">${c.base}/USDT</span></div>
      <div class="cc-right"><span class="cc-price" id="wp-${c.sym}">$—</span><span class="cc-change" id="wc-${c.sym}">0.00%</span></div>
    </div>`).join('');
  el.querySelectorAll('.coin-card').forEach(card => {
    card.addEventListener('click', () => {
      if (S.active === card.dataset.sym) return;
      el.querySelector('.coin-card.active')?.classList.remove('active');
      card.classList.add('active');
      S.active = card.dataset.sym;
      updateTopbar();
      updateStats();
      fetchCandles();
      fetchOrderBook();
      fetchTrades();
    });
  });
}

function buildAlertPairOptions() {
  const sel = document.getElementById('alert-pair');
  if (!sel) return;
  sel.innerHTML = COINS.map(c => `<option value="${c.sym}">${c.base}</option>`).join('');
}

function updateTopbar() {
  const c = COINS.find(x => x.sym === S.active);
  const t = document.getElementById('active-pair-title');
  const s = document.getElementById('active-pair-subtitle');
  if (t && c) t.innerHTML = `${c.name} <span class="pair-symbol">${c.base}/USDT</span>`;
  if (s) {
    const src = S.dataSource === 'coingecko' ? 'CoinGecko API — Live Data' : 'Loading...';
    s.textContent = src;
  }
}

// ══════ LIVE USD/IDR EXCHANGE RATE ══════
async function fetchUsdIdrRate() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const json = await res.json();
    if (json.rates && json.rates.IDR) {
      S.usdidr = json.rates.IDR;
    }
  } catch (err) {
    console.error('Failed to fetch live USD/IDR rate, using fallback:', err);
  }
}

// ══════ DATA FETCHING DIRECTLY FROM PUBLIC EXCHANGE API ══════
async function fetchPrices() {
  try {
    const res = await fetch('https://data-api.binance.vision/api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","ADAUSDT"]');
    const data = await res.json();
    if (!Array.isArray(data)) return;

    S.dataSource = 'binance';
    updateTopbar();

    data.forEach(d => {
      const sym = d.symbol;
      const lastPrice = parseFloat(d.lastPrice);
      const priceChangePercent = parseFloat(d.priceChangePercent);
      const highPrice = parseFloat(d.highPrice);
      const lowPrice = parseFloat(d.lowPrice);
      const volume = parseFloat(d.volume);
      const openPrice = parseFloat(d.openPrice);
      const weightedAvgPrice = parseFloat(d.weightedAvgPrice);
      const prevClosePrice = parseFloat(d.prevClosePrice);
      const quoteVolume = parseFloat(d.quoteVolume);
      const tradeCount = parseInt(d.count);
      const bidPrice = parseFloat(d.bidPrice);
      const askPrice = parseFloat(d.askPrice);

      S.prices[sym] = lastPrice;
      S.pricesIDR[sym] = lastPrice * S.usdidr;
      S.changes[sym] = priceChangePercent;
      S.changesIDR[sym] = priceChangePercent;
      S.highs[sym] = highPrice;
      S.lows[sym] = lowPrice;
      S.volumes[sym] = volume;
      S.openPrices[sym] = openPrice;
      S.wavg[sym] = weightedAvgPrice;
      S.prevClose[sym] = prevClosePrice;
      S.qvol[sym] = quoteVolume;
      S.tradeCount[sym] = tradeCount;
      S.bidP[sym] = bidPrice;
      S.askP[sym] = askPrice;

      updateCoinCard(sym);
      checkAlerts(sym);
    });

    if (S.active) updateStats();
    S.msgCount += data.length;
    setBadge('live');
    if (!S.connectTime) S.connectTime = Date.now();
  } catch (err) {
    console.error('Price fetch failed:', err.message);
    setBadge('offline');
  }
}

async function fetchOrderBook() {
  try {
    const res = await fetch(`https://data-api.binance.vision/api/v3/depth?symbol=${S.active}&limit=20`);
    const data = await res.json();
    if (data.asks && data.bids) {
      renderOrderBook(data.asks, data.bids);
    }
  } catch (err) {
    console.error('Order book fetch failed:', err.message);
  }
}

async function fetchTrades() {
  try {
    const res = await fetch(`https://data-api.binance.vision/api/v3/trades?symbol=${S.active}&limit=30`);
    const trades = await res.json();
    if (!Array.isArray(trades)) return;
    const body = document.getElementById('trades-body');
    if (!body) return;
    body.innerHTML = '';
    trades.reverse().forEach(t => {
      addTrade({ p: t.price, q: t.qty, T: t.time, m: t.isBuyerMaker });
    });
  } catch (err) {
    console.error('Trades fetch failed:', err.message);
  }
}

async function startDataFetch() {
  setBadge('connecting');
  // Fetch live exchange rate first
  await fetchUsdIdrRate();
  
  // Fetch market data immediately
  fetchPrices();
  fetchOrderBook();
  fetchTrades();
  fetchCandles();

  // Poll exchange rate every 5 minutes
  setInterval(fetchUsdIdrRate, 300000);

  // Poll every 1.0 second for real-time prices & orderbook updates directly from Binance API
  pollTimer = setInterval(() => {
    fetchPrices();
    fetchOrderBook();
  }, 1000);

  // Refresh trades every 3 seconds
  setInterval(fetchTrades, 3000);
}

// ══════ COIN CARD UPDATE ══════
function updateCoinCard(sym) {
  const base = getBase(sym);
  const priceEl = document.getElementById('wp-' + sym);
  const changeEl = document.getElementById('wc-' + sym);
  const card = document.getElementById('card-' + sym);
  if (priceEl) {
    const oldText = priceEl.textContent;
    priceEl.textContent = fmtP(S.prices[sym], base);
    if (card && oldText !== priceEl.textContent) {
      card.classList.remove('flash-green', 'flash-red');
      void card.offsetWidth;
      card.classList.add(S.changes[sym] >= 0 ? 'flash-green' : 'flash-red');
    }
  }
  if (changeEl) {
    const ch = S.changes[sym];
    changeEl.textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%';
    changeEl.className = 'cc-change ' + (ch >= 0 ? 'up' : 'down');
  }
}

function updateStats() {
  const sym = S.active, base = getBase(sym);
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  const setC = (id, v, cls) => { const e = document.getElementById(id); if (e) { e.textContent = v; e.className = 'chip-value ' + cls; } };

  set('stat-price', fmtP(S.prices[sym], base));
  const ch = S.changes[sym] || 0;
  setC('stat-change', (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%', ch >= 0 ? 'up' : 'down');
  set('stat-high', fmtP(S.highs[sym], base));
  set('stat-low', fmtP(S.lows[sym], base));

  // Volume formatting
  if (S.currency === 'IDR') {
    set('stat-volume', 'Rp ' + fmtV(S.volumes[sym] * S.usdidr));
  } else {
    set('stat-volume', '$' + fmtV(S.volumes[sym]));
  }

  // Market panel
  set('mk-open', fmtP(S.openPrices[sym], base));
  set('mk-wavg', fmtP(S.wavg[sym], base));
  set('mk-prevclose', fmtP(S.prevClose[sym], base));
  if (S.currency === 'IDR') {
    set('mk-qvol', 'Rp ' + fmtV(S.qvol[sym] * S.usdidr));
  } else {
    set('mk-qvol', '$' + fmtV(S.qvol[sym]));
  }
  set('mk-trades', S.tradeCount[sym]?.toLocaleString() || '—');
  set('mk-bid', fmtP(S.bidP[sym], base));
  set('mk-ask', fmtP(S.askP[sym], base));

  // Update price chip icon direction
  const icon = document.querySelector('.stat-price-chip .chip-icon');
  if (icon) { icon.className = 'chip-icon ' + (ch >= 0 ? 'green' : ''); }
}

// ══════ ORDER BOOK ══════
function renderOrderBook(asks, bids) {
  const asksEl = document.getElementById('ob-asks');
  const bidsEl = document.getElementById('ob-bids');
  const midEl = document.getElementById('ob-mid-price');
  const spreadEl = document.getElementById('ob-spread');
  if (!asksEl || !bidsEl) return;

  const base = getBase(S.active);
  const maxAsk = Math.max(...asks.map(a => parseFloat(a[1])));
  const maxBid = Math.max(...bids.map(b => parseFloat(b[1])));

  // Asks (reversed so lowest ask is at bottom)
  let askTotal = 0;
  const askRows = asks.slice(0, 10).reverse().map(a => {
    const p = parseFloat(a[0]), q = parseFloat(a[1]);
    askTotal += q;
    const pct = (q / maxAsk * 100).toFixed(0);
    return `<div class="ob-row ask"><span>${fmtOBPrice(p, base)}</span><span>${fmtAmt(q)}</span><span>${fmtAmt(askTotal)}</span><div class="ob-depth" style="width:${pct}%"></div></div>`;
  });
  asksEl.innerHTML = askRows.join('');

  // Bids
  let bidTotal = 0;
  const bidRows = bids.slice(0, 10).map(b => {
    const p = parseFloat(b[0]), q = parseFloat(b[1]);
    bidTotal += q;
    const pct = (q / maxBid * 100).toFixed(0);
    return `<div class="ob-row bid"><span>${fmtOBPrice(p, base)}</span><span>${fmtAmt(q)}</span><span>${fmtAmt(bidTotal)}</span><div class="ob-depth" style="width:${pct}%"></div></div>`;
  });
  bidsEl.innerHTML = bidRows.join('');

  // Mid price
  if (midEl && asks.length && bids.length) {
    const bestAsk = parseFloat(asks[0][0]);
    const bestBid = parseFloat(bids[0][0]);
    const mid = (bestAsk + bestBid) / 2;
    midEl.querySelector('.mid-price-value').textContent = fmtP(mid, base);
  }
  if (spreadEl && asks.length && bids.length) {
    let spread = parseFloat(asks[0][0]) - parseFloat(bids[0][0]);
    if (S.currency === 'IDR') {
      spread = spread * S.usdidr;
      spreadEl.textContent = 'Spread: Rp ' + Math.round(spread).toLocaleString('id-ID');
    } else {
      spreadEl.textContent = 'Spread: ' + spread.toFixed(spread < 1 ? 4 : 2);
    }
  }
}

function fmtOBPrice(p, base) {
  let val = parseFloat(p);
  if (S.currency === 'IDR') {
    return Math.round(val * S.usdidr).toLocaleString('id-ID');
  }
  if (base === 'ADA' || base === 'XRP') return val.toFixed(4);
  if (val < 1) return val.toFixed(6);
  if (val < 100) return val.toFixed(2);
  return val.toFixed(2);
}

// ══════ TRADES ══════
function addTrade(d) {
  const body = document.getElementById('trades-body');
  if (!body) return;
  const base = getBase(S.active);
  const price = parseFloat(d.p);
  const qty = parseFloat(d.q);
  const time = new Date(d.T).toLocaleTimeString('en-US', { hour12: false });
  const side = d.m ? 'sell' : 'buy';

  const row = document.createElement('div');
  row.className = 'trade-row ' + side;
  row.innerHTML = `<span>${fmtOBPrice(price, base)}</span><span>${fmtAmt(qty)}</span><span>${time}</span>`;
  body.prepend(row);
  while (body.children.length > 50) body.removeChild(body.lastChild);
}

// ══════ CHART ══════
function initChart() {
  const el = document.getElementById('tv-chart');
  if (!el || typeof LightweightCharts === 'undefined') return;
  S.chart = LightweightCharts.createChart(el, {
    layout: {
      background: { type: 'solid', color: 'transparent' },
      textColor: '#8b95a8',
      fontSize: 11,
      fontFamily: "'Inter', sans-serif"
    },
    grid: {
      vertLines: { color: 'rgba(255,255,255,0.03)' },
      horzLines: { color: 'rgba(255,255,255,0.03)' }
    },
    rightPriceScale: {
      borderColor: 'rgba(255,255,255,0.08)',
      scaleMargins: { top: 0.05, bottom: 0.25 }
    },
    timeScale: {
      borderColor: 'rgba(255,255,255,0.08)',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 5,
      barSpacing: 8,
      fixLeftEdge: true
    },
    crosshair: {
      mode: 0,
      vertLine: { color: 'rgba(0, 229, 255, 0.4)', width: 1, style: 0, labelBackgroundColor: '#0e1726' },
      horzLine: { color: 'rgba(0, 229, 255, 0.4)', width: 1, style: 0, labelBackgroundColor: '#0e1726' }
    },
    handleScroll: { vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: { time: true, price: false } }
  });

  // Recreate active price series dynamically (candles or area line)
  recreatePriceSeries();

  // Volume histogram series (overlaid at bottom)
  S.volumeSeries = S.chart.addHistogramSeries({
    priceFormat: { type: 'volume' },
    priceScaleId: 'volume',
    scaleMargins: { top: 0.8, bottom: 0 }
  });
  S.chart.priceScale('volume').applyOptions({
    scaleMargins: { top: 0.8, bottom: 0 },
    drawTicks: false,
    borderVisible: false,
    visible: false
  });

  // EMA line series
  S.emaSeries = S.chart.addLineSeries({
    color: 'rgba(0, 229, 255, 0.5)',
    lineWidth: 1,
    lineStyle: 0,
    priceLineVisible: false,
    lastValueVisible: false,
    crosshairMarkerVisible: false
  });

  new ResizeObserver(entries => {
    if (entries[0] && S.chart) {
      const { width, height } = entries[0].contentRect;
      S.chart.resize(width, height);
    }
  }).observe(el);
}

// Helper to recreate price series dynamically depending on style selection (candles vs area line)
function recreatePriceSeries() {
  if (S.candles && S.chart) {
    try {
      S.chart.removeSeries(S.candles);
    } catch (err) {}
  }

  if (S.chartStyle === 'area') {
    S.candles = S.chart.addAreaSeries({
      lineColor: '#00d68f',
      topColor: 'rgba(0, 214, 143, 0.22)',
      bottomColor: 'rgba(0, 214, 143, 0.00)',
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true
    });
  } else {
    S.candles = S.chart.addCandlestickSeries({
      upColor: '#00d68f',
      downColor: '#ff4d6a',
      borderUpColor: '#00d68f',
      borderDownColor: '#ff4d6a',
      wickUpColor: 'rgba(0, 214, 143, 0.6)',
      wickDownColor: 'rgba(255, 77, 106, 0.6)',
      borderVisible: false
    });
  }
  
  // Re-fetch candles to populate data into new series
  fetchCandles();
}

// Calculate EMA from data
function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const ema = [];
  if (data.length === 0) return ema;
  
  const getVal = (item) => typeof item.close !== 'undefined' ? item.close : item.value;
  
  let prev = getVal(data[0]);
  for (let i = 0; i < data.length; i++) {
    const itemVal = getVal(data[i]);
    const val = i < period ? itemVal : itemVal * k + prev * (1 - k);
    prev = val;
    ema.push({ time: data[i].time, value: val });
  }
  return ema;
}

// Helper to shift a UTC timestamp to reflect local timezone components on the chart
function toLocalTime(timestampSec) {
  const d = new Date(timestampSec * 1000);
  return Date.UTC(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds()
  ) / 1000;
}

// Helper to apply the active range (zoom / view) to the Lightweight Chart timescale in local timezone
function applyActiveRange() {
  if (!S.chart) return;
  const nowSec = Date.now() / 1000;
  
  if (S.activeRange === '1d') {
    S.chart.timeScale().setVisibleRange({
      from: toLocalTime(nowSec - 86400),
      to: toLocalTime(nowSec)
    });
  } else if (S.activeRange === '1w') {
    S.chart.timeScale().setVisibleRange({
      from: toLocalTime(nowSec - 86400 * 7),
      to: toLocalTime(nowSec)
    });
  } else if (S.activeRange === '1m') {
    S.chart.timeScale().setVisibleRange({
      from: toLocalTime(nowSec - 86400 * 30),
      to: toLocalTime(nowSec)
    });
  } else if (S.activeRange === '3m') {
    S.chart.timeScale().setVisibleRange({
      from: toLocalTime(nowSec - 86400 * 90),
      to: toLocalTime(nowSec)
    });
  } else if (S.activeRange === '1y') {
    S.chart.timeScale().setVisibleRange({
      from: toLocalTime(nowSec - 86400 * 365),
      to: toLocalTime(nowSec)
    });
  } else {
    S.chart.timeScale().fitContent();
  }
}

function fetchCandles() {
  const loader = document.getElementById('chart-loader');
  if (loader) loader.classList.remove('hidden');
  const sym = S.active;
  const interval = S.tf || '1h';

  // Request a larger limit for longer ranges/timeframes
  let limit = 200;
  if (S.activeRange === '1y' || S.activeRange === 'all' || interval === '1d' || interval === '1w' || interval === '1M') {
    limit = 500;
  }

  fetch(`https://data-api.binance.vision/api/v3/klines?symbol=${sym}&interval=${interval}&limit=${limit}`)
    .then(r => r.json())
    .then(data => {
      if (!Array.isArray(data) || data.length === 0) throw new Error('Bad data');

      // Currency conversion factor
      const cf = S.currency === 'IDR' ? S.usdidr : 1;

      const formatted = data.map(k => {
        const time = toLocalTime(Math.floor(k[0] / 1000));
        const closePrice = parseFloat(k[4]) * cf;
        if (S.chartStyle === 'area') {
          return { time, value: closePrice };
        } else {
          return {
            time,
            open: parseFloat(k[1]) * cf,
            high: parseFloat(k[2]) * cf,
            low: parseFloat(k[3]) * cf,
            close: closePrice
          };
        }
      });

      // Volume data with color coding
      const volumeData = data.map(k => {
        const o = parseFloat(k[1]), c = parseFloat(k[4]);
        const vol = parseFloat(k[5]) || 0;
        return {
          time: toLocalTime(Math.floor(k[0] / 1000)),
          value: vol,
          color: c >= o ? 'rgba(0, 214, 143, 0.25)' : 'rgba(255, 77, 106, 0.25)'
        };
      });

      if (S.candles) {
        S.candles.setData(formatted);

        // Set volume data
        if (S.volumeSeries) S.volumeSeries.setData(volumeData);

        // Calculate and set 20-period EMA
        if (S.emaSeries) {
          const ema = calcEMA(formatted, 20);
          S.emaSeries.setData(ema);
        }

        applyActiveRange();
      }
      if (loader) loader.classList.add('hidden');
    })
    .catch(() => {
      // Generate mock candles from real price
      if (S.candles) {
        const cf = S.currency === 'IDR' ? S.usdidr : 1;
        const now = Math.floor(Date.now() / 1000);
        const baseP = (S.prices[sym] || 50000) * cf;
        const mock = [], volMock = [];
        let p = baseP * 0.97;
        for (let i = 200; i >= 0; i--) {
          const o = p, c = o * (1 + (Math.random() * 0.02 - 0.01));
          const h = Math.max(o, c) * (1 + Math.random() * 0.005);
          const l = Math.min(o, c) * (1 - Math.random() * 0.005);
          const t = toLocalTime(now - i * 3600);
          if (S.chartStyle === 'area') {
            mock.push({ time: t, value: c });
          } else {
            mock.push({ time: t, open: o, high: h, low: l, close: c });
          }
          volMock.push({
            time: t,
            value: Math.random() * 100 + 10,
            color: c >= o ? 'rgba(0, 214, 143, 0.25)' : 'rgba(255, 77, 106, 0.25)'
          });
          p = c;
        }
        S.candles.setData(mock);
        if (S.volumeSeries) S.volumeSeries.setData(volMock);
        if (S.emaSeries) S.emaSeries.setData(calcEMA(mock, 20));
        applyActiveRange();
      }
      if (loader) loader.classList.add('hidden');
    });
}

// ══════ CONNECTION BADGE ══════
function setBadge(status) {
  const badge = document.getElementById('conn-badge');
  const text = document.getElementById('conn-text');
  if (!badge) return;
  badge.className = 'conn-badge ' + status;
  if (text) text.textContent = status === 'live' ? 'CONNECTED' : status === 'connecting' ? 'CONNECTING' : 'OFFLINE';
}

// ══════ METRICS ══════
function startMetrics() {
  S.rateTimer = setInterval(() => {
    const el = document.getElementById('metric-msgrate');
    if (el) el.textContent = S.msgCount;
    S.msgCount = 0;
  }, 1000);
  S.uptimeTimer = setInterval(() => {
    if (!S.connectTime) return;
    const s = Math.floor((Date.now() - S.connectTime) / 1000);
    const el = document.getElementById('metric-uptime');
    if (el) {
      if (s < 60) el.textContent = s + 's';
      else if (s < 3600) el.textContent = Math.floor(s / 60) + 'm ' + s % 60 + 's';
      else el.textContent = Math.floor(s / 3600) + 'h ' + Math.floor(s % 3600 / 60) + 'm';
    }
  }, 1000);
  // Latency ping — measure directly against Binance Vision API
  setInterval(() => {
    const t0 = performance.now();
    fetch('https://data-api.binance.vision/api/v3/ping').then(() => {
      const lat = Math.round(performance.now() - t0);
      const el = document.getElementById('metric-latency');
      if (el) el.textContent = lat + 'ms';
    }).catch(() => {});
  }, 5000);
}

// ══════ ALERTS ══════
function checkAlerts(sym) {
  const price = S.prices[sym];
  if (!price) return;
  S.alerts = S.alerts.filter(a => {
    if (a.sym !== sym) return true;
    let triggered = false;
    if (a.cond === '>' && price > a.target) triggered = true;
    if (a.cond === '<' && price < a.target) triggered = true;
    if (triggered) {
      showToast(`🔔 ${getBase(sym)} ${a.cond} ${a.target.toLocaleString()} — Now: ${fmtP(price, getBase(sym))}`);
      if (S.soundOn) playAlertSound();
      return false;
    }
    return true;
  });
  localStorage.setItem('cn_alerts', JSON.stringify(S.alerts));
  renderAlerts();
}

function showToast(msg) {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = 'toast alert-toast';
  t.innerHTML = `<span>${msg}</span>`;
  c.appendChild(t);
  setTimeout(() => { t.style.animation = 'toastOut .3s ease-in forwards'; setTimeout(() => t.remove(), 300); }, 4000);
}

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [800, 1000, 1200].forEach((f, i) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = f; osc.type = 'sine';
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.2);
      osc.start(ctx.currentTime + i * 0.12); osc.stop(ctx.currentTime + i * 0.12 + 0.2);
    });
  } catch (e) {}
}

function renderAlerts() {
  const list = document.getElementById('alerts-list');
  const badge = document.getElementById('alert-count-badge');
  if (!list) return;

  if (S.alerts.length === 0) {
    list.innerHTML = '<div class="no-alerts" id="no-alerts">No active alerts</div>';
    if (badge) badge.style.display = 'none';
    return;
  }
  if (badge) { badge.style.display = 'flex'; badge.textContent = S.alerts.length; }
  list.innerHTML = S.alerts.map((a, i) => `
    <div class="alert-item">
      <div class="alert-item-info"><span class="ai-pair">${getBase(a.sym)}</span><span>${a.cond} ${fmtP(a.target, getBase(a.sym))}</span></div>
      <button class="alert-remove" data-idx="${i}">&times;</button>
    </div>`).join('');
  list.querySelectorAll('.alert-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      S.alerts.splice(parseInt(btn.dataset.idx), 1);
      localStorage.setItem('cn_alerts', JSON.stringify(S.alerts));
      renderAlerts();
    });
  });
}

// ══════ EVENT BINDINGS ══════
function bindEvents() {
  // Chart Style tabs
  document.querySelectorAll('.style-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const activeTab = document.querySelector('.style-tab.active');
      if (activeTab) activeTab.classList.remove('active');
      tab.classList.add('active');
      const nextStyle = tab.dataset.style;
      if (nextStyle !== S.chartStyle) {
        S.chartStyle = nextStyle;
        recreatePriceSeries();
      }
    });
  });

  // Range tabs (TradingView-style range selection)
  document.querySelectorAll('.range-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.range-tab').forEach(r => {
        r.classList.remove('active');
        r.style.background = 'transparent';
        r.style.color = 'var(--text3)';
      });
      tab.classList.add('active');
      tab.style.background = 'rgba(0, 229, 255, 0.1)';
      tab.style.color = 'var(--cyan)';

      S.activeRange = tab.dataset.range;

      // Map range to most logical timeframe interval (exactly like TradingView)
      let nextTf = '1h';
      if (S.activeRange === '1d') nextTf = '5m';
      else if (S.activeRange === '1w') nextTf = '1h';
      else if (S.activeRange === '1m') nextTf = '4h';
      else if (S.activeRange === '3m') nextTf = '1d';
      else if (S.activeRange === '1y') nextTf = '1d';
      else if (S.activeRange === 'all') nextTf = '1d';

      S.tf = nextTf;

      fetchCandles();
    });
  });

  // Add alert
  const addBtn = document.getElementById('alert-add-btn');
  if (addBtn) addBtn.addEventListener('click', () => {
    const sym = document.getElementById('alert-pair')?.value;
    const cond = document.getElementById('alert-condition')?.value;
    let price = parseFloat(document.getElementById('alert-price')?.value);
    if (!sym || !cond || isNaN(price) || price <= 0) return;

    // If currency is IDR, convert target price to USD before saving
    if (S.currency === 'IDR') {
      price = price / S.usdidr;
    }

    S.alerts.push({ sym, cond, target: price });
    localStorage.setItem('cn_alerts', JSON.stringify(S.alerts));
    renderAlerts();
    document.getElementById('alert-price').value = '';
  });

  // Sound toggle
  const soundBtn = document.getElementById('sound-toggle');
  if (soundBtn) soundBtn.addEventListener('click', () => {
    S.soundOn = !S.soundOn;
    const icon = document.getElementById('sound-icon');
    if (icon) icon.setAttribute('data-lucide', S.soundOn ? 'volume-2' : 'volume-x');
    soundBtn.classList.toggle('muted', !S.soundOn);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  });

  // Clear trades
  const clearBtn = document.getElementById('clear-trades');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    const body = document.getElementById('trades-body');
    if (body) body.innerHTML = '';
  });

  // Sidebar toggle
  const sideBtn = document.getElementById('sidebar-toggle');
  if (sideBtn) sideBtn.addEventListener('click', () => {
    const sb = document.getElementById('sidebar');
    if (sb) sb.style.display = sb.style.display === 'none' ? 'flex' : 'none';
  });

  // Fullscreen
  const fsBtn = document.getElementById('btn-fullscreen');
  if (fsBtn) fsBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  });

  // Exchange switch
  const exSel = document.getElementById('exchange-select');
  if (exSel) exSel.addEventListener('change', () => {
    S.exchange = exSel.value;
    updateTopbar();
  });

  // Currency switch
  const curSel = document.getElementById('currency-select');
  if (curSel) curSel.addEventListener('change', () => {
    S.currency = curSel.value;

    // Update input placeholder
    const input = document.getElementById('alert-price');
    if (input) {
      input.placeholder = S.currency === 'IDR' ? 'Target Rp...' : 'Target USD...';
    }

    // Trigger full repaint
    COINS.forEach(c => updateCoinCard(c.sym));
    updateTopbar();
    updateStats();
    renderAlerts();
    fetchOrderBook();
    fetchTrades();
  });
}
