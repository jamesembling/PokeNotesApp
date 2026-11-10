const { localNetworkHostnames } = require("./scripts/local-network-hosts.cjs");

const baselineSecurityHeaders = [
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=()"
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin"
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff"
  },
  {
    key: "X-Frame-Options",
    value: "DENY"
  }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.POKENOTES_E2E_LOCAL === "1" ? ".next-e2e" : ".next",
  // Lets a phone on the same Wi-Fi load dev assets from whatever address this Mac has today.
  allowedDevOrigins: process.env.NODE_ENV === "production" ? [] : localNetworkHostnames(),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: baselineSecurityHeaders
      }
    ];
  },
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
  images: {
    qualities: [75, 80, 95],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "assets.tcgdex.net",
        pathname: "/en/**/high.webp",
        search: ""
      },
      {
        protocol: "https",
        hostname: "r2.limitlesstcg.net"
      },
      {
        protocol: "https",
        hostname: "limitlesstcg.nyc3.cdn.digitaloceanspaces.com"
      },
      {
        protocol: "https",
        hostname: "limitless3.nyc3.cdn.digitaloceanspaces.com"
      }
    ]
  }
};

module.exports = nextConfig;
