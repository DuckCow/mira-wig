function SkeletonCard() {
  return (
    <div className="rounded-lg overflow-hidden border border-gray-200 animate-pulse">
      <div className="aspect-square bg-gray-200" />
      <div className="p-3 space-y-2">
        <div className="h-3 w-16 bg-gray-200 rounded" />
        <div className="h-4 bg-gray-200 rounded" />
        <div className="h-3 w-20 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

export default function StylesLoading() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="h-8 w-40 bg-gray-200 rounded animate-pulse mb-6" />
      <div className="h-10 bg-gray-200 rounded-lg animate-pulse mb-6" />
      <div className="flex gap-2 mb-8">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-16 bg-gray-200 rounded-full animate-pulse" />
        ))}
      </div>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <li key={i}>
            <SkeletonCard />
          </li>
        ))}
      </ul>
    </main>
  );
}
