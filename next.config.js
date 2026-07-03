/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["192.168.1.195", "Jamess-MacBook-Pro-2.local"],
  outputFileTracingRoot: __dirname,
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
