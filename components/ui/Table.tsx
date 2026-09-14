interface Column<T> {
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
}

export function Table<T extends { id: number | string }>({
  columns,
  rows,
  emptyMessage,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="text-lg text-gray-500">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-paper shadow-sm">
      <table className="w-full min-w-[480px] border-collapse text-left">
        <thead>
          <tr className="border-b border-gray-200">
            {columns.map((col) => (
              <th
                key={col.header}
                className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.id} className={`transition-colors hover:bg-accent-light/60 ${i % 2 === 0 ? 'bg-paper' : 'bg-canvas'}`}>
              {columns.map((col) => (
                <td key={col.header} className={`px-4 py-3 text-base ${col.className ?? ''}`}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
