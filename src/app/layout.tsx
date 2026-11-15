import type { Metadata } from "next";
import { Manrope, Bodoni_Moda, Geist_Mono } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });
const bodoni = Bodoni_Moda({ subsets: ["latin"], style: ["normal", "italic"], weight: ["400", "500"], variable: "--font-bodoni", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: "Tenderfit | Construction tenders, closer to home",
  description: "Find construction tenders in your region, neighboring countries and across Europe. Start with your company website and compare requirements with source-backed evidence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" className={`${manrope.variable} ${bodoni.variable} ${geistMono.variable}`}><body>{children}</body></html>;
}
