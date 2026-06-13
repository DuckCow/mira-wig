export default function StyleDetailLoading() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-8">
      <div className="h-4 w-20 bg-gray-200 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="aspect-square bg-gray-200 rounded-xl animate-pulse" />
        <div className="space-y-4">
          <div className="h-3 w-16 bg-gray-200 rounded animate-pulse" />
          <div className="h-8 w-3/4 bg-gray-200 rounded animate-pulse" />
          <div className="h-6 w-1/3 bg-gray-200 rounded animate-pulse" />
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 bg-gray-200 rounded animate-pulse" />
            <div className="h-3 w-2/3 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="space-y-3 pt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 w-10 bg-gray-200 rounded animate-pulse" />
                <div className="flex gap-2">
                  {Array.from({ length: 3 }).map((__, j) => (
                    <div key={j} className="h-7 w-16 bg-gray-200 rounded-full animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
