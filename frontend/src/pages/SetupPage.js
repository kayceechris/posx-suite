import React, { useState } from "react";
import { api } from "../lib/api";
import { useBusiness } from "../context/BusinessContext";
import { useAuth } from "../context/AuthContext";

const BUSINESS_TYPES = [
  { value: "restaurant", label: "Restaurant", emoji: "🍽️", desc: "Full-service dining with table management" },
  { value: "cafe", label: "Café", emoji: "☕", desc: "Coffee shop with order queue" },
  { value: "bar", label: "Bar", emoji: "🍺", desc: "Bar tabs and quick drink service" },
  { value: "nightclub", label: "Nightclub", emoji: "🎵", desc: "VIP tabs and table bookings" },
  { value: "supermarket", label: "Supermarket", emoji: "🛒", desc: "High-volume retail checkout" },
  { value: "retail", label: "Retail", emoji: "🏪", desc: "General retail sales" },
];

export default function SetupPage() {
  const { refreshSettings } = useBusiness();
  const { login } = useAuth();
  const [step, setStep] = useState(1);
  const [businessType, setBusinessType] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [pincode, setPincode] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (pincode !== confirmPin) {
      setError("PINs do not match.");
      return;
    }
    if (pincode.length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }

    setLoading(true);
    try {
      await api.register({
        name: adminName,
        pincode,
        business_type: businessType,
        business_name: businessName,
      });
      await refreshSettings();
      await login(pincode);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary to-blue-700 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden">
        <div className="bg-gradient-to-r from-primary to-blue-700 p-8 text-white text-center">
          <h1 className="font-heading text-3xl font-black mb-1">POSx Suite</h1>
          <p className="font-body text-blue-100 text-sm">First-time Setup</p>
          <div className="flex justify-center gap-2 mt-4">
            {[1, 2].map((s) => (
              <div
                key={s}
                className={`w-8 h-2 rounded-full transition-all ${
                  step >= s ? "bg-white" : "bg-white/30"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="p-8">
          {step === 1 && (
            <div>
              <h2 className="font-heading text-xl font-bold text-gray-900 dark:text-white mb-1">
                Choose Your Business Type
              </h2>
              <p className="font-body text-gray-500 dark:text-gray-400 text-sm mb-6">
                This customizes the entire app experience for your venue.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {BUSINESS_TYPES.map((bt) => (
                  <button
                    key={bt.value}
                    data-testid={`business-type-${bt.value}`}
                    onClick={() => setBusinessType(bt.value)}
                    className={`p-4 rounded-2xl border-2 text-left transition-all duration-150 btn-tactile ${
                      businessType === bt.value
                        ? "border-primary bg-blue-50 dark:bg-blue-900/30"
                        : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-primary/40"
                    }`}
                  >
                    <div className="text-2xl mb-1">{bt.emoji}</div>
                    <div className="font-heading font-bold text-sm text-gray-900 dark:text-white">
                      {bt.label}
                    </div>
                    <div className="font-body text-xs text-gray-500 dark:text-gray-400 leading-tight mt-0.5">
                      {bt.desc}
                    </div>
                  </button>
                ))}
              </div>

              <input
                data-testid="business-name-input"
                type="text"
                placeholder="Business name (e.g. The Golden Fork)"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="mt-4 w-full border-2 border-gray-200 dark:border-gray-600 rounded-2xl px-4 py-3 font-body text-gray-900 dark:text-white dark:bg-gray-700 dark:placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all"
              />

              <button
                data-testid="setup-next-btn"
                disabled={!businessType || !businessName.trim()}
                onClick={() => setStep(2)}
                className="mt-4 w-full bg-primary text-white font-heading font-bold py-3 rounded-2xl border-b-4 border-blue-700 btn-tactile disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Next →
              </button>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit}>
              <h2 className="font-heading text-xl font-bold text-gray-900 dark:text-white mb-1">
                Create Admin Account
              </h2>
              <p className="font-body text-gray-500 dark:text-gray-400 text-sm mb-6">
                You'll use this PIN to log in as the administrator.
              </p>

              <div className="space-y-3">
                <input
                  data-testid="admin-name-input"
                  type="text"
                  placeholder="Your name"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  required
                  className="w-full border-2 border-gray-200 dark:border-gray-600 rounded-2xl px-4 py-3 font-body text-gray-900 dark:text-white dark:bg-gray-700 dark:placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all"
                />
                <input
                  data-testid="admin-pin-input"
                  type="password"
                  inputMode="numeric"
                  placeholder="PIN (4–6 digits)"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  className="w-full border-2 border-gray-200 dark:border-gray-600 rounded-2xl px-4 py-3 font-body text-gray-900 dark:text-white dark:bg-gray-700 dark:placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all"
                />
                <input
                  data-testid="admin-pin-confirm-input"
                  type="password"
                  inputMode="numeric"
                  placeholder="Confirm PIN"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  className="w-full border-2 border-gray-200 dark:border-gray-600 rounded-2xl px-4 py-3 font-body text-gray-900 dark:text-white dark:bg-gray-700 dark:placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/20 transition-all"
                />
              </div>

              {error && (
                <p className="mt-3 text-sm text-destructive font-body">{error}</p>
              )}

              <div className="flex gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-heading font-bold py-3 rounded-2xl border-b-4 border-gray-200 dark:border-gray-600 btn-tactile transition-all"
                >
                  ← Back
                </button>
                <button
                  data-testid="setup-submit-btn"
                  type="submit"
                  disabled={loading}
                  className="flex-[2] bg-primary text-white font-heading font-bold py-3 rounded-2xl border-b-4 border-blue-700 btn-tactile disabled:opacity-50 transition-all"
                >
                  {loading ? "Setting up…" : "Finish Setup"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
