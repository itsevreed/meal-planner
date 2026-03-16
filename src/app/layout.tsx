import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'Meal Planner', description: 'Weekly meal planner for two' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" data-theme="light"><body>{children}</body></html>
}
