import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval';"
  : "script-src 'self' 'unsafe-inline';";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "http", hostname: "127.0.0.1" },
    ],
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self';",
              scriptSrc,
              "style-src 'self' 'unsafe-inline';",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.cloudinary.com http://localhost:5001 ws://localhost:5001 http://127.0.0.1:5001 ws://127.0.0.1:5001;",
              `img-src 'self' data: res.cloudinary.com *.supabase.co localhost 127.0.0.1;`, 
              "font-src 'self';",
              "object-src 'none';",
              "frame-ancestors 'none';",
              "base-uri 'self';",
              "form-action 'self';",
            ].join(" "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
