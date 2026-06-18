export default function CourseLoading() {
  return (
    <div className="flex flex-col h-screen animate-pulse">
      <header className="border-b border-slate-200 bg-white px-8 pt-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="h-7 w-56 rounded bg-slate-200" />
            <div className="h-4 w-72 rounded bg-slate-100 mt-2" />
          </div>
          <div className="h-7 w-48 rounded-full bg-slate-100" />
        </div>
        <div className="flex gap-2 mt-5 pb-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-6 w-20 rounded bg-slate-100" />
          ))}
        </div>
      </header>
      <div className="flex-1 bg-slate-50 p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="h-32 rounded-2xl border border-slate-200 bg-white" />
          <div className="h-16 rounded-xl border border-slate-200 bg-white" />
          <div className="h-16 rounded-xl border border-slate-200 bg-white" />
        </div>
      </div>
    </div>
  );
}
