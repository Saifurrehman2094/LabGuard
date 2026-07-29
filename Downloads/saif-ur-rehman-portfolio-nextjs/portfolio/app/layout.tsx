import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});

const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Saif ur Rehman — AI Engineer",
  description:
    "Portfolio of Saif ur Rehman, an AI Engineer specializing in agentic AI, generative AI, machine learning, cloud solutions, and full-stack development.",
  keywords: [
    "AI Engineer",
    "Agentic AI",
    "Generative AI",
    "Machine Learning",
    "LLM",
    "Portfolio",
    "Full Stack Development",
    "Cloud Solutions",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="grain bg-ink text-cloud antialiased">{children}</body>
    </html>
  );
}
