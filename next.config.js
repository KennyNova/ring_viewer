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
    
    // Handle Node.js specific modules that aren't available in the browser
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
      os: false,
    };
    
    // Add support for WASM files (still needed for other components like draco decompression)
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    
    return config;
  },
  images: {
    domains: ['localhost'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
        ],
      },
      {
        // Add correct MIME type for WASM files (still needed for other components)
        source: '/wasm/:file(.*\\.wasm)',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/wasm',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  }
};

module.exports = nextConfig;