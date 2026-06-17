// ============================================================
// components/ui/Table.tsx — 데이터 테이블
// 정렬·페이지네이션 없음 — 필요 시 확장.
// ============================================================

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  rows: T[];
  /** 각 행의 고유 키 추출 */
  getRowKey: (row: T) => string;
  /** 데이터 없을 때 표시할 문자열 */
  emptyMessage?: string;
}

export function Table<T>({
  columns,
  rows,
  getRowKey,
  emptyMessage = "데이터가 없습니다.",
}: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 font-medium text-gray-700 whitespace-nowrap"
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-8 text-center text-gray-400"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={getRowKey(row)} className="hover:bg-gray-50">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-gray-700">
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
