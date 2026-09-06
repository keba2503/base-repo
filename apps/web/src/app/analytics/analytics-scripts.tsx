import { cookies, headers } from "next/headers";
import { readConsentStatus } from "@/main/privacy";
import { env } from "@/main/env";

function gtmLoaderSource(containerId: string): string {
  return `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({"gtm.start":new Date().getTime(),event:"gtm.js"});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!="dataLayer"?"&l="+l:"";j.async=true;j.src="https://www.googletagmanager.com/gtm.js?id="+i+dl;f.parentNode.insertBefore(j,f);})(window,document,"script","dataLayer","${containerId}");`;
}

export async function AnalyticsScripts() {
  if (env.gtmContainerId === undefined) return null;

  const store = await cookies();
  const { status } = await readConsentStatus(store.get("visitor_id")?.value);
  if (!status.analytics) return null;

  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: gtmLoaderSource(env.gtmContainerId) }} />;
}
