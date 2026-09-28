"use client";

/**
 * Profile settings — one page, all three roles.
 *
 * The shell is mounted without `expectedRole` (see `DashboardShell`), so a
 * customer, a technician and an administrator all land here from their own
 * sidebar and all edit through the same `PATCH /api/auth/profile/`. Three
 * role-nested copies of this form would drift within a week.
 *
 * ── What is and is not editable ───────────────────────────────────────────────
 * The role badge, username and email are shown but not editable, because
 * the endpoint does not accept them — the serializer declares them
 * read-only. Rather than render a disabled field and let the user discover
 * the rule by trying, they are shown as plain values with an explicit note.
 * A disabled input reads as "temporarily unavailable"; a read-only value
 * reads as "this is how it is".
 *
 * ── Success feedback ──────────────────────────────────────────────────────────
 * An inline `role="status"` banner, auto-clearing after a few seconds. The
 * app has no toast library and mounts no `<Toaster />`; adding a dependency
 * for one confirmation would be out of proportion. This mirrors the inline
 * `role="alert"` pattern already used for errors throughout the app, so the
 * two read as the same component in two moods.
 *
 * `role="status"` rather than `role="alert"` is deliberate: the content is a
 * confirmation, not an interruption, and a screen reader should not
 * interrupt whatever the user is doing to hear it.
 */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, AtSign, CheckCircle2, Phone, Save, Shield, User as UserIcon } from "lucide-react";

import { DashboardShell } from "@/components/DashboardShell";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import { updateProfile, type UserProfile, type UserRole } from "@/lib/api";
import { getValidAccessToken } from "@/lib/auth";

/** Matches the server's `IsAdminUser` / role vocabulary, spelled for humans. */
const ROLE_LABEL: Record<UserRole, string> = {
  customer: "Customer",
  staff: "Staff / Service Provider",
  admin: "Admin",
};

const ROLE_TONE: Record<UserRole, BadgeTone> = {
  customer: "info",
  staff: "primary",
  admin: "accent",
};

/** How long the success banner stays up before clearing itself. */
const SUCCESS_TTL_MS = 4000;

function ProfileSettings({ user }: { user: UserProfile }) {
  const queryClient = useQueryClient();

  const [firstName, setFirstName] = useState(user.first_name);
  const [lastName, setLastName] = useState(user.last_name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [saved, setSaved] = useState(false);

  /**
   * The inputs are seeded once, by mount, and then left alone.
   *
   * The obvious alternative — `useEffect(() => setPhone(user.phone), [user])`
   * — is what this page used to do, and it is wrong twice over. It renders the
   * stale value once before the new one, so the phone field visibly flickers
   * from what the user typed to what the server stored; and because the
   * `["auth", "me"]` entry is invalidated on every successful save, it
   * re-runs on a background refetch that has nothing to do with the form and
   * would happily overwrite half-typed input.
   *
   * Keying the form on the username gives the same guarantee with neither
   * problem: the fields initialise from the profile, and only a change of
   * account — which cannot happen in a session, and which *should* discard the
   * old form anyway — re-seeds them.
   */
  const seedKey = user.username;

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), SUCCESS_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getValidAccessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      return updateProfile(
        {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
        },
        token,
      );
    },
    onSuccess: (updated) => {
      // Seed the cache with the server's response rather than trusting the
      // form's own values. The server normalises the phone number, and it
      // is the only thing that knows the result.
      queryClient.setQueryData(["auth", "me"], updated);
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      setSaved(true);
    },
  });

  const initials =
    (user.first_name || user.username).slice(0, 1).toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      {/* Identity card */}
      <Card elevation="raised" className="p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-soft font-display text-xl font-bold text-primary"
          >
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold text-ink">
              {user.first_name || user.last_name
                ? `${user.first_name} ${user.last_name}`.trim()
                : user.username}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge tone={ROLE_TONE[user.role]} size="sm" dot>
                {ROLE_LABEL[user.role]}
              </Badge>
              <span className="text-xs text-muted">
                Signed in as {user.username}
              </span>
            </div>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <div>
            <dt className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-text-soft">
              <AtSign size={13} aria-hidden="true" />
              Email
            </dt>
            <dd className="mt-1 text-sm text-ink">{user.email}</dd>
          </div>
          <div>
            <dt className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-text-soft">
              <Shield size={13} aria-hidden="true" />
              Username
            </dt>
            <dd className="mt-1 font-mono text-sm text-ink">{user.username}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-muted">
          Email, username and role are set when the account is created and
          cannot be changed here. They are also the credentials used to sign
          in — changing them needs a flow that can verify you still own the
          address.
        </p>
      </Card>

      {/* Editable fields */}
      <Card className="p-6">
        <h2 className="font-display text-base font-bold text-ink">
          Personal details
        </h2>
        <p className="mt-1 text-sm text-text-soft">
          These appear on your bookings and, for technicians, on the
          customers&apos; job cards.
        </p>

        <form
          key={seedKey}
          className="mt-5 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="first_name"
              label="First name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              leadingIcon={<UserIcon size={14} />}
              disabled={mutation.isPending}
            />
            <Input
              id="last_name"
              label="Last name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
              disabled={mutation.isPending}
            />
          </div>

          <Input
            id="phone"
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            inputMode="tel"
            placeholder="+91 98765 43210"
            hint="Spaces and dashes are fine — the number is stored without them."
            leadingIcon={<Phone size={14} />}
            disabled={mutation.isPending}
          />

          {/* Both banners live in the same slot so the form does not jump
              when one replaces the other. */}
          {mutation.isError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger"
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              {mutation.error.message}
            </p>
          )}

          {saved && (
            <p
              role="status"
              className={cn(
                "flex items-start gap-2 rounded-md border border-success/30 bg-success-soft px-3 py-2.5 text-sm font-medium text-success",
              )}
            >
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              Profile updated.
            </p>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              loading={mutation.isPending}
              leadingIcon={<Save size={14} aria-hidden="true" />}
            >
              Save changes
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

export default function ProfilePage() {
  return (
    // No `expectedRole`: this page belongs to every role. The shell still
    // redirects anonymous visitors to /login.
    <DashboardShell title="Profile">
      {(user) => <ProfileSettings user={user} />}
    </DashboardShell>
  );
}
