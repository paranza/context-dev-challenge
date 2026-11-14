import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Tender Fit Radar",description:"Evidence-backed tender discovery for Finnish suppliers."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
