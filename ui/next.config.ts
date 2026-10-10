import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['onnxruntime-node'],
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
