"use client";

/**
 * Staff management — the roster, full width, with provisioning.
 *
 * The command centre shows a compact roster because it is one panel among
 * several. This is the page to open when the question is specifically "who
 * works here and can they sign in" — so it gives the roster the whole screen,
 * adds the contact details the panel leaves out, and puts the provisioning
 * dialog on a primary button rather than a small one in a card header.
 *
 * It reads the same `["admin", "staff"]` and `["admin", "metrics"]` queries as
 * the command centre, and shares `StaffTable` and `AddStaffModal` with it, so
 * a technician added here appears there without a reload and neither page can
 * drift from the other.
 *
 * ── What this page deliberately cannot do ─────────────────────────────────────
 * It cannot deactivate an account or change a role. `GET /api/admin/staff/`
 * and `POST /api/admin/staff/` are the only two staff endpoints the spec
 * asks for, and inventing a third from the admin UI would put a button on
 * screen that fails — or worse, silently succeeds for one role and not the
 * other. The `is_active` column is therefore read-only here, and says so.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Plus, RefreshCw, ShieldAlert } from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { AddStaffModal } from "@/components/admin/AddStaffModal";
import { StaffTable } from "@/components/admin/StaffTable";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { toFieldErrors } from "@/lib/admin-errors";
import {
  createStaffMember,
  fetchAdminMetrics,
  fetchAdminStaff,
  type AdminMetrics,
  type AdminStaff,
  type CreateStaffPayload,
} from "@/lib/api";
import { getValidAccessToken } from "@/lib/auth";
import { formatTimestamp } from "@/lib/booking-ui";

/** How long the "account created" confirmation stays up. */
const CONFIRM_TTL_MS = 6000;

function StaffManagement() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<string | null>(null);

  const staffQuery = useQuery<AdminStaff[], Error>({
    queryKey: ["admin", "staff"],
    queryFn: async () => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return fetchAdminStaff(token);
    },
    staleTime: 30_000,
    retry: false,
  });

  // The headcount comes from the metrics payload rather than being counted
  // from the list: the two can legitimately differ (a deactivated technician
  // is in the roster but not in `active_staff`), and which number an operator
  // is looking at should be the one the API defines.
  const metricsQuery = useQuery<AdminMetrics, Error>({
    queryKey: ["admin", "metrics"],
    queryFn: async () => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return fetchAdminMetrics(token);
    },
    staleTime: 30_000,
    retry: false,
  });

  const staff = staffQuery.data;

  useEffect(() => {
    if (!created) return;
    const timer = window.setTimeout(() => setCreated(null), CONFIRM_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [created]);

  const createMutation = useMutation({
    mutationFn: async (payload: CreateStaffPayload) => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("unauthenticated");
      return createStaffMember(payload, token);
    },
    onSuccess: (newStaff) => {
      setModalOpen(false);
      setFieldErrors({});
      setCreated(newStaff.username);
      void queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "metrics"] });
    },
    onError: (err) => {
      setFieldErrors(toFieldErrors(err));
    },
  });

  const closeModal = () => {
    if (createMutation.isPending) return;
    setModalOpen(false);
    setFieldErrors({});
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Confirmation */}
      {created && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-md border border-success/30 bg-success-soft px-4 py-3 text-sm font-medium text-success"
        >
          <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
          <span>
            <span className="font-mono">{created}</span> was created with the
            staff role and can sign in now.
          </span>
        </p>
      )}

      {/* Roster */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-base font-bold text-ink">Roster</h2>
            <p className="mt-0.5 text-xs text-muted">
              {metricsQuery.data
                ? `${metricsQuery.data.active_staff} active of ${metricsQuery.data.total_staff} on the roster`
                : "Loading headcount…"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => staffQuery.refetch()}
              loading={staffQuery.isFetching}
              leadingIcon={<RefreshCw size={14} />}
            >
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setFieldErrors({});
                setModalOpen(true);
              }}
              leadingIcon={<Plus size={14} aria-hidden="true" />}
            >
              Add technician
            </Button>
          </div>
        </div>

        <div className="p-5">
          <StaffTable
            staff={staff}
            isLoading={staffQuery.isLoading}
            isError={staffQuery.isError}
            errorMessage={
              staffQuery.error?.message === "unauthenticated"
                ? "Your session expired. Please sign in again."
                : staffQuery.error?.message ?? "The roster could not be loaded."
            }
            onRetry={() => staffQuery.refetch()}
          />
        </div>
      </Card>

      {/* Contact list — who to ring, and when they joined. */}
      {staff && staff.length > 0 && (
        <Card className="p-6">
          <h2 className="font-display text-base font-bold text-ink">Contact list</h2>
          <p className="mt-0.5 text-xs text-muted">
            Phone numbers and join dates, for the days a booking needs chasing.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {staff.map((member) => (
              <li
                key={member.id}
                className="rounded-md border border-line bg-surface-2 px-4 py-3"
              >
                <p className="text-sm font-medium text-ink">
                  {member.first_name || member.last_name
                    ? `${member.first_name} ${member.last_name}`.trim()
                    : member.username}
                </p>
                <p className="mt-0.5 font-mono text-xs text-text-soft">
                  {member.phone || "No phone on file"}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  Joined {formatTimestamp(member.date_joined)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* A boundary the UI states rather than one it hides. */}
      <Card className="flex items-start gap-3 p-5">
        <ShieldAlert size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
        <p className="text-sm leading-relaxed text-text-soft">
          Accounts created here hold the <strong className="text-ink">staff</strong>{" "}
          role and can work the dispatch queue. Granting administrator access is
          a separate, deliberate step and is not available from this screen —
          the <span className="font-mono text-xs">status</span> column below
          reflects the account&apos;s own state and cannot be edited here either.
        </p>
      </Card>

      {modalOpen && (
        <AddStaffModal
          onClose={closeModal}
          onSubmit={(payload) => createMutation.mutate(payload)}
          pending={createMutation.isPending}
          errors={fieldErrors}
        />
      )}
    </div>
  );
}

export default function AdminStaffPage() {
  return (
    <DashboardShell expectedRole="admin" title="Staff management">
      {() => <StaffManagement />}
    </DashboardShell>
  );
}
