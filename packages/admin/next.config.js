/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@ondc/shared'],
};
module.exports = nextConfig;
