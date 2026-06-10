import React, { useEffect, useState } from "react";
import {
  ArrowLeftRight, BookOpen, FolderOpen, AlertCircle,
  Minus, Plus, Receipt, RefreshCw, Tag, Trash2, TrendingDown,
  TrendingUp, Wallet, X, FileText, DollarSign, Clock, CheckCircle2,
  BarChart2, CreditCard, Activity, Users, Target, Globe, Scale, Landmark, Eye,
} from "lucide-react";
import { api } from "../lib/api";
import { cn, formatCurrency } from "../lib/utils";
import ExportBtn from "../components/ExportBtn";
import { downloadCSV, printReport } from "../lib/export";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split("T")[0]; }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; }
function fmtDate(s) { return new Date(s).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }); }

const INPUT = "w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-white focus:outline-none focus:border-indigo-400 bg-white dark:bg-gray-800";
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

// ─── Pagination Controls ──────────────────────────────────────────────────────
function Pagination({ page, totalPages, count, pageSize, onPage }) {
  if (totalPages <= 1) return null;
  const start = (page - 1) * pageSize + 1;
  const end   = Math.min(page * pageSize, count);
  return (
    <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
      <p className="text-xs text-gray-500">{start}–{end} of {count}</p>
      <div className="flex gap-1 items-center">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page === 1}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40">Prev</button>
        <span className="px-2 py-1.5 text-xs text-gray-500">{page}/{totalPages}</span>
        <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function DetailModal({ title, fields, onClose, extra }) {
  return (
    <Modal title={title} onClose={onClose} wide>
      <dl className="space-y-3">
        {fields.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 py-1 border-b border-gray-50 dark:border-gray-700 last:border-0">
            <dt className="text-xs font-bold text-gray-400 uppercase tracking-wider flex-shrink-0 pt-0.5 w-36">{label}</dt>
            <dd className="text-sm font-semibold text-gray-900 dark:text-white text-right break-words max-w-[260px]">{value ?? "—"}</dd>
          </div>
        ))}
      </dl>
      {extra && <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">{extra}</div>}
    </Modal>
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
        {data && (
          <ExportBtn
            onCSV={() => {
              const rows = [
                ...Object.entries(data.payment_breakdown || {}).map(([m, i]) => ["Payment", m, i.count, i.total]),
                ...Object.entries(data.expense_by_category || {}).map(([c, a]) => ["Expense Category", c, "", a]),
              ];
              downloadCSV(`dashboard_${start}_${end}`, ["Section", "Label", "Count", "Amount"], rows);
            }}
            onPrint={() => printReport({
              title: "Accounts Dashboard",
              subtitle: `${start} to ${end}`,
              summaryRows: cards.map((c) => [c.label, c.value]),
              headers: ["Section", "Label", "Count", "Amount"],
              rows: [
                ...Object.entries(data.payment_breakdown || {}).map(([m, i]) => ["Payment", m, i.count, formatCurrency(i.total)]),
                ...Object.entries(data.expense_by_category || {}).map(([c, a]) => ["Expense", c, "", formatCurrency(a)]),
              ],
            })}
          />
        )}
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
        {data && (
          <ExportBtn
            onCSV={() => downloadCSV(`profit_loss_${start}_${end}`, ["Item", "Amount"], [
              ["Total Sales", data.sales], ["Other Deposits", data.deposits_total || 0],
              ["Total Revenue", data.sales + (data.deposits_total || 0)],
              ["COGS", data.cogs], ["Gross Profit", data.gross_profit],
              ...Object.entries(data.expense_by_category || {}).map(([c, a]) => [c, a]),
              ["Total Expenses", data.expenses_total], ["Net Profit / Loss", data.net_profit],
            ])}
            onPrint={() => printReport({
              title: "Profit & Loss Statement",
              subtitle: `${start} to ${end}`,
              headers: ["Item", "Amount"],
              rows: [
                ["Total Sales", formatCurrency(data.sales)], ["Other Deposits", formatCurrency(data.deposits_total || 0)],
                ["Total Revenue", formatCurrency(data.sales + (data.deposits_total || 0))],
                ["COGS", formatCurrency(data.cogs)], ["Gross Profit", formatCurrency(data.gross_profit)],
                ...Object.entries(data.expense_by_category || {}).map(([c, a]) => [c, formatCurrency(a)]),
                ["Total Expenses", formatCurrency(data.expenses_total)], ["Net Profit / Loss", formatCurrency(data.net_profit)],
              ],
            })}
          />
        )}
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
  const [page, setPage] = useState(1);
  const [viewExp, setViewExp] = useState(null);
  const PAGE = 25;

  const load = () => {
    setLoading(true);
    api.getExpenses().then((data) => { setExpenses(data); setPage(1); }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const del = async (e) => {
    if (!window.confirm("Delete this expense?")) return;
    try { await api.deleteExpense(e.id); load(); } catch (err) { alert(err.message); }
  };

  const totalPages = Math.max(1, Math.ceil(expenses.length / PAGE));
  const paged = expenses.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">All Expenses</h2>
        <div className="flex items-center gap-2">
          {expenses.length > 0 && (
            <ExportBtn
              onCSV={() => downloadCSV("expenses", ["Date", "Category", "Description", "Amount"],
                expenses.map((e) => [fmtDate(e.date), e.category, e.description, e.amount]))}
              onPrint={() => printReport({
                title: "All Expenses",
                summaryRows: [["Total", formatCurrency(expenses.reduce((s, e) => s + e.amount, 0))]],
                headers: ["Date", "Category", "Description", "Amount"],
                rows: expenses.map((e) => [fmtDate(e.date), e.category, e.description, formatCurrency(e.amount)]),
              })}
            />
          )}
          <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2.5 bg-red-500 text-white rounded-xl font-semibold text-sm hover:bg-red-600 transition-colors">
            <Plus size={16} /> Record Expense
          </button>
        </div>
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
              {paged.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors cursor-pointer" onClick={() => setViewExp(e)}>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400 text-sm">{fmtDate(e.date)}</td>
                  <td className="px-5 py-3">
                    <span className="px-2.5 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-full text-xs font-semibold">{e.category}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-700 dark:text-gray-200 text-sm">{e.description}</td>
                  <td className="px-5 py-3 font-bold text-red-500 text-sm text-right tabular-nums">{formatCurrency(e.amount)}</td>
                  <td className="px-5 py-3" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => setViewExp(e)} className="text-gray-300 hover:text-indigo-500 transition-colors"><Eye size={15} /></button>
                      <button onClick={() => del(e)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400 text-sm">No expenses recorded</td></tr>
              )}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} count={expenses.length} pageSize={PAGE} onPage={setPage} />
        </div>
      )}

      {viewExp && (
        <DetailModal
          title="Expense Detail"
          onClose={() => setViewExp(null)}
          fields={[
            ["Date",        fmtDate(viewExp.date)],
            ["Category",    viewExp.category],
            ["Description", viewExp.description],
            ["Amount",      formatCurrency(viewExp.amount)],
            ["Payment Method", viewExp.payment_method || "—"],
            ["Reference",   viewExp.reference || "—"],
          ]}
        />
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
  const [page, setPage] = useState(1);
  const [viewDep, setViewDep] = useState(null);
  const PAGE = 25;

  const load = () => {
    setLoading(true);
    api.getDeposits().then((data) => { setDeposits(data); setPage(1); }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const del = async (d) => {
    if (!window.confirm("Delete this deposit?")) return;
    try { await api.deleteDeposit(d.id); load(); } catch (err) { alert(err.message); }
  };

  const totalPages = Math.max(1, Math.ceil(deposits.length / PAGE));
  const paged = deposits.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">All Deposits</h2>
        <div className="flex items-center gap-2">
          {deposits.length > 0 && (
            <ExportBtn
              onCSV={() => downloadCSV("deposits", ["Date", "Category", "Description", "Method", "Amount"],
                deposits.map((d) => [fmtDate(d.date), d.category, d.description, d.payment_method, d.amount]))}
              onPrint={() => printReport({
                title: "All Deposits",
                summaryRows: [["Total", formatCurrency(deposits.reduce((s, d) => s + d.amount, 0))]],
                headers: ["Date", "Category", "Description", "Method", "Amount"],
                rows: deposits.map((d) => [fmtDate(d.date), d.category, d.description, d.payment_method, formatCurrency(d.amount)]),
              })}
            />
          )}
          <button onClick={onAdd} className="flex items-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-xl font-semibold text-sm hover:bg-green-600 transition-colors">
            <Plus size={16} /> Add Deposit
          </button>
        </div>
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
              {paged.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors cursor-pointer" onClick={() => setViewDep(d)}>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400 text-sm">{fmtDate(d.date)}</td>
                  <td className="px-5 py-3">
                    <span className="px-2.5 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-full text-xs font-semibold">{d.category}</span>
                  </td>
                  <td className="px-5 py-3 text-gray-700 dark:text-gray-200 text-sm">{d.description}</td>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400 text-sm capitalize">{d.payment_method}</td>
                  <td className="px-5 py-3 font-bold text-green-600 text-sm text-right tabular-nums">{formatCurrency(d.amount)}</td>
                  <td className="px-5 py-3" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => setViewDep(d)} className="text-gray-300 hover:text-indigo-500 transition-colors"><Eye size={15} /></button>
                      <button onClick={() => del(d)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {deposits.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400 text-sm">No deposits recorded</td></tr>
              )}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} count={deposits.length} pageSize={PAGE} onPage={setPage} />
        </div>
      )}

      {viewDep && (
        <DetailModal
          title="Deposit Detail"
          onClose={() => setViewDep(null)}
          fields={[
            ["Date",        fmtDate(viewDep.date)],
            ["Category",    viewDep.category],
            ["Description", viewDep.description],
            ["Amount",      formatCurrency(viewDep.amount)],
            ["Payment Method", viewDep.payment_method || "—"],
            ["Reference",   viewDep.reference || "—"],
          ]}
        />
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
  const [viewTransfer, setViewTransfer] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE = 25;
  const [form, setForm] = useState({ from_account: "Cash", to_account: "Bank", amount: "", description: "", date: today(), reference: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = () => {
    setLoading(true);
    api.getTransfers().then((data) => { setTransfers(data); setPage(1); }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const totalPagesT = Math.max(1, Math.ceil(transfers.length / PAGE));
  const pagedT = transfers.slice((page - 1) * PAGE, page * PAGE);

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
        <div className="flex items-center gap-2">
          {transfers.length > 0 && (
            <ExportBtn
              onCSV={() => downloadCSV("transfers", ["Date", "From", "To", "Description", "Amount"],
                transfers.map((t) => [fmtDate(t.date), t.from_account, t.to_account, t.description || "", t.amount]))}
              onPrint={() => printReport({
                title: "Transfers",
                summaryRows: [["Total", formatCurrency(transfers.reduce((s, t) => s + t.amount, 0))]],
                headers: ["Date", "From", "To", "Description", "Amount"],
                rows: transfers.map((t) => [fmtDate(t.date), t.from_account, t.to_account, t.description || "—", formatCurrency(t.amount)]),
              })}
            />
          )}
          <button onClick={() => { setShowAdd(true); setErr(""); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors">
            <Plus size={16} /> New Transfer
          </button>
        </div>
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
              {pagedT.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors cursor-pointer" onClick={() => setViewTransfer(t)}>
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
                  <td className="px-5 py-3" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => setViewTransfer(t)} className="text-gray-300 hover:text-indigo-500 transition-colors"><Eye size={15} /></button>
                      <button onClick={() => del(t)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {transfers.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-gray-400 text-sm">No transfers recorded</td></tr>
              )}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPagesT} count={transfers.length} pageSize={PAGE} onPage={setPage} />
        </div>
      )}

      {viewTransfer && (
        <DetailModal
          title="Transfer Detail"
          onClose={() => setViewTransfer(null)}
          fields={[
            ["Date",        fmtDate(viewTransfer.date)],
            ["From Account", viewTransfer.from_account],
            ["To Account",  viewTransfer.to_account],
            ["Amount",      formatCurrency(viewTransfer.amount)],
            ["Description", viewTransfer.description || "—"],
            ["Reference",   viewTransfer.reference || "—"],
          ]}
        />
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

// ─── SVG Bar Chart ────────────────────────────────────────────────────────────
function BarChart({ data, labelKey = "date", valueKey = "value", color = "#6366f1", height = 120 }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  const W = 100 / data.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      {data.map((d, i) => {
        const barH = (d[valueKey] / max) * (height - 16);
        const x = i * W + W * 0.1;
        const w = W * 0.8;
        return (
          <g key={i}>
            <rect x={x} y={height - 16 - barH} width={w} height={barH}
              fill={color} fillOpacity={0.85} rx={1} />
          </g>
        );
      })}
    </svg>
  );
}

function MiniLineChart({ data, valueKey = "value", color = "#6366f1", height = 60 }) {
  if (!data?.length) return null;
  const max = Math.max(...data.map((d) => d[valueKey]), 1);
  const W = 100 / (data.length - 1 || 1);
  const pts = data.map((d, i) => {
    const x = i * W;
    const y = height - 4 - ((d[valueKey] / max) * (height - 8));
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 100 ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      <polyline fill="none" stroke={color} strokeWidth="2" points={pts} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── CASH FLOW ────────────────────────────────────────────────────────────────
function CashFlowView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());
  const [page, setPage] = useState(1);
  const PAGE = 20;

  const load = () => {
    setLoading(true);
    api.getCashFlow(start, end).then(setData).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [start, end]);

  const timeline = data?.timeline || [];
  const totalPages = Math.max(1, Math.ceil(timeline.length / PAGE));
  const paged = timeline.slice((page - 1) * PAGE, page * PAGE);

  const Spinner = () => <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <Activity size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900 dark:text-white">Cash Flow</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Inflows vs outflows with running balance</p>
          </div>
        </div>
        {data && (
          <ExportBtn
            onCSV={() => downloadCSV(`cash_flow_${start}_${end}`, ["Date", "Inflow", "Outflow", "Net", "Balance"],
              timeline.map((r) => [fmtDate(r.date), r.inflow, r.outflow, r.net, r.balance]))}
            onPrint={() => printReport({
              title: "Cash Flow Statement",
              subtitle: `${start} to ${end}`,
              summaryRows: [["Total Inflow", formatCurrency(data.total_inflow)], ["Total Outflow", formatCurrency(data.total_outflow)], ["Net Cash Flow", formatCurrency(data.net_cash_flow)], ["Closing Balance", formatCurrency(data.closing_balance)]],
              headers: ["Date", "Inflow", "Outflow", "Net", "Balance"],
              rows: timeline.map((r) => [fmtDate(r.date), formatCurrency(r.inflow), formatCurrency(r.outflow), formatCurrency(r.net), formatCurrency(r.balance)]),
            })}
          />
        )}
      </div>

      <DateBar start={start} end={end} onStart={setStart} onEnd={setEnd} onRefresh={load} />

      {loading ? <Spinner /> : !data ? (
        <p className="text-center text-gray-400 py-16 text-sm">Failed to load. Try again.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total Inflow",    value: formatCurrency(data.total_inflow),    iconBg: "bg-green-500",  icon: <TrendingUp size={20} className="text-white" />,   valueColor: "text-green-600" },
              { label: "Total Outflow",   value: formatCurrency(data.total_outflow),   iconBg: "bg-red-500",    icon: <TrendingDown size={20} className="text-white" />, valueColor: "text-red-500" },
              { label: "Net Cash Flow",   value: formatCurrency(data.net_cash_flow),   iconBg: data.net_cash_flow >= 0 ? "bg-blue-500" : "bg-orange-500", icon: <BarChart2 size={20} className="text-white" />, valueColor: data.net_cash_flow >= 0 ? "text-blue-600" : "text-orange-600" },
              { label: "Closing Balance", value: formatCurrency(data.closing_balance), iconBg: "bg-indigo-500", icon: <Wallet size={20} className="text-white" />,       valueColor: "text-indigo-600" },
            ].map((c) => <StatCard key={c.label} {...c} />)}
          </div>

          {timeline.length > 1 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-5 mb-6">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Daily Inflow vs Outflow</p>
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <p className="text-[10px] text-green-500 font-semibold mb-1">Inflow</p>
                  <BarChart data={timeline} labelKey="date" valueKey="inflow" color="#22c55e" height={80} />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] text-red-400 font-semibold mb-1">Outflow</p>
                  <BarChart data={timeline} labelKey="date" valueKey="outflow" color="#f87171" height={80} />
                </div>
              </div>
              <p className="text-[10px] text-gray-400 font-semibold mt-3 mb-1">Running Balance</p>
              <MiniLineChart data={timeline} valueKey="balance" color="#6366f1" height={50} />
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-5 py-3">Date</th>
                  <th className="text-right px-4 py-3">Inflow</th>
                  <th className="text-right px-4 py-3">Outflow</th>
                  <th className="text-right px-4 py-3">Net</th>
                  <th className="text-right px-5 py-3">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {paged.map((row) => (
                  <tr key={row.date} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">{fmtDate(row.date)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-green-600">{formatCurrency(row.inflow)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold text-red-500">{formatCurrency(row.outflow)}</td>
                    <td className={cn("px-4 py-3 text-right text-sm font-bold", row.net >= 0 ? "text-blue-600" : "text-orange-500")}>{row.net >= 0 ? "+" : ""}{formatCurrency(row.net)}</td>
                    <td className="px-5 py-3 text-right text-sm font-black text-gray-900 dark:text-white tabular-nums">{formatCurrency(row.balance)}</td>
                  </tr>
                ))}
                {timeline.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-gray-400 text-sm">No transactions in this period</td></tr>}
              </tbody>
            </table>
            </div>
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <p className="text-xs text-gray-500">{(page - 1) * PAGE + 1}–{Math.min(page * PAGE, timeline.length)} of {timeline.length}</p>
                <div className="flex gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-40">Prev</button>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── INVOICE TRACKING ────────────────────────────────────────────────────────
const AGING_COLORS = {
  "0-7 days":   { badge: "bg-green-100 text-green-700",  row: "" },
  "8-30 days":  { badge: "bg-yellow-100 text-yellow-700", row: "bg-yellow-50/30 dark:bg-yellow-900/10" },
  "31-60 days": { badge: "bg-orange-100 text-orange-700", row: "bg-orange-50/30 dark:bg-orange-900/10" },
  "60+ days":   { badge: "bg-red-100 text-red-700",       row: "bg-red-50/30 dark:bg-red-900/10" },
};

function InvoiceTrackingView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [viewInv, setViewInv] = useState(null);
  const PAGE = 25;

  const load = () => {
    setLoading(true);
    api.getInvoices().then(setData).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const invoices = (data?.invoices || []).filter((inv) => {
    const matchSearch = !search || (inv.order_number || "").toLowerCase().includes(search.toLowerCase()) ||
      (inv.customer_name || "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || inv.invoice_status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalPagesInv = Math.max(1, Math.ceil(invoices.length / PAGE));
  const pagedInv = invoices.slice((page - 1) * PAGE, page * PAGE);

  const BUCKET_ORDER = ["0-7 days", "8-30 days", "31-60 days", "60+ days"];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <FileText size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900 dark:text-white">Invoice Tracking</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Outstanding & overdue invoices</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <ExportBtn
              onCSV={() => downloadCSV("invoices", ["Order #", "Customer", "Date", "Days Open", "Aging", "Amount"],
                (data.invoices || []).map((inv) => [inv.order_number || "—", inv.customer_name || "Walk-in", fmtDate(inv.created_at), inv.days_outstanding, inv.aging_bucket, inv.total]))}
              onPrint={() => printReport({
                title: "Invoice Tracking",
                summaryRows: [["Total Outstanding", formatCurrency(data.total_outstanding)], ["Overdue Invoices", String(data.overdue_count)], ["Total Open", String((data.invoices || []).length)]],
                headers: ["Order #", "Customer", "Date", "Days Open", "Aging", "Amount"],
                rows: (data.invoices || []).map((inv) => [inv.order_number || "—", inv.customer_name || "Walk-in", fmtDate(inv.created_at), inv.days_outstanding, inv.aging_bucket, formatCurrency(inv.total)]),
              })}
            />
          )}
          <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : !data ? null : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <StatCard label="Total Outstanding" value={formatCurrency(data.total_outstanding)} iconBg="bg-blue-500"
              icon={<CreditCard size={20} className="text-white" />} valueColor="text-blue-600" />
            <StatCard label="Overdue Invoices" value={data.overdue_count} iconBg="bg-red-500"
              icon={<AlertCircle size={20} className="text-white" />} valueColor="text-red-600" />
            <StatCard label="Total Open" value={data.invoices.length} iconBg="bg-indigo-500"
              icon={<FileText size={20} className="text-white" />} valueColor="text-indigo-600" />
          </div>

          {data.aging_summary && Object.keys(data.aging_summary).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {BUCKET_ORDER.filter((b) => data.aging_summary[b]).map((bucket) => {
                const info = data.aging_summary[bucket];
                const colors = AGING_COLORS[bucket];
                return (
                  <div key={bucket} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4 text-center">
                    <span className={cn("inline-block px-2.5 py-0.5 rounded-full text-xs font-bold mb-2", colors.badge)}>{bucket}</span>
                    <p className="text-2xl font-black text-gray-900 dark:text-white">{info.count}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatCurrency(info.total)}</p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order # or customer…"
                className="w-full pl-4 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none bg-white dark:bg-gray-800 dark:text-white" />
            </div>
            {["all", "open", "settled"].map((f) => (
              <button key={f} onClick={() => setStatusFilter(f)}
                className={cn("px-4 py-2 rounded-xl text-sm font-semibold capitalize transition-colors",
                  statusFilter === f ? "bg-blue-600 text-white" : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700")}>
                {f === "all" ? "All" : f === "open" ? "Open (Unpaid)" : "Settled"}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-5 py-3">Order #</th>
                  <th className="text-left px-4 py-3">Customer</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-center px-4 py-3">Days</th>
                  <th className="text-center px-4 py-3">Aging</th>
                  <th className="text-center px-4 py-3">Status</th>
                  <th className="text-right px-5 py-3">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {pagedInv.map((inv) => {
                  const colors = AGING_COLORS[inv.aging_bucket] || AGING_COLORS["0-7 days"];
                  return (
                    <tr key={inv.id} className={cn("transition-colors hover:brightness-95 cursor-pointer", colors.row)} onClick={() => setViewInv(inv)}>
                      <td className="px-5 py-3 font-semibold text-gray-900 dark:text-white text-sm">{inv.order_number || "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{inv.customer_name || "Walk-in"}</td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{fmtDate(inv.created_at)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("font-bold text-sm", inv.overdue ? "text-red-500" : "text-gray-700 dark:text-gray-200")}>{inv.days_outstanding}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold", colors.badge)}>{inv.aging_bucket}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold",
                          inv.invoice_status === "open" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" : "bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400")}>
                          {inv.invoice_status === "open" ? "Open" : "Settled"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-gray-900 dark:text-white text-sm tabular-nums">{formatCurrency(inv.total)}</td>
                    </tr>
                  );
                })}
                {invoices.length === 0 && <tr><td colSpan={7} className="px-5 py12 text-center text-gray-400 text-sm">{(data.invoices || []).length === 0 ? "No invoices found" : "No results match your filter"}</td></tr>}
              </tbody>
            </table>
            <Pagination page={page} totalPages={totalPagesInv} count={invoices.length} pageSize={PAGE} onPage={setPage} />
          </div>
        </>
      )}

      {viewInv && (
        <DetailModal
          title={`Invoice — ${viewInv.order_number || "Order"}`}
          onClose={() => setViewInv(null)}
          fields={[
            ["Order #",       viewInv.order_number || "—"],
            ["Customer",      viewInv.customer_name || "Walk-in"],
            ["Date",          fmtDate(viewInv.created_at)],
            ["Amount",        formatCurrency(viewInv.total)],
            ["Days Open",     String(viewInv.days_outstanding)],
            ["Aging Bucket",  viewInv.aging_bucket],
            ["Status",        viewInv.invoice_status === "open" ? "Open (Unpaid)" : "Settled"],
            ["Overdue",       viewInv.overdue ? "Yes" : "No"],
            ["Order Status",  viewInv.status || "—"],
          ]}
          extra={viewInv.items?.length ? (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Order Items</p>
              <div className="space-y-1">
                {viewInv.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-200">{item.qty || item.quantity}× {item.name}</span>
                    <span className="font-semibold text-gray-900 dark:text-white tabular-nums">{formatCurrency((item.price || 0) * (item.qty || item.quantity || 1))}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        />
      )}
    </div>
  );
}

// ─── VAT MANAGEMENT (enhanced TaxSummary) ────────────────────────────────────
function VatManagementView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());

  const load = () => {
    setLoading(true);
    api.getAccountsDashboard(start, end).then(setData).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [start, end]);

  const taxRate = 0.075;
  const taxCollected = data ? data.sales * taxRate : 0;
  const taxOnPurchases = data ? data.purchases * taxRate : 0;
  const netVAT = taxCollected - taxOnPurchases;

  // Next VAT filing deadline — Nigerian quarterly: Mar 21, Jun 21, Sep 21, Dec 21
  const now = new Date();
  const quarters = [
    new Date(now.getFullYear(), 2, 21),
    new Date(now.getFullYear(), 5, 21),
    new Date(now.getFullYear(), 8, 21),
    new Date(now.getFullYear(), 11, 21),
    new Date(now.getFullYear() + 1, 2, 21),
  ];
  const nextDeadline = quarters.find((d) => d > now) || quarters[quarters.length - 1];
  const daysToDeadline = Math.ceil((nextDeadline - now) / 86400000);
  const deadlineUrgent = daysToDeadline <= 14;

  const monthlyRows = data?.daily_sales
    ? Object.entries(
        data.daily_sales.reduce((acc, d) => {
          const month = d.date?.slice(0, 7) || "Unknown";
          acc[month] = (acc[month] || 0) + d.revenue;
          return acc;
        }, {})
      ).map(([month, rev]) => ({ month, revenue: rev, tax: rev * taxRate }))
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-violet-600 rounded-2xl flex items-center justify-center flex-shrink-0">
            <DollarSign size={20} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900 dark:text-white">Tax & VAT Management</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">VAT liability, filing deadlines & monthly breakdown</p>
          </div>
        </div>
        {data && (
          <ExportBtn
            onCSV={() => downloadCSV(`vat_${start}_${end}`, ["Month", "Revenue", "VAT (7.5%)"],
              monthlyRows.map((r) => [r.month, r.revenue, r.tax]))}
            onPrint={() => printReport({
              title: "Tax & VAT Report",
              subtitle: `${start} to ${end}`,
              summaryRows: [["Output VAT Collected", formatCurrency(taxCollected)], ["Input VAT Claimable", formatCurrency(taxOnPurchases)], ["Net VAT Payable", formatCurrency(netVAT)]],
              headers: ["Month", "Revenue", "VAT (7.5%)"],
              rows: monthlyRows.map((r) => [r.month, formatCurrency(r.revenue), formatCurrency(r.tax)]),
            })}
          />
        )}
      </div>

      <div className={cn("flex items-start gap-3 p-4 rounded-xl border mb-6",
        deadlineUrgent
          ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
          : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800")}>
        <Clock size={18} className={cn("flex-shrink-0 mt-0.5", deadlineUrgent ? "text-red-500" : "text-amber-500")} />
        <div>
          <p className={cn("text-sm font-bold", deadlineUrgent ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300")}>
            Next VAT filing deadline: {nextDeadline.toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p className={cn("text-xs mt-0.5", deadlineUrgent ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400")}>
            {daysToDeadline} day{daysToDeadline !== 1 ? "s" : ""} remaining · {deadlineUrgent ? "Filing soon — prepare your return" : "Quarterly VAT return"}
          </p>
        </div>
      </div>

      <DateBar start={start} end={end} onStart={setStart} onEnd={setEnd} onRefresh={load} />

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : data && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Output VAT (Collected)" value={formatCurrency(taxCollected)} iconBg="bg-indigo-500"
              icon={<TrendingUp size={20} className="text-white" />} valueColor="text-indigo-600" />
            <StatCard label="Input VAT (Claimable)" value={formatCurrency(taxOnPurchases)} iconBg="bg-orange-500"
              icon={<TrendingDown size={20} className="text-white" />} valueColor="text-orange-600" />
            <StatCard label="Net VAT Payable" value={formatCurrency(netVAT)} iconBg={netVAT >= 0 ? "bg-red-500" : "bg-green-500"}
              icon={<Wallet size={20} className="text-white" />} valueColor={netVAT >= 0 ? "text-red-600" : "text-green-600"} />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 dark:text-white">VAT Calculation</h3>
              <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-full">Rate: 7.5%</span>
            </div>
            {[
              { label: "Total Sales (Excl. VAT)",      value: data.sales,         color: "text-green-600" },
              { label: "Output VAT @ 7.5%",            value: taxCollected,       color: "text-indigo-600" },
              { label: "Total Purchases (Excl. VAT)",  value: data.purchases,     color: "text-orange-600" },
              { label: "Input VAT @ 7.5%",             value: taxOnPurchases,     color: "text-orange-600" },
              { label: "Net VAT Payable / (Refund)",   value: netVAT,             color: netVAT >= 0 ? "text-red-600" : "text-green-600", bold: true },
            ].map(({ label, value, color, bold }) => (
              <div key={label} className={cn("flex justify-between px-6 py-3.5 border-b border-gray-50 dark:border-gray-700", bold && "bg-gray-50 dark:bg-gray-900")}>
                <span className={cn("text-sm text-gray-700 dark:text-gray-200", bold && "font-bold")}>{label}</span>
                <span className={cn("text-sm font-semibold tabular-nums", color, bold && "font-black text-base")}>{formatCurrency(value)}</span>
              </div>
            ))}
          </div>

          {monthlyRows.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-white">Monthly VAT Breakdown</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-6 py-3">Month</th>
                    <th className="text-right px-4 py-3">Revenue</th>
                    <th className="text-right px-6 py-3">VAT (7.5%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {monthlyRows.map(({ month, revenue, tax }) => (
                    <tr key={month} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-6 py-3 text-sm font-semibold text-gray-700 dark:text-gray-200">{month}</td>
                      <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-300 tabular-nums">{formatCurrency(revenue)}</td>
                      <td className="px-6 py-3 text-right text-sm font-bold text-indigo-600 tabular-nums">{formatCurrency(tax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-gray-400 px-1">Configure your VAT rate in Settings → Tax Settings. Deadline dates are indicative (Nigerian quarterly schedule).</p>
        </div>
      )}
    </div>
  );
}

// ─── GENERAL LEDGER ──────────────────────────────────────────────────────────
const LEDGER_TYPE_COLORS = {
  sales:    "bg-green-50  text-green-700  dark:bg-green-900/20  dark:text-green-400",
  expense:  "bg-red-50    text-red-700    dark:bg-red-900/20    dark:text-red-400",
  deposit:  "bg-blue-50   text-blue-700   dark:bg-blue-900/20   dark:text-blue-400",
  purchase: "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400",
  transfer: "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400",
};

function GeneralLedgerView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE = 25;

  const load = () => {
    setLoading(true);
    api.getLedger(start, end, typeFilter !== "all" ? typeFilter : undefined)
      .then(setData).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [start, end, typeFilter]);
  useEffect(() => { setPage(1); }, [typeFilter, start, end]);

  const entries = data?.entries || [];
  const totalPages = Math.ceil(entries.length / PAGE);
  const pageRows = entries.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">General Ledger</h2>
        {data && entries.length > 0 && (
          <ExportBtn
            onCSV={() => downloadCSV(`ledger_${start}_${end}`, ["Date", "Type", "Description", "Reference", "Debit", "Credit", "Balance"],
              entries.map((e) => [fmtDate(e.date), e.type, e.description, e.reference || "", e.debit > 0 ? e.debit : "", e.credit > 0 ? e.credit : "", e.balance]))}
            onPrint={() => printReport({
              title: "General Ledger",
              subtitle: `${start} to ${end}`,
              summaryRows: [["Total Credits", formatCurrency(data.total_credits)], ["Total Debits", formatCurrency(data.total_debits)], ["Net Balance", formatCurrency(data.net_balance)]],
              headers: ["Date", "Type", "Description", "Debit", "Credit", "Balance"],
              rows: entries.map((e) => [fmtDate(e.date), e.type, e.description, e.debit > 0 ? formatCurrency(e.debit) : "—", e.credit > 0 ? formatCurrency(e.credit) : "—", formatCurrency(e.balance)]),
              landscape: true,
            })}
          />
        )}
      </div>
      <DateBar start={start} end={end} onStart={setStart} onEnd={setEnd} onRefresh={load} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Credits" value={formatCurrency(data?.total_credits || 0)} iconBg="bg-green-500" icon={<TrendingUp size={22} className="text-white" />} valueColor="text-green-600" />
        <StatCard label="Total Debits"  value={formatCurrency(data?.total_debits  || 0)} iconBg="bg-red-500"   icon={<TrendingDown size={22} className="text-white" />} valueColor="text-red-500" />
        <StatCard label="Net Balance"   value={formatCurrency(data?.net_balance   || 0)}
          iconBg={(data?.net_balance || 0) >= 0 ? "bg-indigo-500" : "bg-orange-500"}
          icon={<Wallet size={22} className="text-white" />}
          valueColor={(data?.net_balance || 0) >= 0 ? "text-indigo-600" : "text-orange-600"} />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {["all", "sales", "expense", "deposit", "purchase", "transfer"].map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={cn("px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-colors",
              typeFilter === t ? "bg-indigo-600 text-white" : "bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400")}>
            {t === "all" ? "All Entries" : t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Description</th>
                  <th className="text-left px-4 py-3">Reference</th>
                  <th className="text-right px-4 py-3">Debit</th>
                  <th className="text-right px-4 py-3">Credit</th>
                  <th className="text-right px-4 py-3">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {pageRows.map((e, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors dark:bg-gray-900">
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(e.date)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-bold capitalize", LEDGER_TYPE_COLORS[e.type] || "bg-gray-100 text-gray-600")}>{e.type}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200 max-w-[200px] truncate">{e.description}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{e.reference || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-red-500 tabular-nums">{e.debit > 0 ? formatCurrency(e.debit) : "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-green-600 tabular-nums">{e.credit > 0 ? formatCurrency(e.credit) : "—"}</td>
                    <td className={cn("px-4 py-3 text-right font-bold tabular-nums", e.balance >= 0 ? "text-gray-900 dark:text-white" : "text-red-500")}>{formatCurrency(e.balance)}</td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">No entries for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-700">
              <span className="text-xs text-gray-400">{entries.length} entries</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  className="px-3 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">Prev</button>
                <span className="text-xs text-gray-500">{page} / {totalPages}</span>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  className="px-3 py-1.5 border-2 border-gray-200 dark:border-gray-700 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── BALANCE SHEET ────────────────────────────────────────────────────────────
function BalanceSheetView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [asOf, setAsOf] = useState(today());

  const load = () => {
    setLoading(true);
    api.getBalanceSheet(asOf).then(setData).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [asOf]);

  const BSSection = ({ title, bg, textColor, items, total, totalLabel }) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
      <div className={cn("px-6 py-3 border-b border-gray-100 dark:border-gray-700", bg)}>
        <p className={cn("text-xs font-bold uppercase tracking-widest", textColor)}>{title}</p>
      </div>
      {items.map(([label, val]) => (
        <div key={label} className="flex items-center justify-between px-6 py-3 border-b border-gray-50 dark:border-gray-700/50">
          <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white tabular-nums">{formatCurrency(val)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between px-6 py-4">
        <span className="text-sm font-bold text-gray-900 dark:text-white">{totalLabel}</span>
        <span className={cn("text-base font-black tabular-nums", textColor)}>{formatCurrency(total)}</span>
      </div>
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">Balance Sheet</h2>
        <div className="flex items-center gap-2">
        {data && (
          <ExportBtn
            onCSV={() => downloadCSV(`balance_sheet_${asOf}`, ["Section", "Item", "Amount"], [
              ["Assets", "Cash & Equivalents", data.assets.cash_and_equivalents],
              ["Assets", "Inventory Value", data.assets.inventory],
              ["Assets", "Accounts Receivable", data.assets.accounts_receivable],
              ["Assets", "Total Assets", data.assets.total],
              ["Liabilities", "Accounts Payable", data.liabilities.accounts_payable],
              ["Liabilities", "Total Liabilities", data.liabilities.total],
              ["Equity", "Retained Earnings", data.equity.retained_earnings],
              ["Equity", "Total Equity", data.equity.total],
            ])}
            onPrint={() => printReport({
              title: "Balance Sheet",
              subtitle: `As of ${asOf}`,
              headers: ["Section", "Item", "Amount"],
              rows: [
                ["Assets", "Cash & Equivalents", formatCurrency(data.assets.cash_and_equivalents)],
                ["Assets", "Inventory Value", formatCurrency(data.assets.inventory)],
                ["Assets", "Accounts Receivable", formatCurrency(data.assets.accounts_receivable)],
                ["Assets", "Total Assets", formatCurrency(data.assets.total)],
                ["Liabilities", "Accounts Payable", formatCurrency(data.liabilities.accounts_payable)],
                ["Liabilities", "Total Liabilities", formatCurrency(data.liabilities.total)],
                ["Equity", "Retained Earnings", formatCurrency(data.equity.retained_earnings)],
                ["Equity", "Total Equity", formatCurrency(data.equity.total)],
              ],
            })}
          />
        )}
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
          <Scale size={15} className="text-gray-400" />
          <span className="text-xs text-gray-400 font-medium">As of</span>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)}
            className="text-sm text-gray-700 dark:text-gray-200 focus:outline-none bg-transparent" />
        </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : data && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <BSSection
              title="Assets" bg="bg-blue-50 dark:bg-blue-900/20" textColor="text-blue-700 dark:text-blue-400"
              items={[
                ["Cash & Equivalents", data.assets.cash_and_equivalents],
                ["Inventory Value",    data.assets.inventory],
                ["Accounts Receivable", data.assets.accounts_receivable],
              ]}
              total={data.assets.total} totalLabel="Total Assets"
            />
            <div className="space-y-6">
              <BSSection
                title="Liabilities" bg="bg-red-50 dark:bg-red-900/20" textColor="text-red-600 dark:text-red-400"
                items={[["Accounts Payable (POs)", data.liabilities.accounts_payable]]}
                total={data.liabilities.total} totalLabel="Total Liabilities"
              />
              <BSSection
                title="Equity" bg="bg-green-50 dark:bg-green-900/20" textColor="text-green-700 dark:text-green-400"
                items={[["Retained Earnings", data.equity.retained_earnings]]}
                total={data.equity.total} totalLabel="Total Equity"
              />
            </div>
          </div>

          <div className={cn("rounded-2xl p-6 border-2 flex items-center justify-between",
            Math.abs(data.assets.total - data.total_liabilities_and_equity) < 1
              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
              : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700")}>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Assets = Liabilities + Equity</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {Math.abs(data.assets.total - data.total_liabilities_and_equity) < 1 ? "✓ Balance sheet is balanced" : "⚠ Small rounding difference detected"}
              </p>
            </div>
            <p className="text-2xl font-black tabular-nums text-gray-900 dark:text-white">{formatCurrency(data.assets.total)}</p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── BANK RECONCILIATION ──────────────────────────────────────────────────────
function BankReconciliationView() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [showAdd, setShowAdd] = useState(false);
  const [viewBank, setViewBank] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE = 25;
  const [form, setForm] = useState({ date: today(), description: "", amount: "", type: "credit", reference: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = () => {
    setLoading(true);
    api.getBankStatements(period).then((data) => { setEntries(data); setPage(1); }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [period]);

  const totalPagesBank = Math.max(1, Math.ceil(entries.length / PAGE));
  const pagedBank = entries.slice((page - 1) * PAGE, page * PAGE);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setErr("");
    try {
      await api.createBankStatement({ ...form, amount: parseFloat(form.amount) });
      setShowAdd(false);
      setForm({ date: today(), description: "", amount: "", type: "credit", reference: "" });
      load();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };

  const del = async (entry) => {
    if (!window.confirm("Delete this bank entry?")) return;
    try { await api.deleteBankStatement(entry.id); load(); } catch (ex) { alert(ex.message); }
  };

  const totalCredits = entries.filter((e) => e.type === "credit").reduce((s, e) => s + e.amount, 0);
  const totalDebits  = entries.filter((e) => e.type === "debit").reduce((s, e) => s + e.amount, 0);
  const netBalance   = totalCredits - totalDebits;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">Bank Reconciliation</h2>
        <div className="flex items-center gap-3">
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none" />
          {entries.length > 0 && (
            <ExportBtn
              onCSV={() => downloadCSV(`bank_reconciliation_${period}`, ["Date", "Description", "Reference", "Type", "Amount"],
                entries.map((e) => [fmtDate(e.date), e.description, e.reference || "", e.type, e.amount]))}
              onPrint={() => printReport({
                title: "Bank Reconciliation",
                subtitle: `Period: ${period}`,
                summaryRows: [["Total Credits", formatCurrency(totalCredits)], ["Total Debits", formatCurrency(totalDebits)], ["Net Balance", formatCurrency(netBalance)]],
                headers: ["Date", "Description", "Reference", "Type", "Amount"],
                rows: entries.map((e) => [fmtDate(e.date), e.description, e.reference || "—", e.type.toUpperCase(), formatCurrency(e.amount)]),
              })}
            />
          )}
          <button onClick={() => { setShowAdd(true); setErr(""); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors">
            <Plus size={16} /> Add Entry
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Credits" value={formatCurrency(totalCredits)} iconBg="bg-green-500" icon={<TrendingUp size={22} className="text-white" />} valueColor="text-green-600" />
        <StatCard label="Total Debits"  value={formatCurrency(totalDebits)}  iconBg="bg-red-500"   icon={<TrendingDown size={22} className="text-white" />} valueColor="text-red-500" />
        <StatCard label="Net Balance"   value={formatCurrency(netBalance)}   iconBg={netBalance >= 0 ? "bg-blue-500" : "bg-orange-500"} icon={<Landmark size={22} className="text-white" />} valueColor={netBalance >= 0 ? "text-blue-600" : "text-orange-600"} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-5 py-3">Date</th>
                <th className="text-left px-5 py-3">Description</th>
                <th className="text-left px-5 py-3">Reference</th>
                <th className="text-left px-5 py-3">Type</th>
                <th className="text-right px-5 py-3">Amount</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
              {pagedBank.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors cursor-pointer" onClick={() => setViewBank(e)}>
                  <td className="px-5 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(e.date)}</td>
                  <td className="px-5 py-3 text-gray-700 dark:text-gray-200">{e.description}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{e.reference || "—"}</td>
                  <td className="px-5 py-3">
                    <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-bold uppercase",
                      e.type === "credit" ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400")}>
                      {e.type}
                    </span>
                  </td>
                  <td className={cn("px-5 py-3 text-right font-bold tabular-nums", e.type === "credit" ? "text-green-600" : "text-red-500")}>{formatCurrency(e.amount)}</td>
                  <td className="px-5 py-3" onClick={(ev) => ev.stopPropagation()}>
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => setViewBank(e)} className="text-gray-300 hover:text-indigo-500 transition-colors"><Eye size={15} /></button>
                      <button onClick={() => del(e)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-gray-400">No bank entries for {period}</td></tr>
              )}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPagesBank} count={entries.length} pageSize={PAGE} onPage={setPage} />
        </div>
      )}

      {viewBank && (
        <DetailModal
          title="Bank Statement Entry"
          onClose={() => setViewBank(null)}
          fields={[
            ["Date",        fmtDate(viewBank.date)],
            ["Type",        viewBank.type?.toUpperCase()],
            ["Description", viewBank.description],
            ["Amount",      formatCurrency(viewBank.amount)],
            ["Reference",   viewBank.reference || "—"],
            ["Period",      period],
          ]}
        />
      )}

      {showAdd && (
        <Modal title="Add Bank Statement Entry" onClose={() => setShowAdd(false)} wide>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Date</label>
                <input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={INPUT}>
                  <option value="credit">Credit — Money In</option>
                  <option value="debit">Debit — Money Out</option>
                </select>
              </div>
            </div>
            <div>
              <label className={LABEL}>Description</label>
              <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={INPUT} placeholder="e.g. Customer payment received" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Amount</label>
                <input required type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className={INPUT} placeholder="0.00" />
              </div>
              <div>
                <label className={LABEL}>Reference (Optional)</label>
                <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className={INPUT} placeholder="TXN ref" />
              </div>
            </div>
            {err && <p className="text-red-500 text-xs">{err}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Add Entry"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── BUDGETING & FORECAST ─────────────────────────────────────────────────────
const BUDGET_EXPENSE_CATS = ["Rent", "Utilities", "Salaries", "Supplies", "Marketing", "Maintenance", "Food & Beverage", "Equipment", "Other"];
const BUDGET_REVENUE_CATS = ["Sales Revenue", "Other Income", "Loan", "Investment", "Catering", "Events"];

function BudgetingView() {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ category: "", budget_type: "expense", budget_amount: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  const load = () => {
    setLoading(true);
    api.getBudgets(period).then(setBudgets).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [period]);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setErr("");
    try {
      await api.saveBudget({ ...form, period, budget_amount: parseFloat(form.budget_amount) });
      setShowAdd(false); setForm({ category: "", budget_type: "expense", budget_amount: "" }); load();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };

  const del = async (b) => {
    if (!window.confirm("Remove this budget?")) return;
    try { await api.deleteBudget(b.id); load(); } catch (ex) { alert(ex.message); }
  };

  const filtered = catFilter === "all" ? budgets : budgets.filter((b) => b.budget_type === catFilter);
  const totalBudget = filtered.reduce((s, b) => s + (b.budget_amount || 0), 0);
  const totalActual = filtered.reduce((s, b) => s + (b.actual || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">Budgeting & Forecast</h2>
        <div className="flex items-center gap-3">
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none" />
          {budgets.length > 0 && (
            <ExportBtn
              onCSV={() => downloadCSV(`budgets_${period}`, ["Category", "Type", "Budget", "Actual", "Variance"],
                filtered.map((b) => [b.category, b.budget_type, b.budget_amount, b.actual || 0, (b.actual || 0) - b.budget_amount]))}
              onPrint={() => printReport({
                title: "Budgeting & Forecast",
                subtitle: `Period: ${period}`,
                summaryRows: [["Total Budget", formatCurrency(totalBudget)], ["Total Actual", formatCurrency(totalActual)], ["Variance", formatCurrency(totalActual - totalBudget)]],
                headers: ["Category", "Type", "Budget", "Actual", "Variance"],
                rows: filtered.map((b) => [b.category, b.budget_type, formatCurrency(b.budget_amount), formatCurrency(b.actual || 0), formatCurrency((b.actual || 0) - b.budget_amount)]),
              })}
            />
          )}
          <button onClick={() => { setShowAdd(true); setErr(""); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors">
            <Plus size={16} /> Set Budget
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Budget" value={formatCurrency(totalBudget)} iconBg="bg-indigo-500" icon={<Target size={22} className="text-white" />} valueColor="text-indigo-600" />
        <StatCard label="Total Actual" value={formatCurrency(totalActual)} iconBg="bg-amber-500"  icon={<BarChart2 size={22} className="text-white" />} valueColor="text-amber-600" />
        <StatCard label="Variance" value={formatCurrency(totalActual - totalBudget)}
          iconBg={totalActual <= totalBudget ? "bg-green-500" : "bg-red-500"}
          icon={totalActual <= totalBudget ? <TrendingDown size={22} className="text-white" /> : <TrendingUp size={22} className="text-white" />}
          valueColor={totalActual <= totalBudget ? "text-green-600" : "text-red-500"} />
      </div>

      <div className="flex gap-2 mb-5">
        {["all", "expense", "revenue"].map((t) => (
          <button key={t} onClick={() => setCatFilter(t)}
            className={cn("px-3 py-1.5 rounded-xl text-xs font-bold transition-colors",
              catFilter === t ? "bg-indigo-600 text-white" : "bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-indigo-400")}>
            {t === "all" ? "All" : t === "expense" ? "Expenses" : "Revenue"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => {
            const pct  = b.budget_amount > 0 ? Math.min(100, ((b.actual || 0) / b.budget_amount) * 100) : 0;
            const over = (b.actual || 0) > (b.budget_amount || 0);
            return (
              <div key={b.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold",
                      b.budget_type === "expense" ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" : "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400")}>
                      {b.budget_type}
                    </span>
                    <span className="font-bold text-gray-900 dark:text-white">{b.category}</span>
                  </div>
                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Actual</p>
                      <p className={cn("text-sm font-black tabular-nums", over ? "text-red-500" : "text-gray-900 dark:text-white")}>{formatCurrency(b.actual || 0)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Budget</p>
                      <p className="text-sm font-black tabular-nums text-gray-500 dark:text-gray-400">{formatCurrency(b.budget_amount)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-gray-400 uppercase font-bold">Variance</p>
                      <p className={cn("text-sm font-black tabular-nums", over ? "text-red-500" : "text-green-600")}>{formatCurrency((b.actual || 0) - b.budget_amount)}</p>
                    </div>
                    <button onClick={() => del(b)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                  </div>
                </div>
                <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                  <div className={cn("h-2 rounded-full transition-all", over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-green-500")}
                    style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">{pct.toFixed(1)}% of budget used</p>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-16 text-center bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700">
              <Target size={36} className="mx-auto mb-3 text-gray-300" />
              <p className="text-gray-400 text-sm">No budgets set for {period}. Click "Set Budget" to get started.</p>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <Modal title="Set Budget" onClose={() => setShowAdd(false)}>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className={LABEL}>Type</label>
              <select value={form.budget_type} onChange={(e) => setForm({ ...form, budget_type: e.target.value, category: "" })} className={INPUT}>
                <option value="expense">Expense</option>
                <option value="revenue">Revenue</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={INPUT}>
                <option value="">Select category…</option>
                {(form.budget_type === "expense" ? BUDGET_EXPENSE_CATS : BUDGET_REVENUE_CATS).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Budget Amount</label>
              <input required type="number" step="0.01" min="0" value={form.budget_amount}
                onChange={(e) => setForm({ ...form, budget_amount: e.target.value })} className={INPUT} placeholder="0.00" />
            </div>
            {err && <p className="text-red-500 text-xs">{err}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancel</button>
              <button type="submit" disabled={saving || !form.category}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Save Budget"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── PAYROLL ──────────────────────────────────────────────────────────────────
function PayrollView() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(today().slice(0, 7));
  const [showAdd, setShowAdd] = useState(false);
  const [viewPayroll, setViewPayroll] = useState(null);
  const [page, setPage] = useState(1);
  const PAGE = 25;
  const [form, setForm] = useState({ employee_name: "", employee_id: "", period: today().slice(0, 7), basic_pay: "", allowances: "0", deductions: "0", payment_method: "bank transfer", notes: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = () => {
    setLoading(true);
    api.getPayrollEntries(period).then((data) => { setEntries(data); setPage(1); }).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [period]);

  const netPay = (f) => (parseFloat(f.basic_pay) || 0) + (parseFloat(f.allowances) || 0) - (parseFloat(f.deductions) || 0);
  const totalPagesP = Math.max(1, Math.ceil(entries.length / PAGE));
  const pagedP = entries.slice((page - 1) * PAGE, page * PAGE);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setErr("");
    try {
      await api.createPayrollEntry({
        ...form,
        basic_pay:  parseFloat(form.basic_pay)  || 0,
        allowances: parseFloat(form.allowances) || 0,
        deductions: parseFloat(form.deductions) || 0,
      });
      setShowAdd(false);
      setForm({ employee_name: "", employee_id: "", period: today().slice(0, 7), basic_pay: "", allowances: "0", deductions: "0", payment_method: "bank transfer", notes: "" });
      load();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };

  const del = async (e) => {
    if (!window.confirm("Delete this payroll entry?")) return;
    try { await api.deletePayrollEntry(e.id); load(); } catch (ex) { alert(ex.message); }
  };

  const markPaid = async (e) => {
    try { await api.markPayrollPaid(e.id); load(); } catch (ex) { alert(ex.message); }
  };

  const totalPayroll = entries.reduce((s, e) => s + (e.net_pay || 0), 0);
  const paidCount    = entries.filter((e) => e.status === "paid").length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">Payroll</h2>
        <div className="flex items-center gap-3">
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 focus:outline-none" />
          {entries.length > 0 && (
            <ExportBtn
              onCSV={() => downloadCSV(`payroll_${period}`, ["Employee", "ID", "Basic", "Allowances", "Deductions", "Net Pay", "Method", "Status"],
                entries.map((e) => [e.employee_name, e.employee_id || "", e.basic_pay, e.allowances, e.deductions, e.net_pay, e.payment_method, e.status]))}
              onPrint={() => printReport({
                title: "Payroll",
                subtitle: `Period: ${period}`,
                summaryRows: [["Total Payroll", formatCurrency(totalPayroll)], ["Employees", String(entries.length)], ["Paid", `${paidCount} / ${entries.length}`]],
                headers: ["Employee", "Basic", "Allowances", "Deductions", "Net Pay", "Method", "Status"],
                rows: entries.map((e) => [e.employee_name, formatCurrency(e.basic_pay), formatCurrency(e.allowances), formatCurrency(e.deductions), formatCurrency(e.net_pay), e.payment_method, e.status]),
              })}
            />
          )}
          <button onClick={() => { setShowAdd(true); setErr(""); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 transition-colors">
            <Plus size={16} /> Add Entry
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Payroll"  value={formatCurrency(totalPayroll)} iconBg="bg-violet-600" icon={<DollarSign size={22} className="text-white" />} valueColor="text-violet-600" />
        <StatCard label="Employees"      value={entries.length}               iconBg="bg-blue-500"   icon={<Users size={22} className="text-white" />}     valueColor="text-blue-600" />
        <StatCard label="Paid"           value={`${paidCount} / ${entries.length}`} iconBg="bg-green-500" icon={<CheckCircle2 size={22} className="text-white" />} valueColor="text-green-600" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-5 py-3">Employee</th>
                  <th className="text-right px-4 py-3">Basic</th>
                  <th className="text-right px-4 py-3">Allowances</th>
                  <th className="text-right px-4 py-3">Deductions</th>
                  <th className="text-right px-4 py-3">Net Pay</th>
                  <th className="text-left px-4 py-3">Method</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                {pagedP.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors cursor-pointer" onClick={() => setViewPayroll(e)}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-gray-900 dark:text-white">{e.employee_name}</p>
                      {e.employee_id && <p className="text-xs text-gray-400">{e.employee_id}</p>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-200">{formatCurrency(e.basic_pay)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-600">{formatCurrency(e.allowances)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-500">{formatCurrency(e.deductions)}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-violet-600">{formatCurrency(e.net_pay)}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs capitalize whitespace-nowrap">{e.payment_method}</td>
                    <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                      {e.status === "paid" ? (
                        <span className="px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-full text-[11px] font-bold">Paid</span>
                      ) : (
                        <button onClick={() => markPaid(e)}
                          className="px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-full text-[11px] font-bold hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer">
                          Mark Paid
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => setViewPayroll(e)} className="text-gray-300 hover:text-indigo-500 transition-colors"><Eye size={15} /></button>
                        <button onClick={() => del(e)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {entries.length === 0 && (
                  <tr><td colSpan={8} className="px-5 py-12 text-center text-gray-400">No payroll entries for {period}</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPagesP} count={entries.length} pageSize={PAGE} onPage={setPage} />
        </div>
      )}

      {viewPayroll && (
        <DetailModal
          title={`Payroll — ${viewPayroll.employee_name}`}
          onClose={() => setViewPayroll(null)}
          fields={[
            ["Employee",        viewPayroll.employee_name],
            ["Employee ID",     viewPayroll.employee_id || "—"],
            ["Period",          viewPayroll.period],
            ["Basic Pay",       formatCurrency(viewPayroll.basic_pay)],
            ["Allowances",      formatCurrency(viewPayroll.allowances)],
            ["Deductions",      formatCurrency(viewPayroll.deductions)],
            ["Net Pay",         formatCurrency(viewPayroll.net_pay)],
            ["Payment Method",  viewPayroll.payment_method],
            ["Status",          viewPayroll.status === "paid" ? "Paid" : "Pending"],
            ["Notes",           viewPayroll.notes || "—"],
          ]}
        />
      )}

      {showAdd && (
        <Modal title="Add Payroll Entry" onClose={() => setShowAdd(false)} wide>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Employee Name</label>
                <input required value={form.employee_name} onChange={(e) => setForm({ ...form, employee_name: e.target.value })} className={INPUT} placeholder="Full name" />
              </div>
              <div>
                <label className={LABEL}>Employee ID (Optional)</label>
                <input value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} className={INPUT} placeholder="EMP-001" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={LABEL}>Basic Pay</label>
                <input required type="number" step="0.01" min="0" value={form.basic_pay}
                  onChange={(e) => setForm({ ...form, basic_pay: e.target.value })} className={INPUT} placeholder="0.00" />
              </div>
              <div>
                <label className={LABEL}>Allowances</label>
                <input type="number" step="0.01" min="0" value={form.allowances}
                  onChange={(e) => setForm({ ...form, allowances: e.target.value })} className={INPUT} placeholder="0.00" />
              </div>
              <div>
                <label className={LABEL}>Deductions</label>
                <input type="number" step="0.01" min="0" value={form.deductions}
                  onChange={(e) => setForm({ ...form, deductions: e.target.value })} className={INPUT} placeholder="0.00" />
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">Net Pay</span>
              <span className="text-base font-black text-violet-600 tabular-nums">{formatCurrency(netPay(form))}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Period</label>
                <input type="month" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Payment Method</label>
                <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} className={INPUT}>
                  {["bank transfer", "cash", "mobile money", "cheque"].map((m) => (
                    <option key={m} value={m} className="capitalize">{m}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={LABEL}>Notes (Optional)</label>
              <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={INPUT} placeholder="Additional notes" />
            </div>
            {err && <p className="text-red-500 text-xs">{err}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl font-semibold text-sm hover:bg-violet-700 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Add Entry"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── MULTI-CURRENCY ───────────────────────────────────────────────────────────
const COMMON_CURRENCIES = [
  { code: "USD", name: "US Dollar",              symbol: "$"   },
  { code: "EUR", name: "Euro",                   symbol: "€"   },
  { code: "GBP", name: "British Pound",          symbol: "£"   },
  { code: "GHS", name: "Ghanaian Cedi",          symbol: "₵"   },
  { code: "KES", name: "Kenyan Shilling",        symbol: "Ksh" },
  { code: "ZAR", name: "South African Rand",     symbol: "R"   },
  { code: "XOF", name: "West African CFA Franc", symbol: "CFA" },
  { code: "JPY", name: "Japanese Yen",           symbol: "¥"   },
  { code: "CNY", name: "Chinese Yuan",           symbol: "¥"   },
  { code: "CAD", name: "Canadian Dollar",        symbol: "CA$" },
];

function MultiCurrencyView() {
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", symbol: "", rate: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [convAmount, setConvAmount] = useState("");
  const [convFrom, setConvFrom] = useState("NGN");
  const [convTo, setConvTo] = useState("USD");

  const load = () => {
    setLoading(true);
    api.getExchangeRates().then(setCurrencies).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setErr("");
    try {
      await api.saveCurrencyRate(form.code, { name: form.name, symbol: form.symbol, rate: parseFloat(form.rate) });
      setShowAdd(false); setForm({ code: "", name: "", symbol: "", rate: "" }); load();
    } catch (ex) { setErr(ex.message); }
    finally { setSaving(false); }
  };

  const del = async (c) => {
    if (!window.confirm(`Remove ${c.code}?`)) return;
    try { await api.deleteExchangeRate(c.code); load(); } catch (ex) { alert(ex.message); }
  };

  const prefill = (c) => { setForm({ code: c.code, name: c.name, symbol: c.symbol, rate: "" }); setShowAdd(true); };

  const allCodes = ["NGN", ...currencies.map((c) => c.code)];
  const getRate  = (code) => code === "NGN" ? 1 : (currencies.find((c) => c.code === code)?.rate || 1);
  const converted = convAmount
    ? ((parseFloat(convAmount) / getRate(convFrom)) * getRate(convTo)).toFixed(2)
    : "";
  const convSymbol = convTo === "NGN" ? "₦" : (currencies.find((c) => c.code === convTo)?.symbol || convTo);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">Currencies & Exchange Rates</h2>
        <div className="flex items-center gap-2">
          {currencies.length > 0 && (
            <ExportBtn
              onCSV={() => downloadCSV("exchange_rates", ["Code", "Name", "Symbol", "Rate (per 1 NGN)"],
                currencies.map((c) => [c.code, c.name, c.symbol, c.rate]))}
              onPrint={() => printReport({
                title: "Exchange Rates",
                subtitle: "Base currency: NGN (₦)",
                headers: ["Code", "Name", "Symbol", "Rate (per 1 NGN)"],
                rows: currencies.map((c) => [c.code, c.name, c.symbol, c.rate]),
              })}
            />
          )}
          <button onClick={() => { setShowAdd(true); setForm({ code: "", name: "", symbol: "", rate: "" }); setErr(""); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 transition-colors">
            <Plus size={16} /> Add Currency
          </button>
        </div>
      </div>

      {/* Quick converter */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6 mb-6">
        <h3 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Globe size={18} className="text-indigo-500" /> Quick Converter
        </h3>
        <div className="flex items-center gap-3 flex-wrap">
          <input type="number" step="any" min="0" value={convAmount} onChange={(e) => setConvAmount(e.target.value)}
            className="w-32 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-indigo-400 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200"
            placeholder="Amount" />
          <select value={convFrom} onChange={(e) => setConvFrom(e.target.value)}
            className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200">
            {allCodes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <ArrowLeftRight size={16} className="text-gray-400" />
          <select value={convTo} onChange={(e) => setConvTo(e.target.value)}
            className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200">
            {allCodes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="text-xl font-black text-indigo-600 tabular-nums min-w-[140px]">
            {converted ? `${convSymbol} ${converted}` : "—"}
          </span>
        </div>
      </div>

      <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl px-4 py-3 mb-5 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
        Base currency: <strong>NGN (₦)</strong>. Rates are expressed as units of foreign currency per 1 NGN.
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {currencies.map((c) => (
              <div key={c.code} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex items-center justify-center">
                      <span className="text-indigo-600 dark:text-indigo-400 font-black text-sm">{c.symbol}</span>
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 dark:text-white">{c.code}</p>
                      <p className="text-xs text-gray-400">{c.name}</p>
                    </div>
                  </div>
                  <button onClick={() => del(c)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-gray-400">Rate</span>
                  <span className="font-black text-indigo-600 text-sm tabular-nums">₦1 = {c.rate} {c.code}</span>
                </div>
              </div>
            ))}
            {currencies.length === 0 && (
              <div className="col-span-3 py-12 text-center">
                <Globe size={36} className="mx-auto mb-3 text-gray-300" />
                <p className="text-gray-400 text-sm">No currencies added yet</p>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-5">
            <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-3 text-sm">Common Currencies — click to add rate</h3>
            <div className="flex flex-wrap gap-2">
              {COMMON_CURRENCIES.filter((c) => !currencies.find((x) => x.code === c.code)).map((c) => (
                <button key={c.code} onClick={() => prefill(c)}
                  className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-700 dark:text-gray-200 hover:text-indigo-700 dark:hover:text-indigo-400 rounded-xl text-xs font-semibold transition-colors">
                  {c.symbol} {c.code}
                </button>
              ))}
              {COMMON_CURRENCIES.every((c) => currencies.find((x) => x.code === c.code)) && (
                <p className="text-xs text-gray-400">All common currencies added.</p>
              )}
            </div>
          </div>
        </>
      )}

      {showAdd && (
        <Modal title="Add / Update Currency" onClose={() => setShowAdd(false)}>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Code (e.g. USD)</label>
                <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className={INPUT} placeholder="USD" maxLength={5} />
              </div>
              <div>
                <label className={LABEL}>Symbol</label>
                <input required value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                  className={INPUT} placeholder="$" maxLength={10} />
              </div>
            </div>
            <div>
              <label className={LABEL}>Currency Name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={INPUT} placeholder="US Dollar" />
            </div>
            <div>
              <label className={LABEL}>Exchange Rate (per 1 NGN)</label>
              <input required type="number" step="any" min="0" value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })} className={INPUT} placeholder="0.00065" />
              <p className="text-xs text-gray-400 mt-1">How many {form.code || "foreign units"} = 1 NGN</p>
            </div>
            {err && <p className="text-red-500 text-xs">{err}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Save Currency"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────
export default function AccountsSection({ view = "dashboard", onViewChange }) {
  const go = (id) => onViewChange?.(id);

  const renderView = () => {
    switch (view) {
      case "dashboard":            return <Dashboard />;
      case "profit-loss":          return <ProfitLoss />;
      case "cash-flow":            return <CashFlowView />;
      case "invoices":             return <InvoiceTrackingView />;
      case "tax-summary":          return <VatManagementView />;
      case "ledger":               return <GeneralLedgerView />;
      case "balance-sheet":        return <BalanceSheetView />;
      case "bank-reconciliation":  return <BankReconciliationView />;
      case "budgeting":            return <BudgetingView />;
      case "payroll":              return <PayrollView />;
      case "currencies":           return <MultiCurrencyView />;
      case "expenses":             return <AllExpenses onAdd={() => go("create-expense")} />;
      case "create-expense":       return <CreateExpense onSaved={() => go("expenses")} />;
      case "expense-categories":   return <CategoryManager type="expense" label="Expense Categories" color="red" />;
      case "deposits":             return <AllDeposits onAdd={() => go("create-deposit")} />;
      case "create-deposit":       return <CreateDeposit onSaved={() => go("deposits")} />;
      case "deposit-categories":   return <CategoryManager type="deposit" label="Deposit Categories" color="green" />;
      case "transfers":            return <Transfers />;
      default:                     return <Dashboard />;
    }
  };

  return (
    <div className="w-full">
      {renderView()}
    </div>
  );
}
