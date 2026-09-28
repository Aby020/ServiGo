"use client";

import { CheckCircle2, ClipboardList, Star } from "lucide-react";
import { DashboardShell } from "@/components/DashboardShell";
import { Card } from "@/components/ui/Card";

const STATS = [
  { label: "Assigned jobs", value: "5", icon: ClipboardList },
  { label: "Completed today", value: "3", icon: CheckCircle2 },
  { label: "Rating", value: "4.8", icon: Star },
];

export default function StaffDashboard() {
  return (
    <DashboardShell expectedRole="staff" title="Staff Dashboard">
      {(user) => (
        <div className="flex flex-col gap-6">
          {/* Welcome */}
          <Card elevation="raised" className="p-6">
            <p className="font-display text-lg font-bold text-ink">
              Welcome, {user.first_name || user.username}
            </p>
            <p className="mt-1 text-sm text-text-soft">
              {user.email} · Staff / Service Provider
            </p>
          </Card>

          {/* Stats row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STATS.map(({ label, value, icon: Icon }) => (
              <Card key={label} className="p-5 text-center">
                <span className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-md bg-primary-soft text-primary">
                  <Icon size={15} aria-hidden="true" />
                </span>
                <div className="font-display text-2xl font-bold tabular-nums text-primary">
                  {value}
                </div>
                <div className="mt-0.5 text-sm text-muted">{label}</div>
              </Card>
            ))}
          </div>

          {/* Jobs placeholder */}
          <Card className="p-6">
            <h2 className="mb-4 font-display text-base font-bold text-ink">
              Upcoming jobs
            </h2>
            <p className="text-sm text-text-soft">
              Assigned jobs will appear here once connected to the API.
            </p>
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}
