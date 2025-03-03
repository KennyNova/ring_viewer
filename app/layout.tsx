import type { Metadata } from "next";
import "./globals.css";
import { GoogleAnalytics } from '@next/third-parties/google'
import type { Viewport } from 'next'

export const metadata: Metadata = {
  title: "Masina Diamonds 3D Viewer",
  description: "Interactive 3D jewelry viewer for Masina Diamonds",
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className="min-h-screen" lang="en" style={{ fontSize: '16px' }}>
      <body className="h-screen antialiased overflow-x-hidden">
        {children}
        <GoogleAnalytics gaId="G-6J91GF5STM" />
      </body>
    </html>
  );
}
