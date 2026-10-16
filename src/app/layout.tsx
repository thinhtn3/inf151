import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({ variable: "--font-dm", subsets: ["latin"], weight: ["400", "500", "600"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jb", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "UCI Course Recommender",
  description: "Ranks the courses you're deciding between using who's teaching, student ratings and grade history",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
