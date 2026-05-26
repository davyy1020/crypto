import { Activity, Bell, RadioTower } from 'lucide-react';
import { useCryptoSocket } from '../lib/useCryptoSocket';
import StatCard from '../components/StatCard';
import OrderBook from '../components/OrderBook';
import AlertPanel from '../components/AlertPanel';

export default function Dashboard() {
  const { status, ticker, orderbook, alerts } = useCryptoSocket();
  const isPositive = (ticker?.priceChangePercent || 0) >= 0;

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <section className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">
              <RadioTower size={14} /> WebSocket Relay Active
            </p>
            <h1 className="text-4xl font-bold tracking-tight">Realtime Crypto Market Dashboard</h1>
            <p className="mt-2 max-w-2xl text-slate-400">
              Monitoring harga crypto, order book, price change, dan market alert secara realtime melalui backend relay Node.js.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
            <p className="text-xs text-slate-400">Connection Status</p>
            <p className="mt-1 font-semibold text-cyan-300">{status}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <StatCard label="Symbol" value={ticker?.symbol || 'BTCUSDT'} subtext="Market pair" />
          <StatCard label="Last Price" value={ticker ? `$${ticker.lastPrice.toLocaleString()}` : 'Loading...'} subtext="Realtime ticker" />
          <StatCard label="24h Change" value={ticker ? `${ticker.priceChangePercent}%` : 'Loading...'} positive={isPositive} subtext="Price movement" />
          <StatCard label="Volume" value={ticker ? ticker.volume.toFixed(2) : 'Loading...'} subtext="24h volume" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <OrderBook bids={orderbook.bids} asks={orderbook.asks} />
          </div>
          <AlertPanel alerts={alerts} />
        </div>

        <div className="mt-6 rounded-2xl border border-white/10 bg-gradient-to-br from-cyan-500/10 to-blue-500/10 p-6">
          <div className="flex items-start gap-3">
            <Activity className="mt-1 text-cyan-300" />
            <div>
              <h2 className="text-xl font-semibold">Production Ready Architecture</h2>
              <p className="mt-2 text-sm text-slate-300">
                Frontend tidak langsung connect ke exchange. Semua data realtime masuk melalui backend relay agar lebih stabil, aman, dan mudah dikembangkan untuk multi exchange, database, dan notification service.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
