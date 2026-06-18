export default function DashboardLoading() {
  return (
    <div className="p-8 max-w-6xl mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-7 w-44 rounded bg-slate-200" />
          <div className="h-4 w-72 rounded bg-slate-100 mt-3" />
        </div>
        <div className="h-10 w-32 rounded-lg bg-slate-200" />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="h-10 w-10 rounded-xl bg-slate-200" />
            <div className="h-5 w-32 rounded bg-slate-200 mt-3" />
            <div className="h-4 w-full rounded bg-slate-100 mt-2" />
            <div className="h-4 w-40 rounded bg-slate-100 mt-4" />
          </div>
        ))}
      </div>
    </div>
  );
}
