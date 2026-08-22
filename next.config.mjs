/** @type {import('next').NextConfig} */
const nextConfig = {
  swcMinify: false,
  productionBrowserSourceMaps: true,
  images: {
    // Profile pictures Clerk holds for a user (today: the avatar their SSO
    // provider supplied). Anything else fails the optimiser and Avatar falls
    // back to its initials badge.
    remotePatterns: [{ protocol: 'https', hostname: 'img.clerk.com' }],
  },
};

export default nextConfig;
