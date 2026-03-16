import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Meal Planner',
  description: 'High-protein weekly meal planner for couples',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Meal Planner' },
}

export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, maximumScale: 1,
  userScalable: false, viewportFit: 'cover',
  themeColor: '#2d7a4f',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.png" />
        {/* Barcode polyfill for Safari/Firefox */}
        <script src="https://cdn.jsdelivr.net/npm/@undecaf/zbar-wasm@0.9.15/dist/index.js" defer></script>
        <script src="https://cdn.jsdelivr.net/npm/@undecaf/barcode-detector-polyfill@0.9.23/dist/index.js" defer></script>
      </head>
      <body>{children}</body>
    </html>
  )
}
