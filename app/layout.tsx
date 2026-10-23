import type { Metadata, Viewport } from "next";
import { Questrial } from "next/font/google";
import "./globals.css";
import { GoogleAnalytics } from "@next/third-parties/google";

const questrial = Questrial({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-questrial",
});

export const metadata: Metadata = {
  title: "3D Ring Viewer | Masina Diamonds",
  description: "Explore Masina Diamonds engagement rings in interactive 3D.",
  icons: {
    icon: "/favicon_io/favicon-32x32.png",
    apple: "/favicon_io/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={questrial.variable}>
      <body className="min-h-screen antialiased">
        {children}
        <GoogleAnalytics gaId="G-6J91GF5STM" />
      </body>
    </html>
  );
}
