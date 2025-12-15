
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"] });

export const dynamic = "force-dynamic";

function getMetadataBase(): URL {
  const raw =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.RAILWAY_STATIC_URL ||
    "http://localhost:3000";

  // Normalize common Railway envs that may come without protocol
  const normalized =
    raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;

  try {
    return new URL(normalized);
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  title: "Product Scraper - Extração de Produtos E-commerce",
  description: "Ferramenta automatizada para extrair produtos de categorias de e-commerce com imagens e descrições",
  metadataBase: getMetadataBase(),
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Product Scraper - Extração de Produtos E-commerce",
    description: "Ferramenta automatizada para extrair produtos de categorias de e-commerce com imagens e descrições",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Product Scraper",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
