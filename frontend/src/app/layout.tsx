import type { Metadata, Viewport } from "next";
import { Sora, Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Providers } from "./providers";

/*
 * Two families, three roles (see RESUMEAI_MODEL.md §2):
 *   display -> headings only
 *   sans    -> body, UI, controls
 *   mono    -> eyebrows, labels, numerals (system stack, no webfont needed)
 * `display: swap` keeps text readable while the webfont loads.
 */
const sora = Sora({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display-face",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ServiGo — Home services & EV charging, booked in one place",
    template: "%s · ServiGo",
  },
  description:
    "Book vetted home technicians and reserve EV charging slots with live availability, transparent pricing and verified pros.",
  openGraph: {
    title: "ServiGo — Home services & EV charging",
    description:
      "Vetted home technicians and real-time EV station reservations, booked and tracked in one place.",
    type: "website",
  },
};

export const viewport: Viewport = {
  /*
    Two media entries so the browser chrome (address bar on mobile) tracks
    the resolved theme. The values mirror the `--bg` token in globals.css:
    warm paper for light, deep ink for dark. next-themes' inline bootstrap
    can only flip the class on <html> — the meta tag is static markup — so
    the OS media query is what keeps it honest when the theme follows the
    system.
  */
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#13161c" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /*
      `data-scroll-behavior="smooth"` is the App Router's opt-in for smooth
      scrolling on in-page anchor navigation. Without it Next.js logs a
      console warning recommending exactly this attribute. It is inert for
      normal scrolling and for `prefers-reduced-motion`-style overrides,
      since the CSS below is what actually applies the behaviour.

      `suppressHydrationWarning` is required, not cosmetic. next-themes
      injects a blocking script that writes the `dark` class onto <html>
      before React hydrates, so the client DOM intentionally disagrees with
      the server-rendered attribute. Without this flag React logs a
      hydration mismatch on every page load. It is scoped to this single
      element on purpose — suppressing it app-wide would hide real
      mismatches everywhere else.
    */
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${sora.variable} ${inter.variable}`}
    >
      <body className="page-canvas">
        <Providers>
          {/*
            The single sticky navbar, rendered once for the whole app.
            Pages must not render their own — that is how the "two navs /
            mixed theme" problem started.
          */}
          <Navbar />
          <main>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
