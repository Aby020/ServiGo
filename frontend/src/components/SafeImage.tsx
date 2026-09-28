"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { FALLBACK_IMAGE } from "@/lib/images";

interface SafeImageProps {
  /** Primary source — local (`/images/…`) or remote (`https://…`). */
  src?: string | null;
  /** Rendered when `src` is missing or fails to load. */
  fallbackSrc?: string | null;
  alt: string;
  className?: string;
  /** Applied to the <img> itself; `object-cover` is the common value. */
  imgClassName?: string;
  /** Show a subtle wash + monogram while the image decodes. */
  withPlaceholder?: boolean;
  /** `eager` for above-the-fold / LCP images. */
  priority?: boolean;
  sizes?: string;
  /** Aspect ratio box, e.g. "16/9". Reserves space and kills layout shift. */
  aspectRatio?: string;
}

/**
 * Bulletproof image rendering.
 *
 * A plain `<img>` in React shows the browser's broken-image icon (or, with
 * `alt` text, a small tofu glyph) the moment the request 404s. That is what
 * made ServiGo's cards look empty. SafeImage guarantees a rendered surface
 * in every failure mode:
 *
 *   - no `src` at all            -> straight to `fallbackSrc`
 *   - the request 404s / aborts  -> advance to `fallbackSrc`
 *   - the fallback *also* fails  -> a styled placeholder tile with the
 *                                  category monogram (never a broken icon)
 *
 * State is a single `{ level }` where level 0 = primary, 1 = fallback,
 * 2 = give up. A level only ever moves forward, so the onError/onLoad
 * ping-pong that React 19's concurrent rendering can otherwise trigger cannot
 * happen: once a source has failed we never retry it for this mount.
 *
 * `key` is the (source, fallback) pair. When the caller asks for a different
 * image the state is reset *during render* rather than in an effect, so the
 * old photo is never painted for a frame under the new one.
 *
 * A `priority` image additionally emits a `<link rel="preload">` for the
 * source it is about to paint. `fetchPriority="high"` on the `<img>` alone
 * does not start the download early enough — the element is not in the DOM
 * yet when React renders it, and the preload scanner has already moved on.
 * The link is what actually moves the hero photograph to the front of the
 * connection queue.
 */
export function SafeImage({
  src,
  fallbackSrc,
  alt,
  className,
  imgClassName,
  withPlaceholder = true,
  priority = false,
  sizes,
  aspectRatio,
}: SafeImageProps) {
  const fallback = fallbackSrc?.trim() || FALLBACK_IMAGE;
  const primary = src?.trim() || "";
  const pairKey = `${primary}|${fallback}`;

  const [state, setState] = useState<{ key: string; level: 0 | 1 | 2; loaded: boolean }>(
    () => ({ key: pairKey, level: 0, loaded: false }),
  );

  // Render-time reset. Calling setState while rendering the *same* component
  // is the documented escape hatch for "derive state from props" — React
  // re-runs the component immediately without committing the stale frame, so
  // there is no effect and no cascade.
  if (state.key !== pairKey) {
    setState({ key: pairKey, level: 0, loaded: false });
  }

  const level = state.key === pairKey ? state.level : 0;
  const loaded = state.key === pairKey ? state.loaded : false;

  /** Move to the next source, or stay put if this mount already gave up. */
  const advance = useCallback(() => {
    setState((s) =>
      s.key !== pairKey || s.level >= 2
        ? s
        : { key: s.key, level: (s.level + 1) as 1 | 2, loaded: false },
    );
  }, [pairKey]);

  // Preload the priority source before the browser's own discovery pass. The
  // link is removed as soon as the image loads, or when the component gives
  // up on this source, so a failed hero does not leave a dangling hint that
  // the browser keeps retrying.
  const preloadedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!priority || !primary) return;
    if (preloadedRef.current === primary) return;
    preloadedRef.current = primary;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = primary;
    if (sizes) link.sizes = sizes;
    document.head.appendChild(link);
    return () => {
      link.remove();
      preloadedRef.current = null;
    };
  }, [priority, primary, sizes]);

  const handleError = useCallback(() => advance(), [advance]);

  const handleLoad = useCallback(() => {
    setState((s) => (s.key === pairKey ? { ...s, loaded: true } : s));
  }, [pairKey]);

  const imgRef = useRef<HTMLImageElement | null>(null);

  const currentSrc = level === 0 ? primary : fallback;
  const showTile = level >= 2 || !currentSrc;
  const showPlaceholder = withPlaceholder && !loaded && !showTile;

  /*
   * Reconcile against the DOM after every commit.
   *
   * `load` is the only reliable signal that a *fresh* request painted, but it
   * is not a complete one: a warm HTTP cache can finish decoding an image
   * before React attaches this handler, so the event fires into the void and
   * `loaded` stays false. The image would then sit at `opacity-0` for the rest
   * of the mount — a fully loaded photograph that never becomes visible, and
   * precisely the "blank cards on the landing page" symptom.
   *
   * `complete && naturalWidth > 0` is the browser's own answer to "did this
   * already paint, successfully, at some point before I asked?" and it stays
   * correct for cached, restored-from-bfcache, and bfcache-prerendered images.
   * Failures have `complete === true` with `naturalWidth === 0`, which is why
   * the width test is what distinguishes the two.
   */
  useEffect(() => {
    if (loaded || showTile) return;
    const img = imgRef.current;
    if (img?.complete) {
      if (img.naturalWidth > 0) handleLoad();
      else advance();
    }
  }, [loaded, showTile, currentSrc, handleLoad, advance]);

  const boxStyle = useMemo(
    () => (aspectRatio ? { aspectRatio } : undefined),
    [aspectRatio],
  );

  return (
    <div
      className={cn("relative overflow-hidden bg-surface-3", className)}
      style={boxStyle}
    >
      {/* Decoding wash — sits under the image, so it only shows while loading. */}
      {showPlaceholder && (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-gradient-to-br from-surface-3 to-surface-2"
        />
      )}

      {showTile ? (
        // Last-resort tile. Always renders *something*, so there is never a
        // browser broken-image icon anywhere in the product.
        <div
          role="img"
          aria-label={alt}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-surface-3 to-surface-2 px-4 text-center"
        >
          <Wrench
            aria-hidden="true"
            className="h-6 w-6 text-line-strong"
            strokeWidth={1.5}
          />
          <span className="line-clamp-2 text-[11px] font-medium uppercase tracking-[0.15em] text-muted">
            {alt}
          </span>
        </div>
      ) : (
        /*
         * Deliberately a plain `<img>`, never `next/image`.
         *
         * Every source the registry hands us is a local file under
         * `/public/images`, which the browser fetches straight from the
         * static server. `next/image` would instead funnel each one through
         * `/_next/image?url=…`, where a dozen concurrent home-page requests
         * queue behind the dev server's single sharp worker — the images then
         * land slower than an honest 404 would, and any request that has not
         * answered by the time the old 2.5s timer fired was advanced to the
         * fallback. Keep this as `<img>`; the AVIF/WebP negotiation in
         * next.config.ts only applies to `next/image` callers, of which there
         * are none.
         */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={currentSrc}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          // `async` hands the decode to a background thread and lets the main
          // thread keep working — right for a card that scrolls into view
          // later. For the LCP image the opposite is true: we want it decoded
          // before the first paint, so decoding is synchronous.
          decoding={priority ? "sync" : "async"}
          fetchPriority={priority ? "high" : undefined}
          sizes={sizes}
          onError={handleError}
          onLoad={handleLoad}
          className={cn(
            "h-full w-full object-cover",
            // Fade the image in over the wash, and never leave a frame that
            // is still transparent while decoding.
            loaded ? "opacity-100" : "opacity-0",
            "transition-opacity duration-base ease-out",
            imgClassName,
          )}
        />
      )}
    </div>
  );
}
