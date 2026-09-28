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
  themeColor: "#f6f5f2",
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
    */
    <html
      lang="en"
      data-scroll-behavior="smooth"
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
