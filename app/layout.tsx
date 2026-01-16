import type { Metadata } from "next";
import "@/common/assets/styles/globals.css";

export const metadata: Metadata = {
  title: "Cycle",
  description: "Economic Cycle",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
