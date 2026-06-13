export default function CartLoading() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="h-8 w-32 bg-gray-200 rounded animate-pulse mb-6" />
      <ul className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="flex gap-4 py-4 border-b border-gray-100">
            <div className="w-20 h-20 bg-gray-200 rounded-lg animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
              <div className="h-3 bg-gray-200 rounded animate-pulse w-1/2" />
              <div className="h-4 bg-gray-200 rounded animate-pulse w-1/4" />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
