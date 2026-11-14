import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: { default: "PawTrack — A little care, a healthier life", template: "%s | PawTrack" }, description: "Your pet's health, thoughtfully organized. Manage every pet's profile in one secure place." };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
