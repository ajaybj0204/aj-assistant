// Minimal service worker so AJ can be installed as a phone app.
// Network-first: AJ always needs the internet to think.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
