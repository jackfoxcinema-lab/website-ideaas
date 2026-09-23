/** @type {import('next').NextConfig} */

// Opt-in fully static export (STATIC_EXPORT=true npm run build). The site has
// no server-side features, so exporting is lossless — it just lets the build
// be dropped on any static host. The default build stays a normal Next build
// for Vercel and friends.
const isStaticExport = process.env.STATIC_EXPORT === "true";

const nextConfig = {
  ...(isStaticExport && { output: "export", trailingSlash: true }),
  images: {
    // next/image has no optimiser on a static host.
    unoptimized: isStaticExport,
    remotePatterns: [
      { protocol: "https", hostname: "**.cdninstagram.com" },
      { protocol: "https", hostname: "**.fbcdn.net" },
    ],
  },
};

module.exports = nextConfig;
