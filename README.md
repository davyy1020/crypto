# Realtime Crypto Market Dashboard

Realtime Crypto Market Dashboard adalah aplikasi web untuk monitoring harga crypto, price change, order book, dan alert market secara realtime menggunakan Node.js WebSocket relay dan React Tailwind frontend.

## Fitur

- Realtime last price
- Price change percentage
- Order book bid/ask
- Backend relay WebSocket
- Auto reconnect backend
- Frontend React + TailwindCSS
- Struktur siap dikembangkan untuk Telegram/email alert

## Struktur Folder

```text
crypto-realtime-dashboard/
├── backend/
│   ├── src/
│   │   ├── index.js
│   │   ├── exchangeClient.js
│   │   └── alertEngine.js
│   ├── package.json
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── components/
│   │   └── pages/
│   ├── package.json
│   └── index.html
└── docs/
    ├── PROPOSAL_CLIENT.md
    └── ARCHITECTURE.md
```

## Cara Menjalankan Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

Default backend berjalan di:

```text
http://localhost:4000
ws://localhost:4000
```

## Cara Menjalankan Frontend

```bash
cd frontend
npm install
npm run dev
```

Default frontend berjalan di:

```text
http://localhost:5173
```

## Konfigurasi Pair

Edit file backend `.env`:

```env
PORT=4000
SYMBOL=btcusdt
```

Contoh pair lain:

```env
SYMBOL=ethusdt
```

## Catatan

Kode awal menggunakan Binance public WebSocket stream sebagai contoh. Untuk Bybit, Coinbase, atau OKX, bagian `exchangeClient.js` bisa disesuaikan.

## License

MIT
