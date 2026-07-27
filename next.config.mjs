/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    // With middleware in play, Next.js buffers each request body so it can be
    // read twice, capped at 10MB by default. Lecture recordings blow past that
    // and arrive truncated, which corrupts the multipart upload. Raise the cap
    // above our 200MB audio limit so large uploads survive intact.
    middlewareClientMaxBodySize: "220mb",
  },
};

export default nextConfig;
