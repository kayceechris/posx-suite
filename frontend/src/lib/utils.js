import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

let _currencySymbol = "₦";

export function setCurrencySymbol(symbol) {
  _currencySymbol = symbol || "₦";
}

export function formatCurrency(amount, symbol) {
  const sym = symbol !== undefined ? symbol : _currencySymbol;
  return `${sym}${Number(amount || 0).toFixed(2)}`;
}

export function timeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins === 1) return "1 min ago";
  if (diffMins < 60) return `${diffMins} mins ago`;

  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs === 1) return "1 hr ago";
  if (diffHrs < 24) return `${diffHrs} hrs ago`;

  return date.toLocaleDateString();
}

export function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
