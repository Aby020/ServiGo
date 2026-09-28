import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // AVIF first, WebP second. Both are negotiated per-request via
    // `Accept`, so a browser that supports neither simply gets the original
    // JPEG — there is no sniffing round-trip and no broken image.
    //
    // The category and service photographs are 175–300 KB each and there are
    // a dozen of them on the home page, so the format switch is the single
    // largest win available on the home page's weight.
    formats: ["image/avif", "image/webp"],
    // Avatars and technician photos come off a company bucket; every image
    // path we resolve locally is under /public, so no remote pattern is
    // needed for them.
    remotePatterns: [
      { protocol: "https", hostname: "**.servigo.in", pathname: "/media/**" },
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
    ],
    // The optimizer caches resized variants on disk. Capping the longest edge
    // at 1920 stops a 4K upload from being re-encoded at 3840px for a card
    // that never paints more than ~640px.
    deviceSizes: [360, 480, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [32, 64, 96, 128, 192, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default nextConfig;
