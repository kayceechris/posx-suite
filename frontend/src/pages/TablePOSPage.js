import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Bell, CheckCircle2, ChevronDown, ChefHat, Menu, Minus, Monitor, Plus, Printer, Search, ShoppingCart, Trash2, X, GitMerge,
} from "lucide-react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBusiness } from "../context/BusinessContext";
import { useBusinessConfig } from "../hooks/useBusinessConfig";
import Sidebar from "../components/Sidebar";
import TerminalSettingsModal from "../components/TerminalSettingsModal";
import { api } from "../lib/api";
import { cn, formatCurrency, sortByTableNumber, canManageAnyTable, userHasPermission, pickDefaultOutlet } from "../lib/utils";
import { priceForOutlet } from "../lib/productPricing";
import { printService } from "../utils/printService";
import { useOffline } from "../context/OfflineContext";

function TransferModal({ tableId, currentWaiterId, onClose, onTransferred }) {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getUsers()
      .then((list) => setUsers(
        list.filter((u) => u.active && u.id !== currentWaiterId && ["waiter", "cashier", "manager"].includes(u.role))
      ))
      .catch(() => setError("Could not load users"))
      .finally(() => setLoading(false));
  }, [currentWaiterId]);

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      await api.transferTable(tableId, selected);
      onTransferred();
    } catch (err) {
      setError(err.message || "Transfer failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-gradient-to-r from-violet-500 to-purple-600 p-5 text-white">
          <h3 className="font-bold text-lg">Transfer Table</h3>
          <p className="text-white/75 text-sm mt-0.5">Assign this table to another staff member</p>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-7 h-7 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
              {users.length === 0 && <p className="text-center text-gray-400 text-sm py-4">No other staff available</p>}
              {users.map((u) => (
                <button key={u.id} onClick={() => setSelected(u.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all ${
                    selected === u.id
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-900/30"
                      : "border-gray-200 dark:border-gray-600 hover:border-violet-300"
                  }`}>
                  <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center font-bold text-violet-600 dark:text-violet-300 flex-shrink-0">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{u.name}</p>
                    <p className="text-xs text-gray-400 capitalize">{u.role}</p>
                  </div>
                  {selected === u.id && <CheckCircle2 size={16} className="ml-auto text-violet-500" />}
                </button>
              ))}
            </div>
          )}
          {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-2xl font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm">
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={!selected || saving}
              className="flex-[2] py-2.5 bg-violet-600 text-white rounded-2xl font-bold hover:bg-violet-700 disabled:opacity-40 transition-colors text-sm">
              {saving ? "Transferring..." : "Transfer Table"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Move the active order off this table onto a free one (guests swapped
// seats). Lists every available table on the same outlet/floor.
function MoveOrderModal({ fromTableId, onClose, onMove }) {
  const [tables, setTables] = useState([]);
  const [floors, setFloors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.getTables(), api.getFloors().catch(() => [])])
      .then(([t, f]) => { setTables(t); setFloors(f); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const source = tables.find((t) => t.id === fromTableId);
  const candidates = sortByTableNumber(tables.filter(
    (t) => t.id !== fromTableId
      && (!source || t.outlet_id === source.outlet_id)
      && (t.status === "available" || (!t.status && !t.current_order_id))
      && !t.current_order_id
      && !t.merged_into
  ));
  const floorName = (fid) => floors.find((f) => f.id === fid)?.name || "—";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">Move Order to Another Table</h3>
            <p className="text-xs text-gray-400">
              {source ? `From Table ${source.number}` : ""} — pick an available table
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-10 text-center text-sm text-gray-400">Loading tables…</div>
          ) : candidates.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">No free tables in this outlet.</div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {candidates.map((t) => {
                const active = picked === t.id;
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() => setPicked(t.id)}
                    className={`p-2 sm:p-3 rounded-xl border-2 text-center transition-all min-w-0 ${
                      active
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30"
                        : "border-gray-200 dark:border-gray-700 hover:border-blue-300"
                    }`}>
                    <p className="text-base sm:text-lg font-black text-gray-900 dark:text-white truncate">{t.number}</p>
                    <p className="text-[10px] text-gray-400 truncate">{floorName(t.floor_id)}</p>
                    <p className="text-[10px] text-gray-400">{t.seats || 4} seats</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 p-4 flex gap-2">
          <button onClick={onClose}
            className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl font-semibold text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button
            onClick={async () => { setBusy(true); try { await onMove(picked); } finally { setBusy(false); } }}
            disabled={!picked || busy}
            className="flex-[2] py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-40">
            {busy ? "Moving…" : "Move Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PaymentModal({ total, onClose, onConfirm, onSplit, paymentTypes, customerName, onCustomerNameChange, cart = [], canSplit = false, canSplitPayment = false, canApplyDiscount = false, taxRate = 0, taxMode = "exclusive" }) {
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
  const [splitMode, setSplitMode] = useState(false);
  // Latched in-flight flag — once Confirm fires we never let the same
  // modal session fire again. The modal unmounts on the parent closing
  // it, so this ref naturally resets on the next checkout.
  const confirmFiredRef = useRef(false);
  // pay_qty per cart row index. Default = 0 (nothing selected for partial pay).
  const [payQty, setPayQty] = useState(() => cart.map(() => 0));

  // Discount — % or fixed amount applied to the bill. Type 'pct' uses
  // discountValue as a percentage (0-100), 'amt' as a currency amount.
  // The cashier can only access this when canApplyDiscount is true.
  const [discountOn, setDiscountOn] = useState(false);
  const [discountType, setDiscountType] = useState("pct");
  const [discountValue, setDiscountValue] = useState("");
  const [discountReason, setDiscountReason] = useState("");

  // Split-payment by AMOUNT (multi-method) — different from splitMode
  // which splits by ITEMS. Customer pays e.g. 50 cash + 20 card on the
  // SAME items. payLines = [{ method, amount }].
  const [payByMode, setPayByMode] = useState(false);

  // Compute the split subtotal / total from selected items
  const splitSubtotal = cart.reduce(
    (s, item, i) => s + (parseFloat(item.price) || 0) * (payQty[i] || 0),
    0,
  );
  const splitTax = taxMode === "inclusive"
    ? splitSubtotal * taxRate / (100 + taxRate)
    : splitSubtotal * taxRate / 100;
  const splitTotal = taxMode === "inclusive" ? splitSubtotal : splitSubtotal + splitTax;

  // Base total before discount (full bill or selected split items)
  const baseTotal = splitMode ? splitTotal : total;

  // Discount amount in currency. Capped at the base total — we never
  // let the discount drop the bill below zero, even if the cashier
  // enters something silly.
  const rawDiscount = !discountOn ? 0
    : discountType === "pct"
      ? Math.max(0, (parseFloat(discountValue) || 0)) * baseTotal / 100
      : Math.max(0, parseFloat(discountValue) || 0);
  const discountAmt = Math.min(rawDiscount, baseTotal);
  const splitDue = Math.max(0, baseTotal - discountAmt);

  const [payLines, setPayLines] = useState(() => [
    { method: methods[0]?.name || "cash", amount: total.toFixed(2) },
  ]);
  const payLinesSum = payLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const payLinesValid = Math.abs(payLinesSum - splitDue) < 0.01 && payLines.every((l) => l.method && (parseFloat(l.amount) || 0) > 0);

  const [amountPaid, setAmountPaid] = useState(total.toFixed(2));
  // Keep the amount paid in sync with the split selection / discount
  useEffect(() => { setAmountPaid(splitDue.toFixed(2)); }, [splitDue]);
  // Discount applies to the whole bill, not to a split-by-items slice —
  // collapse it when the cashier toggles splitMode on so the math stays sane.
  useEffect(() => { if (splitMode && discountOn) setDiscountOn(false); }, [splitMode, discountOn]);

  const isCredit = method === "credit";
  const paid = parseFloat(amountPaid) || 0;
  const change = Math.max(0, paid - splitDue);
  const anyPicked = payQty.some((q) => q > 0);
  const discountValid = !discountOn || (discountAmt > 0 && discountAmt <= baseTotal);
  const canConfirm =
    (payByMode ? payLinesValid : (!isCredit || customerName?.trim()))
    && (!splitMode || anyPicked)
    && (!discountOn || discountValid);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-md flex flex-col max-h-[95vh]">
        <div className={`p-5 text-white text-center flex-shrink-0 ${isCredit ? "bg-amber-500" : "bg-emerald-500"}`}>
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/75 mb-1">
            {splitMode ? "Paying Now" : "Total Amount"}
          </p>
          <p className="text-4xl font-black tabular-nums">{formatCurrency(splitDue)}</p>
          {discountOn && discountAmt > 0 && (
            <p className="text-[11px] text-white/85 mt-1">
              Discount applied: <span className="font-bold line-through opacity-75">{formatCurrency(baseTotal)}</span>
              <span className="ml-1.5 px-1.5 py-0.5 bg-white/20 rounded font-bold">−{formatCurrency(discountAmt)}</span>
            </p>
          )}
          {splitMode && (
            <p className="text-[11px] text-white/75 mt-1">
              Remaining held: <span className="font-bold">{formatCurrency(Math.max(0, total - splitTotal))}</span>
            </p>
          )}
        </div>
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          {/* Split toggle */}
          {canSplit && cart.length > 0 && (
            <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
              <div>
                <p className="text-xs font-bold text-gray-700 dark:text-gray-200">Split bill</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Pay for some items now, hold the rest</p>
              </div>
              <button
                type="button"
                onClick={() => setSplitMode((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors ${splitMode ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${splitMode ? "translate-x-5" : ""}`} />
              </button>
            </div>
          )}

          {/* Per-item split picker */}
          {splitMode && (
            <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl divide-y divide-gray-100 dark:divide-gray-700/50 max-h-56 overflow-y-auto">
              {cart.map((item, i) => {
                const max = item.quantity || 0;
                const q = payQty[i] || 0;
                return (
                  <div key={i} className="px-3 py-2 flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{item.product_name}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">{formatCurrency(item.price)} × <span className="font-bold">{q}</span> of {max}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button type="button" onClick={() => setPayQty((arr) => arr.map((v, j) => j === i ? Math.max(0, v - 1) : v))}
                        className="w-7 h-7 rounded-lg border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-700">−</button>
                      <input type="number" min="0" max={max} value={q}
                        onChange={(e) => {
                          const n = Math.max(0, Math.min(max, parseInt(e.target.value) || 0));
                          setPayQty((arr) => arr.map((v, j) => j === i ? n : v));
                        }}
                        className="w-10 h-7 text-center border-2 border-gray-200 dark:border-gray-600 rounded-lg text-xs font-bold bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:border-emerald-400" />
                      <button type="button" onClick={() => setPayQty((arr) => arr.map((v, j) => j === i ? Math.min(max, v + 1) : v))}
                        className="w-7 h-7 rounded-lg border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 font-bold text-sm hover:bg-gray-50 dark:hover:bg-gray-700">+</button>
                    </div>
                  </div>
                );
              })}
              <div className="px-3 py-1.5 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50">
                <button type="button" onClick={() => setPayQty(cart.map(() => 0))}
                  className="text-[11px] font-semibold text-gray-500 hover:text-gray-700">Clear</button>
                <button type="button" onClick={() => setPayQty(cart.map((it) => it.quantity || 0))}
                  className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700">Select all</button>
              </div>
            </div>
          )}

          {/* Split-PAYMENT toggle (multi-method) — only when not splitting by items */}
          {canSplitPayment && !splitMode && (
            <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
              <div>
                <p className="text-xs font-bold text-gray-700 dark:text-gray-200">Split payment</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Mix cash, card, transfer for one bill</p>
              </div>
              <button
                type="button"
                onClick={() => setPayByMode((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors ${payByMode ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${payByMode ? "translate-x-5" : ""}`} />
              </button>
            </div>
          )}

          {/* Split-payment editor */}
          {payByMode && !splitMode && (
            <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl p-2 space-y-2">
              {payLines.map((line, i) => (
                <div key={i} className="flex flex-wrap gap-2 items-center">
                  <select value={line.method}
                    onChange={(e) => setPayLines((arr) => arr.map((l, j) => j === i ? { ...l, method: e.target.value } : l))}
                    className="basis-full sm:basis-0 sm:flex-1 min-w-0 px-2 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:border-emerald-400">
                    {methods.filter((m) => m.name !== "credit").map((m) => (
                      <option key={m.name} value={m.name}>{m.label}</option>
                    ))}
                  </select>
                  <input type="number" min="0" step="0.01" value={line.amount}
                    inputMode="decimal"
                    onChange={(e) => setPayLines((arr) => arr.map((l, j) => j === i ? { ...l, amount: e.target.value } : l))}
                    className="flex-1 sm:flex-none sm:w-28 px-2 py-2 border-2 border-gray-200 dark:border-gray-600 rounded-lg text-sm text-right font-bold bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:border-emerald-400" />
                  {payLines.length > 1 && (
                    <button type="button"
                      onClick={() => setPayLines((arr) => arr.filter((_, j) => j !== i))}
                      className="w-8 h-8 flex items-center justify-center text-red-400 hover:text-red-600 flex-shrink-0">
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between text-[11px] pt-1">
                <button type="button"
                  onClick={() => {
                    const remaining = Math.max(0, splitDue - payLinesSum);
                    setPayLines((arr) => [...arr, { method: methods[0]?.name || "cash", amount: remaining.toFixed(2) }]);
                  }}
                  className="font-semibold text-emerald-600 hover:text-emerald-700">+ Add payment</button>
                <span className={cn("font-bold tabular-nums",
                  Math.abs(payLinesSum - splitDue) < 0.01 ? "text-emerald-600" : "text-amber-600")}>
                  {formatCurrency(payLinesSum)} / {formatCurrency(splitDue)}
                </span>
              </div>
              {Math.abs(payLinesSum - splitDue) >= 0.01 && (
                <p className="text-[10px] text-amber-600 dark:text-amber-400">
                  {payLinesSum < splitDue
                    ? `Short by ${formatCurrency(splitDue - payLinesSum)}`
                    : `Over by ${formatCurrency(payLinesSum - splitDue)}`}
                </p>
              )}
            </div>
          )}

          {/* Payment methods — visual button row (hidden in split-payment mode) */}
          {!payByMode && (
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
          )}

          {/* Customer name */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-1.5">
              Customer {isCredit ? <span className="text-red-400">*</span> : "(Optional)"}
            </label>
            <input
              value={customerName || ""}
              onChange={(e) => onCustomerNameChange?.(e.target.value)}
              placeholder={isCredit ? "Required for credit" : "Customer name"}
              className={`w-full px-3 py-2.5 border-2 rounded-xl text-sm bg-white dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 focus:outline-none transition-colors ${isCredit && !customerName?.trim() ? "border-red-300 dark:border-red-600 focus:border-red-400" : "border-gray-200 dark:border-gray-600 focus:border-emerald-400"}`}
            />
          </div>

          {/* Credit info */}
          {isCredit && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border-2 border-amber-200 dark:border-amber-700/50 rounded-xl px-4 py-3">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Credit Sale — Payment Deferred</p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-0.5">This order will appear as an open invoice in Accounts.</p>
            </div>
          )}

          {/* Discount — gated by permission. Cashier picks % or fixed amount;
              we cap at baseTotal so the bill never goes negative. Hidden
              in split-by-items mode because the discount belongs to the
              whole bill, not to the items chunk going to the kitchen split. */}
          {canApplyDiscount && !splitMode && (
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
                      max={discountType === "pct" ? 100 : baseTotal}
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
                    <span className="text-gray-500 dark:text-gray-400">
                      Bill before: <span className="font-bold tabular-nums">{formatCurrency(baseTotal)}</span>
                    </span>
                    <span className="text-amber-700 dark:text-amber-400 font-bold tabular-nums">
                      −{formatCurrency(discountAmt)}
                    </span>
                  </div>
                  {discountOn && discountAmt <= 0 && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">Enter a discount value to apply.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Amount paid — hidden in split-payment mode (each line has its own amount) */}
          {!isCredit && !payByMode && (
            <div>
              <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-1.5">
                Amount Paid
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className="w-full px-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:border-emerald-400 font-bold text-xl"
              />
              <div className="flex gap-1.5 mt-2">
                <button onClick={() => setAmountPaid(splitDue.toFixed(2))} className="flex-1 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-all">Exact</button>
                {[10, 20, 50, 100].map((amt) => (
                  <button key={amt} onClick={() => setAmountPaid(amt.toFixed(2))} className="flex-1 py-2 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-all">{amt}</button>
                ))}
              </div>
            </div>
          )}

          {/* Change — only meaningful for single-method, non-credit payments */}
          {!isCredit && !payByMode && (() => {
            const shortBy = Math.max(0, splitDue - paid);
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
              // Synchronous double-fire guard — the parent's setSubmitting
              // hasn't propagated back into this modal yet on a fast double
              // click, so without this ref we'd fire onConfirm twice and
              // create two orders. The ref flips immediately and never
              // resets (the modal unmounts on success or on cancel).
              if (confirmFiredRef.current) return;
              confirmFiredRef.current = true;
              const discountInfo = discountOn && discountAmt > 0
                ? { amount: discountAmt, type: discountType, value: parseFloat(discountValue) || 0, reason: discountReason.trim() || null }
                : null;
              if (splitMode) {
                const paid_items = cart
                  .map((item, i) => ({
                    product_id:   item.product_id,
                    product_name: item.product_name,
                    quantity:     payQty[i] || 0,
                    price:        item.price,
                    category_id:  item.category_id,
                  }))
                  .filter((p) => p.quantity > 0);
                onSplit?.(method, paid_items, customerName, discountInfo);
              } else if (payByMode) {
                // Compose a payment_method description like "cash 5000 + card 2000"
                const composed = payLines
                  .filter((l) => (parseFloat(l.amount) || 0) > 0)
                  .map((l) => `${l.method} ${formatCurrency(parseFloat(l.amount) || 0)}`)
                  .join(" + ");
                onConfirm(composed || method, customerName, discountInfo);
              } else {
                onConfirm(method, customerName, discountInfo);
              }
            }}
            disabled={!canConfirm || confirmFiredRef.current}
            className={`w-full py-4 text-white rounded-2xl font-black text-base transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${isCredit ? "bg-amber-500 hover:bg-amber-600 active:bg-amber-700" : "bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700"}`}
          >
            <CheckCircle2 size={18} />
            {splitMode ? "Pay & Hold Rest" : payByMode ? "Confirm Split Payment" : isCredit ? "Record Credit Sale" : "Confirm Payment"}
          </button>
          <button onClick={onClose} className="w-full py-3 border-2 border-gray-200 dark:border-gray-600 rounded-2xl font-bold text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TablePOSPage() {
  const { tableId, barTabId } = useParams();
  const { user } = useAuth();
  const { settings } = useBusiness();
  const config = useBusinessConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const { isOnline, queueOrder } = useOffline();

  const isBarTab = !!barTabId;
  const entityId = tableId || barTabId;

  const [entity, setEntity] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [floors, setFloors] = useState([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  // Synchronous in-flight locks. React state updates are async — a fast
  // double-click can fire both clicks before setSubmitting(true) renders,
  // letting the second click sneak past the disabled={submitting} guard.
  // Refs flip immediately so the second call short-circuits.
  const completeInFlightRef = useRef(false);
  const kitchenInFlightRef = useRef(false);
  const printInFlightRef = useRef(false);
  const holdInFlightRef = useRef(false);
  const billInFlightRef = useRef(false);

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("food");
  const [activeCategory, setActiveCategory] = useState("all");
  const [currentOrderNumber, setCurrentOrderNumber] = useState("");
  const [selectedTerminal, setSelectedTerminal] = useState(
    () => localStorage.getItem("pos_terminal") || ""
  );
  const [selectedOutlet, setSelectedOutlet] = useState(
    () => localStorage.getItem("pos_outlet") || ""
  );
  const [showTerminalModal, setShowTerminalModal] = useState(false);
  const [customerName, setCustomerName] = useState("");

  const [cart, setCart] = useState([]);
  const [originalItems, setOriginalItems] = useState([]); // items from the loaded order (any status)
  const [kitchenSentItems, setKitchenSentItems] = useState([]); // snapshot of what kitchen has actually printed
  const [mergedTables, setMergedTables] = useState([]);
  const [mergedOrders, setMergedOrders] = useState([]);
  const [showPay, setShowPay] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [prods, cats, terms, outs, ptypes, flrs, entityData] = await Promise.all([
          api.getProducts(),
          api.getCategories(),
          api.getTerminals(),
          api.getOutlets(),
          api.getPaymentTypes().catch(() => []),
          isBarTab ? Promise.resolve([]) : api.getFloors().catch(() => []),
          isBarTab ? api.getBarTabs().then((list) => list.find((b) => b.id === entityId)) : api.getTables().then((list) => list.find((t) => t.id === entityId)),
        ]);
        setProducts(prods.filter((p) => p.active !== false));
        setCategories(cats);
        setTerminals(terms);
        setOutlets(outs);
        setPaymentTypes(ptypes);
        setFloors(flrs || []);
        // Auto-select terminal/outlet on first login (if nothing saved yet).
        // Prefer "Main Restaurant" outlet; fall back to the first one found.
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

        // Auth guard: waiter/cashier can only access their own occupied
        // table. The TABLE's waiter_id can drift (denormalized), so we
        // derive the canonical owner from the linked ORDER's created_by
        // — that field is locked from updates and is the source of truth.
        if (entityData && entityData.status === "occupied") {
          // 'Privileged' means anyone allowed to act on someone else's
          // table — admin / manager / a custom role like 'Floor Manager'
          // that holds process_payment, close_order, manage_tables, etc.
          const isPrivileged = canManageAnyTable(user);
          let existingOrder = null;
          if (entityData.current_order_id) {
            try { existingOrder = await api.getOrder(entityData.current_order_id); } catch {}
          }
          const trueOwnerId   = existingOrder?.created_by      || entityData[isBarTab ? "staff_id"   : "waiter_id"];
          const trueOwnerName = existingOrder?.created_by_name || entityData[isBarTab ? "staff_name" : "waiter_name"];

          if (!isPrivileged && trueOwnerId && trueOwnerId !== user?.id) {
            showToast(`This ${isBarTab ? "bar tab" : "table"} belongs to ${trueOwnerName || "another waiter"}`, "error");
            navigate("/tables", { replace: true });
            return;
          }

          // Self-heal: if the table's denormalized waiter_name disagrees
          // with the order's locked owner, patch entityData in-memory so
          // the header shows the right name immediately (and we avoid
          // reading the wrong waiter into receipts / kitchen tickets).
          if (existingOrder && !isBarTab) {
            if (entityData.waiter_id !== existingOrder.created_by ||
                entityData.waiter_name !== existingOrder.created_by_name) {
              entityData = {
                ...entityData,
                waiter_id:   existingOrder.created_by,
                waiter_name: existingOrder.created_by_name,
              };
            }
          }

          // Load the existing order into the cart
          if (existingOrder?.items?.length) {
            const loaded = existingOrder.items.map((item) => {
              const qty = item.quantity || item.qty || 1;
              const price = Number(item.price) || 0;
              const storedTotal = Number(item.total);
              const fresh = price * qty;
              // Defensive: if the stored line total disagrees with
              // price × quantity (e.g. a held order where qty was
              // edited but the saved total wasn't recomputed), trust
              // the math. The cart's running total and the printed
              // receipt both read item.total, so a stale value here
              // is what makes the receipt appear to show a different
              // amount from the app's total.
              const total = (!Number.isFinite(storedTotal) || Math.abs(storedTotal - fresh) > 0.001)
                ? fresh
                : storedTotal;
              return {
                product_id: item.product_id,
                product_name: item.product_name || item.name,
                category_id: item.category_id || "",
                quantity: qty,
                price,
                total,
              };
            });
            setCart(loaded);
            setOriginalItems(loaded);
            // Prefer the persisted kitchen snapshot when available — that's
            // the authoritative record of what the kitchen has actually
            // printed. Falls back to: items if status is sent_to_kitchen
            // (legacy orders without the snapshot), or empty for held.
            // This is what makes 'click Hold again → don't reprint' work
            // across page reloads and across devices.
            const persistedSnapshot = Array.isArray(existingOrder.kitchen_sent_items) ? existingOrder.kitchen_sent_items : null;
            if (persistedSnapshot) {
              setKitchenSentItems(persistedSnapshot.map((it) => ({
                product_id:   it.product_id,
                product_name: it.product_name || it.name,
                category_id:  it.category_id || "",
                quantity:     it.quantity || it.qty || 0,
                price:        it.price,
                total:        it.total,
              })));
            } else {
              setKitchenSentItems(existingOrder.status === "sent_to_kitchen" ? loaded : []);
            }
          }
          if (existingOrder?.customer_name) setCustomerName(existingOrder.customer_name);
          if (existingOrder?.order_number) setCurrentOrderNumber(existingOrder.order_number);
        }
        setEntity(entityData || null);

        // Load tables merged into this one (not bar tabs)
        if (!isBarTab && entityData) {
          try {
            const allTables = await api.getTables();
            const merged = allTables.filter((t) => t.merged_into === entityId);
            setMergedTables(merged);
            if (merged.length > 0) {
              const orders = await Promise.all(
                merged.filter((t) => t.current_order_id).map((t) =>
                  api.getOrder(t.current_order_id).catch(() => null)
                )
              );
              setMergedOrders(orders.filter(Boolean));
            }
          } catch { /* non-fatal */ }
        }
      } catch (err) {
        showToast("Failed to load data", "error");
      } finally {
        setLoading(false);
      }
    };
    load();
    api.getAssignedPrinters().then((printers) => {
      if (printers.length > 0) localStorage.setItem("pos_saved_printers", JSON.stringify(printers));
    }).catch(() => {});
  }, [entityId, isBarTab]);

  // Poll just for the KDS "food ready" flag while a waiter is sitting on
  // this table/bar tab — the load effect above only fetches it once on
  // mount, so without this the ready banner would never appear unless the
  // page was reloaded. Merges only kitchen_status so it can't clobber any
  // other locally-reconciled entity field (waiter name, merged order, etc).
  useEffect(() => {
    if (!entityId) return;
    const poll = () => {
      (isBarTab ? api.getBarTabs() : api.getTables())
        .then((list) => {
          const fresh = list.find((t) => t.id === entityId);
          if (fresh) setEntity((prev) => prev ? { ...prev, kitchen_status: fresh.kitchen_status } : prev);
        })
        .catch(() => {});
    };
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [entityId, isBarTab]);

  // Cart handed off from OfflineBanner's "Reassign" action (a queued hold
  // whose original table was already claimed by someone else) or from
  // HeldOrdersPage — mirrors the same location.state.loadOrder pattern
  // POSPage.js already uses for quick-service. Only pre-fills an empty
  // cart so it can't clobber items already loaded from an existing order
  // on this table.
  useEffect(() => {
    const incoming = location.state?.loadOrder;
    if (!incoming || cart.length > 0) return;
    const cartItems = (incoming.items || []).map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name || item.name,
      category_id: item.category_id || "",
      quantity: item.quantity,
      price: item.price,
      total: item.total,
    }));
    setCart(cartItems);
    if (incoming.customer_name) setCustomerName(incoming.customer_name);
    showToast(`${cartItems.length} item${cartItems.length !== 1 ? "s" : ""} loaded — review and send to kitchen`);
    window.history.replaceState({}, "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const addToCart = (product) => {
    const unitPrice = priceForOutlet(product, entity?.outlet_id || selectedOutlet);
    setCart((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product_id === product.id
            ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.price }
            : i
        );
      }
      return [...prev, {
        product_id: product.id,
        product_name: product.name,
        category_id: product.category_id || "",
        quantity: 1,
        price: unitPrice,
        total: unitPrice,
      }];
    });
  };

  const changeQty = (productId, delta) => {
    if (isWaiter && kitchenSentItems.some((s) => s.product_id === productId)) return;
    setCart((prev) => {
      const next = prev.map((i) =>
        i.product_id === productId
          ? { ...i, quantity: i.quantity + delta, total: (i.quantity + delta) * i.price }
          : i
      ).filter((i) => i.quantity > 0);
      // If the qty drop wiped the line entirely, also drop it from the
      // kitchen baseline so a later re-add is treated as a brand new
      // line — the kitchen needs the new ticket because the previous
      // print was effectively cancelled.
      if (!next.some((i) => i.product_id === productId)) {
        setKitchenSentItems((sent) => sent.filter((s) => s.product_id !== productId));
      }
      return next;
    });
  };

  const removeFromCart = (productId) => {
    setCart((prev) => prev.filter((i) => i.product_id !== productId));
    // Same reasoning as changeQty above — re-adding a removed item must
    // print a fresh kitchen docket, so drop the baseline entry.
    setKitchenSentItems((sent) => sent.filter((s) => s.product_id !== productId));
  };

  // Tax handling honors tax_enabled + tax_mode (inclusive/exclusive).
  //   exclusive: cart prices exclude tax — tax is added on top, total > subtotal
  //   inclusive: cart prices already include tax — total = subtotal, we just
  //              compute the tax portion for display on the receipt
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
  const mergedTotal = mergedOrders.reduce((s, o) => s + (o.total || 0), 0);
  const combinedTotal = total + mergedTotal;
  const isMerged = mergedTables.length > 0;

  const TAB_EMOJI = { food: "🍽", drinks: "🥤" };
  const mainTabs = [...new Set(categories.filter((c) => c.main_category).map((c) => c.main_category))]
    .map((mc) => {
      const groupIcon = categories.find((c) => c.main_category === mc && c.icon)?.icon;
      const emoji = groupIcon || TAB_EMOJI[mc] || "";
      return { key: mc, label: `${emoji ? emoji + " " : ""}${mc.charAt(0).toUpperCase() + mc.slice(1)}` };
    });

  const visibleCategories = categories.filter((cat) =>
    cat.main_category === activeTab
  );

  const filtered = products.filter((p) => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCat = activeCategory === "all" || p.category_id === activeCategory;
    const matchTab = categories.find((c) => c.id === p.category_id)?.main_category === activeTab;
    return matchesSearch && matchesCat && matchTab;
  });

  const outlet = outlets[0] || null;
  const floorName = !isBarTab ? (floors.find((f) => f.id === entity?.floor_id)?.name || "") : "";

  const buildOrderPayload = (status, paymentMethod, nameOverride, discountInfo, idempotencyKey) => {
    const discAmt = Math.min(Math.max(0, discountInfo?.amount || 0), total);
    return {
      outlet_id: entity?.outlet_id || outlet?.id || "",
      terminal_id: selectedTerminal || null,
      table_id: isBarTab ? null : entityId,
      table_number: isBarTab ? null : entity?.number,
      bar_tab_id: isBarTab ? entityId : null,
      customer_name: (nameOverride !== undefined ? nameOverride : customerName).trim() || null,
      items: cart,
      subtotal,
      tax,
      discount: discAmt,
      total: Math.max(0, total - discAmt),
      payment_method: paymentMethod,
      status,
      service_mode: isBarTab ? "bar_tab" : "table_service",
      ...(discountInfo?.reason ? { discount_reason: discountInfo.reason } : {}),
      // Stable per-checkout key. The backend swallows a second POST with
      // the same key, so a network retry, an offline queue replay, or a
      // double-fire that beats the in-flight ref-guard can't create a
      // second order row.
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    };
  };

  const hasWaiterModule =
    (config.hasKitchen !== false)
    && (!settings?.service_mode || settings.service_mode !== "quick_service");

  const isWaiter = user?.role === "waiter";
  const canPrintBill = cart.length > 0 && !isWaiter;
  const canCharge = !isWaiter;
  const isHeldOrder = !!(entity?.current_order_id);
  const canModify = !isHeldOrder || userHasPermission(user, "delete_held_order_items");
  const canMoveOrder = userHasPermission(user, "move_order") || entity?.waiter_id === user?.id;

  // Split bill (by items) and split payment (by methods) are gated by
  // permission so a plain waiter can be restricted from these flows.
  // Admin/manager always have access; everyone else needs the perm,
  // or process_payment / process_sales as a reasonable fallback.
  const _perms = user?.permissions || [];
  const _isPriv = ["admin", "manager"].includes(user?.role);
  const hasSplitBillPerm    = _isPriv || _perms.some((p) => ["split_bill", "process_payment", "process_sales"].includes(p));
  const hasSplitPaymentPerm = _isPriv || _perms.some((p) => ["split_bill", "process_payment", "process_sales"].includes(p));
  const hasApplyDiscountPerm = _isPriv || _perms.some((p) => ["apply_discount", "apply_discounts"].includes(p));

  const handleMoveOrder = async (toTableId) => {
    if (!toTableId) return;
    try {
      await api.moveOrderToTable(entityId, toTableId);
      showToast("Order moved.");
      setShowMove(false);
      navigate(`/table/${toTableId}`, { replace: true });
    } catch (err) {
      showToast(err.message || "Move failed", "error");
    }
  };

  const handlePrintBill = () => {
    // Same debounce pattern as receipt — a fast double-click can fire
    // two prints because the dispatch path is async and the button
    // isn't disabled mid-flight.
    if (billInFlightRef.current) return;
    billInFlightRef.current = true;
    setTimeout(() => { billInFlightRef.current = false; }, 1500);
    let usbPrinter = null;
    try {
      const saved = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
      usbPrinter = saved.find((x) => x.mode === "usb" && x.type === "receipt") || null;
    } catch (_) {}
    printService.printReceipt({
      businessName: settings?.business_name || "Restaurant",
      address: settings?.company_address || settings?.address || "",
      phone: settings?.company_phone || settings?.phone || "",
      logoUrl: settings?.company_logo || settings?.logo_url || "",
      tableName: `${isBarTab ? "Bar Tab" : "Table"} ${entity?.number || ""}`,
      floorName,
      orderNo: currentOrderNumber || entity?.current_order_id?.slice(-8)?.toUpperCase() || "",
      // Waiter on bill — always show someone. Prefer the table's assigned
      // waiter (set when a waiter picks up the table), fall back to staff_name
      // (older field), finally fall back to the current operator so the bill
      // always has accountability for who took the order.
      waiter: entity?.waiter_name || entity?.staff_name || user?.name || "",
      cashier: user?.name || "",
      items: cart.map((i) => ({ name: i.product_name, quantity: i.quantity, price: i.price, total: i.total })),
      subtotal,
      taxAmount: tax,
      discount: 0,
      total,
      docType: "BILL",
      layoutSettings: settings?.bill_settings || {},
    }, { printer: usbPrinter }).catch((e) => showToast(e.message, "error"));
  };

  const handlePrintReceipt = (method, overrideItems, overrideTotal, overrideSubtotal, discountAmt = 0) => {
    // Debounce — guard against a fast double-click sending the same
    // receipt to the printer twice. 1.5s is long enough to swallow a
    // rage-click but short enough that a deliberate reprint after the
    // first one finishes is still possible.
    if (printInFlightRef.current) return;
    printInFlightRef.current = true;
    setTimeout(() => { printInFlightRef.current = false; }, 1500);
    let usbPrinter = null;
    try {
      const saved = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
      usbPrinter = saved.find((x) => x.mode === "usb" && x.type === "receipt") || null;
    } catch (_) {}
    const receiptItems = overrideItems || cart.map((i) => ({ name: i.product_name, quantity: i.quantity, price: i.price, total: i.total }));
    const baseTotalForReceipt = overrideTotal ?? total;
    const finalTotal = Math.max(0, baseTotalForReceipt - (discountAmt || 0));
    const receiptSubtotal = overrideSubtotal != null
      ? overrideSubtotal
      : (overrideTotal != null ? overrideTotal / (1 + taxRate / 100) : subtotal);
    const tableName = isMerged
      ? `${isBarTab ? "Bar Tab" : "Table"} ${entity?.number || ""} + ${mergedTables.map((t) => `T${t.number}`).join(", ")}`
      : `${isBarTab ? "Bar Tab" : "Table"} ${entity?.number || ""}`;
    printService.printReceipt({
      businessName: settings?.business_name || "Restaurant",
      address: settings?.company_address || settings?.address || "",
      phone: settings?.company_phone || settings?.phone || "",
      logoUrl: settings?.company_logo || settings?.logo_url || "",
      tableName,
      floorName,
      orderNo: currentOrderNumber || entity?.current_order_id?.slice(-8)?.toUpperCase() || "",
      // Always show someone on the bill / receipt — see handlePrintBill
      // comment. The table's assigned waiter is preferred; fall back to
      // the current operator so the row never prints blank.
      waiter: entity?.waiter_name || entity?.staff_name || user?.name || "",
      cashier: user?.name || "",
      items: receiptItems,
      subtotal: receiptSubtotal,
      taxAmount: baseTotalForReceipt - receiptSubtotal,
      discount: discountAmt || 0,
      total: finalTotal,
      paymentMethod: method,
      layoutSettings: settings?.receipt_settings || {},
    }, { printer: usbPrinter }).catch((e) => showToast(e.message, "error"));
  };

  // Items that the kitchen hasn't seen yet — new products + quantity increases
  // since the last successful Send to Kitchen. A held order's baseline is empty.
  const computeKitchenItems = () => {
    if (!kitchenSentItems.length) return cart;
    const result = [];
    for (const item of cart) {
      const sent = kitchenSentItems.find((o) => o.product_id === item.product_id);
      if (!sent) {
        result.push(item);
      } else if (item.quantity > sent.quantity) {
        const delta = item.quantity - sent.quantity;
        result.push({ ...item, quantity: delta, total: delta * item.price });
      }
    }
    return result;
  };

  const handleSendToKitchen = async () => {
    if (cart.length === 0) { showToast("Add at least one item", "error"); return; }
    // Synchronous lock — without this, a fast double-click on Send to
    // Kitchen would race past setKitchenSentItems and produce two
    // identical FOOD/DRINKS/SHISHA docket prints (and two POSTs).
    if (kitchenInFlightRef.current) return;
    kitchenInFlightRef.current = true;
    const existingOrderId = entity?.current_order_id;
    const kitchenItems = computeKitchenItems();

    // Block re-sends only when kitchen has already received this exact cart.
    // (computeKitchenItems returns full cart for held / new orders, deltas otherwise.)
    if (kitchenSentItems.length > 0 && kitchenItems.length === 0) {
      showToast("No new items to send — cart unchanged since last send.", "error");
      kitchenInFlightRef.current = false;
      return;
    }

    if (!isOnline) {
      setSubmitting(true);
      try {
        if (existingOrderId) {
          await queueOrder("update_order", { order_id: existingOrderId, data: { status: "sent_to_kitchen", items: cart, subtotal, total } }, `Kitchen add-on — ${isBarTab ? "Bar Tab" : "Table"} ${entity?.number || ""} — ${formatCurrency(total)}`);
        } else {
          await queueOrder("send_kitchen", buildOrderPayload("sent_to_kitchen", "pending"), `Kitchen — ${isBarTab ? "Bar Tab" : "Table"} ${entity?.number || ""} — ${formatCurrency(total)}`);
        }
        showToast("Saved offline — will sync when connected");
        setCart([]); setCustomerName(""); navigate("/tables");
      } catch { showToast("Failed to save offline", "error"); } finally { setSubmitting(false); }
      return;
    }

    setSubmitting(true);
    try {
      if (existingOrderId) {
        // Update the existing held/sent order — don't create a duplicate
        await api.updateOrder(existingOrderId, { status: "sent_to_kitchen", items: cart, subtotal, total });
      } else {
        await api.createOrder(buildOrderPayload("sent_to_kitchen", "pending"));
      }
      showToast("Order sent to kitchen!");
      // Mark current cart as the new kitchen baseline so future sends only print
      // additional items (not what we just printed).
      setKitchenSentItems(cart.map((c) => ({ ...c })));
      // Route kitchen tickets to correct printers based on printer groups
      try {
        const saved  = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
        const groups = JSON.parse(localStorage.getItem("pos_printer_groups")  || "[]");
        const itemsToPrint = kitchenItems;
        const stationPrinters = saved.filter((x) => x.type !== "receipt");

        // Index for fast lookup of missing category_id from the product list.
        const productById  = new Map(products.map((p) => [p.id, p]));
        const categoryById = new Map(categories.map((c) => [c.id, c]));

        // Resolve an item's category_id (cart may be missing it on items
        // loaded from older orders), and its food/drinks intent.
        const resolveCategoryId = (item) =>
          item.category_id || productById.get(item.product_id)?.category_id || "";
        const intentFor = (item) => {
          const cat = categoryById.get(resolveCategoryId(item));
          return (cat?.main_category || "food").toLowerCase() === "drinks" ? "drinks" : "food";
        };

        const tickets = new Map();
        for (const item of itemsToPrint) {
          const catId  = resolveCategoryId(item);
          const intent = intentFor(item);

          // Collect every printer whose groups contain this item by product or category.
          const matches = stationPrinters.filter((printer) =>
            (printer.printer_group_ids || []).some((gid) => {
              const group = groups.find((g) => g.id === gid);
              if (!group) return false;
              return (
                (group.product_ids  || []).includes(item.product_id) ||
                (group.category_ids || []).includes(catId)
              );
            })
          );

          // Pick the best printer:
          //   1. A matching printer whose type aligns with the item's intent
          //      (drinks → bar-type, food → kitchen-type)
          //   2. Otherwise the first matching printer
          //   3. Otherwise fall back by type: bar printer for drinks, kitchen for food
          //   4. Otherwise any station printer
          const preferType = intent === "drinks" ? "bar" : "kitchen";
          let target =
            matches.find((p) => p.type === preferType) ||
            matches[0] ||
            stationPrinters.find((p) => p.type === preferType) ||
            stationPrinters.find((p) => p.type === "kitchen") ||
            stationPrinters[0];

          if (!target) continue;
          if (!tickets.has(target.id)) tickets.set(target.id, { printer: target, items: [] });
          tickets.get(target.id).items.push(item);
        }

        for (const { printer, items } of tickets.values()) {
          if (!items.length) continue;
          const printerConfig = printer.mode === "usb"
            ? { printer }
            : { ip: printer.ip_address, port: printer.port || 9100 };
          printService.printKitchenTicket({
            tableName: `${isBarTab ? "Bar Tab" : "Table"} ${entity?.number || ""}`,
            orderNo: "",
            // Prefer the table's original waiter (or bar tab staff) so
            // kitchen tickets always show the person serving the table,
            // not whichever cashier hit Send to Kitchen.
            waiterName: entity?.waiter_name || entity?.staff_name || user?.name || "",
            items: items.map((i) => ({ name: i.product_name, quantity: i.quantity, note: i.note })),
            station: printer.name || "KITCHEN",
          }, printerConfig).catch((err) => showToast(`${printer.name} print failed: ${err.message}`, "error"));
        }
      } catch (_) {}
      setCart([]);
      setCustomerName("");
      navigate("/tables");
    } catch (err) {
      showToast(err.message || "Failed to send to kitchen", "error");
    } finally {
      setSubmitting(false);
      kitchenInFlightRef.current = false;
    }
  };

  // TEMPORARY ROUTING (until LAN-attached kitchen / bar printers are up):
  // all kitchen + bar tickets go to a single fallback printer (MP-POS 9
  // by default — override via localStorage.pos_kitchen_fallback_printer).
  // Items are split into THREE separate dockets per send:
  //   FOOD    — anything whose category.main_category resolves to 'food'
  //   DRINKS  — main_category === 'drinks' AND name doesn't say 'shisha'
  //   SHISHA  — any category whose name contains 'shisha'
  // Each docket prints as its own kitchen-style ticket with a clear
  // station label so the staff knows which area it belongs to.
  const printKitchenTicketsForNewItems = (newItems) => {
    if (!newItems?.length) return;
    try {
      const saved  = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
      const fallbackName = (localStorage.getItem("pos_kitchen_fallback_printer") || "MP-POS 9").toLowerCase().trim();
      // Pick the consolidated kitchen printer by case-insensitive name match
      // on name / windows_printer_name. If nothing matches, fall through to
      // ANY saved printer — kitchen / bar typed first, then the receipt
      // printer (so everything still lands somewhere while the consolidated
      // routing is in effect).
      let target = saved.find((p) =>
        (p?.name || "").toLowerCase().includes(fallbackName) ||
        (p?.windows_printer_name || "").toLowerCase().includes(fallbackName)
      );
      if (!target) {
        target = saved.find((p) => p?.type === "kitchen")
              || saved.find((p) => p?.type === "bar")
              || saved.find((p) => p?.type === "receipt")
              || saved[0]
              || null;
      }
      if (!target) {
        showToast("No printer configured — open Settings → Printers", "error");
        return;
      }

      const productById  = new Map(products.map((p) => [p.id, p]));
      const categoryById = new Map(categories.map((c) => [c.id, c]));
      const dockets = { FOOD: [], DRINKS: [], SHISHA: [] };
      for (const item of newItems) {
        const catId = item.category_id || productById.get(item.product_id)?.category_id || "";
        const cat   = categoryById.get(catId);
        const catName = (cat?.name || "").toLowerCase();
        const mainCat = (cat?.main_category || "food").toLowerCase();
        const bucket = catName.includes("shisha") ? "SHISHA"
                      : mainCat === "drinks"      ? "DRINKS"
                      : "FOOD";
        dockets[bucket].push(item);
      }

      const printerConfig = target.mode === "usb"
        ? { printer: target }
        : { ip: target.ip_address, port: target.port || 9100 };
      const tableLabel = `${isBarTab ? "Bar Tab" : "Table"} ${entity?.number || ""}`;
      const waiterName = entity?.waiter_name || entity?.staff_name || user?.name || "";
      for (const [station, items] of Object.entries(dockets)) {
        if (!items.length) continue;
        printService.printKitchenTicket({
          tableName: tableLabel,
          orderNo: "",
          waiterName,
          items: items.map((i) => ({ name: i.product_name, quantity: i.quantity, note: i.note })),
          station,
        }, printerConfig).catch((err) => showToast(`${station} ticket failed: ${err.message}`, "error"));
      }
    } catch (_) {}
  };

  // Combined Hold + Send-to-Kitchen + cart update. One button.
  //   - empty cart with no existing order → silently close (no error)
  //   - cart unchanged since last kitchen send → save the held snapshot
  //     but skip kitchen printing (nothing new to print) — also silent
  //   - otherwise: save the order in 'sent_to_kitchen', print kitchen /
  //     bar tickets for new items only, navigate back
  //
  // Offline: order is queued for cloud sync, kitchen tickets still print
  // directly to the LAN bridge so the kitchen sees the order in real time.
  const handleHold = async () => {
    // Hold + Send-to-Kitchen both end up printing FOOD/DRINKS/SHISHA
    // dockets when there are new items. Block re-entry so a fast
    // double-click can't fire two POSTs + two prints.
    if (holdInFlightRef.current || kitchenInFlightRef.current) return;
    holdInFlightRef.current = true;
    const existingOrderId = entity?.current_order_id;
    if (cart.length === 0 && !existingOrderId) {
      holdInFlightRef.current = false;
      navigate("/tables");
      return;
    }
    const kitchenItems = computeKitchenItems();
    const hasNewItems = kitchenItems.length > 0;

    if (!isOnline) {
      setSubmitting(true);
      try {
        // See online branch comments — once kitchen has the order, status
        // stays sent_to_kitchen. kitchen_sent_items snapshot persists the
        // baseline so reloads / multi-device don't lose track.
        const alreadySent = kitchenSentItems.length > 0;
        const status = (hasNewItems || alreadySent) ? "sent_to_kitchen" : "held";
        const newKitchenSnapshot = hasNewItems ? cart.map((c) => ({ ...c })) : kitchenSentItems;
        if (existingOrderId) {
          await queueOrder("update_order", {
            order_id: existingOrderId,
            data: { status, items: cart, subtotal, total, customer_name: customerName || null, kitchen_sent_items: newKitchenSnapshot },
          }, `${hasNewItems ? "Kitchen" : "Hold"} — ${isBarTab ? "Bar Tab" : "Table"} ${entity?.number || ""} — ${formatCurrency(total)}`);
        } else {
          await queueOrder(hasNewItems ? "send_kitchen" : "hold",
            { ...buildOrderPayload(status, "pending"), kitchen_sent_items: newKitchenSnapshot },
            `${hasNewItems ? "Kitchen" : "Hold"} — ${isBarTab ? "Bar Tab" : "Table"} ${entity?.number || ""} — ${formatCurrency(total)}`);
        }
        if (hasNewItems) {
          // Bridge is on the same LAN — kitchen still sees the order
          printKitchenTicketsForNewItems(kitchenItems);
          setKitchenSentItems(newKitchenSnapshot);
        }
        showToast(hasNewItems
          ? "Saved offline + sent to kitchen via bridge"
          : "Saved offline — will sync when connected");
        setCart([]); setCustomerName(""); navigate("/tables");
      } catch {
        showToast("Failed to save offline", "error");
      } finally {
        setSubmitting(false);
        holdInFlightRef.current = false;
      }
      return;
    }
    setSubmitting(true);
    try {
      // Don't revert sent_to_kitchen back to held when nothing new was
      // added — that revert was the source of the 'reprints everything
      // on the next Hold' bug. Once the kitchen has the order, it has
      // the order; status only ever moves forward.
      const alreadySent = kitchenSentItems.length > 0;
      const status = (hasNewItems || alreadySent) ? "sent_to_kitchen" : "held";
      // Snapshot of what kitchen now holds — persisted on the order so a
      // reload on this or another device picks up the correct baseline.
      const newKitchenSnapshot = hasNewItems ? cart.map((c) => ({ ...c })) : kitchenSentItems;
      if (existingOrderId) {
        await api.updateOrder(existingOrderId, {
          status,
          items: cart,
          subtotal,
          total,
          customer_name: customerName || null,
          kitchen_sent_items: newKitchenSnapshot,
        });
      } else if (cart.length > 0) {
        await api.createOrder({
          ...buildOrderPayload(status, "pending"),
          kitchen_sent_items: newKitchenSnapshot,
        });
      }
      if (hasNewItems) {
        setKitchenSentItems(newKitchenSnapshot);
        printKitchenTicketsForNewItems(kitchenItems);
        showToast("Held & sent to kitchen!");
      } else if (cart.length > 0) {
        showToast("Order updated.");
      }
      setCart([]);
      setCustomerName("");
      navigate("/tables");
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
    const existingOrderId = entity?.current_order_id;
    // One key per checkout session — both the live POST and any offline-
    // queue replay end up tagged with this key, so the backend can drop
    // duplicates regardless of which path actually got through first.
    const idempotencyKey = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    if (!isOnline) {
      try {
        if (existingOrderId) {
          await queueOrder("update_order", {
            order_id: existingOrderId,
            data: {
              status: "completed",
              payment_method: method,
              items: cart,
              subtotal,
              discount: discAmt,
              total: effectiveTotal,
              customer_name: (name ?? customerName) || null,
              ...(discountInfo?.reason ? { discount_reason: discountInfo.reason } : {}),
            },
          }, `Sale — ${isBarTab ? "Bar Tab" : "Table"} ${entity?.number || ""} — ${formatCurrency(combinedTotal - discAmt)}`);
        } else {
          await queueOrder("checkout", buildOrderPayload("completed", method, name, discountInfo, idempotencyKey), `Sale — ${isBarTab ? "Bar Tab" : "Table"} ${entity?.number || ""} — ${formatCurrency(combinedTotal - discAmt)}`);
        }
        showToast("Saved offline — will sync when connected");
        setCart([]); setCustomerName(""); navigate("/tables");
      } catch {
        showToast("Failed to save offline", "error");
        completeInFlightRef.current = false;  // let the user retry
      } finally { setSubmitting(false); }
      return;
    }
    try {
      // Complete this table's order — update existing if there is one, else create
      if (existingOrderId) {
        await api.updateOrder(existingOrderId, {
          status: "completed",
          payment_method: method,
          items: cart,
          subtotal,
          discount: discAmt,
          total: effectiveTotal,
          customer_name: (name ?? customerName) || null,
          ...(discountInfo?.reason ? { discount_reason: discountInfo.reason } : {}),
        });
      } else {
        await api.createOrder(buildOrderPayload("completed", method, name, discountInfo, idempotencyKey));
      }

      // Complete and unmerge all merged tables
      for (const mt of mergedTables) {
        try {
          if (mt.current_order_id) {
            await api.updateOrder(mt.current_order_id, { status: "completed", payment_method: method });
          }
          await api.unmergeTable(entityId, mt.id);
        } catch { /* non-fatal per table */ }
      }

      // Print a receipt on every completion — including credit sales,
      // which serve as the customer's IOU until they settle up later.
      // Previously credit was silently skipped here; the user needs a
      // paper record of the open invoice so they can hand it to the
      // customer to sign.
      if (isMerged) {
        const allItems = [
          ...cart.map((i) => ({ name: i.product_name, quantity: i.quantity, price: i.price, total: i.total })),
          ...mergedOrders.flatMap((o) => (o.items || []).map((i) => ({ name: i.product_name || i.name, quantity: i.quantity, price: i.price, total: i.total }))),
        ];
        handlePrintReceipt(method, allItems, combinedTotal, undefined, discAmt);
      } else {
        handlePrintReceipt(method, undefined, undefined, undefined, discAmt);
      }

      showToast(method === "credit" ? "Credit sale recorded!" : `Order completed via ${method}!`);
      setCart([]);
      setCustomerName("");
      navigate("/tables");
    } catch (err) {
      showToast(err.message || "Failed to complete order", "error");
      completeInFlightRef.current = false;  // let the user retry
    } finally {
      setSubmitting(false);
    }
  };

  // Split bill at checkout — pay for the picked items now, hold the rest on
  // this table as the remaining held order.
  const handleSplitCheckout = async (method, paid_items, name) => {
    if (!paid_items?.length) return;
    if (completeInFlightRef.current) return;
    completeInFlightRef.current = true;
    const existingOrderId = entity?.current_order_id;
    if (!existingOrderId) {
      showToast("Send to kitchen first — there's no held order to split yet.", "error");
      return;
    }
    setSubmitting(true);
    setShowPay(false);
    if (name !== undefined) setCustomerName(name);
    try {
      const result = await api.splitOrderItems(existingOrderId, {
        paid_items,
        payment_method: method,
      });
      // Print receipt for the paid portion
      try {
        const paidTotal = paid_items.reduce((s, p) => s + (p.price || 0) * (p.quantity || 0), 0);
        const paidSubtotal = result?.paid_order?.subtotal || paidTotal;
        handlePrintReceipt(
          method,
          paid_items.map((p) => ({ name: p.product_name, quantity: p.quantity, price: p.price })),
          result?.paid_order?.total || paidTotal,
          paidSubtotal,
        );
      } catch { /* non-fatal */ }
      if (result?.remaining_order?.items?.length) {
        // Reload cart with the held remainder
        const remain = result.remaining_order.items.map((it) => ({
          product_id:   it.product_id,
          product_name: it.product_name || it.name,
          category_id:  it.category_id || "",
          quantity:     it.quantity || it.qty || 1,
          price:        it.price,
          total:        it.total,
        }));
        setCart(remain);
        setOriginalItems(remain);
        setKitchenSentItems(remain);
        showToast(`Split paid via ${method}. ${remain.length} item${remain.length === 1 ? "" : "s"} held on table.`);
      } else {
        showToast(`Split paid via ${method}. Table cleared.`);
        setCart([]);
        navigate("/tables");
      }
    } catch (err) {
      showToast(err.message || "Failed to split bill", "error");
      completeInFlightRef.current = false;  // let the user retry on failure
    } finally {
      setSubmitting(false);
      // On success the cashier stays on this page (the remainder held).
      // Release the lock either way so the next deliberate Confirm works.
      completeInFlightRef.current = false;
    }
  };

  const handleSplitTable = async (mergedTableId) => {
    try {
      await api.unmergeTable(entityId, mergedTableId);
      setMergedTables((prev) => prev.filter((t) => t.id !== mergedTableId));
      setMergedOrders((prev) => {
        const mt = mergedTables.find((t) => t.id === mergedTableId);
        return mt ? prev.filter((o) => o.id !== mt.current_order_id) : prev;
      });
      showToast("Tables split successfully");
    } catch (err) {
      showToast(err.message || "Failed to split tables", "error");
    }
  };

  const handleAbsorbMerged = async (mt) => {
    if (!window.confirm(`Move Table ${mt.number}'s items into this table's bill and free Table ${mt.number}?\n\nTable ${mt.number} becomes available immediately. The combined bill stays on this table.`)) return;
    try {
      await api.absorbMergedTable(entityId, mt.id);
      // Refresh: the merged table is gone, items have been added to this order.
      // Reload the current order's items into the cart.
      const refreshed = entity?.current_order_id ? await api.getOrder(entity.current_order_id) : null;
      if (refreshed?.items) {
        const loaded = refreshed.items.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name || item.name,
          category_id: item.category_id || "",
          quantity: item.quantity || item.qty || 1,
          price: item.price,
          total: item.total,
        }));
        setCart(loaded);
        setOriginalItems(loaded);
      }
      setMergedTables((prev) => prev.filter((t) => t.id !== mt.id));
      setMergedOrders((prev) => prev.filter((o) => o.id !== mt.current_order_id));
      showToast(`Table ${mt.number} released — bill moved here`);
    } catch (err) {
      showToast(err.message || "Failed to absorb table", "error");
    }
  };

  return (
    <div className="flex h-screen bg-[#111827] overflow-hidden">
      <Sidebar
        onSettingsClick={() => setShowTerminalModal(true)}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">
        <div className={`h-1 bg-gradient-to-r ${config.headerBg} flex-shrink-0`} />
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex-shrink-0">
              <Menu size={18} />
            </button>
            <button onClick={() => navigate("/tables")}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="font-black text-gray-900 dark:text-white text-base leading-tight">
                {isBarTab ? "Bar Tab" : "Table"} {entity?.number || ""}
              </h1>
              <p className="text-xs text-gray-400">
                {entity?.waiter_name ? `Waiter: ${entity.waiter_name}` : entity?.staff_name ? `Staff: ${entity.staff_name}` : user?.name}
              </p>
            </div>
          </div>
          {!isBarTab && user?.role !== "waiter" && (
            <button onClick={() => setShowTransfer(true)}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-bold hover:bg-violet-700 transition-colors">
              ⇄ Transfer
            </button>
          )}
          {!isBarTab && entity?.current_order_id && (canMoveOrder) && (
            <button onClick={() => setShowMove(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors">
              → Move to Table
            </button>
          )}
        </header>

        {entity?.kitchen_status === "ready" && (
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-bold flex-shrink-0 animate-pulse">
            <Bell size={15} strokeWidth={2.5} />
            Order ready — kitchen has finished cooking this order!
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Product browser */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="px-5 pt-4 pb-3 flex gap-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex-1 relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products..."
                  className="w-full pl-9 pr-4 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-2xl text-sm dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>
              <div className="relative">
                <select
                  value={selectedTerminal}
                  onChange={(e) => setSelectedTerminal(e.target.value)}
                  className="appearance-none flex items-center gap-2 pl-9 pr-8 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-2xl text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none focus:border-blue-400 bg-white dark:bg-gray-700 cursor-pointer"
                >
                  <option value="">ACTIVE TERMINAL — None</option>
                  {terminals.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <Monitor size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
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
            <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
              {visibleCategories.map((cat) => (
                <button key={cat.id}
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

            <div className="flex-1 overflow-y-auto p-5">
              {loading ? (
                <div className="flex justify-center py-20"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <ShoppingCart size={40} className="mb-3 opacity-30" />
                  <p className="font-semibold">No products found</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {filtered.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="bg-white dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-600 rounded-2xl overflow-hidden hover:border-blue-300 hover:shadow-md transition-all text-left group"
                    >
                      {product.image ? (
                        <img src={api.getImageUrl(product.image)} alt={product.name} className="w-full aspect-square object-cover" />
                      ) : (
                        <div className="w-full aspect-square bg-gradient-to-br from-gray-100 dark:from-gray-600 to-gray-200 dark:to-gray-700 flex items-center justify-center">
                          <ShoppingCart size={32} className="text-gray-300 dark:text-gray-500" />
                        </div>
                      )}
                      <div className="p-3">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight line-clamp-2">{product.name}</p>
                        <p className="font-black text-base mt-1" style={{ color: categories.find(c => c.id === product.category_id)?.color || config.accent }}>{formatCurrency(priceForOutlet(product, entity?.outlet_id || selectedOutlet))}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Current Order — hidden on phones+tablets, visible on desktop only */}
          <div className="hidden xl:flex xl:w-80 flex-col bg-white dark:bg-gray-800 flex-shrink-0">
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="font-black text-gray-900 dark:text-white text-lg">Current Order</h2>
            </div>

            <div className="px-4 pt-3 pb-2">
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer name (optional)"
                className="w-full px-3.5 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-colors"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-2">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                  <ShoppingCart size={40} className="text-gray-200 dark:text-gray-600 mb-3" />
                  <p className="font-semibold text-gray-400">No items added</p>
                  <p className="text-xs text-gray-300 dark:text-gray-500 mt-1.5 leading-relaxed">
                    Tap a product on the left to add it. Then <strong>Hold</strong>, or <strong>Complete</strong> the order.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div key={item.product_id} className="flex items-center gap-2 py-2 border-b border-gray-50 dark:border-gray-700">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{item.product_name}</p>
                        <p className="text-xs text-gray-400">{formatCurrency(item.price)} each</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isWaiter && kitchenSentItems.some((s) => s.product_id === item.product_id) ? (
                          <span className="text-[10px] text-orange-400 font-bold px-2 py-0.5 bg-orange-50 dark:bg-orange-900/30 rounded-full">Sent</span>
                        ) : (
                          <>
                            <button onClick={() => changeQty(item.product_id, -1)}
                              className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center transition-colors">
                              <Minus size={12} className="text-gray-600 dark:text-gray-300" />
                            </button>
                            <span className="w-5 text-center font-bold text-sm dark:text-white">{item.quantity}</span>
                            <button onClick={() => changeQty(item.product_id, 1)}
                              className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center transition-colors">
                              <Plus size={12} className="text-gray-600 dark:text-gray-300" />
                            </button>
                          </>
                        )}
                      </div>
                      <p className="text-sm font-black text-gray-900 dark:text-white w-16 text-right flex-shrink-0">{formatCurrency(item.total)}</p>
                      {canModify && (
                        <button onClick={() => removeFromCart(item.product_id)}
                          className="text-gray-300 hover:text-red-500 transition-colors">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Merged tables section */}
            {isMerged && (
              <div className="px-4 pt-2 pb-1 border-t border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20">
                {mergedTables.map((mt) => {
                  const mo = mergedOrders.find((o) => o.id === mt.current_order_id);
                  return (
                    <div key={mt.id} className="mb-2">
                      <div className="flex items-center justify-between mb-1 gap-2">
                        <span className="flex items-center gap-1 text-xs font-bold text-orange-600 dark:text-orange-400">
                          <GitMerge size={11} /> Table {mt.number}
                        </span>
                        <div className="flex gap-2">
                          <button onClick={() => handleAbsorbMerged(mt)}
                            className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 transition-colors"
                            title={`Move T${mt.number}'s items here and free T${mt.number}`}>
                            Move bill here & release
                          </button>
                          <button onClick={() => handleSplitTable(mt.id)}
                            className="text-[10px] font-bold text-red-500 hover:text-red-700 transition-colors"
                            title="Keep both tables separate with their own bills">
                            Split
                          </button>
                        </div>
                      </div>
                      {mo?.items?.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs text-gray-600 dark:text-gray-400 py-0.5">
                          <span>{item.quantity}x {item.product_name || item.name}</span>
                          <span>{formatCurrency((item.price || 0) * (item.quantity || 1))}</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs font-bold text-orange-600 dark:text-orange-400 mt-1 border-t border-orange-200 dark:border-orange-700 pt-1">
                        <span>Table {mt.number} total</span>
                        <span>{formatCurrency(mo?.total || 0)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {cart.length > 0 && (
              <div className="px-4 pt-3 pb-2 border-t border-gray-100 dark:border-gray-700">
                <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-1">
                  <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                </div>
                {isMerged && (
                  <div className="flex justify-between text-sm text-orange-600 dark:text-orange-400 mb-1">
                    <span>Merged tables</span><span>+{formatCurrency(mergedTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-gray-900 dark:text-white text-base mb-3">
                  <span>{isMerged ? "Combined Total" : "Total"}</span>
                  <span className="text-green-600 dark:text-green-400">{formatCurrency(combinedTotal)}</span>
                </div>
              </div>
            )}

            <div className="px-4 pb-4 space-y-2 flex-shrink-0">
              <div className="flex gap-2">
                {canPrintBill && (
                  <button
                    onClick={handlePrintBill}
                    disabled={cart.length === 0}
                    title="Print Bill"
                    className="w-11 h-11 flex-shrink-0 bg-indigo-500 text-white rounded-2xl hover:bg-indigo-600 disabled:opacity-40 transition-colors flex items-center justify-center">
                    <Printer size={18} />
                  </button>
                )}
                {canCharge && (
                  <button
                    onClick={() => { if (cart.length > 0) setShowPay(true); }}
                    disabled={submitting || cart.length === 0}
                    className="flex-1 py-3 bg-emerald-500 text-white rounded-2xl font-bold text-sm hover:bg-emerald-600 disabled:opacity-40 transition-colors">
                    Checkout
                  </button>
                )}
              </div>
              <button
                onClick={handleHold}
                disabled={submitting}
                className="w-full py-3 bg-gray-800 dark:bg-gray-600 text-white rounded-2xl font-bold text-sm hover:bg-gray-900 dark:hover:bg-gray-500 disabled:opacity-40 transition-colors">
                Hold/Kitchen &amp; Bar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile FAB */}
      {(() => {
        const cartItemCount = cart.reduce((s, i) => s + i.quantity, 0);
        return (
          <button
            onClick={() => setShowCart(true)}
            className="fixed bottom-6 right-6 z-30 xl:hidden w-14 h-14 bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-full shadow-2xl shadow-blue-900/40 flex items-center justify-center transition-all"
          >
            <ShoppingCart size={22} className="text-white" />
            {cartItemCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-white text-[11px] font-black flex items-center justify-center shadow-lg">
                {cartItemCount > 9 ? "9+" : cartItemCount}
              </span>
            )}
          </button>
        );
      })()}

      {/* Mobile cart sheet (phones only) */}
      {showCart && (
        <div className="fixed inset-0 z-40 bg-white dark:bg-gray-900 flex flex-col xl:hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
            <div>
              <h2 className="font-black text-xl text-gray-900 dark:text-white tracking-tight">
                {isBarTab ? "Bar Tab" : "Table"} {entity?.number || ""}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Your Cart</p>
            </div>
            <button onClick={() => setShowCart(false)} className="w-9 h-9 rounded-full border-2 border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-400">
              <X size={16} />
            </button>
          </div>
          <div className="px-4 pt-3 pb-1 flex-shrink-0">
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Customer name (optional)"
              className="w-full px-4 py-3 border border-gray-200 dark:border-gray-600 rounded-2xl text-sm bg-gray-50 dark:bg-gray-800 dark:text-white dark:placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-colors"
            />
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <ShoppingCart size={56} className="text-gray-200 dark:text-gray-700 mb-4" />
                <p className="font-bold text-lg text-gray-400">Cart is empty</p>
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
                        <button onClick={() => removeFromCart(item.product_id)} className="text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {isWaiter && kitchenSentItems.some((s) => s.product_id === item.product_id) ? (
                          <span className="text-xs text-orange-500 font-bold px-3 py-1.5 bg-orange-50 dark:bg-orange-900/30 rounded-xl">Sent to kitchen</span>
                        ) : (
                          <>
                            <button onClick={() => changeQty(item.product_id, -1)} className="w-9 h-9 rounded-xl bg-red-500 hover:bg-red-600 active:scale-95 flex items-center justify-center transition-all shadow-sm">
                              <Minus size={14} className="text-white" />
                            </button>
                            <span className="font-black text-lg text-gray-900 dark:text-white w-6 text-center tabular-nums">{item.quantity}</span>
                            <button onClick={() => changeQty(item.product_id, 1)} className="w-9 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 flex items-center justify-center transition-all shadow-sm">
                              <Plus size={14} className="text-white" />
                            </button>
                          </>
                        )}
                      </div>
                      <p className="font-black text-blue-600 dark:text-blue-400 text-lg tabular-nums">{formatCurrency(item.total)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {cart.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-700 px-5 pt-4 pb-8 bg-white dark:bg-gray-900 flex-shrink-0">
              <div className="flex justify-between font-black text-gray-900 dark:text-white text-lg mb-4">
                <span>Total</span>
                <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(total)}</span>
              </div>
              <div className="flex gap-2 mb-2">
                {canPrintBill && (
                  <button onClick={() => { handlePrintBill(); setShowCart(false); }} disabled={submitting} title="Print Bill" className="w-11 h-11 flex-shrink-0 bg-indigo-500 text-white rounded-2xl hover:bg-indigo-600 disabled:opacity-40 flex items-center justify-center">
                    <Printer size={18} />
                  </button>
                )}
                {canCharge && (
                  <button
                    onClick={() => { setShowCart(false); setShowPay(true); }}
                    disabled={submitting}
                    className="flex-1 py-3 bg-emerald-500 text-white rounded-2xl font-bold text-sm hover:bg-emerald-600 disabled:opacity-40">
                    Checkout
                  </button>
                )}
              </div>
              <button onClick={handleHold} disabled={submitting} className="w-full py-3 bg-gray-800 dark:bg-gray-700 text-white rounded-2xl font-bold text-sm hover:bg-gray-900 disabled:opacity-40">
                Hold/Kitchen &amp; Bar
              </button>
            </div>
          )}
        </div>
      )}

      {showPay && (
        <PaymentModal
          total={combinedTotal}
          paymentTypes={paymentTypes}
          customerName={customerName}
          onCustomerNameChange={setCustomerName}
          onClose={() => setShowPay(false)}
          onConfirm={handleComplete}
          onSplit={handleSplitCheckout}
          cart={cart}
          canSplit={hasSplitBillPerm && !!entity?.current_order_id && !isMerged}
          canSplitPayment={hasSplitPaymentPerm}
          canApplyDiscount={hasApplyDiscountPerm}
          taxRate={taxRate}
          taxMode={taxMode}
        />
      )}

      {showTransfer && (
        <TransferModal
          tableId={entityId}
          currentWaiterId={entity?.waiter_id}
          onClose={() => setShowTransfer(false)}
          onTransferred={() => {
            showToast("Table transferred successfully!");
            setShowTransfer(false);
            navigate("/tables");
          }}
        />
      )}

      {showMove && (
        <MoveOrderModal
          fromTableId={entityId}
          onlyAvailable
          onClose={() => setShowMove(false)}
          onMove={handleMoveOrder}
        />
      )}

      {showTerminalModal && (
        <TerminalSettingsModal
          terminals={terminals}
          outlets={outlets}
          selectedTerminal={selectedTerminal}
          selectedOutlet={selectedOutlet}
          onSave={(term, out) => {
            setSelectedTerminal(term);
            setSelectedOutlet(out);
            localStorage.setItem("pos_terminal", term);
            localStorage.setItem("pos_outlet", out);
            localStorage.setItem("pos_terminal_name", terminals.find((t) => t.id === term)?.name || "");
            setShowTerminalModal(false);
          }}
          onClose={() => setShowTerminalModal(false)}
        />
      )}

      {toast && (
        <div className={cn(
          "fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold z-50",
          toast.type === "error" ? "bg-red-600 text-white" : "bg-gray-900 text-white"
        )}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
