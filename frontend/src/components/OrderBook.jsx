export default function OrderBook({ bids = [], asks = [] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Realtime Order Book</h2>
        <span className="text-xs text-slate-400">Top 5 Bid / Ask</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-emerald-400">BUY / BID</p>
          {bids.map((item, index) => (
            <div key={`bid-${index}`} className="flex justify-between border-b border-white/5 py-2 text-sm">
              <span>{item.price}</span>
              <span className="text-slate-400">{item.qty}</span>
            </div>
          ))}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-red-400">SELL / ASK</p>
          {asks.map((item, index) => (
            <div key={`ask-${index}`} className="flex justify-between border-b border-white/5 py-2 text-sm">
              <span>{item.price}</span>
              <span className="text-slate-400">{item.qty}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
