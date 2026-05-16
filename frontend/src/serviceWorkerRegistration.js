export function register(callbacks = {}) {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    const swUrl = `${process.env.PUBLIC_URL}/sw.js`;

    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        // New SW waiting — notify app so it can prompt user to refresh
        reg.onupdatefound = () => {
          const incoming = reg.installing;
          if (!incoming) return;
          incoming.onstatechange = () => {
            if (incoming.state === "installed") {
              if (navigator.serviceWorker.controller) {
                callbacks.onUpdate?.(reg);
              } else {
                callbacks.onSuccess?.(reg);
              }
            }
          };
        };
      })
      .catch((err) => console.error("SW registration failed:", err));
  });
}

export function unregister() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((reg) => reg.unregister())
      .catch(console.error);
  }
}

export function triggerSync() {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: "SYNC_NOW" });
  }
}
