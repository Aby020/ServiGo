"use client";

import { MapPin, Plug, Zap } from "lucide-react";
import { MotionPage, StaggerOnView, StaggerItem, HoverCard } from "@/components/motion";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SafeImage } from "@/components/SafeImage";
import { getEvImage } from "@/lib/images";
import { cn } from "@/lib/utils";

/* Illustrative station data — the shape the live API will return. */
const stations = [
  { id: 1, name: "Koramangala Fast Charge Hub", address: "80 Feet Rd, Koramangala, Bengaluru", slots: 4, available: 2, speed: "DC 60 kW", price: "₹18/kWh", status: "available" },
  { id: 2, name: "Indiranagar Supercharger", address: "100 Feet Rd, Indiranagar, Bengaluru", slots: 8, available: 0, speed: "DC 120 kW", price: "₹22/kWh", status: "full" },
  { id: 3, name: "HSR Layout EV Point", address: "Sector 6, HSR Layout, Bengaluru", slots: 3, available: 3, speed: "AC 22 kW", price: "₹12/kWh", status: "available" },
  { id: 4, name: "Whitefield Charge Zone", address: "ITPL Main Rd, Whitefield, Bengaluru", slots: 6, available: 1, speed: "DC 50 kW", price: "₹16/kWh", status: "available" },
  { id: 5, name: "MG Road Premium Charger", address: "MG Road, Central Bengaluru", slots: 2, available: 2, speed: "DC 150 kW", price: "₹25/kWh", status: "available" },
  { id: 6, name: "Electronic City Hub", address: "Phase 1, Electronic City, Bengaluru", slots: 10, available: 0, speed: "DC 60 kW", price: "₹18/kWh", status: "maintenance" },
];

type StationStatus = "available" | "full" | "maintenance";

const statusMeta: Record<StationStatus, { tone: BadgeTone; label: string }> = {
  available: { tone: "success", label: "Available" },
  full: { tone: "danger", label: "Full" },
  maintenance: { tone: "warning", label: "Maintenance" },
};

function StationCard({ station }: { station: (typeof stations)[number] }) {
  const meta = statusMeta[station.status as StationStatus];
  const isAvailable = station.status === "available";
  const fillRatio = station.slots > 0 ? station.available / station.slots : 0;

  return (
    <StaggerItem className="h-full">
      <HoverCard className="h-full">
        <Card className="flex h-full flex-col overflow-hidden transition-colors duration-base ease-out hover:border-primary/40">
          {/* Station photo — deterministic per station, never a broken icon. */}
          <SafeImage
            src={getEvImage(station.name)}
            alt={station.name}
            className="h-36 w-full"
            imgClassName="object-cover"
          />

          <div className="flex flex-1 flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-display text-base font-bold leading-snug text-ink">
                {station.name}
              </h3>
              <Badge tone={meta.tone} dot className="shrink-0">
                {meta.label}
              </Badge>
            </div>

            <p className="mt-2 flex items-start gap-1.5 text-sm text-text-soft">
              <MapPin size={14} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
              {station.address}
            </p>

            {/* Spec tiles */}
            <dl className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: "Speed", value: station.speed },
                { label: "Bays free", value: `${station.available}/${station.slots}` },
                { label: "Rate", value: station.price },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-md border border-line bg-surface-2 px-2 py-2 text-center"
                >
                  <dd className="font-display text-sm font-bold tabular-nums text-ink">
                    {item.value}
                  </dd>
                  <dt className="mt-0.5 text-[10px] uppercase tracking-wide text-muted">
                    {item.label}
                  </dt>
                </div>
              ))}
            </dl>

            {/* Occupancy bar */}
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Occupancy
                </span>
                <span className="font-mono text-[11px] tabular-nums text-muted">
                  {Math.round(fillRatio * 100)}% free
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div
                  className={cn(
                    "h-full rounded-full",
                    isAvailable ? "bg-success" : "bg-line-strong",
                  )}
                  style={{ width: `${Math.max(fillRatio * 100, 4)}%` }}
                />
              </div>
            </div>

            <Button
              variant={isAvailable ? "primary" : "secondary"}
              size="md"
              fullWidth
              disabled={!isAvailable}
              className="mt-5"
              leadingIcon={<Plug size={15} aria-hidden="true" />}
            >
              {isAvailable ? "Reserve slot" : meta.label}
            </Button>
          </div>
        </Card>
      </HoverCard>
    </StaggerItem>
  );
}

export default function EvPage() {
  const availableCount = stations.filter((s) => s.status === "available").length;

  return (
    <MotionPage>
      {/* Header band */}
      <div className="border-b border-line bg-bg">
        <Container className="py-12 sm:py-16">
          <SectionHeader
            eyebrow="EV charging"
            title="Reserve a charging bay without the queue."
            description="Live bay availability, connector specs and per-kWh pricing across Bengaluru. Reserve in two taps and get a QR pass for the session."
            action={
              <Badge tone="energy" size="md" dot>
                {availableCount} of {stations.length} stations have open bays
              </Badge>
            }
          />
        </Container>
      </div>

      <Container className="py-10 sm:py-12">
        <div className="flex flex-col gap-8 xl:flex-row">
          {/* Station list */}
          <div className="flex-1">
            <StaggerOnView className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {stations.map((s) => (
                <StationCard key={s.id} station={s} />
              ))}
            </StaggerOnView>
          </div>

          {/* Coverage panel */}
          <aside className="w-full shrink-0 xl:w-80">
            <Card className="sticky top-20 overflow-hidden">
              <div className="border-b border-line px-5 py-4">
                <p className="flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-muted">
                  <Zap size={12} className="text-energy" aria-hidden="true" />
                  Network coverage
                </p>
              </div>

              <div className="p-5">
                <ul className="flex flex-col gap-3.5">
                  {[
                    { label: "Total stations", value: String(stations.length) },
                    { label: "Bays open now", value: String(stations.reduce((n, s) => n + s.available, 0)) },
                    { label: "Fast DC (50 kW+)", value: String(stations.filter((s) => s.speed.startsWith("DC")).length) },
                    { label: "Lowest rate", value: "₹12/kWh" },
                  ].map((row) => (
                    <li
                      key={row.label}
                      className="flex items-baseline justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0"
                    >
                      <span className="text-sm text-text-soft">{row.label}</span>
                      <span className="font-display text-sm font-bold tabular-nums text-ink">
                        {row.value}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-5 rounded-md border border-line bg-surface-2 p-4">
                  <p className="text-xs font-semibold text-ink">Interactive map</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-soft">
                    Live pin overlays with per-station specs are on the roadmap. In the
                    meantime, every bay count above is current.
                  </p>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      </Container>
    </MotionPage>
  );
}
