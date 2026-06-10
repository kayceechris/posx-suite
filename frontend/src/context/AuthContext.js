import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { api } from "../lib/api";
import { saveOfflineCredentials, tryOfflineLogin, warmOfflineCache } from "../utils/offlineAuth";

const AuthContext = createContext(null);

const IDLE_MS   = 15 * 60 * 1000; // 15 minutes until warning
const WARN_MS   =  1 * 60 * 1000; // 1-minute countdown after warning

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [warnCountdown, setWarnCountdown] = useState(null); // null = no warning

  const warnTimer    = useRef(null);
  const logoutTimer  = useRef(null);
  const countInterval= useRef(null);

  useEffect(() => {
    const token = localStorage.getItem("posx_token");
    if (!token) { setAuthLoading(false); return; }

    // If no sessionStorage marker the app was closed and relaunched — force re-login
    if (!sessionStorage.getItem("posx_session")) {
      localStorage.removeItem("posx_token");
      setAuthLoading(false);
      return;
    }

    api.getMe()
      .then((u) => {
        setUser(u);
        try { localStorage.setItem("posx_user", JSON.stringify(u)); } catch {}
      })
      .catch((err) => {
        // Backend unreachable AND we have a cached user blob → stay logged in
        // offline. A real auth failure (401) clears the token.
        const networkError = !err?.status && /fetch|network|cannot reach|offline/i.test(err?.message || "");
        const cached = (() => { try { return JSON.parse(localStorage.getItem("posx_user") || "null"); } catch { return null; } })();
        if (networkError && cached) {
          localStorage.setItem("posx_offline_session", "1");
          setUser(cached);
        } else {
          localStorage.removeItem("posx_token");
          localStorage.removeItem("posx_user");
        }
      })
      .finally(() => setAuthLoading(false));
  }, []);

  // Keep Render free-tier warm. Render spins the backend down after ~15
  // minutes of idle, then the next request pays a 30-60s cold-start.
  // Every open signed-in tab pings /api/ping every 10 minutes; one tab
  // open through the day means the backend never sleeps. Also pings
  // immediately on tab focus to wake it up before the user clicks.
  useEffect(() => {
    if (!user) return;
    const ping = () => { api.ping?.(); };
    ping(); // kick on mount / login
    const id = setInterval(ping, 10 * 60 * 1000);
    const onFocus = () => ping();
    const onVisibility = () => { if (document.visibilityState === "visible") ping(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [user]);

  const login = async (pincode) => {
    let data;
    try {
      data = await api.login(pincode);
    } catch (err) {
      // Network down / backend unreachable → try the locally-cached credential.
      // Only accept the offline fallback when the error looks like a network
      // failure (not an auth rejection from the server).
      const looksLikeNetworkError = !err?.status && /fetch|network|cannot reach|offline/i.test(err?.message || "");
      if (looksLikeNetworkError) {
        const cached = await tryOfflineLogin(pincode);
        if (cached) {
          if (cached.token) localStorage.setItem("posx_token", cached.token);
          sessionStorage.setItem("posx_session", "1");
          localStorage.setItem("posx_offline_session", "1");
          setUser(cached.user);
          return cached.user;
        }
      }
      throw err;
    }
    localStorage.setItem("posx_token", data.token);
    sessionStorage.setItem("posx_session", "1");
    localStorage.removeItem("posx_offline_session");
    try { localStorage.setItem("posx_user", JSON.stringify(data.user)); } catch {}
    setUser(data.user);
    // Cache this user's credential for offline re-login + warm the SW cache
    // with the read-only endpoints the POS needs.
    saveOfflineCredentials(pincode, data.user, data.token);
    warmOfflineCache();
    return data.user;
  };

  const logout = useCallback(() => {
    localStorage.removeItem("posx_token");
    localStorage.removeItem("posx_user");
    localStorage.removeItem("posx_offline_session");
    sessionStorage.removeItem("posx_session");
    setUser(null);
    setWarnCountdown(null);
    clearTimeout(warnTimer.current);
    clearTimeout(logoutTimer.current);
    clearInterval(countInterval.current);
  }, []);

  const resetIdle = useCallback(() => {
    if (!user) return;
    setWarnCountdown(null);
    clearTimeout(warnTimer.current);
    clearTimeout(logoutTimer.current);
    clearInterval(countInterval.current);

    warnTimer.current = setTimeout(() => {
      // Start the visible countdown
      let secs = Math.round(WARN_MS / 1000);
      setWarnCountdown(secs);
      countInterval.current = setInterval(() => {
        secs -= 1;
        setWarnCountdown(secs);
        if (secs <= 0) clearInterval(countInterval.current);
      }, 1000);

      logoutTimer.current = setTimeout(() => {
        logout();
      }, WARN_MS);
    }, IDLE_MS);
  }, [user, logout]);

  // Wire up activity listeners while logged in
  useEffect(() => {
    if (!user) return;
    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    const handle = () => resetIdle();
    events.forEach((e) => window.addEventListener(e, handle, { passive: true }));
    resetIdle();
    return () => {
      events.forEach((e) => window.removeEventListener(e, handle));
      clearTimeout(warnTimer.current);
      clearTimeout(logoutTimer.current);
      clearInterval(countInterval.current);
    };
  }, [user, resetIdle]);

  if (authLoading) return null;

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
      {warnCountdown !== null && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-black text-gray-900 dark:text-white mb-1">Still there?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              You've been idle. Logging out in{" "}
              <span className="font-bold text-yellow-500">{warnCountdown}s</span>.
            </p>
            <button
              onClick={resetIdle}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
            >
              Stay logged in
            </button>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
