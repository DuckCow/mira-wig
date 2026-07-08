import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    dangerouslyAllowLocalIP: true, // Next/Image가 로컬 mock-storage URL을 최적화할 수 있게 허용
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.amazonaws.com", // S3 presigned URL 허용
      },
      {
        protocol: "http",
        hostname: "localhost",
        pathname: "/api/mock-storage",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
        pathname: "/api/mock-storage",
      },
    ],
  },
};

export default nextConfig;
