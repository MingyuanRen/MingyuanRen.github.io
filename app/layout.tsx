import type { Metadata } from "next";
import "./globals.css";
import { profile } from "./content";
import { pageMetadata } from "../lib/sharing.mjs";

export const metadata: Metadata = {
  ...pageMetadata({ title: profile.name }),
  icons: { icon: { url: "/favicon.jpg", type: "image/jpeg" } },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
