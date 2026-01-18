"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import type { Client } from "@/lib/types/client";

// Helper to format filing status for display
const formatFilingStatus = (status: Client["filing_status"]): string => {
  const map: Record<Client["filing_status"], string> = {
    single: "Single",
    married_filing_jointly: "Married Filing Jointly",
    married_filing_separately: "Married Filing Separately",
    head_of_household: "Head of Household",
  };
  return map[status];
};

// Actions cell component to encapsulate navigation logic
function ActionsCell({
  client,
  onDelete
}: {
  client: Client;
  onDelete: (id: string) => void;
}) {
  const handleViewDetails = () => {
    window.location.href = `/clients/${client.id}`;
  };

  const handleEdit = () => {
    window.location.href = `/clients/${client.id}/edit`;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="h-8 w-8 p-0 inline-flex items-center justify-center rounded-md hover:bg-muted focus:outline-none"
      >
        <span className="sr-only">Open menu</span>
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleViewDetails}>
          View details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleEdit}>
          Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => onDelete(client.id)}
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// CRITICAL: Define columns outside of component to prevent infinite re-renders
// If you need dynamic data (like onDelete callback), use a factory function
export const createColumns = (onDelete: (id: string) => void): ColumnDef<Client>[] => [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Name
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => (
      <Link
        href={`/clients/${row.original.id}`}
        className="font-medium hover:underline"
      >
        {row.getValue("name")}
      </Link>
    ),
  },
  {
    accessorKey: "state",
    header: "State",
  },
  {
    accessorKey: "filing_status",
    header: "Filing Status",
    cell: ({ row }) => formatFilingStatus(row.getValue("filing_status")),
  },
  {
    accessorKey: "created_at",
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Created
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const date = new Date(row.getValue("created_at"));
      return date.toLocaleDateString();
    },
  },
  {
    id: "actions",
    cell: ({ row }) => (
      <ActionsCell client={row.original} onDelete={onDelete} />
    ),
  },
];
