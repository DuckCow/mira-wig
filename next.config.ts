import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.amazonaws.com", // S3 presigned URL 허용
      },
    ],
  },
};

export default nextConfig;
