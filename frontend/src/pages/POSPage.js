import React, { useEffect, useRef, useState } from "react";
import {
  CheckCircle2, ChevronDown, Menu, Minus, Monitor, Plus, Printer, Search, ShoppingCart, Trash2, X,
} from "lucide-react";
import { printService } from "../utils/printService";
import { useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBusiness } from "../context/BusinessContext";
import { useBusinessConfig } from "../hooks/useBusinessConfig";
import Sidebar from "../components/Sidebar";
import TerminalSettingsModal from "../components/TerminalSettingsModal";
import { api } from "../lib/api";
import { cn, formatCurrency, userHasPermission, pickDefaultOutlet } from "../lib/utils";
import { priceForOutlet } from "../lib/productPricing";
import { useOffline } from "../context/OfflineContext";

// ─── Payment Modal ─────────────────────────────────────────────────────────────
function PaymentModal({ total, onClose, onConfirm, paymentTypes, customerName, onCustomerNameChange, canApplyDiscount = false }) {
  const defaults = [
    { name: "cash", label: "Cash" },
    { name: "card", label: "Card" },
    { name: "mobile", label: "Mobile Pay" },
    { name: "credit", label: "Credit (Pay Later)" },
  ];
  const methods = paymentTypes?.length
    ? [...paymentTypes.map((p) => ({ name: p.name, label: p.name })), { name: "credit", label: "Credit (Pay Later)" }]
    : defaults;
  const [method, setMethod] = useState(methods[0]?.name || "cash");
  const [amountPaid, setAmountPaid] = useState(total.toFixed(2));
  // Latched in-flight flag — once Confirm fires we never let the same
  // modal session fire again (prevents double-clicks creating two orders).
  const confirmFiredRef = useRef(false);

  // Discount — % or fixed amount, capped at total so the bill can't go negative.
  const [discountOn, setDiscountOn] = useState(false);
  const [discountType, setDiscountType] = useState("pct");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const rawDiscount = !discountOn ? 0
    : discountType === "pct"
      ? Math.max(0, parseFloat(discountValue) || 0) * total / 100
      : Math.max(0, parseFloat(discountValue) || 0);
  const discountAmt = Math.min(rawDiscount, total);
  const dueAmount = Math.max(0, total - discountAmt);

  useEffect(() => { setAmountPaid(dueAmount.toFixed(2)); }, [dueAmount]);

  const isCredit = method === "credit";
  const paid = parseFloat(amountPaid) || 0;
  const change = Math.max(0, paid - dueAmount);
  const discountValid = !discountOn || discountAmt > 0;
  const canConfirm = (!isCredit || customerName?.trim()) && (!discountOn || discountValid);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md flex flex-col max-h-[95vh]">
        {/* Total header */}
        <div className={`p-5 text-white text-center flex-shrink-0 ${isCredit ? "bg-amber-500" : "bg-emerald-500"}`}>
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/75 mb-1">Total Amount</p>
          <p className="text-4xl font-black tabular-nums">{formatCurrency(dueAmount)}</p>
          {discountOn && discountAmt > 0 && (
            <p className="text-[11px] text-white/85 mt-1">
              <span className="font-bold line-through opacity-75">{formatCurrency(total)}</span>
              <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded font-bold">−{formatCurrency(discountAmt)}</span>
            </p>
          )}
        </div>

        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          {/* Payment methods — visual button row */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-1.5">
              Payment Method
            </label>
            <div className="grid grid-cols-2 gap-2">
              {methods.map((m) => {
                const isMethodCredit = m.name === "credit";
                const active = method === m.name;
                return (
                  <button
                    type="button"
                    key={m.name}
                    onClick={() => setMethod(m.name)}
                    className={`py-2.5 px-3 rounded-xl text-sm font-bold border-2 transition-all active:scale-95 capitalize ${
                      active
                        ? isMethodCredit
                          ? "border-amber-500 bg-amber-500 text-white"
                          : "border-emerald-500 bg-emerald-500 text-white"
                        : isMethodCredit
                          ? "border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100"
                          : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Customer name */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-1.5">
              Customer Name {isCredit ? <span className="text-red-400">*</span> : "(Optional)"}
            </label>
            <input
              value={customerName}
              onChange={(e) => onCustomerNameChange(e.target.value)}
              placeholder={isCredit ? "Required for credit" : "Enter customer name"}
              className={`w-full px-3 py-2.5 border-2 rounded-xl text-sm bg-white dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 focus:outline-none transition-colors ${isCredit && !customerName?.trim() ? "border-red-300 dark:border-red-600 focus:border-red-400" : "border-gray-200 dark:border-gray-600 focus:border-emerald-400"}`}
            />
          </div>

          {/* Credit info box */}
          {isCredit && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-700/50 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Credit Sale — Payment Deferred</p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">This order will appear as an open invoice in Accounts.</p>
            </div>
          )}

          {/* Discount — gated by permission */}
          {canApplyDiscount && (
            <div className={cn(
              "border-2 rounded-xl px-3 py-2.5 transition-colors",
              discountOn ? "border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-900/10" : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
            )}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-700 dark:text-gray-200">Discount</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Apply % or fixed amount off this bill</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDiscountOn((v) => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${discountOn ? "bg-amber-500" : "bg-gray-300 dark:bg-gray-600"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${discountOn ? "translate-x-5" : ""}`} />
                </button>
              </div>
              {discountOn && (
                <div className="mt-2.5 space-y-2">
                  <div className="flex gap-2">
                    <div className="flex bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => setDiscountType("pct")}
                        className={cn("px-3 py-1.5 rounded-md text-xs font-bold transition-colors",
                          discountType === "pct" ? "bg-amber-500 text-white" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700")}
                      >%</button>
                      <button
                        type="button"
                        onClick={() => setDiscountType("amt")}
                        className={cn("px-3 py-1.5 rounded-md text-xs font-bold transition-colors",
                          discountType === "amt" ? "bg-amber-500 text-white" : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700")}
                      >Amount</button>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max={discountType === "pct" ? 100 : total}
                      step="0.01"
                      inputMode="decimal"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(e.target.value)}
                      placeholder={discountType === "pct" ? "e.g. 10" : "e.g. 500"}
                      className="flex-1 px-3 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm font-bold text-right bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:border-amber-400"
                    />
                  </div>
                  <input
                    type="text"
                    value={discountReason}
                    onChange={(e) => setDiscountReason(e.target.value)}
                    placeholder="Reason (optional, e.g. staff meal, VIP)"
                    className="w-full px-3 py-1.5 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-xs bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:border-amber-400"
                  />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-500 dark:text-gray-400">Bill before: <span className="font-bold tabular-nums">{formatCurrency(total)}</span></span>
                    <span className="text-amber-700 dark:text-amber-400 font-bold tabular-nums">−{formatCurrency(discountAmt)}</span>
                  </div>
                  {discountOn && discountAmt <= 0 && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">Enter a discount value to apply.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Amount paid — hidden for credit */}
          {!isCredit && (
            <div>
              <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-1.5">
                Amount Paid
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:border-emerald-400 transition-colors font-bold text-xl"
              />
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => setAmountPaid(dueAmount.toFixed(2))} className="flex-1 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-all">Exact</button>
                {[10, 20, 50, 100].map((amt) => (
                  <button key={amt} onClick={() => setAmountPaid(amt.toFixed(2))} className="flex-1 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-all">{amt}</button>
                ))}
              </div>
            </div>
          )}

          {/* Change — hidden for credit */}
          {!isCredit && (() => {
            const shortBy = Math.max(0, dueAmount - paid);
            return shortBy > 0 ? (
              <div className="bg-amber-50 dark:bg-amber-900/30 border-2 border-amber-200 dark:border-amber-700/50 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">Due</span>
                <span className="text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums">{formatCurrency(shortBy)}</span>
              </div>
            ) : (
              <div className="bg-emerald-50 dark:bg-emerald-900/30 border-2 border-emerald-200 dark:border-emerald-700/50 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Change</span>
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(change)}</span>
              </div>
            );
          })()}

        </div>
        {/* Pinned footer — always visible, never scrolled off screen */}
        <div className="px-5 pb-5 pt-3 space-y-2 flex-shrink-0 border-t border-gray-100 dark:border-gray-700/60">
          <button
            onClick={() => {
              if (!canConfirm) return;
              if (confirmFiredRef.current) return;
              confirmFiredRef.current = true;
              const discountInfo = discountOn && discountAmt > 0
                ? { amount: discountAmt, type: discountType, value: parseFloat(discountValue) || 0, reason: discountReason.trim() || null }
                : null;
              onConfirm(method, customerName, discountInfo);
            }}
            disabled={!canConfirm || confirmFiredRef.current}
            className={`w-full py-4 text-white rounded-2xl font-black text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${isCredit ? "bg-amber-500 hover:bg-amber-600 active:bg-amber-700" : "bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700"}`}
          >
            <CheckCircle2 size={18} />
            {isCredit ? "Record Credit Sale" : "Confirm Payment"}
          </button>
          <button
            onClick={onClose}
            className="w-full py-3 border-2 border-gray-200 dark:border-gray-600 rounded-2xl font-bold text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile Cart Sheet ─────────────────────────────────────────────────────────
function MobileCartSheet({
  cart, customerName, setCustomerName,
  subtotal, tax, taxRate, total,
  onClose, onHold, onCharge,
  changeQty, removeFromCart,
  submitting, loadedOrderId, onClearLoaded, canModify,
}) {
  return (
    <div className="fixed inset-0 z-40 bg-white dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
        <h2 className="font-black text-xl text-gray-900 dark:text-white tracking-tight">Your Cart</h2>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full border-2 border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Held order banner */}
      {loadedOrderId && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl flex-shrink-0">
          <div className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0" />
          <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex-1">Held order loaded</span>
          {canModify && <button onClick={onClearLoaded} className="text-amber-400 hover:text-amber-600"><X size={12} /></button>}
        </div>
      )}

      {/* Customer name */}
      <div className="px-4 pt-3 pb-1 flex-shrink-0">
        <input
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Customer name (optional)"
          className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-2xl text-sm bg-gray-50 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-colors"
        />
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <ShoppingCart size={56} className="text-gray-200 dark:text-gray-700 mb-4" />
            <p className="font-bold text-lg text-gray-400">Cart is empty</p>
            <p className="text-sm text-gray-300 dark:text-gray-600 mt-1">Add products from the menu</p>
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {cart.map((item) => (
              <div key={item.product_id} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="font-bold text-gray-900 dark:text-white text-base leading-tight">{item.product_name}</p>
                    <p className="text-sm text-gray-400 mt-0.5">{formatCurrency(item.price)} each</p>
                  </div>
                  {canModify && (
                    <button onClick={() => removeFromCart(item.product_id)} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => changeQty(item.product_id, -1)}
                      className="w-9 h-9 rounded-xl bg-red-500 hover:bg-red-600 active:scale-95 flex items-center justify-center transition-all shadow-sm"
                    >
                      <Minus size={14} className="text-white" />
                    </button>
                    <span className="font-black text-lg text-gray-900 dark:text-white w-6 text-center tabular-nums">{item.quantity}</span>
                    <button
                      onClick={() => changeQty(item.product_id, 1)}
                      className="w-9 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 flex items-center justify-center transition-all shadow-sm"
                    >
                      <Plus size={14} className="text-white" />
                    </button>
                  </div>
                  <p className="font-black text-blue-600 dark:text-blue-400 text-lg tabular-nums">{formatCurrency(item.total)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Totals + actions */}
      {cart.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 px-5 pt-4 pb-8 bg-white dark:bg-gray-900 flex-shrink-0">
          <div className="space-y-2 mb-4">
            <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatCurrency(subtotal)}</span>
            </div>
            {tax > 0 && (
              <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                <span>Tax ({taxRate}%)</span>
                <span className="tabular-nums">{formatCurrency(tax)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-gray-900 dark:text-white text-lg border-t border-gray-100 dark:border-gray-700 pt-2 mt-1">
              <span>Total</span>
              <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(total)}</span>
            </div>
          </div>
          <button
            onClick={onCharge}
            disabled={submitting}
            className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-base hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-40 transition-all"
          >
            Charge {formatCurrency(total)}
          </button>
          <button
            onClick={onHold}
            disabled={submitting}
            className="w-full py-3 mt-2 bg-gray-800 dark:bg-gray-700 text-white rounded-2xl font-bold text-sm hover:bg-gray-900 dark:hover:bg-gray-600 disabled:opacity-40 transition-colors"
          >
            Hold Order
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main POS Page ─────────────────────────────────────────────────────────────
export default function POSPage() {
  const { user } = useAuth();
  const { settings } = useBusiness();
  const config = useBusinessConfig();
  const location = useLocation();
  const { isOnline, queueOrder } = useOffline();

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // Synchronous re-entry locks. setSubmitting is async, so a fast double
  // click can sneak past the disabled={submitting} guard and fire the
  // handler twice — creating two orders or two prints. Refs flip
  // immediately so the second call short-circuits.
  const completeInFlightRef = useRef(false);
  const holdInFlightRef = useRef(false);
  const [toast, setToast] = useState(null);

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("food"); // "food" | "drinks"
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedTerminal, setSelectedTerminal] = useState(
    () => localStorage.getItem("pos_terminal") || ""
  );
  const [selectedOutlet, setSelectedOutlet] = useState(
    () => localStorage.getItem("pos_outlet") || ""
  );
  const [savedTerminalName, setSavedTerminalName] = useState(
    () => localStorage.getItem("pos_terminal_name") || ""
  );
  const [assignedPrinters, setAssignedPrinters] = useState([]);
  const [customerName, setCustomerName] = useState("");

  const [cart, setCart] = useState([]);
  const [loadedOrderId, setLoadedOrderId] = useState(null);
  const canModify = !loadedOrderId || userHasPermission(user, "delete_held_order_items");
  const [showPay, setShowPay] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [showTerminalModal, setShowTerminalModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const incoming = location.state?.loadOrder;
    if (!incoming) return;
    const cartItems = (incoming.items || []).map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name || item.name,
      quantity: item.quantity,
      price: item.price,
      total: item.total,
    }));
    setCart(cartItems);
    setCustomerName(incoming.customer_name || "");
    setLoadedOrderId(incoming.id);
    window.history.replaceState({}, "");
  }, [location.state]);

  useEffect(() => {
    const load = async () => {
      try {
        const [prods, cats, terms, outs, ptypes, assignedPrinters] = await Promise.all([
          api.getProducts(),
          api.getCategories(),
          api.getTerminals(),
          api.getOutlets(),
          api.getPaymentTypes().catch(() => []),
          api.getAssignedPrinters().catch(() => []),
        ]);
        setProducts(prods.filter((p) => p.active !== false));
        setCategories(cats);
        setTerminals(terms);
        setOutlets(outs);
        setPaymentTypes(ptypes);
        setAssignedPrinters(assignedPrinters);
        if (assignedPrinters.length > 0) {
          localStorage.setItem("pos_saved_printers", JSON.stringify(assignedPrinters));
        }
        if (terms.length > 0 && !localStorage.getItem("pos_terminal")) {
          setSelectedTerminal(terms[0].id);
          localStorage.setItem("pos_terminal", terms[0].id);
        }
        if (outs.length > 0 && !localStorage.getItem("pos_outlet")) {
          const main = pickDefaultOutlet(outs);
          if (main) {
            setSelectedOutlet(main.id);
            localStorage.setItem("pos_outlet", main.id);
          }
        }
      } catch {
        showToast("Failed to load data", "error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const addToCart = (product) => {
    showToast(`Added ${product.name} to cart`);
    const unitPrice = priceForOutlet(product, selectedOutlet);
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id
            ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.price }
            : i
        );
      }
      return [
        ...prev,
        { product_id: product.id, product_name: product.name, quantity: 1, price: unitPrice, total: unitPrice },
      ];
    });
  };

  const changeQty = (productId, delta) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.product_id === productId
            ? { ...i, quantity: i.quantity + delta, total: (i.quantity + delta) * i.price }
            : i
        )
        .filter((i) => i.quantity > 0)
    );
  };

  const removeFromCart = (productId) =>
    setCart((prev) => prev.filter((i) => i.product_id !== productId));

  // Tax honors tax_enabled + tax_mode (inclusive/exclusive). See TablePOSPage
  // for the same logic.
  const cartSum = cart.reduce((s, i) => s + i.total, 0);
  const taxRate = parseFloat(settings?.tax_rate || 0);
  const taxMode = (settings?.tax_mode || "exclusive").toLowerCase();
  const taxEnabled = settings?.tax_enabled !== false && taxRate > 0;
  let subtotal, tax, total;
  if (!taxEnabled) {
    subtotal = cartSum;
    tax = 0;
    total = cartSum;
  } else if (taxMode === "inclusive") {
    total = cartSum;
    tax = cartSum * taxRate / (100 + taxRate);
    subtotal = total - tax;
  } else {
    subtotal = cartSum;
    tax = cartSum * taxRate / 100;
    total = cartSum + tax;
  }

  useEffect(() => {
    try {
      const terminalId = JSON.parse(localStorage.getItem("display_terminal_id") || '"terminal-1"');
      const key = `display_order_${terminalId}`;
      if (cart.length === 0) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify({ items: cart, subtotal, customerName, updatedAt: Date.now() }));
      }
    } catch {}
  }, [cart, subtotal, customerName]);

  const TAB_EMOJI = { food: "🍽", drinks: "🥤" };
  const mainTabs = [...new Set(categories.filter((c) => c.main_category).map((c) => c.main_category))]
    .map((mc) => {
      const groupIcon = categories.find((c) => c.main_category === mc && c.icon)?.icon;
      const emoji = groupIcon || TAB_EMOJI[mc] || "";
      return { key: mc, label: `${emoji ? emoji + " " : ""}${mc.charAt(0).toUpperCase() + mc.slice(1)}` };
    });

  const visibleCategories = categories.filter((cat) =>
    activeTab === "all" || cat.main_category === activeTab
  );

  const filtered = products.filter((p) => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === "all" || p.category_id === activeCategory;
    const matchTab =
      activeTab === "all" ||
      categories.find((c) => c.id === p.category_id)?.main_category === activeTab;
    return matchSearch && matchCat && matchTab;
  });

  const buildPayload = (status, paymentMethod, nameOverride, discountInfo, idempotencyKey) => {
    const discAmt = Math.min(Math.max(0, discountInfo?.amount || 0), total);
    return {
      outlet_id: selectedOutlet || outlets[0]?.id || "",
      terminal_id: selectedTerminal || null,
      customer_name: ((nameOverride !== undefined ? nameOverride : customerName).trim()) || null,
      items: cart,
      subtotal,
      tax,
      discount: discAmt,
      total: Math.max(0, total - discAmt),
      payment_method: paymentMethod,
      status,
      service_mode: "counter",
      ...(discountInfo?.reason ? { discount_reason: discountInfo.reason } : {}),
      // Backend swallows a second POST with the same key — catches the
      // 'cashier clicked Confirm twice on bank transfer' duplicates.
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    };
  };

  const handleHold = async () => {
    if (cart.length === 0) { showToast("Add at least one item", "error"); return; }
    if (holdInFlightRef.current) return;
    holdInFlightRef.current = true;
    if (!isOnline) {
      setSubmitting(true);
      try {
        if (loadedOrderId) {
          await queueOrder("update_order", { order_id: loadedOrderId, data: { items: cart, subtotal, total } }, `Update held — ${formatCurrency(total)}`);
        } else {
          await queueOrder("hold", buildPayload("held", "pending"), `Hold — ${formatCurrency(total)}`);
        }
        showToast("Saved offline — will sync when connected");
        setCart([]); setCustomerName(""); setLoadedOrderId(null); setShowCart(false);
      } catch { showToast("Failed to save offline", "error"); }
      finally { setSubmitting(false); holdInFlightRef.current = false; }
      return;
    }
    setSubmitting(true);
    try {
      if (loadedOrderId) {
        await api.updateOrder(loadedOrderId, { items: cart, subtotal, total });
      } else {
        await api.createOrder(buildPayload("held", "pending"));
      }
      showToast("Order held!");
      setCart([]);
      setCustomerName("");
      setLoadedOrderId(null);
      setShowCart(false);
    } catch (err) {
      showToast(err.message || "Failed to hold order", "error");
    } finally {
      setSubmitting(false);
      holdInFlightRef.current = false;
    }
  };

  const handleComplete = async (method, name, discountInfo) => {
    if (completeInFlightRef.current) return;
    completeInFlightRef.current = true;
    setSubmitting(true);
    setShowPay(false);
    if (name !== undefined) setCustomerName(name);
    const discAmt = Math.min(Math.max(0, discountInfo?.amount || 0), total);
    const effectiveTotal = Math.max(0, total - discAmt);
    // One key per checkout session — see TablePOSPage comment.
    const idempotencyKey = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    const receiptData = {
      businessName: settings?.business_name || "Restaurant",
      address: settings?.company_address || settings?.address || "",
      phone: settings?.company_phone || settings?.phone || "",
      logoUrl: settings?.company_logo || settings?.logo_url || "",
      orderNo: loadedOrderId?.slice(-8)?.toUpperCase() || "",
      // Counter mode has no separate waiter — the cashier IS the seller.
      // Print the user's name so the receipt has accountability instead
      // of an empty seller line.
      waiter: user?.name || "",
      cashier: user?.name || "",
      items: cart.map((i) => ({ name: i.product_name, quantity: i.quantity, price: i.price, total: i.total })),
      subtotal,
      taxAmount: tax,
      discount: discAmt,
      total: effectiveTotal,
      paymentMethod: method,
      layoutSettings: settings?.receipt_settings || {},
    };
    if (!isOnline) {
      try {
        if (loadedOrderId) {
          await queueOrder("complete_order", { order_id: loadedOrderId, method, discount: discAmt }, `Complete held — ${formatCurrency(effectiveTotal)}`);
        } else {
          await queueOrder("checkout", buildPayload("completed", method, name, discountInfo, idempotencyKey), `Sale — ${formatCurrency(effectiveTotal)}`);
        }
        // Print the receipt via the LAN bridge so the customer walks away
        // with paper even though the cloud is down. dispatchPrint inside
        // printService tries the bridge first when configured.
        let usbPrinter = assignedPrinters.find((p) => p.mode === "usb" && p.type === "receipt") || null;
        if (!usbPrinter) {
          try {
            const saved = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
            usbPrinter = saved.find((p) => p.mode === "usb" && p.type === "receipt") || null;
          } catch (_) {}
        }
        printService.printReceipt(receiptData, { printer: usbPrinter }).catch(() => {});
        showToast("Saved offline — receipt printed via bridge");
        setCart([]); setCustomerName(""); setLoadedOrderId(null); setShowCart(false);
      } catch {
        showToast("Failed to save offline", "error");
      } finally {
        setSubmitting(false);
        completeInFlightRef.current = false;
      }
      return;
    }
    try {
      if (loadedOrderId) {
        // Pass discount as part of completion so the stored order
        // reflects what the customer actually paid.
        await api.updateOrder(loadedOrderId, {
          status: "completed",
          payment_method: method,
          discount: discAmt,
          total: effectiveTotal,
          ...(discountInfo?.reason ? { discount_reason: discountInfo.reason } : {}),
        });
      } else {
        await api.createOrder(buildPayload("completed", method, name, discountInfo, idempotencyKey));
      }
      showToast("Order completed!");
      let usbPrinter = assignedPrinters.find((p) => p.mode === "usb" && p.type === "receipt") || null;
      if (!usbPrinter) {
        try {
          const saved = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
          usbPrinter = saved.find((p) => p.mode === "usb" && p.type === "receipt") || null;
        } catch (_) {}
      }
      printService.printReceipt(receiptData, { printer: usbPrinter }).catch((e) => showToast(e.message, "error"));
      setCart([]);
      setCustomerName("");
      setLoadedOrderId(null);
      setShowCart(false);
    } catch (err) {
      showToast(err.message || "Failed to complete order", "error");
    } finally {
      setSubmitting(false);
      // Release the lock on both success and failure — POSPage doesn't
      // navigate away after a counter sale, so the cashier needs to be
      // able to ring up the next customer immediately.
      completeInFlightRef.current = false;
    }
  };

  const activeTerminalName =
    terminals.find((t) => t.id === selectedTerminal)?.name
    || (selectedTerminal ? savedTerminalName : "")
    || "None";

  const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="flex h-screen bg-[#111827] overflow-hidden">
      <Sidebar
        onSettingsClick={() => setShowTerminalModal(true)}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex overflow-hidden bg-gray-50 dark:bg-gray-900">
        {/* Product browser */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          <div className={`h-1 bg-gradient-to-r ${config.headerBg} flex-shrink-0`} />
          {/* Top bar */}
          <div className="px-4 pt-4 pb-3 flex gap-3 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden flex items-center justify-center w-10 h-10 rounded-2xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex-shrink-0"
            >
              <Menu size={18} />
            </button>
            <div className="flex-1 relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products..."
                className="w-full pl-9 pr-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-2xl text-sm bg-gray-50 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:bg-white dark:focus:bg-gray-600 focus:outline-none focus:border-blue-400 transition-all"
              />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-blue-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0" title={user?.name}>
                {user?.photo
                  ? <img src={user.photo} alt={user?.name} className="w-full h-full object-cover" />
                  : <span>{(user?.name || "U")[0].toUpperCase()}</span>}
              </div>
            </div>
            <button
              onClick={() => setShowTerminalModal(true)}
              className="flex items-center gap-2 px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-2xl text-sm text-gray-600 dark:text-gray-300 hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/20 transition-all bg-gray-50 dark:bg-gray-700 flex-shrink-0"
            >
              <Monitor size={14} className="text-gray-400 flex-shrink-0" />
              <div className="text-left min-w-0 hidden sm:block">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none whitespace-nowrap">Active Terminal</p>
                <p className="font-semibold text-gray-700 dark:text-gray-200 text-xs mt-0.5 truncate max-w-[80px]">{activeTerminalName}</p>
              </div>
              <ChevronDown size={13} className="text-gray-400 flex-shrink-0 hidden sm:block" />
            </button>
          </div>

          {/* Main category tabs — dynamic from category data */}
          {mainTabs.length > 0 && (
            <div className="px-4 py-3 bg-white dark:bg-gray-800 flex-shrink-0">
              <div className="flex bg-gray-100 dark:bg-gray-700 rounded-2xl p-1 gap-0.5 overflow-x-auto scrollbar-hide">
                {mainTabs.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setActiveTab(key); setActiveCategory("all"); }}
                    className={cn(
                      "flex-1 min-w-fit px-3 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 whitespace-nowrap",
                      activeTab === key
                        ? "bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category pills */}
          <div className="px-4 py-2.5 flex gap-2 overflow-x-auto scrollbar-hide border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
            {visibleCategories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className="px-4 py-1.5 rounded-full text-sm font-semibold transition-all whitespace-nowrap flex-shrink-0"
                style={
                  activeCategory === cat.id
                    ? { backgroundColor: cat.color || "#3B82F6", color: "#fff" }
                    : { backgroundColor: (cat.color || "#3B82F6") + "22", color: cat.color || "#3B82F6" }
                }
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Product grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <ShoppingCart size={40} className="mb-3 opacity-30" />
                <p className="font-semibold">No products found</p>
                <p className="text-sm mt-1 text-gray-400">Add products in Admin → Products</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                {filtered.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-2xl overflow-hidden hover:border-blue-400 hover:shadow-md active:scale-95 transition-all text-left group"
                  >
                    {product.image ? (
                      <img
                        src={api.getImageUrl(product.image)}
                        alt={product.name}
                        className="w-full aspect-square object-cover group-hover:brightness-95 transition-all"
                      />
                    ) : (
                      <div className="w-full aspect-square bg-gradient-to-br from-gray-100 dark:from-gray-600 to-gray-200 dark:to-gray-700 flex items-center justify-center">
                        <ShoppingCart size={22} className="text-gray-300 dark:text-gray-500" />
                      </div>
                    )}
                    <div className="p-3">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight line-clamp-2">
                        {product.name}
                      </p>
                      <p className="font-black text-base mt-1" style={{ color: categories.find(c => c.id === product.category_id)?.color || config.accent }}>
                        {formatCurrency(priceForOutlet(product, selectedOutlet))}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Desktop order panel — hidden on mobile */}
        <div className="hidden lg:flex w-[320px] flex-col bg-white dark:bg-gray-800 flex-shrink-0 border-l border-gray-200 dark:border-gray-700">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
            <h2 className="font-black text-gray-900 dark:text-white text-lg tracking-tight">Current Order</h2>
            {loadedOrderId && (
              <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
                <div className="w-2 h-2 bg-amber-500 rounded-full flex-shrink-0" />
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Held order loaded</span>
                {canModify && (
                  <button
                    onClick={() => { setCart([]); setCustomerName(""); setLoadedOrderId(null); }}
                    className="ml-auto text-amber-400 hover:text-amber-600"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Customer */}
          <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Customer</p>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name (optional)"
              className="w-full px-3.5 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-gray-50 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:bg-white dark:focus:bg-gray-600 focus:outline-none focus:border-blue-400 transition-all"
            />
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 dark:bg-gray-700 flex items-center justify-center mb-3">
                  <ShoppingCart size={28} className="text-gray-300 dark:text-gray-500" />
                </div>
                <p className="font-semibold text-gray-400 text-sm">Cart is empty</p>
                <p className="text-xs text-gray-300 dark:text-gray-500 mt-1">Tap a product to add it</p>
              </div>
            ) : (
              <div className="space-y-1">
                {cart.map((item) => (
                  <div key={item.product_id} className="flex items-center gap-2.5 py-2.5 border-b border-gray-50 dark:border-gray-700 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{item.product_name}</p>
                      <p className="text-xs text-gray-400">{formatCurrency(item.price)} each</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => changeQty(item.product_id, -1)} className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center">
                        <Minus size={11} className="text-gray-600 dark:text-gray-300" />
                      </button>
                      <span className="w-6 text-center font-bold text-sm tabular-nums dark:text-white">{item.quantity}</span>
                      <button onClick={() => changeQty(item.product_id, 1)} className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center">
                        <Plus size={11} className="text-gray-600 dark:text-gray-300" />
                      </button>
                    </div>
                    <p className="text-sm font-black text-gray-900 dark:text-white w-14 text-right flex-shrink-0 tabular-nums">{formatCurrency(item.total)}</p>
                    {canModify && <button onClick={() => removeFromCart(item.product_id)} className="text-gray-300 hover:text-red-400 flex-shrink-0"><X size={14} /></button>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Totals + actions */}
          <div className="border-t border-gray-100 dark:border-gray-700 flex-shrink-0">
            {cart.length > 0 && (
              <div className="px-5 py-3 space-y-1.5">
                <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(subtotal)}</span>
                </div>
                {tax > 0 && (
                  <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>Tax ({taxRate}%)</span>
                    <span className="tabular-nums">{formatCurrency(tax)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-gray-900 dark:text-white text-base">
                  <span>Total</span>
                  <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(total)}</span>
                </div>
              </div>
            )}
            <div className="px-4 pb-4 pt-2 space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={handleHold}
                  disabled={submitting || cart.length === 0}
                  className="flex-1 py-3 bg-gray-800 dark:bg-gray-600 text-white rounded-2xl font-bold text-sm hover:bg-gray-900 dark:hover:bg-gray-500 disabled:opacity-40 transition-colors"
                >
                  Hold
                </button>
                <button
                  onClick={() => {
                    if (cart.length === 0) return;
                    let usbPrinter = assignedPrinters.find((p) => p.mode === "usb" && p.type === "receipt") || null;
                    if (!usbPrinter) {
                      try {
                        const saved = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
                        usbPrinter = saved.find((p) => p.mode === "usb" && p.type === "receipt") || null;
                      } catch (_) {}
                    }
                    printService.printReceipt({
                      businessName: settings?.business_name || "Restaurant",
                      address: settings?.company_address || settings?.address || "",
                      phone: settings?.company_phone || settings?.phone || "",
                      logoUrl: settings?.company_logo || settings?.logo_url || "",
                      orderNo: loadedOrderId?.slice(-8)?.toUpperCase() || "",
                      waiter: "",
                      cashier: user?.name || "",
                      items: cart.map((i) => ({ name: i.product_name, quantity: i.quantity, price: i.price, total: i.total })),
                      subtotal,
                      taxAmount: tax,
                      discount: 0,
                      total,
                      docType: "BILL",
                      layoutSettings: settings?.bill_settings || {},
                    }, { printer: usbPrinter }).catch((e) => showToast(e.message, "error"));
                  }}
                  disabled={cart.length === 0}
                  title="Print Bill"
                  className="w-11 flex items-center justify-center rounded-2xl border-2 border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:border-blue-400 hover:text-blue-600 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  <Printer size={16} />
                </button>
              </div>
              <button
                onClick={() => { if (cart.length > 0) setShowPay(true); }}
                disabled={submitting || cart.length === 0}
                className="w-full py-3 bg-emerald-500 text-white rounded-2xl font-bold text-sm hover:bg-emerald-600 disabled:opacity-40 transition-colors"
              >
                Charge
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile floating cart button */}
      <button
        onClick={() => setShowCart(true)}
        className="fixed bottom-6 right-6 z-30 lg:hidden w-14 h-14 bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-full shadow-2xl shadow-blue-900/40 flex items-center justify-center transition-all"
      >
        <ShoppingCart size={22} className="text-white" />
        {cartItemCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-white text-[11px] font-black flex items-center justify-center shadow-lg">
            {cartItemCount > 9 ? "9+" : cartItemCount}
          </span>
        )}
      </button>

      {/* Mobile cart sheet */}
      {showCart && (
        <MobileCartSheet
          cart={cart}
          customerName={customerName}
          setCustomerName={setCustomerName}
          subtotal={subtotal}
          tax={tax}
          taxRate={taxRate}
          total={total}
          onClose={() => setShowCart(false)}
          onHold={handleHold}
          onCharge={() => { if (cart.length > 0) { setShowCart(false); setShowPay(true); } }}
          changeQty={changeQty}
          removeFromCart={removeFromCart}
          submitting={submitting}
          loadedOrderId={loadedOrderId}
          onClearLoaded={() => { setCart([]); setCustomerName(""); setLoadedOrderId(null); }}
          canModify={canModify}
        />
      )}

      {showTerminalModal && (
        <TerminalSettingsModal
          terminals={terminals}
          outlets={outlets}
          selectedTerminal={selectedTerminal}
          selectedOutlet={selectedOutlet}
          onSave={(term, out) => {
            const name = terminals.find((t) => t.id === term)?.name || "";
            setSelectedTerminal(term);
            setSelectedOutlet(out);
            setSavedTerminalName(name);
            localStorage.setItem("pos_terminal", term);
            localStorage.setItem("pos_outlet", out);
            localStorage.setItem("pos_terminal_name", name);
            setShowTerminalModal(false);
          }}
          onClose={() => setShowTerminalModal(false)}
        />
      )}

      {showPay && (
        <PaymentModal
          total={total}
          paymentTypes={paymentTypes}
          customerName={customerName}
          onCustomerNameChange={setCustomerName}
          onClose={() => setShowPay(false)}
          onConfirm={handleComplete}
          canApplyDiscount={
            ["admin", "manager"].includes(user?.role)
            || userHasPermission(user, "apply_discount")
            || (user?.permissions || []).includes("apply_discounts")
          }
        />
      )}

      {toast && (
        <div
          className={cn(
            "fixed top-4 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold z-[60] flex items-center gap-2 whitespace-nowrap max-w-[90vw]",
            toast.type === "error" ? "bg-red-600 text-white" : "bg-gray-900 text-white"
          )}
        >
          {toast.type !== "error" && <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}
