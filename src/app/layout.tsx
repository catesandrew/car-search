import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { NavSidebar } from "@/components/nav-sidebar";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Truck Search",
  description: "Find your next truck",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-foreground">
        <Providers>
          <NavSidebar />
          {/* Desktop: offset for sidebar; mobile: offset for bottom nav */}
          <main className="pb-16 md:ml-16 md:pb-0">
            <div className="mx-auto max-w-6xl p-4 md:p-6">{children}</div>
          </main>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
