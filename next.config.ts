import type { NextConfig } from "next";

import packageJson from "./package.json";

const releaseChannel =
  process.env.RELEASE_CHANNEL ??
  (process.env.NODE_ENV === "development" ? "dev" : "latest");

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    APP_VERSION: process.env.APP_VERSION ?? packageJson.version,
    RELEASE_CHANNEL: releaseChannel,
  },
};

export default nextConfig;
