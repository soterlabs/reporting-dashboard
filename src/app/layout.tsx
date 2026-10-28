import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prime agents · Financial reporting",
  description:
    "Annual income statements and monthly portfolio positions for prime agents, with separate individual, group and combined reporting views.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{document.documentElement.dataset.theme=localStorage.getItem('theme')||'light'}catch{}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
