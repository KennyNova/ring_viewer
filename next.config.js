/** @type {import('next').NextConfig} */
const nextConfig = {
  // Either remove the assetPrefix line completely, or ensure it points to a valid domain
  // that you control and has proper CORS headers configured
  // assetPrefix: process.env.NODE_ENV === "production" ? "https://3d.masinadiamonds.com" : "",
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      'three': require.resolve('three'),
    };
    return config;
  },
};

module.exports = nextConfig;