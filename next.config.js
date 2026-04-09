/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
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
  },
  async headers() {
    return [
      {
        source:
          "/:path((?:login|logs|decks(?:/.*)?|stats|calculator|profile|admin(?:/.*)?|auth/callback)?)",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate"
          }
        ]
      }
    ];
  }
};

module.exports = nextConfig;
