import React, { useCallback, useEffect, useState } from "react";
import { Lock, Store } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useBusiness } from "../context/BusinessContext";

const PIN_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "CLR", "0", "←"];

export default function LoginPage() {
  const { login } = useAuth();
  const { settings } = useBusiness();
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const attemptLogin = useCallback(async (code) => {
    setLoading(true);
    setError("");
    try {
      await login(code);
    } catch (err) {
      setError("Incorrect PIN. Please try again.");
      setPin("");
    } finally {
      setLoading(false);
    }
  }, [login]);

  const handleKey = useCallback((key) => {
    if (loading) return;
    if (key === "⌫" || key === "Backspace") {
      setPin((p) => p.slice(0, -1));
      setError("");
    } else if (/^[0-9]$/.test(key)) {
      setPin((p) => {
        if (p.length >= 6) return p;
        return p + key;
      });
    }
  }, [loading]);

  const handleLoginButton = () => {
    if (pin.length >= 4) attemptLogin(pin);
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") { if (pin.length >= 4) attemptLogin(pin); return; }
      handleKey(e.key);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKey, pin, attemptLogin]);

  const dots = Array.from({ length: 6 }).map((_, i) => ({ filled: i < pin.length }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col bg-white dark:bg-gray-800 rounded-3xl shadow-2xl px-6 py-6">

        {/* Logo + Title */}
        <div className="flex flex-col items-center justify-center py-4">
          <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-blue-200">
            <Store size={30} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">
            {settings?.business_name || "POSx Suite"}
          </h1>
          <p className="text-sm text-gray-400 mt-1">Enter your pincode to continue</p>
        </div>

        {/* PIN label */}
        <div className="flex items-center justify-center gap-1.5 mb-3">
          <Lock size={13} className="text-blue-400" />
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Pincode</span>
        </div>

        {/* PIN dot boxes */}
        <div className="flex justify-center gap-2 mb-1">
          {dots.map((d, i) => (
            <div
              key={i}
              className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center transition-all"
            >
              {d.filled && (
                <div className="w-3.5 h-3.5 rounded-full bg-gray-700 dark:bg-gray-300 transition-all" />
              )}
            </div>
          ))}
        </div>

        {/* Error */}
        <div className="min-h-[22px] mb-3 text-center">
          {error && (
            <p className="text-sm text-red-500 font-medium animate-pulse">{error}</p>
          )}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {PIN_KEYS.map((key, idx) => {
            const isCLR = key === "CLR";
            const isBack = key === "←";
            const isEmpty = key === "";

            return (
              <button
                key={idx}
                disabled={loading || isEmpty}
                onClick={() => {
                  if (isCLR) { setPin(""); setError(""); }
                  else if (isBack) handleKey("⌫");
                  else handleKey(key);
                }}
                className={[
                  "h-14 rounded-2xl font-bold text-xl",
                  "transition-all duration-100 active:scale-95 touch-manipulation",
                  "disabled:opacity-50",
                  isCLR
                    ? "bg-red-500 text-white hover:bg-red-600 shadow-sm shadow-red-200"
                    : isBack
                    ? "bg-gray-500 text-white hover:bg-gray-600 shadow-sm"
                    : isEmpty
                    ? "invisible"
                    : "bg-blue-500 text-white hover:bg-blue-600 shadow-sm shadow-blue-200",
                ].join(" ")}
              >
                {key}
              </button>
            );
          })}
        </div>

        {/* Login button */}
        <button
          onClick={handleLoginButton}
          disabled={loading || pin.length < 4}
          className="w-full py-4 bg-green-500 text-white rounded-2xl font-bold text-base tracking-wide hover:bg-green-600 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-green-200"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Verifying…
            </span>
          ) : "Login"}
        </button>

        <p className="text-center text-xs text-gray-300 mt-3">
          You can also type your PIN on the keyboard
        </p>

        <p className="text-center text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
          Created by <span className="font-bold text-gray-600 dark:text-gray-300 tracking-wide">Whitehat Tech Solutions</span>
        </p>
      </div>
    </div>
  );
}
