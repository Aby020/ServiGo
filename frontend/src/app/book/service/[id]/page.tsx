"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  MapPin,
} from "lucide-react";

import { MotionPage } from "@/components/motion";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { SafeImage } from "@/components/SafeImage";
import {
  createBooking,
  fetchServiceDetail,
  type CreateBookingPayload,
} from "@/lib/api";
import { getValidAccessToken } from "@/lib/auth";
import { getServiceImage, getServiceFallback } from "@/lib/images";
import { loginHref } from "@/lib/session";

/**
 * Mirrors bookings/forms.py BookingForm.Meta.fields exactly:
 *   preferred_date, preferred_time, location, address, notes (optional)
 * plus the service_id the template view took from the URL.
 *
 * The past-date rule is copied from BookingForm.clean_preferred_date so the
 * client rejects what the server would reject — one rule, two places.
 */
const schema = z.object({
  preferred_date: z
    .string()
    .min(1, "Preferred date is required")
    .refine(
      (v) => {
        // Compare as dates, not timestamps: "today" must be valid.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const picked = new Date(`${v}T00:00:00`);
        return !Number.isNaN(picked.getTime()) && picked >= today;
      },
      { message: "Preferred date cannot be in the past." },
    ),
  preferred_time: z.string().min(1, "Preferred time is required"),
  location: z.string().min(1, "Location is required"),
  address: z.string().min(1, "Address is required"),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function todayIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

export default function BookServicePage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const queryClient = useQueryClient();
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { preferred_date: "", preferred_time: "", location: "", address: "", notes: "" },
  });

  const {
    data: service,
    isLoading: serviceLoading,
    isError: serviceError,
  } = useQuery({
    queryKey: ["service", id],
    queryFn: () => fetchServiceDetail(id),
    enabled: Number.isInteger(id) && id > 0,
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      setAuthError(null);
      const token = await getValidAccessToken();
      if (!token) {
        setAuthError("Please sign in to book a service.");
        router.push(loginHref(`/book/service/${id}`));
        throw new Error("unauthenticated");
      }
      const payload: CreateBookingPayload = {
        service_id: id,
        preferred_date: values.preferred_date,
        preferred_time: values.preferred_time,
        location: values.location,
        address: values.address,
        notes: values.notes ?? "",
      };
      return createBooking(payload, token);
    },
    onSuccess: (booking) => {
      // Seed the detail cache so the redirect target paints instantly.
      queryClient.setQueryData(["booking", booking.id], booking);
      router.push(`/bookings/${booking.id}`);
    },
  });

  if (serviceLoading) {
    return (
      <Container className="py-12">
        <div role="status" aria-label="Loading service" className="flex flex-col gap-6">
          <Skeleton className="h-4 w-40" />
          <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
            <Skeleton className="aspect-[21/9] w-full rounded-lg" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </Container>
    );
  }

  if (serviceError || !service) {
    return (
      <Container className="py-24">
        <Card className="mx-auto flex max-w-md flex-col items-center gap-3 px-8 py-14 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-3 text-muted">
            <AlertCircle size={19} aria-hidden="true" />
          </span>
          <p className="font-display text-lg font-bold text-ink">Service not found</p>
          <p className="text-sm text-text-soft">
            This service may have been removed or is temporarily unavailable.
          </p>
          <ButtonLink href="/services" variant="secondary" size="sm" className="mt-2">
            Back to services
          </ButtonLink>
        </Card>
      </Container>
    );
  }

  const price = Number.parseFloat(service.price);
  const priceLabel = Number.isFinite(price) ? `₹${price.toLocaleString("en-IN")}` : "₹—";
  const minDate = todayIso();

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
          <Link
            href={`/services/${service.id}`}
            className="truncate text-text-soft transition-colors duration-base ease-out hover:text-primary"
          >
            {service.name}
          </Link>
          <ChevronRight size={13} className="text-line-strong" aria-hidden="true" />
          <span className="font-medium text-ink">Book</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
          {/* Form column */}
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-on-primary"
                aria-hidden="true"
              >
                <CalendarDays size={18} />
              </span>
              <div>
                <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
                  Book {service.name}
                </h1>
                <p className="mt-0.5 text-sm text-text-soft">
                  Tell us when and where. We&apos;ll confirm shortly.
                </p>
              </div>
            </div>

            {authError && (
              <div
                className="mt-6 flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm font-medium text-danger"
                role="alert"
              >
                <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{authError}</span>
              </div>
            )}

            <Card elevation="raised" className="mt-6 p-6 sm:p-7">
              <form
                className="flex flex-col gap-5"
                onSubmit={handleSubmit((v) => mutation.mutate(v))}
                noValidate
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    id="preferred_date"
                    type="date"
                    label="Preferred date"
                    min={minDate}
                    error={errors.preferred_date?.message}
                    leadingIcon={<CalendarDays size={15} aria-hidden="true" />}
                    {...register("preferred_date")}
                  />
                  <Input
                    id="preferred_time"
                    type="time"
                    label="Preferred time"
                    error={errors.preferred_time?.message}
                    leadingIcon={<Clock size={15} aria-hidden="true" />}
                    {...register("preferred_time")}
                  />
                </div>

                <Input
                  id="location"
                  type="text"
                  label="Location"
                  placeholder="e.g., Kochi, Ernakulam"
                  autoComplete="address-level2"
                  error={errors.location?.message}
                  leadingIcon={<MapPin size={15} aria-hidden="true" />}
                  {...register("location")}
                />

                <Textarea
                  id="address"
                  label="Full address"
                  placeholder="Flat, house, street — with landmarks"
                  autoComplete="street-address"
                  error={errors.address?.message}
                  {...register("address")}
                />

                <Textarea
                  id="notes"
                  label="Notes (optional)"
                  placeholder="Any special instructions or notes"
                  error={errors.notes?.message}
                  {...register("notes")}
                />

                <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted">
                    No charge until the job is complete.
                  </p>
                  <div className="flex gap-3">
                    <ButtonLink href={`/services/${service.id}`} variant="secondary" size="md">
                      Back
                    </ButtonLink>
                    <Button
                      type="submit"
                      variant="accent"
                      size="lg"
                      loading={mutation.isPending}
                    >
                      {mutation.isPending ? "Requesting…" : "Request booking"}
                    </Button>
                  </div>
                </div>
              </form>
            </Card>
          </div>

          {/* Summary rail */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Card className="overflow-hidden">
              <SafeImage
                src={getServiceImage(service)}
                fallbackSrc={getServiceFallback(service.category?.slug)}
                alt={service.name}
                aspectRatio="16 / 10"
                className="w-full border-b border-line"
                imgClassName="object-cover"
                sizes="(max-width: 1024px) 92vw, 20rem"
              />
              <div className="p-6">
                <Badge tone="primary" size="md">
                  {service.category?.name}
                </Badge>
                <h2 className="mt-3 font-display text-lg font-bold text-ink">
                  {service.name}
                </h2>
                <p className="mt-1 line-clamp-2 text-sm text-text-soft">
                  {service.short_description}
                </p>

                <div className="mt-5 flex items-baseline justify-between border-t border-line pt-5">
                  <span className="text-sm text-text-soft">Fixed price</span>
                  <span className="font-display text-2xl font-bold tabular-nums text-ink">
                    {priceLabel}
                  </span>
                </div>

                <ul className="mt-5 space-y-2.5 border-t border-line pt-5 text-sm text-text-soft">
                  <li className="flex items-start gap-2.5">
                    <Check size={15} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                    Background-checked technician
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check size={15} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                    Insured service visit
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check size={15} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                    Live tracking once confirmed
                  </li>
                </ul>
              </div>
            </Card>
          </aside>
        </div>
      </Container>
    </MotionPage>
  );
}
