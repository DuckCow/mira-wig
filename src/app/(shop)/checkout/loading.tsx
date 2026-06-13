export default function CheckoutLoading() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <div className="h-8 w-32 bg-gray-200 rounded animate-pulse mb-6" />
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        ))}
      </div>
    </main>
  );
}
