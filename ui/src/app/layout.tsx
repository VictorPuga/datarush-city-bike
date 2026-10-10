import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NYC Bike Forecast",
  description: "Predicted classic and electric bike availability around NYC stations",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
