"use client";

/**
 * EV charging discovery.
 *
 * Layout is two columns on desktop — filters + station list on the left, the
 * interactive map on the right — because the two are one control, not two
 * pages. Clicking a pin selects its card; clicking a card pans the map to it.
 * Both directions go through the single `selectedId` state below rather than
 * each pane keeping its own copy, which is what stops the list and the map
 * from disagreeing about what is selected.
 *
 * All station data comes from the live API. The previous version of this page
 * hard-coded six Bengaluru rows, which meant the map would have had nothing
 * authoritative to plot and the bay counts would have been fiction.
 */

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import {
  MapPin,
  Plug,
  Zap,
  ZapOff,
  AlertTriangle,
  Search,
  RotateCcw,
} from "lucide-react";

import { MotionPage, StaggerOnView, StaggerItem, HoverCard } from "@/components/motion";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Input";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { SafeImage } from "@/components/SafeImage";
import { ReservationModal } from "@/components/ev/ReservationModal";
import { fetchEvStations, type EvStation, type EvAvailabilityTone } from "@/lib/api";
import { getEvImage } from "@/lib/images";
import { cn } from "@/lib/utils";

/**
 * Leaflet is loaded client-side only.
 *
 * `ssr: false` is what keeps this route buildable: leaflet touches `window`
 * at module scope, so a server render of the map throws during the Node pass
 * and fails the whole page. The `loading` state is the same skeleton the map
 * itself renders, so the swap is a fade rather than a layout jump.
 */
const StationMap = dynamic(
  () => import("@/components/ev/StationMap").then((m) => m.StationMapInner),
  {
    ssr: false,
    loading: () => <StationMapSkeleton className="h-[34rem] w-full" />,
  },
);

function StationMapSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-lg border border-line bg-surface-3",
        className,
      )}
    >
      <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-surface-3 to-surface-2" />
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-mono text-[11px] uppercase tracking-widest text-muted">
          Loading map
        </span>
      </div>
    </div>
  );
}

/* ── Availability vocabulary ──────────────────────────────────────────────────
   Mirrors the server's `get_availability_tone()` and the map's marker fills.
   One mapping, used by every card, so a pin and its card can never disagree
   about what colour a station is. */

const TONE_META: Record<
  EvAvailabilityTone,
  { tone: BadgeTone; label: string; Icon: typeof Zap; bar: string }
> = {
  available: { tone: "success", label: "Bays open", Icon: Zap, bar: "bg-success" },
  limited: { tone: "warning", label: "Last bays", Icon: AlertTriangle, bar: "bg-warning" },
  unavailable: { tone: "neutral", label: "No bays", Icon: ZapOff, bar: "bg-line-strong" },
};

/** Connector choices, mirroring `EVChargingStation.ChargerType` on the server. */
const CONNECTORS = [
  { value: "ccs2", label: "CCS2" },
  { value: "ccs1", label: "CCS1" },
  { value: "chademo", label: "CHAdeMO" },
  { value: "type2", label: "Type 2 (AC)" },
  { value: "type1", label: "Type 1" },
  { value: "tesla", label: "Tesla" },
];

/* ── Station card ─────────────────────────────────────────────────────────── */

function StationCard({
  station,
  selected,
  onSelect,
  onReserve,
}: {
  station: EvStation;
  selected: boolean;
  onSelect: () => void;
  onReserve: () => void;
}) {
  const meta = TONE_META[station.availability_tone];
  const bookable = station.availability_tone !== "unavailable";
  const fillRatio = station.total_ports > 0 ? station.available_ports / station.total_ports : 0;

  return (
    <StaggerItem className="h-full">
      <HoverCard className="h-full">
        <Card
          className={cn(
            "flex h-full flex-col overflow-hidden transition-colors duration-base ease-out",
            selected ? "border-primary ring-2 ring-primary/20" : "hover:border-primary/40",
          )}
        >
          <SafeImage
            src={station.image_url ?? getEvImage(station.slug)}
            alt={station.name}
            className="h-36 w-full"
            imgClassName="object-cover"
            sizes="(max-width: 1280px) 92vw, 30vw"
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
              {station.address}, {station.city}
            </p>

            {/* Spec tiles */}
            <dl className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: "Speed", value: `${station.charging_speed_kw} kW` },
                { label: "Bays free", value: `${station.available_ports}/${station.total_ports}` },
                { label: "Rate", value: `₹${station.price_per_kwh.toFixed(2)}` },
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

            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
              <Plug size={12} aria-hidden="true" />
              {station.charger_type_display}
              <span aria-hidden="true">·</span>
              {station.hours_display}
            </p>

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
                  className={cn("h-full rounded-full", meta.bar)}
                  style={{ width: `${Math.max(fillRatio * 100, 4)}%` }}
                />
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={onSelect}
                aria-pressed={selected}
                className="flex-1"
                leadingIcon={<MapPin size={14} aria-hidden="true" />}
              >
                {selected ? "On map" : "Show on map"}
              </Button>
              <Button
                variant={bookable ? "primary" : "secondary"}
                size="sm"
                onClick={onReserve}
                disabled={!bookable}
                className="flex-1"
                leadingIcon={<Plug size={14} aria-hidden="true" />}
              >
                {bookable ? "Reserve" : meta.label}
              </Button>
            </div>
          </div>
        </Card>
      </HoverCard>
    </StaggerItem>
  );
}

/* ── Filters ──────────────────────────────────────────────────────────────── */

function Filters({
  search,
  onSearch,
  connector,
  onConnector,
  fastOnly,
  onFastOnly,
  availableOnly,
  onAvailableOnly,
  city,
  onCity,
  cities,
  onReset,
}: {
  search: string;
  onSearch: (v: string) => void;
  connector: string;
  onConnector: (v: string) => void;
  fastOnly: boolean;
  onFastOnly: (v: boolean) => void;
  availableOnly: boolean;
  onAvailableOnly: (v: boolean) => void;
  city: string;
  onCity: (v: string) => void;
  cities: string[];
  onReset: () => void;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-muted">
          <Zap size={12} className="text-energy" aria-hidden="true" />
          Filters
        </p>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted transition-colors duration-base ease-out hover:text-primary"
        >
          <RotateCcw size={12} aria-hidden="true" />
          Reset
        </button>
      </div>

      <div className="space-y-3.5">
        <Input
          id="ev-search"
          placeholder="Station, address or city"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          leadingIcon={<Search size={15} />}
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            id="ev-connector"
            aria-label="Connector type"
            value={connector}
            onChange={(e) => onConnector(e.target.value)}
          >
            <option value="">All connectors</option>
            {CONNECTORS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>

          <Select
            id="ev-city"
            aria-label="City"
            value={city}
            onChange={(e) => onCity(e.target.value)}
          >
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onAvailableOnly(!availableOnly)}
            aria-pressed={availableOnly}
            className={cn(
              "rounded-pill border px-3 py-1.5 text-xs font-medium",
              "transition-[background-color,border-color,color] duration-base ease-out",
              availableOnly
                ? "border-primary bg-primary-soft text-primary"
                : "border-line bg-surface text-text-soft hover:border-line-strong",
            )}
          >
            Bays free now
          </button>
          <button
            type="button"
            onClick={() => onFastOnly(!fastOnly)}
            aria-pressed={fastOnly}
            className={cn(
              "rounded-pill border px-3 py-1.5 text-xs font-medium",
              "transition-[background-color,border-color,color] duration-base ease-out",
              fastOnly
                ? "border-energy bg-energy-soft text-energy"
                : "border-line bg-surface text-text-soft hover:border-line-strong",
            )}
          >
            Fast DC (50 kW+)
          </button>
        </div>
      </div>
    </Card>
  );
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function EvPage() {
  const [search, setSearch] = useState("");
  const [connector, setConnector] = useState("");
  const [fastOnly, setFastOnly] = useState(false);
  const [availableOnly, setAvailableOnly] = useState(false);
  const [city, setCity] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reserving, setReserving] = useState<EvStation | null>(null);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["ev-stations", { search, connector, fastOnly, availableOnly, city }],
    queryFn: () =>
      fetchEvStations({
        search: search.trim() || undefined,
        connector_type: connector || undefined,
        is_fast_charging: fastOnly ? true : undefined,
        available_only: availableOnly ? true : undefined,
        city: city || undefined,
      }),
    // Bay counts move. 30s is long enough that re-filtering does not re-fetch,
    // and short enough that a driver does not route to a full station.
    staleTime: 30_000,
  });

  const stations = useMemo(() => data ?? [], [data]);

  // The city list is derived from the *unfiltered* set when possible, so
  // choosing a city does not empty the dropdown of the other options. With a
  // filtered query the only cities on offer are the ones already selected,
  // which still lets the user switch away from their current choice.
  const cities = useMemo(
    () => Array.from(new Set(stations.map((s) => s.city).filter(Boolean))).sort(),
    [stations],
  );

  const stats = useMemo(() => {
    const open = stations.filter((s) => s.availability_tone !== "unavailable").length;
    const bays = stations.reduce((n, s) => n + s.available_ports, 0);
    const fast = stations.filter((s) => s.is_fast_charging).length;
    const cheapest = stations.reduce<number | null>(
      (min, s) => (min === null || s.price_per_kwh < min ? s.price_per_kwh : min),
      null,
    );
    return { open, bays, fast, cheapest };
  }, [stations]);

  const unlocated = useMemo(
    () => stations.filter((s) => s.latitude == null || s.longitude == null).length,
    [stations],
  );

  const reset = () => {
    setSearch("");
    setConnector("");
    setFastOnly(false);
    setAvailableOnly(false);
    setCity("");
  };

  const hasFilters = Boolean(search || connector || fastOnly || availableOnly || city);

  return (
    <MotionPage>
      {/* Header band */}
      <div className="border-b border-line bg-bg">
        <Container className="py-12 sm:py-16">
          <SectionHeader
            eyebrow="EV charging"
            title="Reserve a charging bay without the queue."
            description="Live bay availability, connector specs and per-kWh pricing across the network. Pick a window, and it is held against your plate."
            action={
              <Badge tone="energy" size="md" dot>
                {stations.length > 0
                  ? `${stats.open} of ${stations.length} stations have open bays`
                  : "Live network"}
              </Badge>
            }
          />
        </Container>
      </div>

      <Container className="py-8 sm:py-10">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          {/* ── Left column: filters + list ─────────────────────────────── */}
          <div className="flex min-w-0 flex-col gap-5">
            <Filters
              search={search}
              onSearch={setSearch}
              connector={connector}
              onConnector={setConnector}
              fastOnly={fastOnly}
              onFastOnly={setFastOnly}
              availableOnly={availableOnly}
              onAvailableOnly={setAvailableOnly}
              city={city}
              onCity={setCity}
              cities={cities}
              onReset={reset}
            />

            {isPending ? (
              <div className="grid grid-cols-1 gap-5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            ) : isError ? (
              <Card className="p-6 text-center">
                <p className="text-sm font-semibold text-ink">
                  Could not load stations
                </p>
                <p className="mt-1 text-xs text-text-soft">
                  The charging service is not responding. Check that the API is
                  running on port 8004.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => refetch()}
                  className="mt-4"
                >
                  Try again
                </Button>
              </Card>
            ) : stations.length === 0 ? (
              <Card className="p-6 text-center">
                <ZapOff size={22} className="mx-auto text-muted" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-ink">No stations match</p>
                <p className="mt-1 text-xs text-text-soft">
                  {hasFilters
                    ? "Try widening the filters — clear the city or connector to see the whole network."
                    : "No stations are published yet."}
                </p>
                {hasFilters && (
                  <Button variant="secondary" size="sm" onClick={reset} className="mt-4">
                    Clear filters
                  </Button>
                )}
              </Card>
            ) : (
              <StaggerOnView className="grid grid-cols-1 gap-5">
                {stations.map((station) => (
                  <StationCard
                    key={station.id}
                    station={station}
                    selected={selectedId === station.id}
                    onSelect={() => setSelectedId(station.id)}
                    onReserve={() => setReserving(station)}
                  />
                ))}
              </StaggerOnView>
            )}
          </div>

          {/* ── Right column: map + network summary ─────────────────────── */}
          <div className="flex min-w-0 flex-col gap-5">
            <StationMap
              stations={stations}
              focusId={selectedId}
              onSelect={(station) => setSelectedId(station.id)}
              className="h-[28rem] sm:h-[34rem] xl:sticky xl:top-20 xl:h-[calc(100vh-7rem)]"
            />

            {unlocated > 0 && (
              <p className="rounded-md border border-line bg-surface-2 px-3 py-2 text-xs text-text-soft">
                {unlocated} station{unlocated === 1 ? "" : "s"} could not be
                geocoded and {unlocated === 1 ? "is" : "are"} listed on the left
                but not plotted on the map.
              </p>
            )}

            <Card className="p-5">
              <p className="mb-3 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-muted">
                <Zap size={12} className="text-energy" aria-hidden="true" />
                Network at a glance
              </p>
              <ul className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                {[
                  { label: "Stations", value: String(stations.length) },
                  { label: "Bays open", value: String(stats.bays) },
                  { label: "Fast DC", value: String(stats.fast) },
                  {
                    label: "From",
                    value: stats.cheapest === null ? "—" : `₹${stats.cheapest.toFixed(2)}`,
                  },
                ].map((row) => (
                  <li key={row.label} className="min-w-0">
                    <span className="block text-xs text-muted">{row.label}</span>
                    <span className="mt-0.5 block font-display text-lg font-bold tabular-nums text-ink">
                      {row.value}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      </Container>

      {reserving && (
        <ReservationModal
          station={reserving}
          onClose={() => setReserving(null)}
          onReserved={() => {
            /* The map pins and the list's bay counts are both derived from the
               query above; the modal already invalidates them, so there is
               nothing to patch here. */
          }}
        />
      )}
    </MotionPage>
  );
}
