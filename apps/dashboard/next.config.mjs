import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const repoEnv = join(root, "../../.env");
if (existsSync(repoEnv)) {
  for (const line of readFileSync(repoEnv, "utf8").split("\n")) {
    const m = line.match(
      /^((?:GRAPH|PROVE|TRANSLATE|TURNSTILE|DASHBOARD|NEXT_PUBLIC)_[A-Z0-9_]+|TRANSLATE_URL|WARRANT_STRICT_PROD|REGISTRY_ADDRESS)=(.*)$/,
    );
    if (m && m[1] && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
    }
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@astryxdesign/core"],
  outputFileTracingRoot: join(root, "../.."),
  allowedDevOrigins: ["http://localhost:3001", "http://127.0.0.1:3001"],
  env: {
    NEXT_PUBLIC_TRANSLATE_URL:
      process.env.NEXT_PUBLIC_TRANSLATE_URL ??
      process.env.TRANSLATE_URL ??
      "http://127.0.0.1:8787/v1/translate",
  },
};

export default nextConfig;
