"use client";

/**
 * Add-technician dialog, shared by the command centre and the roster page.
 *
 * Extracted because two pages now provision staff and a form that exists
 * twice is a form that will be fixed in one place and left stale in the other
 * — the classic way a required field quietly stops being required. It is
 * presentational and dumb: the caller owns the mutation, the pending flag and
 * the error map, so the same dialog serves a create-and-invalidate flow and
 * anything else that grows later.
 *
 * Escape-to-close and backdrop-click-to-close match the status modal on the
 * staff dashboard. Both are suppressed while a request is in flight, so a
 * mis-click cannot dismiss a dialog whose submit is still running and leave
 * the user with no feedback at all.
 */

import { useEffect, useState } from "react";
import { UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { CreateStaffPayload } from "@/lib/api";

const EMPTY_FORM: CreateStaffPayload = {
  username: "",
  email: "",
  password: "",
  first_name: "",
  last_name: "",
  phone: "",
};

interface AddStaffModalProps {
  onClose: () => void;
  onSubmit: (payload: CreateStaffPayload) => void;
  pending: boolean;
  errors: Record<string, string>;
}

export function AddStaffModal({
  onClose,
  onSubmit,
  pending,
  errors,
}: AddStaffModalProps) {
  const [form, setForm] = useState<CreateStaffPayload>(EMPTY_FORM);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const set = (key: keyof CreateStaffPayload) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-staff-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-lg border border-line bg-surface shadow-lg">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id="add-staff-title" className="font-display text-base font-bold text-ink">
              Add new technician
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              Creates a staff account they can sign in with immediately.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Close"
            className="rounded p-1 text-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-50"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form
          className="flex flex-col gap-4 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              username: form.username.trim(),
              email: form.email.trim(),
              password: form.password,
              first_name: form.first_name.trim(),
              last_name: form.last_name.trim(),
              phone: form.phone.trim(),
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="staff-username"
              label="Username"
              value={form.username}
              onChange={(e) => set("username")(e.target.value)}
              autoComplete="off"
              placeholder="ravi_tech"
              error={errors.username}
              disabled={pending}
            />
            <Input
              id="staff-email"
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => set("email")(e.target.value)}
              autoComplete="off"
              placeholder="ravi@servigo.in"
              error={errors.email}
              disabled={pending}
            />
          </div>

          <Input
            id="staff-password"
            label="Temporary password"
            type="password"
            value={form.password}
            onChange={(e) => set("password")(e.target.value)}
            autoComplete="new-password"
            hint="Share it out of band. It is never shown again."
            error={errors.password}
            disabled={pending}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="staff-first-name"
              label="First name"
              value={form.first_name}
              onChange={(e) => set("first_name")(e.target.value)}
              autoComplete="off"
              error={errors.first_name}
              disabled={pending}
            />
            <Input
              id="staff-last-name"
              label="Last name"
              value={form.last_name}
              onChange={(e) => set("last_name")(e.target.value)}
              autoComplete="off"
              error={errors.last_name}
              disabled={pending}
            />
          </div>

          <Input
            id="staff-phone"
            label="Phone"
            value={form.phone}
            onChange={(e) => set("phone")(e.target.value)}
            inputMode="tel"
            autoComplete="off"
            placeholder="+91 98765 43210"
            error={errors.phone}
            disabled={pending}
          />

          <p className="rounded-md bg-surface-2 px-3 py-2 text-xs text-muted">
            The account is created with the staff role and can reach the
            dispatch queue. It cannot be given administrator access from here.
          </p>

          {errors.non_field && (
            <p role="alert" className="text-sm text-danger">
              {errors.non_field}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={pending} leadingIcon={<UserPlus size={14} />}>
              Create account
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
