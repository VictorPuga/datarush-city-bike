import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['onnxruntime-node'],
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
