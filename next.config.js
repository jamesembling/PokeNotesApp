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
  }
};

module.exports = nextConfig;
