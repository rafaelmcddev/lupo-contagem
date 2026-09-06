export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="mt-6 flex items-center justify-center gap-4">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
      >
        Anterior
      </button>
      <span className="text-sm text-gray-600">
        Página {page} de {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium disabled:opacity-40"
      >
        Próxima
      </button>
    </div>
  );
}
