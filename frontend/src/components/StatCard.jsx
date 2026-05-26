export default function StatCard({ label, value, subtext, positive }) {
  const valueClass = positive === undefined ? 'text-white' : positive ? 'text-emerald-400' : 'text-red-400';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl">
      <p className="text-sm text-slate-400">{label}</p>
      <h3 className={`mt-2 text-2xl font-bold ${valueClass}`}>{value}</h3>
      {subtext && <p className="mt-1 text-xs text-slate-500">{subtext}</p>}
    </div>
  );
}
