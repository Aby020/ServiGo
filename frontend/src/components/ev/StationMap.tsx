"use client";

/**
 * Leaflet map for EV charging discovery.
 *
 * ── Why this file is split in two ───────────────────────────────────────────
 * Leaflet reads `window` at *module* scope (its CSS-free JS touches
 * `navigator` and `document` as soon as it is imported), so a plain import
 * from a server-rendered page throws during the Node render pass and takes
 * the whole route down with a "window is not defined" error. `next/dynamic`
 * with `ssr: false` moves the import behind a client boundary — the outer
 * module below renders on the server as a skeleton and only ever swaps the
 * real map in after hydration.
 *
 * ── Marker colours ───────────────────────────────────────────────────────────
 * Pins are painted from `availability_tone`, which the server computes from
 * the operating status *and* the free/total bay ratio. Colour is therefore
 * never a client-side guess: "limited" (down to its last third of bays) is
 * amber and distinct from "unavailable" (closed, or zero bays) in grey.
 *
 * ── Selected-station sync ────────────────────────────────────────────────────
 * The map is one half of a two-way control. Clicking a pin calls `onSelect`,
 * which the page turns into a selected card; selecting a card in the list
 * calls `focusId`, and `MapFocus` below pans the map to it. The two directions
 * share one piece of state on the page rather than two copies.
 */

import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Zap, ZapOff, AlertTriangle } from "lucide-react";
import type { EvStation } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Marker fill per availability tone — the map's only visual vocabulary. */
const TONE_STYLE: Record<
  EvStation["availability_tone"],
  { fill: string; ring: string; label: string; Icon: typeof Zap }
> = {
  available: { fill: "#047857", ring: "#ffffff", label: "Bays open", Icon: Zap },
  limited: { fill: "#b45309", ring: "#ffffff", label: "Last bays", Icon: AlertTriangle },
  unavailable: { fill: "#767169", ring: "#ffffff", label: "No bays", Icon: ZapOff },
};

/** India, so the initial view frames every seeded station rather than the world. */
const DEFAULT_CENTER: [number, number] = [14.5, 77.5];
const DEFAULT_ZOOM = 5;

interface StationMapProps {
  stations: EvStation[];
  /** Station highlighted in the list; the map pans to it. */
  focusId: number | null;
  onSelect: (station: EvStation) => void;
  className?: string;
}

/**
 * A `divIcon` per tone, built once. Leaflet's default marker is a PNG sprite
 * referenced by a relative URL, which resolves against the *page* route under
 * the App Router and 404s — the classic "broken marker icon" bug. A divIcon
 * has no image at all, so the pin is pure CSS and always renders.
 */
const ICONS = (Object.keys(TONE_STYLE) as EvStation["availability_tone"][]).map(
  (tone) => {
    const { fill, Icon } = TONE_STYLE[tone];
    return L.divIcon({
      className: "",
      html: `<span style="
        display:flex;align-items:center;justify-content:center;
        width:30px;height:30px;border-radius:9999px;
        background:${fill};color:#ffffff;
        box-shadow:0 0 0 3px rgba(255,255,255,0.9), 0 2px 6px rgba(24,30,38,0.35);
      "><svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2.2" stroke-linecap="round"
        stroke-linejoin="round" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9z"/></svg></span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
      popupAnchor: [0, -18],
    });
  },
);

const ICON_BY_TONE = Object.fromEntries(
  Object.keys(TONE_STYLE).map((tone, i) => [tone, ICONS[i]]),
) as Record<EvStation["availability_tone"], L.DivIcon>;

/**
 * Pans the map when the list selects a different station.
 *
 * Rendered as a child of `MapContainer` so it can call the `useMap` hook —
 * hooks cannot run in the same component that creates the map, because the
 * context does not exist until the container has mounted.
 *
 * `flyTo` is animated by Leaflet's own tweening and respects the
 * `prefers-reduced-motion` media query, so it degrades to an instant jump
 * without this component knowing about motion settings.
 */
function MapFocus({
  station,
  zoom,
}: {
  station: EvStation | null;
  zoom: number;
}) {
  const map = useMap();

  useEffect(() => {
    if (!station || station.latitude == null || station.longitude == null) return;
    map.flyTo([station.latitude, station.longitude], zoom, {
      duration: 0.6,
    });
  }, [map, station, zoom]);

  return null;
}

/**
 * Frames every plottable station on first load, so a filtered result set is
 * never left sitting in the middle of an empty ocean.
 */
function FitBounds({ stations }: { stations: EvStation[] }) {
  const map = useMap();

  const points = useMemo(
    () =>
      stations
        .filter(
          (s): s is EvStation & { latitude: number; longitude: number } =>
            s.latitude != null && s.longitude != null,
        )
        .map((s) => [s.latitude, s.longitude] as [number, number]),
    [stations],
  );

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], DEFAULT_ZOOM + 3);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 12 });
  }, [map, points]);

  return null;
}

/** The map itself. Only ever mounted on the client — see the file header. */
export function StationMapInner({
  stations,
  focusId,
  onSelect,
  className,
}: StationMapProps) {
  const focus = useMemo(
    () => stations.find((s) => s.id === focusId) ?? null,
    [stations, focusId],
  );

  // Stations without coordinates cannot be pinned. They stay in the list — a
  // driver still needs to know the station exists — and the page says so
  // rather than letting the map silently omit them.
  const plottable = useMemo(
    () =>
      stations.filter((s) => s.latitude != null && s.longitude != null),
    [stations],
  );

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-line bg-surface-3",
        className,
      )}
    >
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        // The map is one pane of a page, not the page. Wheel-zoom is left off
        // because the default makes it impossible to scroll past a 60vh map
        // with the cursor over it.
        scrollWheelZoom={false}
        className="h-full w-full"
        attributionControl
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={19}
        />

        {plottable.map((station) => {
          const tone = station.availability_tone;
          const { fill, Icon: ToneIcon, label } = TONE_STYLE[tone];
          return (
            <Marker
              key={station.id}
              position={[station.latitude as number, station.longitude as number]}
              icon={ICON_BY_TONE[tone]}
              // `riseOnHover` is what makes a dense cluster of pins in one
              // city readable without a spiderfier.
              riseOnHover
              eventHandlers={{ click: () => onSelect(station) }}
              zIndexOffset={station.id === focusId ? 1000 : 0}
            >
              <Popup closeButton autoPan>
                <div className="min-w-[13rem] font-sans">
                  <p className="m-0 font-display text-sm font-bold text-ink">
                    {station.name}
                  </p>
                  <p className="m-0 mt-0.5 text-xs text-muted">
                    {station.city}, {station.state}
                  </p>

                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        background: `${fill}1a`,
                        color: fill,
                      }}
                    >
                      <ToneIcon size={11} aria-hidden="true" />
                      {label}
                    </span>
                    <span className="rounded-pill bg-surface-3 px-2 py-0.5 text-[11px] font-semibold text-text-soft">
                      {station.charging_speed_kw} kW
                    </span>
                    <span className="rounded-pill bg-surface-3 px-2 py-0.5 font-mono text-[11px] text-text-soft">
                      {station.price_display}
                    </span>
                  </div>

                  <p className="mt-2.5 mb-0 text-xs text-text-soft">
                    {station.available_ports} of {station.total_ports} bays open
                    {" · "}
                    {station.charger_type_display}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}

        <FitBounds stations={plottable} />
        <MapFocus station={focus} zoom={focus ? 13 : DEFAULT_ZOOM} />
      </MapContainer>

      {/* Legend — the tone scale is only useful if it is written down. */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex flex-col gap-1 rounded-md border border-line bg-surface/95 px-2.5 py-2 shadow-sm backdrop-blur-sm">
        {(
          [
            ["available", "Bays open"],
            ["limited", "Last bays"],
            ["unavailable", "No bays"],
          ] as const
        ).map(([tone, label]) => (
          <span
            key={tone}
            className="flex items-center gap-1.5 text-[11px] font-medium text-text-soft"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: TONE_STYLE[tone].fill }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Client-only boundary ────────────────────────────────────────────────────
   Everything above runs in the browser only. The wrapper below is what the
   page imports: it renders this placeholder during SSR and during the
   hydration pass, then the real map once the chunk resolves. */

export function StationMapSkeleton({ className }: { className?: string }) {
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
