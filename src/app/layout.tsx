import type { Metadata } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { GtagLoader } from "@/components/tracking/gtag-loader";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { getAppTitle, getProjectName } from "@/lib/env";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const projectName = getProjectName();
  return {
    title: getAppTitle(),
    description: projectName
      ? `Sistema de tracking com painel — ${projectName}`
      : "Sistema de tracking com painel — Royal Tracking",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${manrope.variable} ${jetbrains.variable} dark h-full`}
    >
      <body className="relative min-h-full font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <TooltipProvider>
            <div className="relative z-10 flex min-h-svh flex-col">
              {children}
            </div>
            <GtagLoader />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
