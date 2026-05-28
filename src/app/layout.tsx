import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthGate } from "@/components/auth/auth-gate";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://boqai-demo.vercel.app"),
  title: {
    default: "BOQ.ai",
    template: "%s | BOQ.ai",
  },
  description: "Agentic BOQ management for construction teams.",
  icons: {
    icon: "/icon.svg",
  },
  openGraph: {
    title: "BOQ.ai",
    description:
      "Four AI agents for construction BOQ, invoice extraction, material matching, and compliance auditing.",
    url: "https://boqai-demo.vercel.app",
    siteName: "BOQ.ai",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "BOQ.ai",
    description:
      "Agentic BOQ management for construction teams.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col overflow-x-hidden">
        <div className="pointer-events-none fixed inset-0 -z-10 opacity-30 blur-3xl">
          <div className="absolute -left-40 top-[-12rem] h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,_rgba(59,130,246,0.85)_0%,_rgba(59,130,246,0.28)_42%,_transparent_70%)]" />
          <div className="absolute -right-36 top-40 h-[36rem] w-[36rem] rounded-full bg-[radial-gradient(circle,_rgba(217,70,239,0.75)_0%,_rgba(217,70,239,0.24)_44%,_transparent_72%)]" />
        </div>
        <AuthGate>{children}</AuthGate>
        <Toaster richColors theme="dark" position="top-right" />
      </body>
    </html>
  );
}
