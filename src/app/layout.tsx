import type { Metadata } from "next";
import "./globals.css";
import { APP_NAME } from "@/lib/format";

export const metadata: Metadata = { title: APP_NAME, description: "LCL consolidation & FCL shipping" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
