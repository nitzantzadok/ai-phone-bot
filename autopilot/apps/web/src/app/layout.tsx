import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'AI Recommendation Autopilot',
  description:
    'Find out where AI systems recommend your business, and fix what is stopping them.',
}

/**
 * The shell.
 *
 * Language and direction come from the customer's setting rather than the browser, because
 * an Israeli business owner may run their phone in English and still want the product in
 * Hebrew. RTL is applied at the document level so every layout primitive inherits it.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  // Wired to the customer preference once accounts exist; Hebrew is the launch default.
  const language = 'en'
  const dir = language === 'en' ? 'ltr' : 'rtl'

  return (
    <html lang={language} dir={dir}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
