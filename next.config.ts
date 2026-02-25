import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // output: 'export', // Removed for Cloudflare SSR/API support
  // trailingSlash: true, // Fixes static export routing on Cloudflare Pages (Not strictly needed for SSR, but we can keep it)
  // Disable image optimization API since we are exporting statically (Need to update this for next-on-pages)
  images: {
    unoptimized: true,
  }
};

export default nextConfig;
