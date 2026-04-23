export default function Loading() {
  return (
    <main className="min-h-screen bg-[#f7f8fb] px-6 py-8 text-gray-950">
      <div className="mx-auto max-w-7xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="h-4 w-36 rounded bg-gray-100" />
          <div className="mt-5 h-9 w-2/3 rounded bg-gray-100" />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            <div className="h-28 rounded-xl bg-gray-100" />
            <div className="h-28 rounded-xl bg-gray-100" />
            <div className="h-28 rounded-xl bg-gray-100" />
          </div>
        </div>
      </div>
    </main>
  );
}

