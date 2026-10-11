import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Verifikasi/build manual memakai folder lain (NEXT_DIST_DIR=.next-verify) supaya tidak menimpa `.next` milik `next dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    // Serve covers as-is: Vercel Hobby allows only 5,000 image transformations a month (hard cap, no billing).
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ampvduihfkdyvgobpwiv.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
