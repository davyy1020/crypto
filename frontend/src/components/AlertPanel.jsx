export default function AlertPanel({ alerts = [] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl">
      <h2 className="text-lg font-semibold">Market Alerts</h2>
      <div className="mt-4 space-y-3">
        {alerts.length === 0 && <p className="text-sm text-slate-400">Belum ada alert aktif.</p>}
        {alerts.map((alert, index) => (
          <div key={index} className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">
            {alert.message}
          </div>
        ))}
      </div>
    </div>
  );
}
