import { useEffect } from "react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "https://posx-suite.vercel.app";
const INTERVAL_MS = 14 * 60 * 1000; // 14 minutes — Render spins down after 15

export function useKeepAlive() {
  useEffect(() => {
    const ping = () => fetch(`${BACKEND_URL}/api/ping`).catch(() => {});
    ping(); // ping immediately on mount
    const id = setInterval(ping, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
}
