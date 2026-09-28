"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { fetchServices } from "@/lib/api";
import { SafeImage } from "@/components/SafeImage";
import { getServiceImage, getServiceFallback } from "@/lib/images";

function formatPrice(price: string): string {
  const n = parseFloat(price);
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN")}` : "₹—";
}

/**
 * Compact featured-service strip. Kept as a lightweight alternative to the
 * full catalogue grid for dashboard / landing embeds.
 */
export default function FeaturedServices() {
  const { data } = useQuery({
    queryKey: ["featured-services"],
    queryFn: () => fetchServices({ featured: true, available_only: true, page: 1 }),
    staleTime: 5 * 60_000,
  });

  const list = data?.results ?? [];
  if (list.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {list.slice(0, 6).map((s) => (
        <Link
          key={s.id}
          href={`/services/${s.id}`}
          className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm transition-colors duration-base ease-out hover:border-primary/40"
        >
          <SafeImage
            src={getServiceImage(s)}
            fallbackSrc={getServiceFallback(s.category?.slug)}
            alt={s.name}
            className="h-20 w-full"
            imgClassName="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
          <div className="flex flex-1 flex-col p-3.5 text-center">
            <span className="text-sm font-semibold text-ink">{s.name}</span>
            <span className="mt-1 line-clamp-2 text-xs text-text-soft">
              {s.short_description}
            </span>
            <span className="mt-2 inline-flex items-center justify-center gap-0.5 text-xs font-bold text-primary">
              {formatPrice(s.price)}
              <ChevronRight
                size={12}
                className="transition-transform duration-base ease-out group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
