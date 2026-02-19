/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.DOCKER_BUILD === '1' ? 'standalone' : undefined,
  transpilePackages: ['@ondc/shared'],
};
module.exports = nextConfig;
