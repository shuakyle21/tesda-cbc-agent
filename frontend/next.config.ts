import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    /* Pin the workspace root to this app. There is a stray package-lock.json in the home
       directory above the repo, and without this Turbopack infers that as the root and
       warns on every build. */
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
