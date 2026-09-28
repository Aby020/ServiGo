"use client";

/**
 * The technician roster table, shared by the command centre and the roster
 * page.
 *
 * Presentational, including its loading and error states. The query lives with
 * the caller, because the two callers have different surrounding chrome (one
 * is a panel in a two-column grid, the other a full page) but the same data
 * and — importantly — the same query key `["admin", "staff"]`, so a
 * technician provisioned on one page appears on the other without a reload.
 *
 * The table is a real `<table>` with a `<caption>` and scoped headers rather
 * than a grid of divs: it is tabular data, and screen readers announce the
 * relationships between cells when the markup is honest about them.
 */

import { AlertCircle, Users } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import type { AdminStaff } from "@/lib/api";

interface StaffTableProps {
  staff: AdminStaff[] | undefined;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string;
  onRetry: () => void;
}

export function StaffTable({
  staff,
  isLoading,
  isError,
  errorMessage,
  onRetry,
}: StaffTableProps) {
  if (isLoading) {
    return (
      <div role="status" aria-label="Loading staff" className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertCircle size={22} className="text-danger" aria-hidden="true" />
        <p className="text-sm text-text-soft">{errorMessage}</p>
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (!staff || staff.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <Users size={22} className="text-muted" aria-hidden="true" />
        <p className="text-sm text-text-soft">
          No technicians yet. Add the first one to open the dispatch queue.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Staff accounts and their status</caption>
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="pb-2 pr-4 font-medium">Technician</th>
            <th scope="col" className="pb-2 pr-4 font-medium">Employee ID</th>
            <th scope="col" className="pb-2 pr-4 font-medium">Jobs</th>
            <th scope="col" className="pb-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => (
            <tr key={member.id} className="border-b border-line last:border-0">
              <td className="py-3 pr-4">
                <div className="font-medium text-ink">
                  {member.first_name || member.last_name
                    ? `${member.first_name} ${member.last_name}`.trim()
                    : member.username}
                </div>
                <div className="text-xs text-muted">{member.email}</div>
              </td>
              <td className="py-3 pr-4 font-mono text-xs text-text-soft">
                {/* Null for an account promoted without a profile. A dash says
                    "not set up"; `undefined` would say nothing at all. */}
                {member.employee_id ?? "—"}
              </td>
              <td className="py-3 pr-4 tabular-nums text-text-soft">
                {member.total_jobs ?? "—"}
              </td>
              <td className="py-3">
                <Badge tone={member.is_active ? "success" : "neutral"} size="sm" dot>
                  {member.is_active ? "Active" : "Deactivated"}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
