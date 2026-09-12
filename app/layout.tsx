import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HackSprint Foundation",
  description: "Daytona + Neo4j Aura + Nosana + Composio integration foundation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">{children}</body>
    </html>
  );
}
