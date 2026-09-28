"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import {
  BadgeCheck,
  Check,
  ChevronRight,
  Clock,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { MotionPage } from "@/components/motion";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { SafeImage } from "@/components/SafeImage";
import { fetchServiceDetail } from "@/lib/api";
import { getServiceImage, getServiceFallback } from "@/lib/images";
import { loginHref, useSessionResolved } from "@/lib/session";

function DetailSkeleton() {
  return (
    <Container className="py-12">
      <div role="status" aria-label="Loading service" className="flex flex-col gap-6">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="aspect-[21/9] w-full rounded-lg" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton className="h-5 w-32 rounded" />
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
    </Container>
  );
}

export default function ServiceDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  // Hydration-safe: true/false on the server exactly as on the first client
  // render, so the booking rail never swaps its own href mid-paint.
  const sessionResolved = useSessionResolved();

  const { data: service, isLoading, isError } = useQuery({
    queryKey: ["service", id],
    queryFn: () => fetchServiceDetail(id),
    enabled: !Number.isNaN(id),
  });

  if (isLoading) return <DetailSkeleton />;

  if (isError || !service) {
    return (
      <Container className="py-24">
        <Card className="mx-auto flex max-w-md flex-col items-center gap-3 px-8 py-14 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-3 text-muted">
            <ShieldCheck size={19} aria-hidden="true" />
          </span>
          <p className="font-display text-lg font-bold text-ink">Service not found</p>
          <p className="text-sm text-text-soft">
            This service may have been removed or is temporarily unavailable.
          </p>
          <Link
            href="/services"
            className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors duration-base ease-out hover:text-primary-strong"
          >
            <ChevronRight size={14} className="rotate-180" aria-hidden="true" />
            Back to services
          </Link>
        </Card>
      </Container>
    );
  }

  const price = Number.parseFloat(service.price);
  const priceLabel = Number.isFinite(price)
    ? `₹${price.toLocaleString("en-IN")}`
    : "₹—";
  const categorySlug = service.category?.slug;
  const bookHref = `/book/service/${service.id}`;

  return (
    <MotionPage>
      <Container className="py-8 sm:py-10">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-1.5 text-sm">
          <Link
            href="/services"
            className="text-text-soft transition-colors duration-base ease-out hover:text-primary"
          >
            Services
          </Link>
          <ChevronRight size={13} className="text-line-strong" aria-hidden="true" />
          <span className="text-text-soft">{service.category?.name}</span>
          <ChevronRight size={13} className="text-line-strong" aria-hidden="true" />
          <span className="truncate font-medium text-ink">{service.name}</span>
        </nav>

        {/* Hero image — always rendered, with the category photo as fallback. */}
        <SafeImage
          src={getServiceImage(service)}
          fallbackSrc={getServiceFallback(categorySlug)}
          alt={service.name}
          priority
          sizes="(max-width: 1024px) 94vw, 68vw"
          aspectRatio="21 / 9"
          className="mb-8 w-full rounded-lg border border-line"
          imgClassName="object-cover"
        />

        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          {/* Main column */}
          <div className="min-w-0">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <Badge tone="primary" size="md">
                  {service.category?.name}
                </Badge>
                <h1 className="mt-3 font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
                  {service.name}
                </h1>
                <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <Timer size={14} aria-hidden="true" />
                    ~{service.estimated_duration} min
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={14} aria-hidden="true" />
                    Same-day slots available
                  </span>
                </p>
              </div>
              <p className="shrink-0 font-display text-3xl font-bold tabular-nums text-primary sm:text-4xl">
                {priceLabel}
              </p>
            </div>

            {service.short_description && (
              <p className="mt-6 text-lg leading-relaxed text-text-soft">
                {service.short_description}
              </p>
            )}

            {service.description && (
              <div className="mt-8">
                <h2 className="font-display text-xl font-bold tracking-tight text-ink">
                  About this service
                </h2>
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-text-soft">
                  {service.description}
                </p>
              </div>
            )}

            {/* What's included */}
            {service.what_included.length > 0 && (
              <Card className="mt-8 p-6">
                <h2 className="font-display text-base font-bold text-ink">
                  What&apos;s included
                </h2>
                <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {service.what_included.map((item, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-text-soft">
                      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                        <Check size={11} strokeWidth={3} aria-hidden="true" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          {/* Booking rail */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Card className="p-6">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.15em] text-muted">
                Fixed price
              </p>
              <p className="mt-1 font-display text-3xl font-bold tabular-nums text-ink">
                {priceLabel}
              </p>
              <p className="mt-1 text-xs text-muted">
                Includes visit, labour and parts as listed above.
              </p>

              <div className="mt-5 space-y-2.5 border-t border-line pt-5">
                <p className="flex items-start gap-2.5 text-sm text-text-soft">
                  <BadgeCheck size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                  Background-checked technician
                </p>
                <p className="flex items-start gap-2.5 text-sm text-text-soft">
                  <ShieldCheck size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                  Insured service visit
                </p>
                <p className="flex items-start gap-2.5 text-sm text-text-soft">
                  <Clock size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                  Live tracking once booked
                </p>
              </div>

              {/*
                Auth-gated: a guest is sent to /login with this service as the
                redirect target, so signing in returns them to the booking
                form instead of dumping them on a generic dashboard. Signed-in
                users keep the direct link — there is no reason to bounce a
                valid session through the login page.
              */}
              {sessionResolved ? (
                <ButtonLink
                  href={bookHref}
                  variant="accent"
                  size="lg"
                  className="mt-6 w-full"
                  trailingIcon={<ChevronRight size={16} aria-hidden="true" />}
                >
                  Book this service
                </ButtonLink>
              ) : (
                <ButtonLink
                  href={loginHref(bookHref)}
                  variant="accent"
                  size="lg"
                  className="mt-6 w-full"
                  trailingIcon={<ChevronRight size={16} aria-hidden="true" />}
                >
                  Sign in to book
                </ButtonLink>
              )}
              <p className="mt-3 text-center text-xs text-muted">
                {sessionResolved
                  ? "No charge until the job is complete"
                  : "You will be signed in first — we will bring you right back here"}
              </p>
            </Card>
          </aside>
        </div>
      </Container>
    </MotionPage>
  );
}
