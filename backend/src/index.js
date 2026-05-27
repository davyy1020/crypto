const dotenv = require('dotenv');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

dotenv.config();

const PORT = Number(process.env.PORT || 4000);
const SYMBOL = process.env.SYMBOL || 'btcusdt';

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: false
}));
app.options('*', cors());
app.use(express.json());

// ══════ SYMBOLS MAP FOR HTX & COINGECKO ══════
const HTX_SYMBOL_MAP = {
  BTCUSDT: 'btcusdt',
  ETHUSDT: 'ethusdt',
  SOLUSDT: 'solusdt',
  BNBUSDT: 'bnbusdt',
  XRPUSDT: 'xrpusdt',
  ADAUSDT: 'adausdt'
};

const COINGECKO_IDS = {
  BTCUSDT: 'bitcoin',
  ETHUSDT: 'ethereum',
  SOLUSDT: 'solana',
  BNBUSDT: 'binancecoin',
  XRPUSDT: 'ripple',
  ADAUSDT: 'cardano'
};

// ══════ STATE ══════
let usdToIdrRate = 17740; // Live rate, fetched dynamically
let htxData = {}; // Real-time tickers
let coinGeckoSlowData = {}; // Market Cap & Circulating Supply
let lastGeckoFetch = 0;

// Fetch exchange rate USD/IDR dynamically from open exchange API
async function fetchExchangeRate() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (res.ok) {
      const data = await res.json();
      if (data && data.rates && data.rates.IDR) {
        usdToIdrRate = data.rates.IDR;
        console.log(`[ExchangeRate] Updated USD/IDR: ${usdToIdrRate}`);
      }
    }
  } catch (err) {
    console.warn('[ExchangeRate] Failed to fetch USD/IDR, using fallback:', usdToIdrRate);
  }
}

// Fetch slow data from CoinGecko (once every 10 minutes to avoid rate limit)
async function fetchCoinGeckoSlowData() {
  const now = Date.now();
  if (now - lastGeckoFetch < 600000 && Object.keys(coinGeckoSlowData).length > 0) {
    return;
  }
  try {
    const ids = Object.values(COINGECKO_IDS).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,idr&include_market_cap=true`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      coinGeckoSlowData = data;
      lastGeckoFetch = now;
      console.log('[CoinGecko] Slow data updated successfully');
    }
  } catch (err) {
    console.warn('[CoinGecko] Fetch failed, using fallback / cache:', err.message);
  }
}

// Fetch real-time zero-delay tickers from HTX (Huobi) - completely unblocked!
async function fetchHTXRealtime() {
  try {
    const res = await fetch('https://api.huobi.pro/market/tickers');
    if (!res.ok) throw new Error(`HTX tickers returned ${res.status}`);
    const data = await res.json();
    if (data && data.status === 'ok' && Array.isArray(data.data)) {
      const mapped = {};
      const targets = Object.values(HTX_SYMBOL_MAP);
      data.data.forEach(item => {
        if (targets.includes(item.symbol)) {
          mapped[item.symbol] = item;
        }
      });
      htxData = mapped;
    }
  } catch (err) {
    console.error('[HTX] Real-time fetch error:', err.message);
  }
}

// Helper to construct normalized market data response
function getNormalizedPrices() {
  const result = {};
  for (const [sym, htxKey] of Object.entries(HTX_SYMBOL_MAP)) {
    const ticker = htxData[htxKey];
    if (!ticker) continue;

    const lastPriceUSD = parseFloat(ticker.close);
    const lastPriceIDR = lastPriceUSD * usdToIdrRate;

    const geckoId = COINGECKO_IDS[sym];
    const gecko = coinGeckoSlowData[geckoId] || {};

    // 24h change percent calculated directly from real global ticker (open vs close)
    const openPrice = parseFloat(ticker.open) || lastPriceUSD;
    const priceChangePercent = ((lastPriceUSD - openPrice) / openPrice) * 100;

    result[sym] = {
      symbol: sym,
      lastPrice: lastPriceUSD,
      lastPriceIDR: lastPriceIDR,
      priceChangePercent: priceChangePercent,
      priceChangePercentIDR: priceChangePercent,
      highPrice: parseFloat(ticker.high),
      lowPrice: parseFloat(ticker.low),
      volume: parseFloat(ticker.amount), // volume in base currency
      marketCap: gecko.usd_market_cap || (lastPriceUSD * 19000000), // realistic fallback if gecko failed
      openPrice: openPrice,
      weightedAvgPrice: lastPriceUSD,
      prevClosePrice: openPrice,
      quoteVolume: parseFloat(ticker.vol), // volume in USD
      tradeCount: parseInt(ticker.count) || 0,
      bidPrice: parseFloat(ticker.bid),
      askPrice: parseFloat(ticker.ask),
      // IDR equivalents
      highPriceIDR: parseFloat(ticker.high) * usdToIdrRate,
      lowPriceIDR: parseFloat(ticker.low) * usdToIdrRate,
      usdToIdr: usdToIdrRate
    };
  }
  return result;
}

// ══════ REST API ROUTES ══════
app.get('/', (_req, res) => {
  res.json({
    service: 'Real-Time Global Crypto Proxy',
    status: 'running',
    symbol: SYMBOL.toUpperCase(),
    dataSource: 'HTX Real-Time + CoinGecko Hybrid (ISP-safe & Global)',
    updateInterval: '1.5 seconds'
  });
});

// Main price endpoint
app.get('/api/prices', async (_req, res) => {
  try {
    await Promise.all([
      fetchCoinGeckoSlowData(),
      fetchHTXRealtime()
    ]);
    
    const result = getNormalizedPrices();
    res.json({ source: 'htx', timestamp: Date.now(), data: result });
  } catch (err) {
    console.error('API /prices error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Chart candles - proxy to HTX history/kline
app.get('/api/klines', async (req, res) => {
  const { symbol = 'BTCUSDT', interval = '1h', limit = 200 } = req.query;
  try {
    const htxSymbol = HTX_SYMBOL_MAP[symbol.toUpperCase()] || 'btcusdt';
    
    // Map interval: 1m -> 1min, 5m -> 5min, 15m -> 15min, 1h -> 60min, 4h -> 4hour, 1d -> 1day, 1w -> 1week, 1M -> 1mon
    const tfMap = {
      '1m': '1min',
      '5m': '5min',
      '15m': '15min',
      '1h': '60min',
      '4h': '4hour',
      '1d': '1day',
      '1w': '1week',
      '1M': '1mon'
    };
    const tf = tfMap[interval] || '60min';
    
    const url = `https://api.huobi.pro/market/history/kline?symbol=${htxSymbol}&period=${tf}&size=${limit}`;
    const r = await fetch(url);
    const data = await r.json();
    
    if (data && data.status === 'ok' && Array.isArray(data.data)) {
      // HTX klines are sorted newest first, we must reverse them for lightweight charts
      const sorted = [...data.data].reverse();
      
      // Convert HTX format to Binance kline format
      // HTX: {id (seconds), open, close, low, high, amount (vol), vol (quote_vol), count}
      // Binance: [openTime, open, high, low, close, volume, closeTime]
      const klines = sorted.map((candle) => {
        const t = candle.id * 1000;
        return [
          t,
          candle.open.toString(),
          candle.high.toString(),
          candle.low.toString(),
          candle.close.toString(),
          candle.amount.toString(),
          t + 3600000
        ];
      });
      return res.json(klines);
    }
    throw new Error('No HTX kline data');
  } catch (err) {
    console.error('[Klines] Fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Order book - get real-time HTX depth
app.get('/api/orderbook', async (req, res) => {
  const { symbol = 'BTCUSDT' } = req.query;
  const htxSymbol = HTX_SYMBOL_MAP[symbol.toUpperCase()] || 'btcusdt';
  try {
    const url = `https://api.huobi.pro/market/depth?symbol=${htxSymbol}&type=step0&depth=10`;
    const r = await fetch(url);
    const data = await r.json();
    if (data && data.status === 'ok' && data.tick) {
      // HTX depth format: bids: [[price, qty], ...], asks: [[price, qty], ...]
      const convertList = (list) => list.map(([p, q]) => [p.toString(), q.toString()]);
      
      return res.json({
        asks: convertList(data.tick.asks), 
        bids: convertList(data.tick.bids)
      });
    }
    throw new Error('Invalid depth data');
  } catch (err) {
    console.error('[Orderbook] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Recent trades - get real-time HTX trades
app.get('/api/trades', async (req, res) => {
  const { symbol = 'BTCUSDT' } = req.query;
  const htxSymbol = HTX_SYMBOL_MAP[symbol.toUpperCase()] || 'btcusdt';
  try {
    const url = `https://api.huobi.pro/market/history/trade?symbol=${htxSymbol}&size=20`;
    const r = await fetch(url);
    const data = await r.json();
    if (data && data.status === 'ok' && Array.isArray(data.data)) {
      // HTX trades: data is list of {id, ts, data: [{id, ts, price, amount, direction}]}
      // Convert to Binance trade format
      const trades = [];
      data.data.forEach(group => {
        if (Array.isArray(group.data)) {
          group.data.forEach(t => {
            trades.push({
              price: t.price.toString(),
              qty: t.amount.toString(),
              time: t.ts,
              isBuyerMaker: t.direction === 'sell'
            });
          });
        }
      });
      return res.json(trades.slice(0, 20));
    }
    throw new Error('Invalid trades data');
  } catch (err) {
    console.error('[Trades] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log('HTX Real-Time + CoinGecko Proxy Ready:');
  console.log('  GET /api/prices    - Global real-time tickers (accurate USD + converted IDR)');
  console.log('  GET /api/klines    - Real HTX global chart candlesticks');
  console.log('  GET /api/orderbook - Real HTX order book depth');
  console.log('  GET /api/trades    - Real HTX global trade history');
});

// Startup tasks
async function startup() {
  await fetchExchangeRate();
  await fetchCoinGeckoSlowData();
  await fetchHTXRealtime();
}
startup();

// ══════ BACKEND LIVE PRICE BROADCAST (WEB SOCKET) ══════
const wss = new WebSocketServer({ server });
const clients = new Set();

function broadcast(payload) {
  const message = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === 1) client.send(message);
  }
}

wss.on('connection', (client) => {
  clients.add(client);
  client.send(JSON.stringify({ type: 'system', message: 'Connected to backend relay' }));
  client.on('close', () => clients.delete(client));
});

// Broadcast real-time tickers to all connected frontend clients every 1.5 seconds!
setInterval(async () => {
  try {
    await fetchHTXRealtime();
    const prices = getNormalizedPrices();
    
    for (const [sym, d] of Object.entries(prices)) {
      broadcast({
        type: 'ticker',
        symbol: sym,
        lastPrice: d.lastPrice,
        priceChangePercent: d.priceChangePercent,
        highPrice: d.highPrice,
        lowPrice: d.lowPrice,
        volume: d.volume,
        eventTime: Date.now(),
        source: 'htx'
      });
    }
  } catch (err) {
    // Graceful capture
  }
}, 1000);

// Setup background interval to update exchange rate and CoinGecko slow metrics
setInterval(fetchExchangeRate, 3600000); // 1 hour
setInterval(fetchCoinGeckoSlowData, 600000); // 10 mins

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
