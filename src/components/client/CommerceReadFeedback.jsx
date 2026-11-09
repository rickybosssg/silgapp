export function CommerceReadError({ message, onRetry, isRetrying = false }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
      <p>{message}</p>
      <button type="button" onClick={onRetry} disabled={isRetrying} className="mt-2 rounded-lg border border-red-200 px-3 py-2 font-bold disabled:opacity-50">
        {isRetrying ? 'Chargement...' : 'Réessayer'}
      </button>
    </div>
  );
}
export function CommercePageFeedback({ query, message }) {
  return (
    <>
      {query.isError && <CommerceReadError message={message} isRetrying={query.isFetching} onRetry={() => query.isFetchNextPageError ? query.fetchNextPage() : query.refetch()} />}
      {query.hasNextPage && !query.isFetchNextPageError && (
        <button type="button" disabled={query.isFetching} onClick={() => query.fetchNextPage()} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700 disabled:opacity-50">
          {query.isFetchingNextPage ? 'Chargement...' : 'Afficher la suite'}
        </button>
      )}
    </>
  );
}
