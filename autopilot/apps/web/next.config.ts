import type { NextConfig } from 'next'

/**
 * Internal packages are consumed as TypeScript source rather than built artefacts, so
 * there is no build step between changing a domain package and seeing it in the app.
 */
const config: NextConfig = {
  transpilePackages: [
    '@autopilot/shared',
    '@autopilot/database',
    '@autopilot/providers',
    '@autopilot/crawler',
    '@autopilot/knowledge',
    '@autopilot/prompts',
    '@autopilot/measurement',
    '@autopilot/scoring',
    '@autopilot/optimization',
    '@autopilot/website',
    '@autopilot/billing',
    '@autopilot/integrations',
    '@autopilot/agent',
    '@autopilot/insights',
    '@autopilot/scan',
    '@autopilot/jobs',
  ],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Defence in depth. These are cheap, and the alternative is discovering their
          // absence during a penetration test.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // React's development overlay — the one that shows you a readable error
              // instead of a blank page — needs eval. Production keeps the strict policy,
              // where React never uses eval at all.
              process.env.NODE_ENV === 'development'
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                : "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ]
  },
}

export default config
