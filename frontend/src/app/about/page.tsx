import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ShieldCheck,
  UserCog,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { SafeImage } from "@/components/SafeImage";
import { buttonClasses } from "@/components/ui/button-variants";
import { ButtonLink } from "@/components/ui/Button";
import {
  MotionPage,
  StaggerOnView,
  StaggerItem,
} from "@/components/motion";
import { getServiceImage } from "@/lib/images";

export const metadata: Metadata = {
  title: "About",
  description:
    "What ServiGo is, who it serves, and how a booking moves from request to completion.",
};

/* ── Content ───────────────────────────────────────────────────────────────── */

/** The three account roles the platform is built around. */
const ROLES = [
  {
    icon: Users,
    role: "Customer",
    summary: "Books a service or a charging bay, tracks it live, and pays after the work is done.",
    points: [
      "Fixed price agreed before the visit",
      "Live status from assignment to arrival",
      "Rating left only after a completed job",
    ],
  },
  {
    icon: Wrench,
    role: "Staff",
    summary: "A verified technician who accepts jobs in their covered area and keeps the customer updated.",
    points: [
      "Jobs matched to skills and location",
      "Arrival window with a 30-minute grace band",
      "Job marked complete before payment releases",
    ],
  },
  {
    icon: UserCog,
    role: "Admin",
    summary: "Operates the marketplace: vetting pros, managing the catalogue, and resolving escalations.",
    points: [
      "Approves technician verification and insurance",
      "Owns category and service pricing",
      "Handles refunds and re-assignment",
    ],
  },
];

/** The booking lifecycle, in the order a customer actually sees it. */
const BOOKING_FLOW = [
  {
    status: "Requested",
    body: "You pick a service and accept the fixed price. The job enters the queue for your area.",
  },
  {
    status: "Assigned",
    body: "A verified pro with the right skills accepts. You get their profile and a contact channel.",
  },
  {
    status: "En route",
    body: "The technician starts the job. ETA updates live and you can message them directly.",
  },
  {
    status: "In progress",
    body: "Work is underway. The clock and the agreed price are both fixed for the duration.",
  },
  {
    status: "Completed",
    body: "The technician marks the job done. Only now does the payment release and the rating unlock.",
  },
];

/** EV-specific highlights, called out separately as the task requires. */
const EV_HIGHLIGHTS = [
  {
    title: "Live bay availability",
    body: "Occupancy per connector, not just per station, so you can pick the charger that is actually free.",
  },
  {
    title: "Connector specs up front",
    body: "CCS2, CHAdeMO and Type 2 are listed per bay. Match the plug before you drive over.",
  },
  {
    title: "Price per kWh, locked in",
    body: "The rate is shown at reservation time and does not change when you arrive.",
  },
  {
    title: "QR pass on your phone",
    body: "A downloadable pass is issued with the booking. Scan it at the charger to start the session.",
  },
];

/* ── Page sections ─────────────────────────────────────────────────────────── */

function AboutHero() {
  return (
    <section className="border-b border-line bg-bg">
      <Container className="py-16 sm:py-20">
        <Badge tone="primary" size="md" dot>
          About ServiGo
        </Badge>
        <h1 className="mt-6 max-w-3xl font-display text-4xl font-bold leading-[1.1] tracking-tight text-ink sm:text-5xl">
          Two marketplaces that were always the same problem.
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-text-soft sm:text-lg">
          Booking a plumber and booking a charge point fail for the same reason:
          you cannot trust what you were shown. ServiGo fixes that with verified
          providers, prices agreed before the job, and status you can see the
          whole way through.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ButtonLink
            href="/services"
            variant="primary"
            size="lg"
            trailingIcon={<ArrowRight size={16} aria-hidden="true" />}
          >
            Browse services
          </ButtonLink>
          <Link href="/#overview" className={buttonClasses("secondary", "lg")}>
            Back to overview
          </Link>
        </div>
      </Container>
    </section>
  );
}

function WhatItIs() {
  return (
    <Section tone="default" id="what-it-is">
      <SectionHeader
        eyebrow="What ServiGo is"
        title="A verified marketplace for work that has to be right."
        description="ServiGo connects households with background-checked home technicians, and drivers with EV charging stations that have real availability. Both sides run on the same core: a fixed price, a tracked status, and a review only once the job is genuinely done."
      />

      <StaggerOnView className="mt-14 grid gap-5 sm:grid-cols-3">
        {[
          {
            icon: BadgeCheck,
            title: "Verified providers",
            body: "Technicians clear identity, skills and insurance checks before accepting work. Stations are listed with verified live status.",
          },
          {
            icon: ShieldCheck,
            title: "Price agreed upfront",
            body: "Labour and call-out are in the quoted figure. Nothing is added on the day of the visit.",
          },
          {
            icon: CheckCircle2,
            title: "Tracked to completion",
            body: "Every booking moves through a visible status progression, and payment releases only when the job is marked complete.",
          },
        ].map((item) => (
          <StaggerItem key={item.title} className="h-full">
            <Card className="flex h-full flex-col p-6" elevation="raised">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-soft text-primary">
                <item.icon size={17} strokeWidth={2} aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-display text-base font-bold text-ink">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-soft">
                {item.body}
              </p>
            </Card>
          </StaggerItem>
        ))}
      </StaggerOnView>
    </Section>
  );
}

function Roles() {
  return (
    <Section tone="raised" id="roles">
      <SectionHeader
        eyebrow="Roles"
        title="Three sides, one shared workflow."
        description="Each role sees the same booking from a different angle, with permissions that keep operations separated."
      />
      <StaggerOnView className="mt-14 grid gap-5 lg:grid-cols-3">
        {ROLES.map((r) => (
          <StaggerItem key={r.role} className="h-full">
            <Card className="flex h-full flex-col p-6" elevation="raised">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-soft text-primary">
                <r.icon size={17} strokeWidth={2} aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold text-ink">
                {r.role}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-soft">
                {r.summary}
              </p>
              <ul className="mt-5 flex flex-col gap-2.5 border-t border-line pt-5">
                {r.points.map((p) => (
                  <li
                    key={p}
                    className="flex items-start gap-2.5 text-sm text-text-soft"
                  >
                    <CheckCircle2
                      size={15}
                      className="mt-0.5 shrink-0 text-success"
                      aria-hidden="true"
                    />
                    {p}
                  </li>
                ))}
              </ul>
            </Card>
          </StaggerItem>
        ))}
      </StaggerOnView>
    </Section>
  );
}

function BookingWorkflow() {
  return (
    <Section tone="default" id="booking-workflow">
      <SectionHeader
        eyebrow="Booking workflow"
        title="How a job moves from request to completion."
        description="The same five statuses apply to a home service booking. Each transition is recorded, so both sides always see the same state."
      />

      <ol className="mt-14 flex flex-col gap-0">
        {BOOKING_FLOW.map((step, i) => (
          <li key={step.status} className="relative flex gap-6 pb-9 last:pb-0">
            {/* Connector rail — the line stops at the final step. */}
            {i < BOOKING_FLOW.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-px bg-line"
              />
            )}
            <span
              aria-hidden="true"
              className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface font-mono text-sm font-semibold text-primary"
            >
              {i + 1}
            </span>
            <div className="pt-1">
              <h3 className="font-display text-base font-bold text-ink">
                {step.status}
              </h3>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-text-soft">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>

      <Card className="mt-10 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between" elevation="raised">
        <p className="text-sm text-text-soft">
          <span className="font-semibold text-ink">Payment is held</span> until
          the technician marks the job complete — not until arrival.
        </p>
        <Link
          href="/login"
          className={buttonClasses("secondary", "sm", "shrink-0")}
        >
          Sign in to track a job
        </Link>
      </Card>
    </Section>
  );
}

function EvSection() {
  return (
    <Section tone="raised" id="ev-booking">
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-md">
        <div className="grid lg:grid-cols-2">
          <div className="space-y-6 p-8 sm:p-10 lg:p-12">
            <Badge tone="energy" size="md">
              <Zap size={12} aria-hidden="true" />
              EV booking
            </Badge>
            <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-ink">
              Reserve a bay, not a guess.
            </h2>
            <p className="text-base leading-relaxed text-text-soft">
              EV reservations run on the same booking engine as home services.
              The difference is that the resource is a connector rather than a
              person, so availability is genuinely live and per-bay.
            </p>
            <ButtonLink
              href="/ev"
              variant="primary"
              size="lg"
              trailingIcon={<ArrowRight size={16} aria-hidden="true" />}
            >
              Find a station
            </ButtonLink>
          </div>

          <div className="relative min-h-[300px]">
            <SafeImage
              src={getServiceImage({
                name: "EV charging station",
                category: { slug: "ev-charging" },
              })}
              alt="EV charging station"
              className="absolute inset-0 h-full w-full"
              imgClassName="object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-ink/60 via-ink/10 to-transparent"
            />
          </div>
        </div>
      </div>

      <StaggerOnView className="mt-10 grid gap-5 sm:grid-cols-2">
        {EV_HIGHLIGHTS.map((h) => (
          <StaggerItem key={h.title} className="h-full">
            <Card className="flex h-full flex-col p-5" elevation="raised">
              <h3 className="font-display text-sm font-bold text-ink">
                {h.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-soft">
                {h.body}
              </p>
            </Card>
          </StaggerItem>
        ))}
      </StaggerOnView>
    </Section>
  );
}

function ClosingCta() {
  return (
    <Section tone="default" id="start">
      <div className="flex flex-col items-start gap-6 rounded-xl border border-line bg-surface p-8 shadow-sm sm:p-10 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Ready to see it in practice?
          </h2>
          <p className="mt-3 text-base leading-relaxed text-text-soft">
            Browse the catalogue with fixed prices, or look up a charging
            station near you. No account needed to browse.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <ButtonLink
            href="/services"
            variant="primary"
            size="lg"
            trailingIcon={<ArrowRight size={16} aria-hidden="true" />}
          >
            Browse services
          </ButtonLink>
          <Link href="/ev" className={buttonClasses("secondary", "lg")}>
            EV stations
          </Link>
        </div>
      </div>
    </Section>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function AboutPage() {
  return (
    <MotionPage>
      <AboutHero />
      <WhatItIs />
      <Roles />
      <BookingWorkflow />
      <EvSection />
      <ClosingCta />
    </MotionPage>
  );
}
