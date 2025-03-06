/** @type {import('next').NextConfig} */
const nextConfig = {
  // Either remove the assetPrefix line completely, or ensure it points to a valid domain
  // that you control and has proper CORS headers configured
  // assetPrefix: process.env.NODE_ENV === "production" ? "https://3d.masinadiamonds.com" : "",
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
  // output: 'standalone', // Enable standalone output for Docker deployment
  experimental: {
    // This is experimental but can be enabled to allow for better tree-shaking
    outputFileTracingRoot: process.env.NODE_ENV === "production" ? undefined : __dirname,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'three': require.resolve('three'),
    };
    return config;
  },
};

module.exports = nextConfig;