import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse", "mammoth"],
  transpilePackages: ["@eigenpal/docx-js-editor"],
};



export default nextConfig;
