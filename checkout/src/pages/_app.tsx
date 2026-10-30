import "@/styles/globals.css";
import type { AppProps } from "next/app";
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect } from "react";
import { Toaster } from "sonner";

const META_PIXEL_ID = "1631442295142660";
const UTMIFY_PIXEL_ID = "6ae40cf0387b195022d0ee0d";

function loadTrackingScripts() {
  const w = window as any;

  if (!w.fbq) {
    const fbq: any = function (...args: any[]) {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, args);
      else fbq.queue.push(args);
    };
    w.fbq = fbq;
    if (!w._fbq) w._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    const metaScript = document.createElement("script");
    metaScript.async = true;
    metaScript.src = "https://connect.facebook.net/en_US/fbevents.js";
    const firstScript = document.getElementsByTagName("script")[0];
    if (firstScript?.parentNode) firstScript.parentNode.insertBefore(metaScript, firstScript);
    else document.head.appendChild(metaScript);
  }
  w.fbq("init", META_PIXEL_ID);
  w.fbq("track", "PageView");

  w.pixelId = UTMIFY_PIXEL_ID;
  if (!document.querySelector("[data-site-utmify-pixel]")) {
    const pixelScript = document.createElement("script");
    pixelScript.src = "https://cdn.utmify.com.br/scripts/pixel/pixel.js";
    pixelScript.async = true;
    pixelScript.defer = true;
    pixelScript.setAttribute("data-site-utmify-pixel", "");
    document.head.appendChild(pixelScript);
  }
  if (!document.querySelector("[data-site-utmify-utms]")) {
    const utmsScript = document.createElement("script");
    utmsScript.src = "https://cdn.utmify.com.br/scripts/utms/latest.js";
    utmsScript.async = true;
    utmsScript.defer = true;
    utmsScript.setAttribute("data-utmify-prevent-xcod-sck", "");
    utmsScript.setAttribute("data-utmify-prevent-subids", "");
    utmsScript.setAttribute("data-site-utmify-utms", "");
    document.head.appendChild(utmsScript);
  }
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  useEffect(() => {
    loadTrackingScripts();
  }, []);

  useEffect(() => {
    const trackPageView = () => {
      const fbq = (window as any).fbq;
      if (typeof fbq === "function") fbq("track", "PageView");
    };
    router.events.on("routeChangeComplete", trackPageView);
    return () => router.events.off("routeChangeComplete", trackPageView);
  }, [router.events]);

  return (
    <div>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="robots" content="noindex" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
      </Head>
      <noscript>
        <img height="1" width="1" style={{ display: "none" }} src="https://www.facebook.com/tr?id=1631442295142660&ev=PageView&noscript=1" alt="" />
      </noscript>
      <Component {...pageProps} />
      <Toaster position="top-center" richColors />
    </div>
  );
}
