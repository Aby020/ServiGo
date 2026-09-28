/**
 * ServiGo image registry.
 *
 * Every image the UI renders is resolved through this module so that:
 *   1. URLs are always local (`/images/...`) and therefore cacheable,
 *      same-origin, and never blocked by a third-party host going down.
 *   2. A category or service always has *some* image — no card is ever
 *      allowed to render an empty frame.
 *   3. Backend-supplied `image_url` values that point at legacy Django
 *      media paths are transparently mapped onto the local asset tree.
 *
 * See ./ASSETS.md for per-file provenance and licensing.
 */

export const IMAGE_BASE = "/images";

/** Rendered inside SafeImage when a source fails and no specific fallback fits. */
export const FALLBACK_IMAGE = `${IMAGE_BASE}/categories/fallback.jpg`;

/* ── Category images ───────────────────────────────────────────────────────
   Keyed by category slug. Any slug not listed here resolves through
   getCategoryImage()'s keyword heuristics, then the neutral fallback. */
const CATEGORY_IMAGES: Record<string, string> = {
  plumbing: `${IMAGE_BASE}/categories/plumbing.jpg`,
  electrical: `${IMAGE_BASE}/categories/electrical.jpg`,
  "smart-tv": `${IMAGE_BASE}/categories/smart-tv.jpg`,
  "ac-service": `${IMAGE_BASE}/categories/ac-service.jpg`,
  "deep-clean": `${IMAGE_BASE}/categories/deep-clean.jpg`,
  cleaning: `${IMAGE_BASE}/categories/cleaning.jpg`,
  carpentry: `${IMAGE_BASE}/categories/carpentry.jpg`,
  locksmith: `${IMAGE_BASE}/categories/locksmith.jpg`,
  painting: `${IMAGE_BASE}/categories/painting.jpg`,
  "appliance-repair": `${IMAGE_BASE}/categories/appliance-repair.jpg`,
  "ev-charging": `${IMAGE_BASE}/ev/ev-charging.jpg`,
};

/**
 * The dedicated Smart TV *repair* photograph. Used for the "TV Repair &
 * Maintenance" service and anywhere a repair (rather than an install) photo
 * is wanted — the file name is `Smart_tv_repair.jpg` in the Django static
 * tree and is preserved verbatim as `smart-tv-repair.jpg` here.
 */
export const SMART_TV_REPAIR_IMAGE = `${IMAGE_BASE}/categories/smart-tv-repair.jpg`;

/** Substrings that force a specific image regardless of the slug. */
const KEYWORD_OVERRIDES: Array<[RegExp, string]> = [
  // "smart-tv" is the DB slug; some records say "tv-repair" / "tv repair".
  [/smart[\s-]?tv.*repair|tv[\s-]?repair/, SMART_TV_REPAIR_IMAGE],
  [/smart[\s-]?tv|television/, CATEGORY_IMAGES["smart-tv"]],
  [/plumb|pipe|leak|water/, CATEGORY_IMAGES.plumbing],
  [/electr|wiring|light|fan|inverter|ups/, CATEGORY_IMAGES.electrical],
  [/\bac\b|air[\s-]?condition|hvac|cooling/, CATEGORY_IMAGES["ac-service"]],
  [/carpent|wood|furnitur/, CATEGORY_IMAGES.carpentry],
  [/lock|key/, CATEGORY_IMAGES.locksmith],
  [/paint/, CATEGORY_IMAGES.painting],
  [/clean|deep[\s-]?clean|housekeep/, CATEGORY_IMAGES["deep-clean"]],
  [/appliance|washer|fridge|refrigerat|microwave/, CATEGORY_IMAGES["appliance-repair"]],
  [/ev|charg|station|supercharg/, `${IMAGE_BASE}/ev/ev-charging.jpg`],
];

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Resolve the best local image for a category slug (or any free-text
 * identifier such as a service name).
 *
 * Resolution order:
 *   1. exact slug match in `CATEGORY_IMAGES`
 *   2. keyword heuristics (this is what routes "TV Repair" to
 *      `smart-tv-repair.jpg`)
 *   3. the neutral fallback — always defined, so the return type is a
 *      usable path and the caller never has to null-check.
 */
export function getCategoryImage(slug: string | null | undefined): string {
  const key = normalize(slug);
  if (!key) return FALLBACK_IMAGE;

  const exact = CATEGORY_IMAGES[key];
  if (exact) return exact;

  for (const [pattern, image] of KEYWORD_OVERRIDES) {
    if (pattern.test(key)) return image;
  }

  return FALLBACK_IMAGE;
}

/**
 * Resolve a service image. Prefers whatever the backend supplied, but only
 * after proving it points at something we can actually load:
 *
 *   - empty / blank / `null`           -> derive from name + category
 *   - relative legacy Django path     -> remapped onto the local asset tree
 *   - absolute remote URL             -> kept (SafeImage still guards it)
 *   - a bare filename (no leading /)  -> treated as a local asset
 */
export function getServiceImage(
  service: {
    name?: string | null;
    image_url?: string | null;
    category?: { slug?: string | null; name?: string | null } | null;
  } | null
  | undefined,
): string {
  const raw = normalize(service?.image_url);
  if (raw) {
    // Already absolute (http/https) — hand it to SafeImage untouched.
    if (/^https?:\/\//.test(raw)) return service!.image_url!;

    // Legacy Django paths the frontend cannot serve, e.g.
    // "/static/images/plumbing.jpg" or "/media/services/foo.jpg".
    const legacy = raw.match(/(?:static|media)\/images\/([^/?#]+)/);
    if (legacy) {
      const file = decodeURIComponent(legacy[1]).toLowerCase();
      if (file === "smart_tv_repair.jpg") return SMART_TV_REPAIR_IMAGE;
      if (CATEGORY_IMAGES[`smart-tv`]) {
        // Reuse the local category photo for any other known static image.
        return getCategoryImage(file.replace(/\.(jpe?g|png|webp|avif)$/, ""));
      }
      return FALLBACK_IMAGE;
    }

    // A local asset path we can actually serve.
    if (raw.startsWith("/images/")) return service!.image_url!;

    // Bare filename from an upload field.
    if (/^[\w][\w.-]*\.(jpe?g|png|webp|avif)$/.test(raw)) {
      return `${IMAGE_BASE}/${service!.image_url!.trim()}`;
    }
  }

  // Nothing usable from the backend — derive from the category, then the name.
  const categoryImage = getCategoryImage(service?.category?.slug);
  if (categoryImage !== FALLBACK_IMAGE) return categoryImage;

  const byName = getCategoryImage(service?.name);
  if (byName !== FALLBACK_IMAGE) return byName;

  return FALLBACK_IMAGE;
}

/**
 * A neutral fallback for any card that shows an image. Pass the category slug
 * when you have one so the placeholder stays topically relevant instead of
 * always being the generic grey.
 */
export function getServiceFallback(categorySlug?: string | null): string {
  return getCategoryImage(categorySlug);
}

/** A rotating set of local EV photographs, indexed deterministically. */
export const EV_IMAGES = [
  `${IMAGE_BASE}/ev/ev-charging.jpg`,
  `${IMAGE_BASE}/ev/ev-station-1.jpg`,
  `${IMAGE_BASE}/ev/ev-station-2.jpg`,
  `${IMAGE_BASE}/ev/ev-station-3.jpg`,
] as const;

export function getEvImage(seed: number | string): string {
  if (typeof seed === "number") {
    return EV_IMAGES[Math.abs(Math.trunc(seed)) % EV_IMAGES.length];
  }
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return EV_IMAGES[Math.abs(hash) % EV_IMAGES.length];
}

/** Category tiles for the home bento. `icon` is a lucide component name. */
export interface CategoryTile {
  name: string;
  slug: string;
  image: string;
  from: string;
  tag: string;
}

export const CATEGORY_TILES: CategoryTile[] = [
  { name: "Plumbing", slug: "plumbing", image: CATEGORY_IMAGES.plumbing, from: "₹299", tag: "Fixed pricing" },
  { name: "Electrical", slug: "electrical", image: CATEGORY_IMAGES.electrical, from: "₹499", tag: "Guaranteed" },
  { name: "AC Service", slug: "ac-service", image: CATEGORY_IMAGES["ac-service"], from: "₹399", tag: "Same day" },
  { name: "Deep Clean", slug: "deep-clean", image: CATEGORY_IMAGES["deep-clean"], from: "₹599", tag: "Certified" },
  { name: "Carpentry", slug: "carpentry", image: CATEGORY_IMAGES.carpentry, from: "₹799", tag: "Fixed" },
  { name: "Locksmith", slug: "locksmith", image: CATEGORY_IMAGES.locksmith, from: "₹349", tag: "24/7" },
];
