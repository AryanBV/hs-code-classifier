/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  // Environment variables
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  },

  // Experimental features
  experimental: {
    // Enable if needed
  },

  // Image optimization (if using next/image)
  images: {
    domains: [],
  },
}

module.exports = nextConfig
