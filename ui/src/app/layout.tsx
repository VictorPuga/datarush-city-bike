import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NYC Bike Forecast",
  description: "Predicted classic and electric bike availability around NYC stations",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
