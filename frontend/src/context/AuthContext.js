import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { api } from "../lib/api";

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
      .then(setUser)
      .catch(() => localStorage.removeItem("posx_token"))
      .finally(() => setAuthLoading(false));
  }, []);

  const login = async (pincode) => {
    const data = await api.login(pincode);
    localStorage.setItem("posx_token", data.token);
    sessionStorage.setItem("posx_session", "1");
    setUser(data.user);
    return data.user;
  };

  const logout = useCallback(() => {
    localStorage.removeItem("posx_token");
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
