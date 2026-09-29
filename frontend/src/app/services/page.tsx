"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChevronRight, Search, SlidersHorizontal, X } from "lucide-react";
import { MotionPage, StaggerOnView, StaggerItem, HoverCard } from "@/components/motion";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SafeImage } from "@/components/SafeImage";
import { fetchCategories, fetchServices } from "@/lib/api";
import type { Service, ServiceCategory, ServicesParams } from "@/lib/api";
import { getServiceImage, getServiceFallback } from "@/lib/images";
import { loginHref, useSessionResolved } from "@/lib/session";
import { cn } from "@/lib/utils";

const PER_PAGE = 12;

function formatPrice(price: string): string {
  const n = parseFloat(price);
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN")}` : "₹—";
}

/* ── Service card ──────────────────────────────────────────────────────────── */

function ServiceCard({
  service,
  priority = false,
}: {
  service: Service;
  /** True for the first row of the grid, which is above the fold. */
  priority?: boolean;
}) {
  const categorySlug = service.category?.slug;
  // Hydration-safe token-presence read: identical on the server and on the
  // first client render, so the Book link's href never changes mid-paint.
  const hasSession = useSessionResolved();
  const bookHref = hasSession
    ? `/book/service/${service.id}`
    : loginHref(`/book/service/${service.id}`);

  return (
    <StaggerItem className="h-full">
      {/*
        A `<div>`, not a `<Link>`. The card needs two destinations — the
        service detail page and the booking form — and nesting a link inside
        a link is invalid HTML that browsers resolve unpredictably. The
        detail link is instead a stretched overlay (`absolute inset-0`
        below the content in z-order), which keeps the whole surface
        clickable while leaving the Book action free to be a real link.
      */}
      <HoverCard className="h-full">
        <div className="group relative flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm transition-colors duration-base ease-out hover:border-primary/40">
          {/*
            Always rendered — never `{service.image_url && …}`. The API
            returns an empty image for most records, and gating on the URL
            is exactly what left those cards as blank white rectangles.
            SafeImage picks the category photo when the URL is empty and
            falls back again if the request fails.
          */}
          <SafeImage
            src={getServiceImage(service)}
            fallbackSrc={getServiceFallback(categorySlug)}
            alt={service.name}
            className="h-40 w-full"
            imgClassName="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            priority={priority}
            sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 30vw"
          />

          <div className="flex flex-1 flex-col p-5">
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="font-display text-base font-bold leading-snug text-ink">
                {service.name}
              </h3>
              <Badge tone="neutral" className="shrink-0">
                {service.category?.name}
              </Badge>
            </div>

            <p className="line-clamp-2 text-sm leading-relaxed text-text-soft">
              {service.short_description}
            </p>

            {/* Defined bottom edge — mono metadata left, actions right. */}
            <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3.5">
              <span>
                <span className="font-display text-lg font-bold tabular-nums text-primary">
                  {formatPrice(service.price)}
                </span>
                <span className="ml-1.5 font-mono text-[11px] text-muted">
                  · {service.estimated_duration} min
                </span>
              </span>
              <span className="relative z-20 flex items-center gap-3">
                <Link
                  href={bookHref}
                  className="inline-flex items-center gap-0.5 rounded text-xs font-semibold text-primary transition-colors duration-base ease-out hover:text-primary-strong"
                >
                  Book
                  <ChevronRight size={13} aria-hidden="true" />
                </Link>
                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-text-soft transition-colors duration-base ease-out group-hover:text-primary-strong">
                  View
                  <ChevronRight size={13} aria-hidden="true" />
                </span>
              </span>
            </div>
          </div>

          {/* Stretched detail link — clickable label, whole-card hit area. */}
          <Link href={`/services/${service.id}`} className="absolute inset-0 z-10">
            <span className="sr-only">View {service.name}</span>
          </Link>
        </div>
      </HoverCard>
    </StaggerItem>
  );
}

/* ── Main page ─────────────────────────────────────────────────────────────── */

export default function ServicesPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [order, setOrder] = useState<ServicesParams["order"]>(undefined);
  const [page, setPage] = useState(1);
  // The filter set that `page` belongs to. Changing any filter must send the
  // user back to page 1; tracking the filters alongside the page lets us do
  // that during render instead of in an effect, so the query never briefly
  // fires for the stale page number.
  const [pageFor, setPageFor] = useState({ debouncedSearch, selectedCategory, order });

  // Debounce search 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filtersChanged =
    pageFor.debouncedSearch !== debouncedSearch ||
    pageFor.selectedCategory !== selectedCategory ||
    pageFor.order !== order;

  if (filtersChanged) {
    setPageFor({ debouncedSearch, selectedCategory, order });
    if (page !== 1) setPage(1);
  }

  const params: ServicesParams = {
    q: debouncedSearch || undefined,
    category: selectedCategory || undefined,
    order,
    page,
  };

  const { data: categories } = useQuery<ServiceCategory[]>({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    staleTime: 5 * 60_000,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["services", params],
    queryFn: () => fetchServices(params),
    placeholderData: (prev) => prev,
  });

  const services = data?.results ?? [];
  const totalPages = data ? Math.ceil(data.count / PER_PAGE) : 0;
  const hasFilters = Boolean(search || selectedCategory || order);

  const clearFilters = () => {
    setSearch("");
    setSelectedCategory("");
    setOrder(undefined);
  };

  return (
    <MotionPage>
      {/* Page header band */}
      <div className="border-b border-line bg-bg">
        <Container className="py-12 sm:py-16">
          <SectionHeader
            eyebrow="Catalogue"
            title="Every service, one fixed price."
            description="Browse vetted professionals across home maintenance and repairs. Prices are quoted before a job is booked — never after."
          />
        </Container>
      </div>

      <Container className="py-10 sm:py-12">
        {/* Toolbar */}
        <Card className="mb-8 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input
              id="service-search"
              type="search"
              label="Search"
              placeholder="Search services…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leadingIcon={<Search size={15} aria-hidden="true" />}
              className="sm:max-w-xs"
            />
            <Select
              id="category-select"
              label="Category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="sm:max-w-52"
            >
              <option value="">All categories</option>
              {(categories ?? []).map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              id="order-select"
              label="Sort by"
              value={order ?? ""}
              onChange={(e) => setOrder((e.target.value as ServicesParams["order"]) || undefined)}
              className="sm:max-w-48"
            >
              <option value="">Default order</option>
              <option value="price_asc">Price: low → high</option>
              <option value="price_desc">Price: high → low</option>
              <option value="newest">Newest first</option>
            </Select>

            {hasFilters && (
              <Button variant="ghost" size="md" onClick={clearFilters} className="sm:ml-auto">
                <X size={15} aria-hidden="true" />
                Clear
              </Button>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Category sidebar */}
          <aside className="w-full shrink-0 lg:w-56">
            <Card className="sticky top-20 p-5">
              <p className="mb-3 flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-muted">
                <SlidersHorizontal size={12} aria-hidden="true" />
                Category
              </p>
              <ul className="flex flex-col gap-1">
                <li>
                  <CategoryButton
                    label="All"
                    active={selectedCategory === ""}
                    onClick={() => setSelectedCategory("")}
                  />
                </li>
                {(categories ?? []).map((c) => (
                  <li key={c.slug}>
                    <CategoryButton
                      label={c.name}
                      active={selectedCategory === c.slug}
                      onClick={() => setSelectedCategory(c.slug)}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          </aside>

          {/* Grid */}
          <div className="flex-1">
            <p className="mb-5 text-sm text-muted" aria-live="polite">
              {isLoading
                ? "Loading services…"
                : `${data?.count ?? 0} service${data?.count === 1 ? "" : "s"} available`}
            </p>

            {isError && (
              <Card className="border-danger/30 bg-danger-soft p-6">
                <p className="text-sm font-semibold text-danger">
                  Failed to load services.
                </p>
                <p className="mt-1 text-sm text-text-soft">
                  Service unavailable. Connecting to dispatch network...
                </p>
              </Card>
            )}

            {isLoading && (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <CardSkeleton key={i} />
                ))}
              </div>
            )}

            {!isLoading && !isError && services.length === 0 && (
              <Card className="flex flex-col items-center gap-3 px-8 py-16 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-3 text-muted">
                  <Search size={18} aria-hidden="true" />
                </span>
                <p className="font-display text-lg font-bold text-ink">No services found</p>
                <p className="text-sm text-text-soft">
                  Try a different search term or category.
                </p>
                {hasFilters && (
                  <Button variant="secondary" size="md" onClick={clearFilters} className="mt-2">
                    Clear filters
                  </Button>
                )}
              </Card>
            )}

            {!isLoading && !isError && services.length > 0 && (
              <>
                <StaggerOnView
                  key={`${debouncedSearch}-${selectedCategory}-${order}-${page}`}
                  className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3"
                >
                  {services.map((s, i) => (
                    <ServiceCard key={s.id} service={s} priority={i < 3} />
                  ))}
                </StaggerOnView>

                {/* Pagination */}
                {totalPages > 1 && (
                  <nav
                    aria-label="Pagination"
                    className="mt-10 flex items-center justify-center gap-4"
                  >
                    <Button
                      variant="secondary"
                      size="md"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      ← Prev
                    </Button>
                    <span className="text-sm tabular-nums text-muted">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="secondary"
                      size="md"
                      disabled={page === totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next →
                    </Button>
                  </nav>
                )}
              </>
            )}
          </div>
        </div>
      </Container>
    </MotionPage>
  );
}

function CategoryButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "w-full rounded-md px-3 py-2 text-left text-sm font-medium",
        "transition-colors duration-base ease-out",
        active
          ? "bg-primary text-on-primary"
          : "text-text hover:bg-surface-3 hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}
