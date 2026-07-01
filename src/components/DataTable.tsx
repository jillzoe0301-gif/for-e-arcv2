import { ReactNode } from 'react';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  title: string;
  className?: string;
  render: (row: any, index: number) => ReactNode;
}

export function DataTable<T>({ columns, rows, emptyText, rowKey }: {
  columns: Column<T>[];
  rows: T[];
  emptyText?: string;
  rowKey: (row: T, index: number) => string;
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => <th key={column.key} className={column.className}>{column.title}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={rowKey(row, index)}>
              {columns.map((column) => <td key={column.key} className={column.className}>{column.render(row, index)}</td>)}
            </tr>
          )) : (
            <tr><td colSpan={columns.length}><EmptyState text={emptyText} /></td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
