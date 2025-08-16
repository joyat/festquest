import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { Metadata } from "next";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FestQuest",
  description: "Discover, plan, and chase all the events of the world!",
  themeColor: "#1E1E2F",
  icons: {
    icon: "/fq-icon.svg",               // favicon
    shortcut: "/fq-icon.svg",
    apple: "/fq-icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${jakarta.variable} font-sans bg-[#1E1E2F] text-white min-h-full`}>
        {/* Sticky brand header */}
        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#1E1E2F]/80 backdrop-blur">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3">
              <img src="/fq-icon.svg" alt="FestQuest" className="h-8 w-8 sm:hidden" />
              <img
                src="/festquest-wordmark.svg"
                alt="FestQuest"
                className="h-7 hidden sm:block"
              />
            </a>
            <nav className="text-sm">
              <a href="/" className="hover:text-[#6C63FF]">Search</a>
              <span className="mx-3 opacity-30">•</span>
              <a href="/itinerary" className="hover:text-[#6C63FF]">Itinerary</a>
            </nav>
          </div>
        </header>

        {/* Soft gradient backdrop */}
        <div className="pointer-events-none fixed inset-x-0 top-[-10%] h-[42rem] -z-10
                        bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))]
                        from-[#007BFF33] via-transparent to-transparent blur-2xl" />

        <main className="min-h-[calc(100dvh-8rem)]">{children}</main>

        <footer className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-4 py-6 text-xs text-white/60 flex items-center justify-between">
            <span>© {new Date().getFullYear()} FestQuest</span>
            <span>Made for travelers & festival lovers ✨</span>
          </div>
        </footer>
      </body>
    </html>
  );
}