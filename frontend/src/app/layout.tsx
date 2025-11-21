import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Header } from "@/components/Header"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "HS Code Classifier - AI-Powered Export Documentation",
  description: "Reduce HS code classification from 30 minutes to 2 minutes using hybrid AI. Built for Indian exporters.",
  keywords: ["HS code", "export", "classification", "customs", "India", "AI"],
  authors: [{ name: "Aryan" }],
  viewport: "width=device-width, initial-scale=1",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1">
            {children}
          </main>
          <footer className="border-t py-6 md:py-8">
            <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
              <p>
                Building towards DPIIT Recognition & SISFS Seed Funding
              </p>
              <p className="mt-2">
                © 2024 HS Code Classifier. MIT License.
              </p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
