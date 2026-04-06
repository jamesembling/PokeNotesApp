import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poke Notes",
  description: "Competitive Pokemon TCG notes, logs, and analysis."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
