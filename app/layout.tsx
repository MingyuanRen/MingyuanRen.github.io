import type { Metadata } from "next";
import "./globals.css";
import { profile } from "./content";

export const metadata: Metadata = {
  title: profile.name || "Personal site",
  description: profile.bio || undefined,
  icons: { icon: { url: "/favicon.jpg", type: "image/jpeg" } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
