import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@astryxdesign/core"],
  outputFileTracingRoot: join(root, "../.."),
};

export default nextConfig;
