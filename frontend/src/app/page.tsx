import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPin,
  Search,
  Star,
  Zap,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Badge } from "@/components/ui/Badge";
import { SafeImage } from "@/components/SafeImage";
import { buttonClasses } from "@/components/ui/button-variants";
import { ButtonLink } from "@/components/ui/Button";
import {
  MotionPage,
  StaggerGroup,
  StaggerItem,
  StaggerOnView,
  HoverCard,
} from "@/components/motion";
import { CATEGORY_TILES, getEvImage, SMART_TV_REPAIR_IMAGE } from "@/lib/images";

/* ── Static showcase data (illustrative) ────────────────────────────────────
   These mirror the shape the API returns so the marketing surface stays
   composed before the backend is reachable. */

const METRICS = [
  { value: "4.9★", label: "Customer rating" },
  { value: "< 30 min", label: "Average arrival" },
  { value: "100%", label: "Vetted & insured" },
  { value: "24/7", label: "Booking coverage" },
];

const EV_PERKS = [
  "Live slot availability and price per kWh",
  "Station map with connector specs — CCS2, CHAdeMO, Type 2",
  "Instant reservation with a downloadable QR pass",
  "Verified charger health and recent user reviews",
];

/** The active technician shown in the hero's product preview. */
const LIVE_JOB = {
  title: "Smart TV diagnostics",
  assignee: "Technician en route",
  eta: "12 min",
  image: SMART_TV_REPAIR_IMAGE,
};

/* ── Hero ──────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section
      id="overview"
      className="relative scroll-mt-16 overflow-hidden border-b border-line bg-bg"
    >
      {/* Restrained backdrop — reads as paper, not as an effect. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 right-[-12%] h-[26rem] w-[26rem] rounded-full bg-primary-faint blur-3xl" />
        <div className="absolute left-[-14%] top-40 h-[22rem] w-[22rem] rounded-full bg-primary-glow blur-3xl" />
      </div>

      <Container className="relative grid items-center gap-14 py-16 sm:py-24 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:py-28">
        {/* Copy */}
        <StaggerGroup className="max-w-xl">
          <StaggerItem>
            <Badge tone="primary" size="md" dot>
              25+ stations live · 100+ verified pros
            </Badge>
          </StaggerItem>

          <StaggerItem>
            <h1 className="mt-6 font-display text-4xl font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
              Home services &amp; EV charging,{" "}
              <span className="text-primary">synchronized.</span>
            </h1>
          </StaggerItem>

          <StaggerItem>
            <p className="mt-6 text-base leading-relaxed text-text-soft sm:text-lg">
              A dual-sided marketplace for certified home technicians and real-time
              EV station reservations — booked, tracked and reviewed in one place.
            </p>
          </StaggerItem>

          <StaggerItem>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink
                href="/services"
                variant="primary"
                size="lg"
                leadingIcon={<Search size={16} aria-hidden="true" />}
              >
                Find a service
              </ButtonLink>
              <ButtonLink
                href="/ev"
                variant="secondary"
                size="lg"
                trailingIcon={<ArrowRight size={16} aria-hidden="true" />}
              >
                Explore EV stations
              </ButtonLink>
            </div>
          </StaggerItem>

          <StaggerItem>
            <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span>Fixed pricing</span>
              <span aria-hidden="true">·</span>
              <span>Vetted technicians</span>
              <span aria-hidden="true">·</span>
              <span>Support within 30 minutes</span>
            </p>
          </StaggerItem>
        </StaggerGroup>

        {/* Product visualization — the service is shown, not described. */}
        <div className="lg:justify-self-end">
          <HeroPreview />
        </div>
      </Container>
    </section>
  );
}

/**
 * The hero's right-hand column: a window-chrome panel holding a live job
 * card and an EV slot card. This is the reference "show the product" move —
 * a static illustration built from the same tokens as everything else, so it
 * demonstrates the product rather than describing it.
 */
function HeroPreview() {
  return (
    <StaggerGroup className="w-full max-w-md lg:max-w-none">
      <StaggerItem>
        <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
          {/* Window chrome */}
          <div className="flex items-center justify-between border-b border-line bg-surface-2 px-4 py-3">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-line" />
              <span className="h-2.5 w-2.5 rounded-full bg-line" />
            </div>
            <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
              Live operations
            </span>
            <span className="text-xs font-medium text-primary">Open console ↗</span>
          </div>

          <div className="space-y-5 p-5">
            {/* Active job */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <SafeImage
                  src={LIVE_JOB.image}
                  alt="Smart TV repair in progress"
                  className="h-10 w-10 shrink-0 rounded-md"
                  imgClassName="object-cover"
                  priority
                  sizes="40px"
                />
                <div>
                  <p className="font-display text-sm font-bold text-ink">{LIVE_JOB.title}</p>
                  <p className="mt-0.5 text-xs text-muted">{LIVE_JOB.assignee}</p>
                </div>
              </div>
              <Badge tone="primary" dot>
                Active
              </Badge>
            </div>

            {/* Stat tiles */}
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="En route" value="12" suffix="min" tone="primary" />
              <StatTile label="Completion" value="94" suffix="%" tone="ink" />
            </div>

            {/* EV slot card */}
            <div className="rounded-lg border border-line bg-surface-2 p-3.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-energy">
                <Zap size={13} aria-hidden="true" />
                DC fast charge · 60 kW
              </p>
              <p className="mt-1 font-display text-base font-bold text-ink">
                2 of 4 bays open
              </p>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full w-1/2 rounded-full bg-energy" />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-xs text-muted">₹18 / kWh</span>
                <Badge tone="success" dot>
                  Available
                </Badge>
              </div>
            </div>

            {/* Footer meta */}
            <div className="flex items-center justify-between border-t border-line pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                This week
              </p>
              <p className="font-mono text-[11px] text-muted">412 jobs · 38 stations</p>
            </div>
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-muted">
          Illustrative operations preview — live figures differ
        </p>
      </StaggerItem>
    </StaggerGroup>
  );
}

function StatTile({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: string;
  suffix: string;
  tone: "primary" | "ink";
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <span
          className={`font-display text-3xl font-bold tabular-nums ${
            tone === "primary" ? "text-primary" : "text-ink"
          }`}
        >
          {value}
        </span>
        <span className="text-xs text-muted">{suffix}</span>
      </div>
    </div>
  );
}

/* ── Metric strip ──────────────────────────────────────────────────────────── */

function MetricStrip() {
  return (
    <section className="border-b border-line bg-surface-2">
      <Container className="grid grid-cols-2 gap-6 py-8 lg:grid-cols-4">
        {METRICS.map((m) => (
          <div key={m.label} className="text-center lg:text-left">
            <p className="font-display text-2xl font-bold tabular-nums tracking-tight text-ink sm:text-3xl">
              {m.value}
            </p>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.15em] text-muted">
              {m.label}
            </p>
          </div>
        ))}
      </Container>
    </section>
  );
}

/* ── Category bento ────────────────────────────────────────────────────────── */

function CategoryBento() {
  return (
    <Section tone="default" id="categories">
      <SectionHeader
        eyebrow="Categories"
        title="Book the job. We bring the expert."
        description="Six high-demand categories, each with upfront pricing and technicians who are background-checked and insured."
        action={
          <Link
            href="/services"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors duration-base ease-out hover:text-primary-strong"
          >
            Browse all
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
        }
      />

      <StaggerOnView className="mt-14 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {CATEGORY_TILES.map((cat) => (
          <StaggerItem key={cat.slug} className="h-full">
            <HoverCard className="h-full">
              <Link
                href={`/services?category=${cat.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface p-3 shadow-sm transition-colors duration-base ease-out hover:border-primary/40"
              >
                <SafeImage
                  src={cat.image}
                  alt={`${cat.name} service`}
                  className="mb-3 h-32 w-full rounded-md"
                  imgClassName="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  // The bento sits directly under the hero on a 1080p laptop,
                  // so these tiles are above the fold even though the section
                  // header is not. Loading them eagerly is what stops the
                  // grid flashing six empty frames on first paint.
                  priority
                  sizes="(max-width: 768px) 45vw, (max-width: 1024px) 30vw, 16vw"
                />
                <h3 className="mb-0.5 font-display text-sm font-bold text-ink">{cat.name}</h3>
                <p className="mb-2 text-xs text-muted">{cat.tag}</p>
                <div className="mt-auto flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-primary">
                    from {cat.from}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-text-soft">
                    View
                    <ChevronRight size={12} aria-hidden="true" />
                  </span>
                </div>
              </Link>
            </HoverCard>
          </StaggerItem>
        ))}
      </StaggerOnView>
    </Section>
  );
}

/* ── Featured services ─────────────────────────────────────────────────────── */

function FeaturedServices() {
  const items = [
    {
      name: "Smart TV Repair",
      short: "Screen, board and remote diagnostics",
      price: "₹2,499",
      image: SMART_TV_REPAIR_IMAGE,
      category: "Electronics",
    },
    {
      name: "EV Station Setup",
      short: "Home charger installation and inspection",
      price: "₹4,999",
      image: getEvImage(1),
      category: "EV Charging",
    },
    {
      name: "Plumbing Repair",
      short: "Leak fix, pipe replacement, pressure check",
      price: "₹899",
      image: CATEGORY_TILES[0].image,
      category: "Plumbing",
    },
  ];

  return (
    <Section tone="raised" id="featured">
      <SectionHeader
        eyebrow="Featured"
        title="Popular with customers this month."
        description="A rotating selection from the live catalogue — verified professionals, transparent pricing."
        action={
          <Link
            href="/services"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition-colors duration-base ease-out hover:text-primary-strong"
          >
            See all services
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
        }
      />

      <StaggerOnView className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {items.map((s) => (
          <StaggerItem key={s.name} className="h-full">
            <HoverCard className="h-full">
              <Link
                href="/services"
                className="group flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-sm transition-colors duration-base ease-out hover:border-primary/40"
              >
                <SafeImage
                  src={s.image}
                  alt={s.name}
                  className="h-48 w-full"
                  imgClassName="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  sizes="(max-width: 640px) 92vw, 30vw"
                />
                <div className="flex flex-1 flex-col p-5">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-primary">{s.category}</span>
                    <span className="font-mono text-sm font-semibold tabular-nums text-ink">
                      {s.price}
                    </span>
                  </div>
                  <h3 className="mb-1 font-display text-lg font-bold text-ink">{s.name}</h3>
                  <p className="text-sm leading-relaxed text-text-soft">{s.short}</p>
                </div>
              </Link>
            </HoverCard>
          </StaggerItem>
        ))}
      </StaggerOnView>
    </Section>
  );
}

/* ── EV showcase ───────────────────────────────────────────────────────────── */

function EvShowcase() {
  return (
    <Section tone="default" id="ev">
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-md">
        <div className="grid lg:grid-cols-2">
          {/* Copy */}
          <div className="space-y-6 p-8 sm:p-10 lg:p-12">
            <Badge tone="energy" size="md">
              EV charging
            </Badge>
            <h2 className="font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
              Real-time station reservation.
              <span className="block text-text-soft">No queue, no guesswork.</span>
            </h2>
            <ul className="space-y-3">
              {EV_PERKS.map((perk) => (
                <li key={perk} className="flex items-start gap-3 text-sm text-text-soft">
                  <CheckCircle2
                    size={17}
                    className="mt-0.5 shrink-0 text-success"
                    aria-hidden="true"
                  />
                  {perk}
                </li>
              ))}
            </ul>
            <ButtonLink
              href="/ev"
              variant="primary"
              size="lg"
              trailingIcon={<ArrowRight size={16} aria-hidden="true" />}
            >
              Explore stations
            </ButtonLink>
          </div>

          {/* Image panel */}
          <div className="relative min-h-[320px]">
            <SafeImage
              src={getEvImage(0)}
              alt="EV charging station"
              className="absolute inset-0 h-full w-full"
              imgClassName="object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/10 to-transparent"
            />
            {/* Floating reservation card */}
            <div className="absolute inset-x-4 bottom-4 rounded-lg border border-line bg-surface/95 p-4 shadow-lg backdrop-blur-sm sm:inset-x-6 sm:bottom-6">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-energy">
                <Zap size={13} aria-hidden="true" />
                CCS2 · 150 kW · 2 bays
              </p>
              <p className="mb-3 font-display text-base font-bold text-ink">
                Live rate <span className="font-mono tabular-nums">₹22 / kWh</span>
              </p>
              <Link
                href="/ev"
                className={buttonClasses("primary", "sm", "w-full")}
              >
                Reserve a slot
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ── How it works ──────────────────────────────────────────────────────────── */

const STEPS = [
  { n: "01", title: "Pick what you need", body: "Choose a category or search the catalogue for an exact job." },
  { n: "02", title: "See the fixed price", body: "Every service is quoted up front — no call-out surprises later." },
  { n: "03", title: "Track the technician", body: "Live status from assignment to arrival, with an ETA that updates." },
  { n: "04", title: "Pay after the job", body: "Release payment only once the work is marked complete and reviewed." },
];

function HowItWorks() {
  return (
    <Section tone="raised" id="how-it-works">
      <SectionHeader
        eyebrow="How it works"
        title="Four steps from tap to done."
        description="The same flow whether you book a technician or reserve a charging bay."
      />
      <StaggerOnView
        amount={0.2}
        className="mt-14 grid gap-9 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6"
      >
        {STEPS.map((step) => (
          <StaggerItem key={step.n} className="border-t border-line-strong pt-6">
            <span className="font-display text-4xl font-bold tabular-nums tracking-tight text-primary/25">
              {step.n}
            </span>
            <h3 className="mt-3 font-display text-lg font-bold text-ink">{step.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-soft">{step.body}</p>
          </StaggerItem>
        ))}
      </StaggerOnView>
    </Section>
  );
}

/* ── Trust band ────────────────────────────────────────────────────────────── */

function TrustBand() {
  const items = [
    { icon: BadgeCheck, title: "Background-checked pros", body: "Every technician is identity-verified and insured before they accept jobs." },
    { icon: Clock, title: "Arrival windows that hold", body: "Real-time tracking with a 30-minute grace band on every visit." },
    { icon: MapPin, title: "Serviceable areas", body: "Coverage maps so you know a pro is available before you book." },
    { icon: Star, title: "Reviewed after every job", body: "Only customers who completed a booking can leave a rating." },
  ];

  return (
    <Section tone="default" id="trust">
      <SectionHeader
        eyebrow="Why ServiGo"
        title="Built for work that has to be right."
        description="The operational details that decide whether a home visit actually goes well."
      />
      <StaggerOnView className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <StaggerItem key={item.title}>
            <div className="flex h-full flex-col rounded-lg border border-line bg-surface p-6 shadow-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-soft text-primary">
                <item.icon size={17} strokeWidth={2} aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-display text-base font-bold text-ink">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-soft">{item.body}</p>
            </div>
          </StaggerItem>
        ))}
      </StaggerOnView>
    </Section>
  );
}

/* ── FAQ ───────────────────────────────────────────────────────────────────── */

const FAQS = [
  {
    q: "How is pricing decided?",
    a: "Each service carries a fixed price set before booking. The quote you accept is the quote you pay — call-out and labour are already included.",
  },
  {
    q: "Are the technicians verified?",
    a: "Yes. Every pro clears identity verification, a skills check and insurance before they can accept a job on the platform.",
  },
  {
    q: "What if the job is not completed?",
    a: "Payment is released only after the work is marked complete. If something goes wrong, support is reachable within 30 minutes and the job is re-assigned at no extra cost.",
  },
  {
    q: "How do EV reservations work?",
    a: "Pick a station, see live bay availability and the price per kWh, then reserve a slot. You get a QR pass to scan on arrival.",
  },
  {
    q: "Which areas are covered?",
    a: "Coverage is mapped per category so you can confirm a pro is available before you book. Stations are listed separately on the EV page.",
  },
];

function Faq() {
  return (
    <Section tone="default" id="faq">
      <SectionHeader
        eyebrow="FAQ"
        title="Straight answers, no runaround."
        description="The questions customers ask most before a first booking."
      />
      <div className="mt-12 divide-y divide-line border-y border-line">
        {FAQS.map((item) => (
          <details key={item.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-base font-bold text-ink marker:content-none">
              {item.q}
              <span
                aria-hidden="true"
                className="shrink-0 text-xl font-normal text-primary transition-transform duration-base ease-out group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 max-w-3xl pr-8 text-sm leading-relaxed text-text-soft">
              {item.a}
            </p>
          </details>
        ))}
      </div>
    </Section>
  );
}

/* ── Final CTA ─────────────────────────────────────────────────────────────── */

function FinalCta() {
  return (
    <Section tone="raised" id="get-started">
      <div className="flex flex-col items-start gap-8 rounded-xl border border-line bg-surface p-8 shadow-sm sm:p-12 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-2xl">
          <p className="flex items-center gap-3 font-mono text-xs font-medium uppercase tracking-[0.2em] text-primary">
            <span aria-hidden="true" className="h-px w-6 bg-primary" />
            Get started
          </p>
          <h2 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
            Ready when you are.
          </h2>
          <p className="mt-4 text-base leading-relaxed text-text-soft">
            Sign in to track live bookings, message your technician and keep every
            receipt in one place — or browse the catalogue without an account.
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
          <Link href="/login" className={buttonClasses("secondary", "lg")}>
            Sign in
          </Link>
        </div>
      </div>
    </Section>
  );
}

/* ── Footer ────────────────────────────────────────────────────────────────── */

function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface-2">
      <Container className="flex flex-col items-center justify-between gap-4 py-8 sm:flex-row">
        <p className="font-display text-sm font-bold tracking-tight text-ink">ServiGo</p>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link
            href="/"
            className="text-sm text-text-soft transition-colors duration-base ease-out hover:text-ink"
          >
            Home
          </Link>
          <Link
            href="/services"
            className="text-sm text-text-soft transition-colors duration-base ease-out hover:text-ink"
          >
            Services
          </Link>
          <Link
            href="/ev"
            className="text-sm text-text-soft transition-colors duration-base ease-out hover:text-ink"
          >
            EV Charging
          </Link>
          <Link
            href="/about"
            className="text-sm text-text-soft transition-colors duration-base ease-out hover:text-ink"
          >
            About
          </Link>
          <Link
            href="/login"
            className="text-sm text-text-soft transition-colors duration-base ease-out hover:text-ink"
          >
            Sign in
          </Link>
        </nav>
        <p className="text-xs text-muted">
          © {new Date().getFullYear()} ServiGo. All rights reserved.
        </p>
      </Container>
    </footer>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function HomePage() {
  return (
    <MotionPage>
      <Hero />
      <MetricStrip />
      <CategoryBento />
      <FeaturedServices />
      <EvShowcase />
      <HowItWorks />
      <TrustBand />
      <Faq />
      <FinalCta />
      <SiteFooter />
    </MotionPage>
  );
}
