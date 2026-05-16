import React, { useEffect, useState } from "react";
import {
  ArrowLeftRight, BookOpen, FolderOpen,
  Minus, Plus, Receipt, RefreshCw, Tag, Trash2, TrendingDown,
  TrendingUp, Wallet, X,
} from "lucide-react";
import { api } from "../lib/api";
import { cn, formatCurrency } from "../lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split("T")[0]; }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; }
function fmtDate(s) { return new Date(s).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }); }

const INPUT = "w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white dark:bg-gray-800";
const LABEL = "block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5";

// ─── Shared Modal ─────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className={cn("bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-h-[90vh] flex flex-col", wide ? "max-w-lg" : "max-w-md")}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <h3 className="font-bold text-gray-900 dark:text-white text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, bg, iconBg, valueColor = "text-gray-900 dark:text-white" }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm flex items-center gap-4">
      <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0", iconBg || bg)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide truncate">{label}</p>
        <p className={cn("text-xl font-black mt-0.5 tabular-nums", valueColor)}>{value}</p>
      </div>
    </div>
  );
}

// ─── Date Range Bar ───────────────────────────────────────────────────────────
function DateBar({ start, end, onStart, onEnd, onRefresh }) {
  return (
    <div className="flex items-center gap-3 mb-6 flex-wrap">
      <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
        <span className="text-gray-400 text-sm">📅</span>
        <input type="date" value={start} onChange={(e) => onStart(e.target.value)}
          className="text-sm text-gray-700 dark:text-gray-200 focus:outline-none bg-transparent" />
      </div>
      <span className="text-gray-400 text-sm font-medium">→</span>
      <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
        <input type="date" value={end} onChange={(e) => onEnd(e.target.value)}
          className="text-sm text-gray-700 dark:text-gray-200 focus:outline-none bg-transparent" />
      </div>
      {onRefresh && (
        <button onClick={onRefresh} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
          <RefreshCw size={16} />
        </button>
      )}
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());

  const load = () => {
    setLoading(true);
    api.getAccountsDashboard(start, end)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [start, end]);

  const cards = data ? [
    { label: "Sales",             value: formatCurrency(data.sales),          iconBg: "bg-indigo-500",  icon: <TrendingUp size={22} className="text-white" />,   valueColor: "text-indigo-600"  },
    { label: "Purchases",         value: formatCurrency(data.purchases),       iconBg: "bg-emerald-500", icon: <Receipt size={22} className="text-white" />,       valueColor: "text-emerald-600" },
    { label: "Sales Return",      value: formatCurrency(data.sales_return),    iconBg: "bg-amber-500",   icon: <TrendingDown size={22} className="text-white" />,  valueColor: "text-amber-600"   },
    { label: "Purchases Return",  value: formatCurrency(data.purchases_return),iconBg: "bg-red-400",     icon: <Minus size={22} className="text-white" />,         valueColor: "text-red-500"     },
    { label: "Sales Due",         value: formatCurrency(data.sales_due),       iconBg: "bg-blue-500",    icon: <Wallet size={22} className="text-white" />,        valueColor: "text-blue-600"    },
    { label: "Purchase Due",      value: formatCurrency(data.purchase_due),    iconBg: "bg-orange-500",  icon: <FolderOpen size={22} className="text-white" />,    valueColor: "text-orange-600"  },
    { label: "Invoice Count",     value: data.invoice_count,                   iconBg: "bg-purple-500",  icon: <BookOpen size={22} className="text-white" />,      valueColor: "text-purple-600"  },
    { label: "Net Profit",        value: formatCurrency(data.net_profit),      iconBg: data.net_profit >= 0 ? "bg-green-500" : "bg-red-500",
      icon: data.net_profit >= 0 ? <TrendingUp size={22} className="text-white" /> : <TrendingDown size={22} className="text-white" />,
      valueColor: data.net_profit >= 0 ? "text-green-600" : "text-red-500" },
  ] : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">Dashboard</h2>
      </div>

      <DateBar start={start} end={end} onStart={setStart} onEnd={setEnd} onRefresh={load} />

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : !data ? (
        <div className="flex justify-center py-16 text-gray-400 text-sm">Failed to load data. Check your connection and try again.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
            {cards.map((c) => <StatCard key={c.label} {...c} />)}
          </div>

          {/* Payment breakdown */}
          {data.payment_breakdown && Object.keys(data.payment_breakdown).length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm mb-6">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-white">Sales by Payment Method</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {Object.entries(data.payment_breakdown).map(([method, info]) => (
                  <div key={method} className="px-6 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-semibold capitalize">{method}</span>
                      <span className="text-xs text-gray-400">{info.count} orders</span>
                    </div>
                    <span className="font-bold text-gray-900 dark:text-white tabular-nums">{formatCurrency(info.total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Expense by category */}
          {data.expense_by_category && Object.keys(data.expense_by_category).length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-white">Expenses by Category</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {Object.entries(data.expense_by_category).map(([cat, amt]) => (
                  <div key={cat} className="px-6 py-3.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{cat}</span>
                    <span className="text-sm font-bold text-red-500 tabular-nums">{formatCurrency(amt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── PROFIT & LOSS ────────────────────────────────────────────────────────────
function ProfitLoss() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());

  const load = () => {
    setLoading(true);
    api.getAccountsDashboard(start, end).then(setData).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [start, end]);

  const Row = ({ label, value, bold, indent, color = "text-gray-900 dark:text-white" }) => (
    <div className={cn("flex items-center justify-between py-3 px-6", indent && "pl-10", bold && "border-t border-gray-100 dark:border-gray-700")}>
      <span className={cn("text-sm text-gray-700 dark:text-gray-200", bold && "font-bold text-gray-900 dark:text-white")}>{label}</span>
      <span className={cn("text-sm tabular-nums font-semibold", color, bold && "font-black text-base")}>{formatCurrency(value || 0)}</span>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">Profit & Loss</h2>
      </div>
      <DateBar start={start} end={end} onStart={setStart} onEnd={setEnd} onRefresh={load} />

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : data && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
          {/* Revenue */}
          <div className="px-6 py-3 bg-green-50 dark:bg-green-900/20 border-b border-green-100 dark:border-green-900">
            <p className="text-xs font-bold text-green-700 dark:text-green-400 uppercase tracking-widest">Revenue</p>
          </div>
          <Row label="Total Sales" value={data.sales} color="text-green-600" />
          <Row label="Other Deposits" value={data.deposits_total} color="text-green-600" />
          <Row label="Total Revenue" value={data.sales + (data.deposits_total || 0)} bold color="text-green-700" />

          {/* Cost of Goods */}
          <div className="px-6 py-3 bg-orange-50 dark:bg-orange-900/20 border-b border-orange-100 dark:border-orange-900 border-t border-t-gray-100 dark:border-t-gray-700">
            <p className="text-xs font-bold text-orange-700 dark:text-orange-400 uppercase tracking-widest">Cost of Goods Sold</p>
          </div>
          <Row label="COGS" value={data.cogs} color="text-orange-600" />
          <Row label="Gross Profit" value={data.gross_profit} bold color={data.gross_profit >= 0 ? "text-green-600" : "text-red-500"} />

          {/* Operating Expenses */}
          <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-900 border-t border-t-gray-100 dark:border-t-gray-700">
            <p className="text-xs font-bold text-red-700 dark:text-red-400 uppercase tracking-widest">Operating Expenses</p>
          </div>
          {data.expense_by_category && Object.entries(data.expense_by_category).map(([cat, amt]) => (
            <Row key={cat} label={cat} value={amt} indent color="text-red-500" />
          ))}
          <Row label="Total Expenses" value={data.expenses_total} bold color="text-red-600" />

          {/* Net Profit */}
          <div className={cn("px-6 py-5 border-t-2", data.net_profit >= 0 ? "border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-700" : "border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-700")}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Net Profit / Loss</p>
                {data.net_profit !== 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {((data.net_profit / Math.max(data.sales, 1)) * 100).toFixed(1)}% margin
                  </p>
                )}
              </div>
              <p className={cn("text-3xl font-black tabular-nums", data.net_profit >= 0 ? "text-green-600" : "text-red-500")}>
                {formatCurrency(data.net_profit)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ALL EXPENSES ─────────────────────────────────────────────────────────────
function AllExpenses({ onAdd }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.getExpenses().then(setExpenses).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const del = async (e) => {
    if (!window.confirm("Delete this expense?")) return;
    try { await api.deleteExpense(e.id); load(); } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">All Expenses</h2>
        <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2.5 bg-red-500 text-white rounded-xl font-semibold text-sm hover:bg-red-600 transition-colors">
          <Plus size={16} /> Record Expense
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-5 py-3">Date</th>
                <th className="text-left px-5 py-3">Category</th>
                <th className="text-left px-5 py-3">Description</th>
                <th className="text-right px-5 py-3">Amount</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {expenses.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400 text-sm">{fmtDate(e.date)}</td>
                  <td className="px-5 py-3">
                    <span className="px-2.5 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full text-xs font-semibold">{e.category}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-700 dark:text-gray-200 text-sm">{e.description}</td>
                  <td className="px-5 py-3 font-bold text-red-500 text-sm text-right tabular-nums">{formatCurrency(e.amount)}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => del(e)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400 text-sm">No expenses recorded</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── CREATE EXPENSE ───────────────────────────────────────────────────────────
function CreateExpense({ onSaved }) {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ category: "", description: "", amount: "", date: today(), payment_method: "cash", reference: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const DEFAULT_CATS = ["Rent", "Utilities", "Salaries", "Supplies", "Marketing", "Maintenance", "Food & Beverage", "Equipment", "Other"];

  useEffect(() => {
    api.getAccountCategories("expense").then((c) => {
      setCategories(c.length ? c : DEFAULT_CATS.map((n) => ({ name: n })));
    }).catch(() => setCategories(DEFAULT_CATS.map((n) => ({ name: n }))));
  }, []);

  useEffect(() => {
    if (categories.length) setForm((f) => ({ ...f, category: f.category || categories[0].name }));
  }, [categories]);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await api.createExpense({ category: form.category, description: form.description, amount: parseFloat(form.amount), date: form.date });
      setDone(true);
      setTimeout(() => { setDone(false); setForm({ category: categories[0]?.name || "", description: "", amount: "", date: today(), payment_method: "cash", reference: "" }); onSaved?.(); }, 1500);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-6">Create Expense</h2>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6 max-w-lg mx-auto">
        {done && (
          <div className="mb-4 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-400 text-sm font-semibold">
            ✓ Expense recorded successfully
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={LABEL}>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={INPUT}>
              {categories.map((c) => <option key={c.name || c} value={c.name || c}>{c.name || c}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Description</label>
            <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={INPUT} placeholder="e.g. Monthly rent payment" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Amount</label>
              <input required type="number" step="0.01" min="0" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className={INPUT} placeholder="0.00" />
            </div>
            <div>
              <label className={LABEL}>Date</label>
              <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={INPUT} />
            </div>
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Record Expense"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── ALL DEPOSITS ─────────────────────────────────────────────────────────────
function AllDeposits({ onAdd }) {
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.getDeposits().then(setDeposits).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const del = async (d) => {
    if (!window.confirm("Delete this deposit?")) return;
    try { await api.deleteDeposit(d.id); load(); } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">All Deposits</h2>
        <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-xl font-semibold text-sm hover:bg-green-600 transition-colors">
          <Plus size={16} /> Add Deposit
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-5 py-3">Date</th>
                <th className="text-left px-5 py-3">Category</th>
                <th className="text-left px-5 py-3">Description</th>
                <th className="text-left px-5 py-3">Method</th>
                <th className="text-right px-5 py-3">Amount</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {deposits.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400 text-sm">{fmtDate(d.date)}</td>
                  <td className="px-5 py-3">
                    <span className="px-2.5 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full text-xs font-semibold">{d.category}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-700 dark:text-gray-200 text-sm">{d.description}</td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400 text-sm capitalize">{d.payment_method}</td>
                  <td className="px-5 py-3 font-bold text-green-600 text-sm text-right tabular-nums">{formatCurrency(d.amount)}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => del(d)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
              {deposits.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">No deposits recorded</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── CREATE DEPOSIT ───────────────────────────────────────────────────────────
function CreateDeposit({ onSaved }) {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ category: "", description: "", amount: "", date: today(), payment_method: "cash", reference: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const DEFAULT_CATS = ["Sales Revenue", "Loan", "Investment", "Refund", "Other Income"];

  useEffect(() => {
    api.getAccountCategories("deposit").then((c) => {
      setCategories(c.length ? c : DEFAULT_CATS.map((n) => ({ name: n })));
    }).catch(() => setCategories(DEFAULT_CATS.map((n) => ({ name: n }))));
  }, []);

  useEffect(() => {
    if (categories.length) setForm((f) => ({ ...f, category: f.category || categories[0].name }));
  }, [categories]);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await api.createDeposit({ ...form, amount: parseFloat(form.amount) });
      setDone(true);
      setTimeout(() => { setDone(false); setForm({ category: categories[0]?.name || "", description: "", amount: "", date: today(), payment_method: "cash", reference: "" }); onSaved?.(); }, 1500);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  return (
    <div>
      <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-6">Create Deposit</h2>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6 max-w-lg mx-auto">
        {done && (
          <div className="mb-4 px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl text-green-700 dark:text-green-400 text-sm font-semibold">
            ✓ Deposit recorded successfully
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className={LABEL}>Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={INPUT}>
              {categories.map((c) => <option key={c.name || c} value={c.name || c}>{c.name || c}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Description</label>
            <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={INPUT} placeholder="e.g. Daily sales deposit" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Amount</label>
              <input required type="number" step="0.01" min="0" value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className={INPUT} placeholder="0.00" />
            </div>
            <div>
              <label className={LABEL}>Date</label>
              <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Payment Method</label>
              <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className={INPUT}>
                {["cash", "card", "bank transfer", "mobile money", "cheque"].map((m) => (
                  <option key={m} value={m} className="capitalize">{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Reference (Optional)</label>
              <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })}
                className={INPUT} placeholder="Ref / receipt no." />
            </div>
          </div>
          {error && <p className="text-red-500 text-xs">{error}</p>}
          <button type="submit" disabled={saving}
            className="w-full py-3 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Record Deposit"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── CATEGORY MANAGER (shared for expense & deposit) ─────────────────────────
function CategoryManager({ type, label, color }) {
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = () => {
    setLoading(true);
    api.getAccountCategories(type).then(setCats).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [type]);

  const submit = async (e) => {
    e.preventDefault(); if (!name.trim()) return;
    setSaving(true); setErr("");
    try {
      await api.createAccountCategory({ name: name.trim(), type });
      setName(""); setShowAdd(false); load();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };

  const del = async (c) => {
    if (!window.confirm(`Delete category "${c.name}"?`)) return;
    try { await api.deleteAccountCategory(c.id); load(); } catch (ex) { alert(ex.message); }
  };

  const accent = color === "green" ? "bg-green-500 hover:bg-green-600" : "bg-red-500 hover:bg-red-600";
  const badge  = color === "green" ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">{label}</h2>
        <button onClick={() => { setShowAdd(true); setErr(""); }}
          className={cn("flex items-center gap-2 px-4 py-2.5 text-white rounded-xl font-semibold text-sm transition-colors", accent)}>
          <Plus size={16} /> Add Category
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cats.map((c) => (
            <div key={c.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Tag size={16} className="text-gray-500 dark:text-gray-400" />
                </div>
                <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold", badge)}>{c.name}</span>
              </div>
              <button onClick={() => del(c)} className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {cats.length === 0 && (
            <div className="col-span-3 py-16 text-center text-gray-400 text-sm">
              <Tag size={36} className="mx-auto mb-3 opacity-20" />
              No categories yet
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <Modal title={`Add ${label.replace(" Categories", "")} Category`} onClose={() => setShowAdd(false)}>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className={LABEL}>Category Name</label>
              <input required autoFocus value={name} onChange={(e) => setName(e.target.value)}
                className={INPUT} placeholder="e.g. Rent, Utilities…" />
            </div>
            {err && <p className="text-red-500 text-xs">{err}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className={cn("flex-1 py-2.5 text-white rounded-xl font-semibold text-sm disabled:opacity-50 transition-colors", accent)}>
                {saving ? "Saving…" : "Add"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── TRANSFERS ────────────────────────────────────────────────────────────────
const ACCOUNTS = ["Cash", "Bank", "Mobile Money", "POS Terminal", "Petty Cash", "Savings"];

function Transfers() {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ from_account: "Cash", to_account: "Bank", amount: "", description: "", date: today(), reference: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = () => {
    setLoading(true);
    api.getTransfers().then(setTransfers).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (form.from_account === form.to_account) { setErr("From and To accounts must be different"); return; }
    setSaving(true); setErr("");
    try {
      await api.createTransfer({ ...form, amount: parseFloat(form.amount) });
      setShowAdd(false);
      setForm({ from_account: "Cash", to_account: "Bank", amount: "", description: "", date: today(), reference: "" });
      load();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };

  const del = async (t) => {
    if (!window.confirm("Delete this transfer?")) return;
    try { await api.deleteTransfer(t.id); load(); } catch (ex) { alert(ex.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">Transfers Money</h2>
        <button onClick={() => { setShowAdd(true); setErr(""); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors">
          <Plus size={16} /> New Transfer
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-5 py-3">Date</th>
                <th className="text-left px-5 py-3">From</th>
                <th className="px-2 py-3"></th>
                <th className="text-left px-5 py-3">To</th>
                <th className="text-left px-5 py-3">Description</th>
                <th className="text-right px-5 py-3">Amount</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {transfers.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400 text-sm">{fmtDate(t.date)}</td>
                  <td className="px-5 py-3">
                    <span className="px-2.5 py-0.5 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 rounded-full text-xs font-semibold">{t.from_account}</span>
                  </td>
                  <td className="px-2 py-3 text-gray-300"><ArrowLeftRight size={14} /></td>
                  <td className="px-5 py-3">
                    <span className="px-2.5 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 rounded-full text-xs font-semibold">{t.to_account}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-600 dark:text-gray-300 text-sm">{t.description || "—"}</td>
                  <td className="px-5 py-3 font-bold text-indigo-600 text-sm text-right tabular-nums">{formatCurrency(t.amount)}</td>
                  <td className="px-5 py-3">
                    <button onClick={() => del(t)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
              {transfers.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-sm">No transfers recorded</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <Modal title="New Transfer" onClose={() => setShowAdd(false)} wide>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>From Account</label>
                <select value={form.from_account} onChange={(e) => setForm({ ...form, from_account: e.target.value })} className={INPUT}>
                  {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>To Account</label>
                <select value={form.to_account} onChange={(e) => setForm({ ...form, to_account: e.target.value })} className={INPUT}>
                  {ACCOUNTS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Amount</label>
                <input required type="number" step="0.01" min="0" value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} className={INPUT} placeholder="0.00" />
              </div>
              <div>
                <label className={LABEL}>Date</label>
                <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={INPUT} />
              </div>
            </div>
            <div>
              <label className={LABEL}>Description (Optional)</label>
              <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className={INPUT} placeholder="Reason for transfer" />
            </div>
            <div>
              <label className={LABEL}>Reference (Optional)</label>
              <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })}
                className={INPUT} placeholder="Transaction reference" />
            </div>
            {err && <p className="text-red-500 text-xs">{err}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Record Transfer"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── TAX SUMMARY ─────────────────────────────────────────────────────────────
function TaxSummary() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());

  const load = () => {
    setLoading(true);
    api.getAccountsDashboard(start, end).then(setData).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [start, end]);

  const taxRate = 0.075; // 7.5% default — in a full implementation this would come from settings
  const taxCollected = data ? data.sales * taxRate : 0;
  const taxOnPurchases = data ? data.purchases * taxRate : 0;
  const netVAT = taxCollected - taxOnPurchases;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">Tax Summary</h2>
      </div>
      <DateBar start={start} end={end} onStart={setStart} onEnd={setEnd} onRefresh={load} />

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : data && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Tax Collected (Output)" value={formatCurrency(taxCollected)} iconBg="bg-indigo-500"
              icon={<TrendingUp size={20} className="text-white" />} valueColor="text-indigo-600" />
            <StatCard label="Tax on Purchases (Input)" value={formatCurrency(taxOnPurchases)} iconBg="bg-orange-500"
              icon={<TrendingDown size={20} className="text-white" />} valueColor="text-orange-600" />
            <StatCard label="Net VAT Payable" value={formatCurrency(netVAT)} iconBg={netVAT >= 0 ? "bg-red-500" : "bg-green-500"}
              icon={<Wallet size={20} className="text-white" />} valueColor={netVAT >= 0 ? "text-red-600" : "text-green-600"} />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-bold text-gray-900 dark:text-white">Tax Calculation Breakdown</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {[
                { label: "Total Sales (Excl. Tax)",   value: data.sales,            color: "text-green-600" },
                { label: "Output Tax (7.5%)",          value: taxCollected,          color: "text-indigo-600" },
                { label: "Total Purchases (Excl. Tax)",value: data.purchases,        color: "text-orange-600" },
                { label: "Input Tax (7.5%)",           value: taxOnPurchases,        color: "text-orange-600" },
                { label: "Net VAT Payable",            value: netVAT,                color: netVAT >= 0 ? "text-red-600" : "text-green-600", bold: true },
              ].map(({ label, value, color, bold }) => (
                <div key={label} className={cn("flex justify-between px-6 py-3.5", bold && "bg-gray-50 dark:bg-gray-900")}>
                  <span className={cn("text-sm text-gray-700 dark:text-gray-200", bold && "font-bold")}>{label}</span>
                  <span className={cn("text-sm font-semibold tabular-nums", color, bold && "font-black text-base")}>{formatCurrency(value)}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400 px-1">Tax rate is indicative (7.5%). Configure your tax rate in Settings → Tax Settings.</p>
        </div>
      )}
    </div>
  );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function AccountsSection({ view = "dashboard", onViewChange }) {
  const go = (id) => onViewChange?.(id);

  const renderView = () => {
    switch (view) {
      case "dashboard":          return <Dashboard />;
      case "profit-loss":        return <ProfitLoss />;
      case "tax-summary":        return <TaxSummary />;
      case "expenses":           return <AllExpenses onAdd={() => go("create-expense")} />;
      case "create-expense":     return <CreateExpense onSaved={() => go("expenses")} />;
      case "expense-categories": return <CategoryManager type="expense" label="Expense Categories" color="red" />;
      case "deposits":           return <AllDeposits onAdd={() => go("create-deposit")} />;
      case "create-deposit":     return <CreateDeposit onSaved={() => go("deposits")} />;
      case "deposit-categories": return <CategoryManager type="deposit" label="Deposit Categories" color="green" />;
      case "transfers":          return <Transfers />;
      default:                   return <Dashboard />;
    }
  };

  return (
    <div className="w-full">
      {renderView()}
    </div>
  );
}
