import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

interface Library {
  id: string;
  name: string;
  description: string | null;
  sourceType: string | null;
  chunkCount: number | null;
  updatedAt: string | null;
}

const columnHelper = createColumnHelper<Library>();

const columns = [
  columnHelper.accessor("name", {
    header: "Name",
    cell: (info) => (
      <Link
        to="/dashboard/libraries/$id"
        params={{ id: info.row.original.id }}
        className="font-medium text-text hover:text-accent"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("id", {
    header: "ID",
    cell: (info) => (
      <code className="text-xs text-muted">{info.getValue()}</code>
    ),
  }),
  columnHelper.accessor("sourceType", {
    header: "Source",
    cell: (info) => (
      <span className="rounded bg-hover px-2 py-0.5 text-xs text-muted">
        {info.getValue() ?? "unknown"}
      </span>
    ),
  }),
  columnHelper.accessor("chunkCount", {
    header: "Chunks",
    cell: (info) => info.getValue() ?? 0,
  }),
  columnHelper.accessor("updatedAt", {
    header: "Updated",
    cell: (info) => {
      const val = info.getValue();
      return val ? new Date(val).toLocaleDateString() : "—";
    },
  }),
];

export function LibraryTable({ data }: { data: Library[] }) {
  const [globalFilter, setGlobalFilter] = useState("");

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div>
      <input
        type="text"
        placeholder="Search libraries..."
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        className="mb-4 w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text placeholder-muted focus:border-muted focus:outline-none"
      />

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-surface">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 font-medium text-muted"
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-border">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-surface/50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-text">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-muted">
                  No libraries found. Add one to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
