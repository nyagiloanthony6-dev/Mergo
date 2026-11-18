/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: "20mb" } }, // document uploads
};

export default nextConfig;
