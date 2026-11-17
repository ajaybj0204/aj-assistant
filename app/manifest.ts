import type { MetadataRoute } from "next";

// App details used by phones and by PWABuilder to make the Android app (APK).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "AJ: My AI Personal Assistant",
    short_name: "AJ",
    description: "Ajay's private AI personal assistant: chat, calls, Gmail, calendar and more.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#07080a",
    theme_color: "#07080a",
    categories: ["productivity", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
