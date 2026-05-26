import WebSocket from 'ws';

export class BinanceStreamClient {
  constructor({ symbol, onMarketData, onStatus }) {
    this.symbol = symbol.toLowerCase();
    this.onMarketData = onMarketData;
    this.onStatus = onStatus;
    this.ws = null;
    this.reconnectDelay = 5000;
    this.shouldReconnect = true;
    this.mockInterval = null;
    this.mockOrderBookInterval = null;
    this.connectionTimeout = null;
  }

  connect() {
    const tickerStream = `${this.symbol}@ticker`;
    const depthStream = `${this.symbol}@depth5@100ms`;
    const url = `wss://stream.binance.com:9443/stream?streams=${tickerStream}/${depthStream}`;

    this.onStatus?.({ status: 'CONNECTING', url, createdAt: new Date().toISOString() });
    this.ws = new WebSocket(url);

    // Setup connection timeout to fallback if blocked
    clearTimeout(this.connectionTimeout);
    this.connectionTimeout = setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        console.log("WebSocket connection timed out (likely blocked by ISP). Falling back to mock simulator.");
        this.ws.terminate();
        this.startMockSimulator();
      }
    }, 5000);

    this.ws.on('open', () => {
      clearTimeout(this.connectionTimeout);
      this.stopMockSimulator();
      this.onStatus?.({ status: 'CONNECTED', createdAt: new Date().toISOString() });
    });

    this.ws.on('message', (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        const normalized = this.normalize(payload);
        if (normalized) this.onMarketData?.(normalized);
      } catch (error) {
        this.onStatus?.({ status: 'PARSE_ERROR', error: error.message });
      }
    });

    this.ws.on('close', () => {
      clearTimeout(this.connectionTimeout);
      this.onStatus?.({ status: 'CLOSED', createdAt: new Date().toISOString() });
      if (this.shouldReconnect) {
        this.reconnect();
      }
    });

    this.ws.on('error', (error) => {
      clearTimeout(this.connectionTimeout);
      this.onStatus?.({ status: 'ERROR', error: error.message, createdAt: new Date().toISOString() });
      this.startMockSimulator();
    });
  }

  reconnect() {
    setTimeout(() => {
      if (!this.mockInterval) {
        this.connect();
      }
    }, this.reconnectDelay);
  }

  stop() {
    this.shouldReconnect = false;
    clearTimeout(this.connectionTimeout);
    this.ws?.close();
    this.stopMockSimulator();
  }

  startMockSimulator() {
    if (this.mockInterval) return;
    
    // Clean up current WebSocket to prevent late close/error events from overwriting status
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.on('error', () => {}); // No-op to catch potential unhandled errors
        this.ws.terminate();
      } catch (err) {
        console.error("Error terminating websocket:", err);
      }
      this.ws = null;
    }

    console.log("Starting high-fidelity local market simulator...");
    this.onStatus?.({ status: 'CONNECTED (SIMULATED)', createdAt: new Date().toISOString() });

    let currentPrice = this.symbol === 'btcusdt' ? 68500 : 3500;
    const startPrice = currentPrice;
    
    this.mockInterval = setInterval(() => {
      const changePercent = (Math.random() - 0.48) * 0.05; // slight positive bias
      currentPrice = currentPrice * (1 + changePercent / 100);
      const priceChangePercent = ((currentPrice - startPrice) / startPrice) * 100;
      
      this.onMarketData?.({
        type: 'ticker',
        symbol: this.symbol.toUpperCase(),
        lastPrice: Number(currentPrice.toFixed(2)),
        priceChangePercent: Number(priceChangePercent.toFixed(2)),
        highPrice: Number((startPrice * 1.02).toFixed(2)),
        lowPrice: Number((startPrice * 0.98).toFixed(2)),
        volume: Number((12450.42 + (Math.random() * 100)).toFixed(2)),
        eventTime: Date.now()
      });
    }, 500);

    this.mockOrderBookInterval = setInterval(() => {
      const bids = [];
      const asks = [];
      const basePrice = currentPrice;

      for (let i = 0; i < 5; i++) {
        bids.push({
          price: Number((basePrice - (i + 1) * (0.5 + Math.random() * 0.5)).toFixed(2)),
          qty: Number((Math.random() * 2).toFixed(4))
        });
        asks.push({
          price: Number((basePrice + (i + 1) * (0.5 + Math.random() * 0.5)).toFixed(2)),
          qty: Number((Math.random() * 2).toFixed(4))
        });
      }

      this.onMarketData?.({
        type: 'orderbook',
        symbol: this.symbol.toUpperCase(),
        bids: bids.sort((a, b) => b.price - a.price),
        asks: asks.sort((a, b) => a.price - b.price),
        eventTime: Date.now()
      });
    }, 300);
  }

  stopMockSimulator() {
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }
    if (this.mockOrderBookInterval) {
      clearInterval(this.mockOrderBookInterval);
      this.mockOrderBookInterval = null;
    }
  }

  normalize(payload) {
    const stream = payload.stream || '';
    const data = payload.data;

    if (!data) return null;

    if (stream.includes('@ticker')) {
      return {
        type: 'ticker',
        symbol: data.s,
        lastPrice: Number(data.c),
        priceChangePercent: Number(data.P),
        highPrice: Number(data.h),
        lowPrice: Number(data.l),
        volume: Number(data.v),
        eventTime: data.E
      };
    }

    if (stream.includes('@depth')) {
      return {
        type: 'orderbook',
        symbol: this.symbol.toUpperCase(),
        bids: data.bids.map(([price, qty]) => ({ price: Number(price), qty: Number(qty) })),
        asks: data.asks.map(([price, qty]) => ({ price: Number(price), qty: Number(qty) })),
        eventTime: Date.now()
      };
    }

    return null;
  }
}
