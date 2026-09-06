import type { Metadata } from "next";
import { cookies } from "next/headers";
import { readConsentStatus } from "@/main/privacy";
import { AnalyticsScripts } from "./analytics/analytics-scripts";
import { CookieBanner } from "./cookie-consent/cookie-banner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Base Repo",
  description: "Next.js base repository",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const store = await cookies();
  const { known } = await readConsentStatus(store.get("visitor_id")?.value);

  return (
    <html lang="es">
      <body>
        <AnalyticsScripts />
        {children}
        <CookieBanner initiallyKnown={known} />
      </body>
    </html>
  );
}
