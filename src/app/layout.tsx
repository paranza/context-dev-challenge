import type { Metadata } from "next";
import { Manrope, Bodoni_Moda, Geist_Mono } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const bodoni = Bodoni_Moda({ subsets: ["latin"], style: ["normal", "italic"], weight: ["400", "500"], variable: "--font-bodoni", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Tender Fit Radar | Your next contract, already on the radar",
  description: "Find Finnish public tenders that match your business. Compare requirements with public supplier evidence and follow every finding to its source.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${manrope.variable} ${bodoni.variable} ${geistMono.variable}`}><body>{children}</body></html>;
}
