/** @type {import('next').NextConfig} */
const nextConfig = {
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
