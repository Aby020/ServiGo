import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

/**
 * A neutral placeholder block. Loading is a first-class state in this design
 * system — a page that is fetching should look composed, not blank.
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-md bg-surface-3", className)}
    />
  );
}

/**
 * Card-shaped skeleton matching the ServiceCard / category card footprint,
 * so the grid does not reflow when real data lands.
 */
export function CardSkeleton({ className }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-line bg-surface",
        className,
      )}
    >
      <Skeleton className="h-40 w-full rounded-none" />
      <div className="flex flex-col gap-2.5 p-5">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <div className="mt-2 flex items-center justify-between">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-4 w-14" />
        </div>
      </div>
    </div>
  );
}

interface TextSkeletonProps {
  /** Number of lines to render. */
  lines?: number;
  className?: string;
}

/** A small stack of text-shaped placeholder lines. */
export function TextSkeleton({ lines = 3, className }: TextSkeletonProps) {
  return (
    <div role="status" aria-label="Loading" className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-3/5" : "w-full")}
        />
      ))}
    </div>
  );
}

/** A generic skeleton grid for list pages. */
export function SkeletonGrid({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3",
        className,
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
