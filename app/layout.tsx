import type { Metadata } from "next";
import { EB_Garamond, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const garamond = EB_Garamond({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-garamond",
});

export const metadata: Metadata = {
  title: "Dennis, the AI Native Developer Relations",
  description:
    "Dennis plans the missing @composio/core lesson, writes a runnable TypeScript cookbook, and verifies every block in a Daytona sandbox.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${garamond.variable}`}>
      <body className={`${inter.className} min-h-full bg-background font-sans text-foreground antialiased`}>
        {children}
      </body>
    </html>
  );
}
