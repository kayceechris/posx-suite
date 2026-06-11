import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Calendar, ChevronDown, ChevronRight, X, BarChart2, Tag, Layers, Percent, ClipboardList, Clock, Receipt, LayoutGrid, Printer, FileText } from "lucide-react";
import { api } from "../lib/api";
import { cn, formatCurrency, dedupePendingOrders, dedupeOrders } from "../lib/utils";
import ExportBtn from "../components/ExportBtn";
import { downloadCSV, printReport } from "../lib/export";
import { printService, pickReprintPrinter } from "../utils/printService";
import { useBusiness } from "../context/BusinessContext";

const VIEW_LABELS = {
  sales:         "Sales",
  cost:          "Cost Analysis",
  staff:         "Staff Performance",
  payments:      "Payment Methods",
  items:         "Sales by Item",
  category:      "Report by Category",
  discounts:     "Discount Report",
  "daily-summary": "Daily Summary",
  shifts:        "Shift Report",
  tax:           "Tax Report",
  floors:        "Floor Report",
};

function today() { return new Date().toISOString().split("T")[0]; }
function monthStart() { const d = new Date(); d.setDate(1); return d.toISOString().split("T")[0]; }

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function DateFilter({ onApply }) {
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-sm px-4 py-3 mb-6 space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
      <Calendar size={18} className="text-gray-400 flex-shrink-0 hidden sm:block" />
      <div className="flex items-center gap-2">
        <input
          type="date" value={start} onChange={(e) => setStart(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-gray-50 dark:bg-gray-900 dark:text-white"
        />
        <span className="text-gray-400 text-sm font-medium flex-shrink-0">to</span>
        <input
          type="date" value={end} onChange={(e) => setEnd(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-gray-50 dark:bg-gray-900 dark:text-white"
        />
      </div>
      <button
        onClick={() => onApply(start, end)}
        className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
      >
        Apply
      </button>
    </div>
  );
}

function StatCard({ label, value, color, bg }) {
  return (
    <div className={cn("rounded-2xl p-4 shadow-sm", bg)}>
      <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 leading-tight">{label}</p>
      <p className={cn("text-lg sm:text-2xl font-black leading-tight truncate", color)}>{value}</p>
    </div>
  );
}

// ─── Sales ────────────────────────────────────────────────────────────────────

function SalesTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState({ start: monthStart(), end: today() });

  const load = useCallback((s, e) => {
    setLoading(true);
    api.getSalesReport({ start_date: s, end_date: e })
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(dates.start, dates.end); }, []);

  const maxRevenue = data?.daily_sales?.length
    ? Math.max(...data.daily_sales.map((d) => d.revenue || 0), 1)
    : 1;

  return (
    <div>
      <DateFilter onApply={(s, e) => { setDates({ start: s, end: e }); load(s, e); }} />
      {loading ? <Spinner /> : data && (
        <>
          <div className="flex justify-end mb-3">
            <ExportBtn
              onCSV={() => downloadCSV(`sales_${dates.start}_${dates.end}`,
                ["Date", "Orders", "Revenue"],
                (data.daily_sales || []).map((d) => [d.date, d.orders, d.revenue]))}
              onPrint={() => printReport({
                title: "Sales Report",
                subtitle: `${dates.start} to ${dates.end}`,
                summaryRows: [["Total Revenue", formatCurrency(data.total_revenue)], ["Total Orders", String(data.total_orders)], ["Avg Order Value", formatCurrency(data.avg_order_value)]],
                headers: ["Date", "Orders", "Revenue"],
                rows: (data.daily_sales || []).map((d) => [d.date, d.orders, formatCurrency(d.revenue)]),
              })}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <StatCard label="Total Revenue" value={formatCurrency(data.total_revenue)} color="text-green-600 dark:text-green-400" bg="bg-green-50 dark:bg-green-900/20" />
            <StatCard label="Total Orders" value={data.total_orders} color="text-blue-600 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-900/20" />
            <StatCard label="Avg Order Value" value={formatCurrency(data.avg_order_value)} color="text-orange-500 dark:text-orange-400" bg="bg-orange-50 dark:bg-orange-900/20" />
          </div>

          {data.daily_sales?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm mb-6">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-white">Daily Sales</h3>
              </div>
              <div className="px-4 py-4 space-y-3">
                {data.daily_sales.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-14 sm:w-20 flex-shrink-0 truncate">{d.date}</span>
                    <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-5 relative">
                      <div className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${Math.max(((d.revenue || 0) / maxRevenue) * 100, 2)}%` }} />
                    </div>
                    <span className="text-xs font-bold text-green-600 dark:text-green-400 w-20 sm:w-28 text-right flex-shrink-0 whitespace-nowrap">
                      {formatCurrency(d.revenue)}
                    </span>
                    <span className="hidden sm:block text-xs text-gray-400 w-12 text-right flex-shrink-0">{d.orders}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.top_products?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-white">Top Products</h3>
              </div>
              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">
                {data.top_products.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-3">
                    <span className="w-6 h-6 flex-shrink-0 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-xs font-bold text-gray-500 dark:text-gray-400">{i + 1}</span>
                    <p className="flex-1 min-w-0 font-semibold text-gray-900 dark:text-white text-sm truncate">{p.name}</p>
                    <div className="text-right flex-shrink-0 max-w-[110px]">
                      <p className="text-sm font-bold text-green-600 dark:text-green-400 truncate">{formatCurrency(p.revenue)}</p>
                      <p className="text-xs text-gray-400">{p.quantity} sold</p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full min-w-[360px]">
                  <thead>
                    <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left px-4 py-3 w-8">#</th>
                      <th className="text-left px-4 py-3">Product</th>
                      <th className="text-right px-4 py-3">Qty</th>
                      <th className="text-right px-4 py-3">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {data.top_products.map((p, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 text-gray-400 text-sm">{i + 1}</td>
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm">{p.name}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm text-right">{p.quantity}</td>
                        <td className="px-4 py-3 font-semibold text-green-600 dark:text-green-400 text-sm text-right whitespace-nowrap">{formatCurrency(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Cost Analysis ────────────────────────────────────────────────────────────

function CostTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((s, e) => {
    setLoading(true);
    api.getCostReport({ start_date: s, end_date: e })
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(monthStart(), today()); }, []);

  return (
    <div>
      <DateFilter onApply={load} />
      {loading ? <Spinner /> : data && (
        <>
          <div className="flex justify-end mb-3">
            <ExportBtn
              onCSV={() => downloadCSV("cost_analysis",
                ["Product", "Qty", "Cost", "Revenue", "Profit"],
                (data.products || []).map((p) => [p.name, p.quantity ?? "", p.cost, p.revenue, p.profit]))}
              onPrint={() => printReport({
                title: "Cost Analysis",
                summaryRows: [["Total Revenue", formatCurrency(data.total_revenue)], ["Total Cost", formatCurrency(data.total_cost)], ["Gross Profit", formatCurrency(data.total_profit)]],
                headers: ["Product", "Qty", "Cost", "Revenue", "Profit"],
                rows: (data.products || []).map((p) => [p.name, p.quantity ?? "—", formatCurrency(p.cost), formatCurrency(p.revenue), formatCurrency(p.profit)]),
              })}
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <StatCard label="Total Revenue" value={formatCurrency(data.total_revenue)} color="text-blue-600 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-900/20" />
            <StatCard label="Total Cost" value={formatCurrency(data.total_cost)} color="text-orange-500 dark:text-orange-400" bg="bg-orange-50 dark:bg-orange-900/20" />
            <StatCard label="Gross Profit" value={formatCurrency(data.total_profit)} color="text-green-600 dark:text-green-400" bg="bg-green-50 dark:bg-green-900/20" />
          </div>

          {data.products?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm">
              <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-white">Product Cost Breakdown</h3>
              </div>
              {/* Mobile cards */}
              <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">
                {data.products.map((p, i) => (
                  <div key={i} className="px-4 py-3">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm mb-2">{p.name}</p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p className="text-gray-400 mb-0.5">Cost</p>
                        <p className="font-semibold text-orange-500 whitespace-nowrap">{formatCurrency(p.cost)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 mb-0.5">Revenue</p>
                        <p className="font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">{formatCurrency(p.revenue)}</p>
                      </div>
                      <div>
                        <p className="text-gray-400 mb-0.5">Profit</p>
                        <p className="font-semibold text-green-600 dark:text-green-400 whitespace-nowrap">{formatCurrency(p.profit)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full min-w-[480px]">
                  <thead>
                    <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                      <th className="text-left px-4 py-3">Product</th>
                      <th className="text-right px-4 py-3">Qty</th>
                      <th className="text-right px-4 py-3">Cost</th>
                      <th className="text-right px-4 py-3">Revenue</th>
                      <th className="text-right px-4 py-3">Profit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {data.products.map((p, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm">{p.name}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm text-right">{p.quantity ?? "—"}</td>
                        <td className="px-4 py-3 text-orange-500 text-sm text-right whitespace-nowrap">{formatCurrency(p.cost)}</td>
                        <td className="px-4 py-3 text-blue-600 dark:text-blue-400 font-semibold text-sm text-right whitespace-nowrap">{formatCurrency(p.revenue)}</td>
                        <td className="px-4 py-3 text-green-600 dark:text-green-400 font-semibold text-sm text-right whitespace-nowrap">{formatCurrency(p.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Staff Performance ────────────────────────────────────────────────────────

function OrderItemsPanel({ order, onClose }) {
  const { settings } = useBusiness();
  const [reprinting, setReprinting] = useState(false);
  const [reprintMsg, setReprintMsg] = useState("");

  const handleReprint = async () => {
    setReprinting(true);
    setReprintMsg("");
    try {
      let usbPrinter = pickReprintPrinter();
      if (!usbPrinter) {
        try {
          const saved = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
          usbPrinter = saved.find((x) => x.mode === "usb" && x.type === "receipt") || null;
        } catch {}
      }
      await printService.printReceipt({
        businessName: settings?.business_name || "Restaurant",
        address: settings?.company_address || settings?.address || "",
        phone: settings?.company_phone || settings?.phone || "",
        logoUrl: settings?.company_logo || settings?.logo_url || "",
        tableName: order.table_number ? `Table ${order.table_number}` : (order.customer_name || ""),
        orderNo: order.order_number || order.id?.slice(-8)?.toUpperCase() || "",
        // Same fallback as OrdersSection — receipts must always show
        // SOMEONE on the seller line, even when waiter_name is empty.
        waiter: order.waiter_name || order.served_by_name || order.created_by_name || "",
        cashier: order.created_by_name || "",
        items: (order.items || []).map((i) => ({
          name: i.product_name || i.name,
          quantity: i.quantity,
          price: i.price,
          total: i.total,
        })),
        subtotal: order.subtotal || 0,
        taxAmount: order.tax || 0,
        discount: order.discount || 0,
        total: order.total || 0,
        paymentMethod: order.payment_method || "",
        docType: "RECEIPT",
        reprintAt: new Date().toISOString(),
        orderDate: order.created_at || order.completed_at || null,
        layoutSettings: settings?.receipt_settings || {},
      }, { printer: usbPrinter });
      setReprintMsg("Receipt sent to printer");
    } catch (err) {
      setReprintMsg(err.message || "Failed to reprint");
    } finally {
      setReprinting(false);
      setTimeout(() => setReprintMsg(""), 3500);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div>
            <p className="font-bold text-gray-900 dark:text-white">Order #{order.order_number}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(order.created_at).toLocaleString()} · {order.payment_method || "pending"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">
            {(order.items || []).map((item, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 dark:text-white text-sm">{item.product_name || item.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{item.quantity} × {formatCurrency(item.price)}</p>
                </div>
                <p className="font-semibold text-green-600 dark:text-green-400 text-sm whitespace-nowrap ml-3">
                  {formatCurrency((item.price || 0) * (item.quantity || 1))}
                </p>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-[320px]">
              <thead>
                <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-4 py-3">Item</th>
                  <th className="text-right px-4 py-3">Qty</th>
                  <th className="text-right px-4 py-3">Price</th>
                  <th className="text-right px-4 py-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {(order.items || []).map((item, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white text-sm">{item.product_name || item.name}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm text-right">{item.quantity}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm text-right whitespace-nowrap">{formatCurrency(item.price)}</td>
                    <td className="px-4 py-3 font-semibold text-green-600 dark:text-green-400 text-sm text-right whitespace-nowrap">{formatCurrency((item.price || 0) * (item.quantity || 1))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
            <span className="font-bold text-gray-700 dark:text-gray-200">Total</span>
            <span className="font-black text-green-600 dark:text-green-400 text-lg">{formatCurrency(order.total)}</span>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between gap-3 flex-shrink-0">
          {reprintMsg ? (
            <p className={cn("text-xs font-semibold flex-1",
              reprintMsg.includes("Failed") ? "text-red-500" : "text-green-600 dark:text-green-400")}>
              {reprintMsg}
            </p>
          ) : <span />}
          <button onClick={handleReprint} disabled={reprinting}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-xl font-semibold text-sm hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 transition-colors">
            <Printer size={14} /> {reprinting ? "Reprinting…" : "Reprint Receipt"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StaffOrdersPanel({ staff, dateRange, onClose }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.getOrders({ created_by: staff.user_id || staff._id, start_date: dateRange.start, end_date: dateRange.end })
      .then((list) => setOrders(dedupeOrders(dedupePendingOrders(list))))
      .catch(console.error).finally(() => setLoading(false));
  }, [staff, dateRange]);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 flex items-end sm:items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
            <div>
              <p className="font-bold text-gray-900 dark:text-white">Orders by {staff.name || "Unknown"}</p>
              <p className="text-xs text-gray-400 mt-0.5">{orders.length} orders found</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
          </div>
          <div className="overflow-y-auto flex-1">
            {loading ? <Spinner /> : orders.length === 0 ? (
              <p className="px-6 py-10 text-center text-gray-400 text-sm">No orders found for this period.</p>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">
                  {orders.map((o) => (
                    <div key={o.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      onClick={() => setSelectedOrder(o)}>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-blue-600 text-sm">{o.order_number}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(o.created_at).toLocaleDateString()} · {o.items?.length ?? 0} items</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-semibold text-green-600 dark:text-green-400 text-sm whitespace-nowrap">{formatCurrency(o.total)}</p>
                        <span className="text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300 rounded-full px-2 py-0.5 capitalize">
                          {o.payment_method || "pending"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full min-w-[440px]">
                    <thead>
                      <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                        <th className="text-left px-4 py-3">Order #</th>
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-right px-4 py-3">Items</th>
                        <th className="text-right px-4 py-3">Total</th>
                        <th className="text-left px-4 py-3">Payment</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {orders.map((o) => (
                        <tr key={o.id} className="hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors"
                          onClick={() => setSelectedOrder(o)}>
                          <td className="px-4 py-3 font-semibold text-blue-600 text-sm">{o.order_number}</td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm whitespace-nowrap">{new Date(o.created_at).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm text-right">{o.items?.length ?? 0}</td>
                          <td className="px-4 py-3 font-semibold text-green-600 dark:text-green-400 text-sm text-right whitespace-nowrap">{formatCurrency(o.total)}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-xs capitalize">
                              {o.payment_method || "pending"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {selectedOrder && <OrderItemsPanel order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </>
  );
}

const ROLE_COLORS = {
  admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  manager: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  cashier: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  waiter: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

function StaffTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ start: monthStart(), end: today() });
  const [selectedStaff, setSelectedStaff] = useState(null);

  const load = useCallback((s, e) => {
    setLoading(true);
    setDateRange({ start: s, end: e });
    api.getStaffReport({ start_date: s, end_date: e })
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(monthStart(), today()); }, []);

  return (
    <div>
      <DateFilter onApply={load} />
      {loading ? <Spinner /> : data && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 dark:text-white">Staff Sales Performance</h3>
            <ExportBtn
              onCSV={() => downloadCSV("staff_performance",
                ["Staff", "Role", "Orders", "Revenue"],
                (data.staff || []).map((s) => [s.name || "Unknown", s.role || "unknown", s.orders, s.revenue]))}
              onPrint={() => printReport({
                title: "Staff Performance Report",
                subtitle: `${dateRange.start} to ${dateRange.end}`,
                headers: ["Staff", "Role", "Orders", "Revenue"],
                rows: (data.staff || []).map((s) => [s.name || "Unknown", s.role || "unknown", s.orders, formatCurrency(s.revenue)]),
              })}
            />
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">
            {(data.staff || []).map((s, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                onClick={() => setSelectedStaff(s)}>
                <div className="w-8 h-8 flex-shrink-0 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-gray-600 dark:text-gray-300">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 dark:text-white text-sm">{s.name || "Unknown"}</p>
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
                    ROLE_COLORS[s.role] || "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400")}>
                    {s.role || "unknown"}
                  </span>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-green-600 dark:text-green-400 whitespace-nowrap">{formatCurrency(s.revenue)}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.orders} orders</p>
                </div>
              </div>
            ))}
            {(data.staff || []).length === 0 && (
              <p className="px-4 py-10 text-center text-gray-400 text-sm">No data for this period</p>
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-[400px]">
              <thead>
                <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                  <th className="text-left px-4 py-3 w-8">#</th>
                  <th className="text-left px-4 py-3">Staff</th>
                  <th className="text-left px-4 py-3">Role</th>
                  <th className="text-right px-4 py-3">Orders</th>
                  <th className="text-right px-4 py-3">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {(data.staff || []).map((s, i) => (
                  <tr key={i} className="hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors"
                    onClick={() => setSelectedStaff(s)}>
                    <td className="px-4 py-3 text-gray-400 text-sm">{i + 1}</td>
                    <td className="px-4 py-3 font-bold text-gray-900 dark:text-white text-sm">{s.name || "Unknown"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide",
                        ROLE_COLORS[s.role] || "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400")}>
                        {s.role || "unknown"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm text-right">{s.orders}</td>
                    <td className="px-4 py-3 font-semibold text-green-600 dark:text-green-400 text-sm text-right whitespace-nowrap">{formatCurrency(s.revenue)}</td>
                  </tr>
                ))}
                {(data.staff || []).length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 text-sm">No data for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {(data.staff || []).length > 0 && (
            <p className="px-5 py-3 text-xs text-gray-400 border-t border-gray-100 dark:border-gray-700">
              Tap a row to view individual orders and items
            </p>
          )}
        </div>
      )}

      {selectedStaff && (
        <StaffOrdersPanel
          staff={selectedStaff}
          dateRange={dateRange}
          onClose={() => setSelectedStaff(null)}
        />
      )}
    </div>
  );
}

// ─── Payment Methods ──────────────────────────────────────────────────────────

function PaymentOrdersPanel({ method, dateRange, onClose }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    setLoading(true);
    api.getOrders({ start_date: dateRange.start, end_date: dateRange.end })
      .then((all) => {
        const matching = all.filter((o) => (o.payment_method || "").toLowerCase() === method.toLowerCase());
        setOrders(dedupeOrders(dedupePendingOrders(matching)));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [method, dateRange]);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 flex items-end sm:items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0 gap-3">
            <div className="min-w-0">
              <p className="font-bold text-gray-900 dark:text-white capitalize">Orders — {method}</p>
              <p className="text-xs text-gray-400 mt-0.5">{orders.length} orders found</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {orders.length > 0 && (
                <button
                  onClick={() => printReport({
                    title: `${method[0].toUpperCase()}${method.slice(1)} Sales`,
                    subtitle: `${dateRange.start} to ${dateRange.end}`,
                    summaryRows: [
                      ["Orders", String(orders.length)],
                      ["Total", formatCurrency(orders.reduce((s, o) => s + (o.total || 0), 0))],
                    ],
                    headers: ["Order #", "Date", "Customer", "Items", "Total"],
                    rows: orders.map((o) => [
                      o.order_number,
                      new Date(o.created_at).toLocaleDateString(),
                      o.customer_name || "Walk-in",
                      String(o.items?.length ?? 0),
                      formatCurrency(o.total),
                    ]),
                  })}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-xl text-xs font-bold hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
                  title="Opens a print preview — choose 'Save as PDF' to export"
                >
                  <FileText size={13} /> Export PDF
                </button>
              )}
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {loading ? <Spinner /> : orders.length === 0 ? (
              <p className="px-6 py-10 text-center text-gray-400 text-sm">No orders found for this payment method.</p>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">
                  {orders.map((o) => (
                    <div key={o.id} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                      onClick={() => setSelectedOrder(o)}>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-blue-600 text-sm">{o.order_number}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(o.created_at).toLocaleDateString()} · {o.customer_name || "Walk-in"}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-semibold text-green-600 dark:text-green-400 text-sm whitespace-nowrap">{formatCurrency(o.total)}</p>
                        <p className="text-xs text-gray-400">{o.items?.length ?? 0} items</p>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full min-w-[420px]">
                    <thead>
                      <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                        <th className="text-left px-4 py-3">Order #</th>
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-left px-4 py-3">Customer</th>
                        <th className="text-right px-4 py-3">Items</th>
                        <th className="text-right px-4 py-3">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {orders.map((o) => (
                        <tr key={o.id} className="hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors"
                          onClick={() => setSelectedOrder(o)}>
                          <td className="px-4 py-3 font-semibold text-blue-600 text-sm">{o.order_number}</td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm whitespace-nowrap">{new Date(o.created_at).toLocaleDateString()}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm">{o.customer_name || "Walk-in"}</td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm text-right">{o.items?.length ?? 0}</td>
                          <td className="px-4 py-3 font-semibold text-green-600 dark:text-green-400 text-sm text-right whitespace-nowrap">{formatCurrency(o.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {selectedOrder && <OrderItemsPanel order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </>
  );
}

// Parse a split payment method string like "cash ₦5,000.00 + card ₦2,000.00"
// into an array of { method, amount } components. Returns null for non-split strings.
function parseSplitComponents(methodStr) {
  if (!methodStr || !methodStr.includes(" + ")) return null;
  const parts = methodStr.split(" + ");
  const components = [];
  for (const part of parts) {
    const symIdx = part.search(/[₦$€£¥]/);
    if (symIdx === -1) continue;
    const method = part.slice(0, symIdx).trim();
    const amount = parseFloat(part.slice(symIdx + 1).replace(/,/g, "")) || 0;
    if (method && amount > 0) components.push({ method, amount });
  }
  return components.length > 0 ? components : null;
}

function PaymentsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ start: monthStart(), end: today() });
  const [selectedMethod, setSelectedMethod] = useState(null);

  const load = useCallback((s, e) => {
    setLoading(true);
    setDateRange({ start: s, end: e });
    api.getPaymentMethodsReport({ start_date: s, end_date: e })
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(monthStart(), today()); }, []);

  // Merge split-payment entries into their component methods so "cash ₦X + card ₦Y"
  // contributes to the Cash and Card totals rather than appearing as a separate card.
  // splitCount tracks how many split-bill orders contributed so we can badge the card.
  const mergedMethods = useMemo(() => {
    if (!data?.methods) return [];
    const map = new Map();
    const add = (key, method, count, total, splitCount) => {
      if (!map.has(key)) map.set(key, { method, count: 0, total: 0, splitCount: 0 });
      const e = map.get(key);
      e.count += count;
      e.total += total;
      e.splitCount += splitCount;
    };
    for (const m of data.methods) {
      const components = parseSplitComponents(m.method);
      if (components) {
        const componentSum = components.reduce((s, c) => s + c.amount, 0);
        if (componentSum > 0) {
          for (const { method, amount } of components) {
            add(method.toLowerCase(), method, m.count, (amount / componentSum) * m.total, m.count);
          }
        }
      } else {
        const key = (m.method || "unknown").toLowerCase();
        add(key, m.method || "Unknown", m.count, m.total, 0);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [data]);

  const METHOD_COLORS = [
    "border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-700",
    "border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700",
    "border-purple-200 bg-purple-50 dark:bg-purple-900/20 dark:border-purple-700",
    "border-orange-200 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-700",
    "border-pink-200 bg-pink-50 dark:bg-pink-900/20 dark:border-pink-700",
  ];

  return (
    <div>
      <DateFilter onApply={load} />
      {loading ? <Spinner /> : data && (
        <>
          <div className="flex justify-end mb-3">
            <ExportBtn
              onCSV={() => downloadCSV("payment_methods",
                ["Method", "Total", "Transactions"],
                mergedMethods.map((m) => [m.method || "Unknown", m.total, m.count]))}
              onPrint={() => printReport({
                title: "Payment Methods Report",
                subtitle: `${dateRange.start} to ${dateRange.end}`,
                headers: ["Method", "Total", "Transactions"],
                rows: mergedMethods.map((m) => [m.method || "Unknown", formatCurrency(m.total), m.count]),
              })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
            {mergedMethods.map((m, i) => (
              <button key={i} onClick={() => setSelectedMethod(m.method)}
                className={cn(
                  "text-left rounded-2xl border-2 p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5",
                  METHOD_COLORS[i % METHOD_COLORS.length]
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <p className="font-semibold text-gray-700 dark:text-gray-100 capitalize">{m.method || "Unknown"}</p>
                  {m.splitCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 text-[10px] font-bold rounded-full uppercase tracking-wide whitespace-nowrap">
                      Split Bill ×{m.splitCount}
                    </span>
                  )}
                </div>
                <p className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 mb-1 truncate">{formatCurrency(m.total)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-300">{m.count} transaction{m.count !== 1 ? "s" : ""}</p>
              </button>
            ))}
            {mergedMethods.length === 0 && (
              <p className="col-span-3 py-10 text-center text-gray-400 text-sm">No payment data for this period.</p>
            )}
          </div>
          {mergedMethods.length > 0 && (
            <p className="text-xs text-gray-400 mb-2">Tap a payment method card to view its orders</p>
          )}
        </>
      )}

      {selectedMethod && (
        <PaymentOrdersPanel
          method={selectedMethod}
          dateRange={dateRange}
          onClose={() => setSelectedMethod(null)}
        />
      )}
    </div>
  );
}

// ─── Sales by Item ────────────────────────────────────────────────────────────

function SalesByItemTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState({ start: monthStart(), end: today() });
  const [search, setSearch] = useState("");

  const load = useCallback((s, e) => {
    setLoading(true);
    api.getSalesByItem({ start_date: s, end_date: e })
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(dates.start, dates.end); }, []);

  const items = (data?.items || []).filter((i) =>
    !search || i.name.toLowerCase().includes(search.toLowerCase()) || (i.category || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <DateFilter onApply={(s, e) => { setDates({ start: s, end: e }); load(s, e); }} />
      {loading ? <Spinner /> : data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <StatCard label="Total Items Sold" value={data.total_items_sold} color="text-blue-600 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-900/20" />
            <StatCard label="Total Revenue" value={formatCurrency(data.total_revenue)} color="text-green-600 dark:text-green-400" bg="bg-green-50 dark:bg-green-900/20" />
            <StatCard label="Unique Items" value={(data.items || []).length} color="text-purple-600 dark:text-purple-400" bg="bg-purple-50 dark:bg-purple-900/20" />
          </div>
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item or category…"
              className="flex-1 min-w-0 max-w-xs px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:border-blue-400" />
            <ExportBtn
              onCSV={() => downloadCSV(`sales_by_item_${dates.start}_${dates.end}`,
                ["#", "Item", "Category", "Qty Sold", "Orders", "Revenue"],
                (data.items || []).map((i, idx) => [idx + 1, i.name, i.category || "—", i.quantity, i.order_count, i.revenue]))}
              onPrint={() => printReport({
                title: "Sales by Item",
                subtitle: `${dates.start} to ${dates.end}`,
                summaryRows: [["Total Items Sold", String(data.total_items_sold)], ["Total Revenue", formatCurrency(data.total_revenue)]],
                headers: ["#", "Item", "Category", "Qty", "Revenue"],
                rows: (data.items || []).map((i, idx) => [idx + 1, i.name, i.category || "—", i.quantity, formatCurrency(i.revenue)]),
              })}
            />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-4 py-3 w-8">#</th>
                    <th className="text-left px-4 py-3">Item</th>
                    <th className="text-left px-4 py-3">Category</th>
                    <th className="text-right px-4 py-3">Qty Sold</th>
                    <th className="text-right px-4 py-3">Orders</th>
                    <th className="text-right px-4 py-3">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {items.map((item, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-gray-400 text-sm">{i + 1}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm">{item.name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded-full text-xs font-semibold">{item.category || "—"}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-blue-600 dark:text-blue-400 text-sm">{item.quantity}</td>
                      <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 text-sm">{item.order_count}</td>
                      <td className="px-4 py-3 text-right font-semibold text-green-600 dark:text-green-400 text-sm whitespace-nowrap">{formatCurrency(item.revenue)}</td>
                    </tr>
                  ))}
                  {items.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">No items found</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sales by Category ────────────────────────────────────────────────────────

function SalesByCategoryTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState({ start: monthStart(), end: today() });
  // 'all' / 'food' / 'drinks' / 'shisha' — filters the per-category list
  // so an owner can pull Food sales separately from Drinks sales.
  const [bucket, setBucket] = useState("all");

  const load = useCallback((s, e) => {
    setLoading(true);
    api.getSalesByCategory({ start_date: s, end_date: e })
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(dates.start, dates.end); }, []);

  const cats = data?.categories || [];

  // Roll categories up to Food / Drinks / Shisha. main_category is set by
  // the backend; missing values fall back to 'food' to match how the
  // kitchen routing classifies an uncategorised item.
  const bucketOf = (c) => (c?.main_category || "food").toLowerCase();
  const buckets = ["food", "drinks", "shisha"].map((b) => {
    const rows = cats.filter((c) => bucketOf(c) === b);
    return {
      key: b,
      label: b === "food" ? "Food" : b === "drinks" ? "Drinks" : "Shisha",
      revenue: rows.reduce((s, r) => s + (r.revenue || 0), 0),
      quantity: rows.reduce((s, r) => s + (r.quantity || 0), 0),
      orders: new Set(),  // we don't have unique order ids per bucket from the API; orders aggregate per category
      categories: rows.length,
    };
  });
  const totalRev = buckets.reduce((s, b) => s + b.revenue, 0) || 1;

  const filtered = bucket === "all" ? cats : cats.filter((c) => bucketOf(c) === bucket);
  const maxRev = filtered.length ? Math.max(...filtered.map((c) => c.revenue), 1) : 1;
  const filteredRevenue = filtered.reduce((s, c) => s + (c.revenue || 0), 0);

  const BUCKET_COLOR = {
    food:   { card: "bg-amber-50 dark:bg-amber-900/20",   text: "text-amber-700 dark:text-amber-300",   bar: "bg-amber-500"   },
    drinks: { card: "bg-blue-50 dark:bg-blue-900/20",      text: "text-blue-700 dark:text-blue-300",      bar: "bg-blue-500"     },
    shisha: { card: "bg-purple-50 dark:bg-purple-900/20",  text: "text-purple-700 dark:text-purple-300",  bar: "bg-purple-500"   },
  };

  return (
    <div>
      <DateFilter onApply={(s, e) => { setDates({ start: s, end: e }); load(s, e); }} />
      {loading ? <Spinner /> : data && (
        <>
          {/* Food / Drinks / Shisha summary cards — the headline numbers */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {buckets.map((b) => {
              const pct = totalRev > 0 ? Math.round((b.revenue / totalRev) * 100) : 0;
              const c = BUCKET_COLOR[b.key];
              const active = bucket === b.key;
              return (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setBucket(active ? "all" : b.key)}
                  className={cn(
                    "text-left rounded-2xl border-2 p-4 transition-all",
                    c.card,
                    active ? "border-current ring-2 ring-current/40" : "border-transparent hover:border-current/30",
                    c.text,
                  )}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">{b.label}</p>
                  <p className="text-2xl font-black tabular-nums mt-1">{formatCurrency(b.revenue)}</p>
                  <p className="text-[11px] mt-1 opacity-80">{b.quantity} sold · {b.categories} categor{b.categories === 1 ? "y" : "ies"} · {pct}% of total</p>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setBucket("all")}
                className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                  bucket === "all" ? "bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200")}>
                All ({cats.length})
              </button>
              {buckets.map((b) => (
                <button key={b.key} onClick={() => setBucket(b.key)}
                  className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors",
                    bucket === b.key ? "bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200")}>
                  {b.label} ({b.categories})
                </button>
              ))}
            </div>
            <ExportBtn
              onCSV={() => downloadCSV(`report_by_category_${bucket}_${dates.start}_${dates.end}`,
                ["Bucket", "Category", "Qty Sold", "Orders", "Revenue"],
                filtered.map((c) => [c.main_category || "food", c.category, c.quantity, c.orders, c.revenue]))}
              onPrint={() => printReport({
                title: `Report by Category — ${bucket === "all" ? "All" : (bucket[0].toUpperCase() + bucket.slice(1))}`,
                subtitle: `${dates.start} to ${dates.end}`,
                summaryRows: [
                  ["Revenue (filtered)", formatCurrency(filteredRevenue)],
                  ["Food", formatCurrency(buckets[0].revenue)],
                  ["Drinks", formatCurrency(buckets[1].revenue)],
                  ["Shisha", formatCurrency(buckets[2].revenue)],
                ],
                headers: ["Bucket", "Category", "Qty Sold", "Orders", "Revenue"],
                rows: filtered.map((c) => [(c.main_category || "food"), c.category, c.quantity, c.orders, formatCurrency(c.revenue)]),
              })}
            />
          </div>

          <div className="space-y-3">
            {filtered.map((c, i) => {
              const pct = Math.max((c.revenue / maxRev) * 100, 2);
              const colors = BUCKET_COLOR[bucketOf(c)] || BUCKET_COLOR.food;
              return (
                <div key={c.category} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-sm p-4">
                  <div className="flex items-center justify-between mb-2 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-gray-400 w-5">{i + 1}</span>
                      <span className="font-bold text-gray-900 dark:text-white text-sm truncate">{c.category}</span>
                      <span className={cn("text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded", colors.card, colors.text)}>
                        {bucketOf(c)}
                      </span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-black text-green-600 dark:text-green-400 text-sm tabular-nums">{formatCurrency(c.revenue)}</p>
                      <p className="text-xs text-gray-400">{c.quantity} sold · {c.orders} orders</p>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                    <div className={cn("h-2 rounded-full transition-all", colors.bar)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-12 text-center text-gray-400 text-sm">
                No {bucket === "all" ? "category" : bucket} data for this period
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Discount Report ──────────────────────────────────────────────────────────

function DiscountTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState({ start: monthStart(), end: today() });

  const load = useCallback((s, e) => {
    setLoading(true);
    api.getDiscountReport({ start_date: s, end_date: e })
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(dates.start, dates.end); }, []);

  const orders = data?.orders || [];
  const fmtDate = (s) => s ? new Date(s).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "—";

  return (
    <div>
      <DateFilter onApply={(s, e) => { setDates({ start: s, end: e }); load(s, e); }} />
      {loading ? <Spinner /> : data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <StatCard label="Total Discounted" value={formatCurrency(data.total_discounts)} color="text-red-500 dark:text-red-400" bg="bg-red-50 dark:bg-red-900/20" />
            <StatCard label="Orders Discounted" value={data.total_orders_discounted} color="text-amber-600 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-900/20" />
            <StatCard label="Revenue (After)" value={formatCurrency(data.total_revenue_after_discount)} color="text-green-600 dark:text-green-400" bg="bg-green-50 dark:bg-green-900/20" />
          </div>
          <div className="flex justify-end mb-3">
            <ExportBtn
              onCSV={() => downloadCSV(`discounts_${dates.start}_${dates.end}`,
                ["Order #", "Date", "Customer", "Type", "Discount", "Subtotal", "Total"],
                orders.map((o) => [o.order_number, fmtDate(o.created_at), o.customer_name, o.discount_type, o.discount_amount, o.subtotal, o.total]))}
              onPrint={() => printReport({
                title: "Discount Report",
                subtitle: `${dates.start} to ${dates.end}`,
                summaryRows: [["Total Discounts", formatCurrency(data.total_discounts)], ["Orders", String(data.total_orders_discounted)]],
                headers: ["Order #", "Date", "Customer", "Discount", "Total"],
                rows: orders.map((o) => [o.order_number, fmtDate(o.created_at), o.customer_name, formatCurrency(o.discount_amount), formatCurrency(o.total)]),
              })}
            />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-4 py-3">Order #</th>
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Customer</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-right px-4 py-3">Discount</th>
                    <th className="text-right px-4 py-3">Subtotal</th>
                    <th className="text-right px-4 py-3">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {orders.map((o, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-semibold text-blue-600 text-sm">{o.order_number}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm whitespace-nowrap">{fmtDate(o.created_at)}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-200 text-sm">{o.customer_name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 rounded-full text-xs font-semibold capitalize">{o.discount_type || "manual"}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-red-500 text-sm tabular-nums">-{formatCurrency(o.discount_amount)}</td>
                      <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 text-sm tabular-nums">{formatCurrency(o.subtotal)}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600 dark:text-green-400 text-sm tabular-nums">{formatCurrency(o.total)}</td>
                    </tr>
                  ))}
                  {orders.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">No discounted orders in this period</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Daily Summary ────────────────────────────────────────────────────────────

function DailySummaryTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState({ start: monthStart(), end: today() });

  const load = useCallback((s, e) => {
    setLoading(true);
    api.getDailySummary({ start_date: s, end_date: e })
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(dates.start, dates.end); }, []);

  const days = data?.days || [];
  const fmtDate = (s) => new Date(s + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  return (
    <div>
      <DateFilter onApply={(s, e) => { setDates({ start: s, end: e }); load(s, e); }} />
      {loading ? <Spinner /> : data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatCard label="Total Revenue" value={formatCurrency(data.total_revenue)} color="text-green-600 dark:text-green-400" bg="bg-green-50 dark:bg-green-900/20" />
            <StatCard label="Total Orders" value={data.total_orders} color="text-blue-600 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-900/20" />
            <StatCard label="Items Sold" value={data.total_items_sold} color="text-indigo-600 dark:text-indigo-400" bg="bg-indigo-50 dark:bg-indigo-900/20" />
            <StatCard label="Best Day" value={data.best_day ? fmtDate(data.best_day) : "—"} color="text-amber-600 dark:text-amber-400" bg="bg-amber-50 dark:bg-amber-900/20" />
          </div>
          <div className="flex justify-end mb-3">
            <ExportBtn
              onCSV={() => downloadCSV(`daily_summary_${dates.start}_${dates.end}`,
                ["Date", "Orders", "Revenue", "Items Sold", "Avg Order", "Discounts", "Unique Customers"],
                days.map((d) => [d.date, d.orders, d.revenue, d.items_sold, d.avg_order_value, d.discounts, d.unique_customers]))}
              onPrint={() => printReport({
                title: "Daily Summary Report",
                subtitle: `${dates.start} to ${dates.end}`,
                summaryRows: [["Total Revenue", formatCurrency(data.total_revenue)], ["Total Orders", String(data.total_orders)], ["Items Sold", String(data.total_items_sold)]],
                headers: ["Date", "Orders", "Revenue", "Items", "Avg Order"],
                rows: days.map((d) => [d.date, d.orders, formatCurrency(d.revenue), d.items_sold, formatCurrency(d.avg_order_value)]),
              })}
            />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-right px-4 py-3">Orders</th>
                    <th className="text-right px-4 py-3">Revenue</th>
                    <th className="text-right px-4 py-3">Items</th>
                    <th className="text-right px-4 py-3">Avg Order</th>
                    <th className="text-right px-4 py-3">Discounts</th>
                    <th className="text-right px-4 py-3">Customers</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {days.map((d, i) => (
                    <tr key={i} className={cn("hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors", d.date === data.best_day && "bg-green-50/50 dark:bg-green-900/10")}>
                      <td className="px-4 py-3 text-sm">
                        <span className="font-semibold text-gray-900 dark:text-white">{fmtDate(d.date)}</span>
                        {d.date === data.best_day && <span className="ml-2 text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full px-2 py-0.5 font-bold">Best</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-blue-600 dark:text-blue-400 text-sm">{d.orders}</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600 dark:text-green-400 text-sm tabular-nums">{formatCurrency(d.revenue)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300 text-sm">{d.items_sold}</td>
                      <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 text-sm tabular-nums">{formatCurrency(d.avg_order_value)}</td>
                      <td className="px-4 py-3 text-right text-red-400 text-sm tabular-nums">{d.discounts > 0 ? `-${formatCurrency(d.discounts)}` : "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-500 dark:text-gray-400 text-sm">{d.unique_customers || "—"}</td>
                    </tr>
                  ))}
                  {days.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-400 text-sm">No data for this period</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Shift Report ─────────────────────────────────────────────────────────────

const SHIFT_ICONS = { Morning: "🌅", Afternoon: "☀️", Evening: "🌆", Night: "🌙" };
const SHIFT_COLORS = {
  Morning:   { card: "border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700",   bar: "bg-amber-500",   text: "text-amber-600 dark:text-amber-400" },
  Afternoon: { card: "border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700",       bar: "bg-blue-500",    text: "text-blue-600 dark:text-blue-400" },
  Evening:   { card: "border-indigo-200 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-700", bar: "bg-indigo-500", text: "text-indigo-600 dark:text-indigo-400" },
  Night:     { card: "border-gray-300 bg-gray-50 dark:bg-gray-700/40 dark:border-gray-600",       bar: "bg-gray-500",    text: "text-gray-600 dark:text-gray-400" },
};

function ShiftReportTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState({ start: monthStart(), end: today() });

  const load = useCallback((s, e) => {
    setLoading(true);
    api.getShiftReport({ start_date: s, end_date: e })
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(dates.start, dates.end); }, []);

  const shifts = data?.shifts || [];
  const maxRev = shifts.length ? Math.max(...shifts.map((s) => s.revenue), 1) : 1;

  return (
    <div>
      <DateFilter onApply={(s, e) => { setDates({ start: s, end: e }); load(s, e); }} />
      {loading ? <Spinner /> : data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <StatCard label="Total Revenue" value={formatCurrency(data.total_revenue)} color="text-green-600 dark:text-green-400" bg="bg-green-50 dark:bg-green-900/20" />
            <StatCard label="Total Orders" value={data.total_orders} color="text-blue-600 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-900/20" />
            {data.busiest_shift && <StatCard label="Busiest Shift" value={`${SHIFT_ICONS[data.busiest_shift] || ""} ${data.busiest_shift}`} color="text-indigo-600 dark:text-indigo-400" bg="bg-indigo-50 dark:bg-indigo-900/20" />}
          </div>
          <div className="flex justify-end mb-4">
            <ExportBtn
              onCSV={() => downloadCSV(`shifts_${dates.start}_${dates.end}`,
                ["Shift", "Hours", "Orders", "Items Sold", "Revenue"],
                shifts.map((s) => [s.shift, s.hours, s.orders, s.items_sold, s.revenue]))}
              onPrint={() => printReport({
                title: "Shift Report",
                subtitle: `${dates.start} to ${dates.end}`,
                summaryRows: [["Total Revenue", formatCurrency(data.total_revenue)], ["Busiest Shift", data.busiest_shift || "—"]],
                headers: ["Shift", "Hours", "Orders", "Items", "Revenue"],
                rows: shifts.map((s) => [s.shift, s.hours, s.orders, s.items_sold, formatCurrency(s.revenue)]),
              })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {shifts.map((s) => {
              const colors = SHIFT_COLORS[s.shift] || SHIFT_COLORS["Night"];
              const pct = Math.max((s.revenue / maxRev) * 100, 2);
              return (
                <div key={s.shift} className={cn("rounded-2xl border-2 p-5 shadow-sm", colors.card)}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-black text-gray-900 dark:text-white text-lg">{SHIFT_ICONS[s.shift]} {s.shift}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{s.hours}</p>
                    </div>
                    {s.shift === data.busiest_shift && (
                      <span className="text-[10px] bg-white/70 dark:bg-gray-900/50 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-full px-2 py-0.5 font-bold">Busiest</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                    <div><p className="text-xs text-gray-400">Orders</p><p className={cn("font-black text-lg", colors.text)}>{s.orders}</p></div>
                    <div><p className="text-xs text-gray-400">Items</p><p className={cn("font-black text-lg", colors.text)}>{s.items_sold}</p></div>
                    <div><p className="text-xs text-gray-400">Revenue</p><p className={cn("font-black text-sm tabular-nums", colors.text)}>{formatCurrency(s.revenue)}</p></div>
                  </div>
                  <div className="w-full bg-white/50 dark:bg-gray-900/30 rounded-full h-2">
                    <div className={cn("h-2 rounded-full transition-all", colors.bar)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tax Report ───────────────────────────────────────────────────────────────

function TaxReportTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState({ start: monthStart(), end: today() });
  const TAX_RATE = 0.075;

  const load = useCallback((s, e) => {
    setLoading(true);
    api.getDailySummary({ start_date: s, end_date: e })
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(dates.start, dates.end); }, []);

  const days = data?.days || [];
  const taxCollected = data ? data.total_revenue * TAX_RATE : 0;
  const fmtDate = (s) => new Date(s + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  return (
    <div>
      <DateFilter onApply={(s, e) => { setDates({ start: s, end: e }); load(s, e); }} />
      {loading ? <Spinner /> : data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <StatCard label="Gross Revenue" value={formatCurrency(data.total_revenue)} color="text-blue-600 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-900/20" />
            <StatCard label="Tax Collected (7.5%)" value={formatCurrency(taxCollected)} color="text-red-600 dark:text-red-400" bg="bg-red-50 dark:bg-red-900/20" />
            <StatCard label="Net Revenue" value={formatCurrency(data.total_revenue - taxCollected)} color="text-green-600 dark:text-green-400" bg="bg-green-50 dark:bg-green-900/20" />
          </div>
          <div className="flex justify-end mb-3">
            <ExportBtn
              onCSV={() => downloadCSV(`tax_report_${dates.start}_${dates.end}`,
                ["Date", "Gross Revenue", "Tax (7.5%)", "Net Revenue"],
                days.map((d) => [d.date, d.revenue, (d.revenue * TAX_RATE).toFixed(2), (d.revenue * (1 - TAX_RATE)).toFixed(2)]))}
              onPrint={() => printReport({
                title: "Tax Report",
                subtitle: `${dates.start} to ${dates.end}`,
                summaryRows: [["Gross Revenue", formatCurrency(data.total_revenue)], ["Tax Collected (7.5%)", formatCurrency(taxCollected)], ["Net Revenue", formatCurrency(data.total_revenue - taxCollected)]],
                headers: ["Date", "Gross Revenue", "Tax (7.5%)", "Net Revenue"],
                rows: days.map((d) => [d.date, formatCurrency(d.revenue), formatCurrency(d.revenue * TAX_RATE), formatCurrency(d.revenue * (1 - TAX_RATE))]),
              })}
            />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-right px-4 py-3">Gross Revenue</th>
                    <th className="text-right px-4 py-3">Tax (7.5%)</th>
                    <th className="text-right px-4 py-3">Net Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700">
                  {days.map((d, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white text-sm">{fmtDate(d.date)}</td>
                      <td className="px-4 py-3 text-right text-blue-600 dark:text-blue-400 font-semibold text-sm tabular-nums">{formatCurrency(d.revenue)}</td>
                      <td className="px-4 py-3 text-right text-red-500 font-semibold text-sm tabular-nums">{formatCurrency(d.revenue * TAX_RATE)}</td>
                      <td className="px-4 py-3 text-right text-green-600 dark:text-green-400 font-bold text-sm tabular-nums">{formatCurrency(d.revenue * (1 - TAX_RATE))}</td>
                    </tr>
                  ))}
                  {days.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400 text-sm">No data for this period</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-3 px-1">Tax rate: 7.5% — configure in Settings → Tax Settings.</p>
        </>
      )}
    </div>
  );
}

// ─── Floor Report ─────────────────────────────────────────────────────────────

const FLOOR_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-amber-500", "bg-indigo-500",
];
const FLOOR_TEXT = [
  "text-blue-600 dark:text-blue-400", "text-green-600 dark:text-green-400",
  "text-purple-600 dark:text-purple-400", "text-orange-500 dark:text-orange-400",
  "text-pink-600 dark:text-pink-400", "text-teal-600 dark:text-teal-400",
  "text-amber-600 dark:text-amber-400", "text-indigo-600 dark:text-indigo-400",
];
const FLOOR_BG = [
  "bg-blue-50 dark:bg-blue-900/20", "bg-green-50 dark:bg-green-900/20",
  "bg-purple-50 dark:bg-purple-900/20", "bg-orange-50 dark:bg-orange-900/20",
  "bg-pink-50 dark:bg-pink-900/20", "bg-teal-50 dark:bg-teal-900/20",
  "bg-amber-50 dark:bg-amber-900/20", "bg-indigo-50 dark:bg-indigo-900/20",
];

function FloorReportTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState({ start: monthStart(), end: today() });
  const [expanded, setExpanded] = useState(null); // floor_id of open drill-down

  const load = useCallback((s, e) => {
    setLoading(true);
    api.getFloorReport({ start_date: s, end_date: e })
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(dates.start, dates.end); }, []);

  const floors = data?.floors || [];
  const maxRevenue = floors.length ? Math.max(...floors.map((f) => f.revenue), 1) : 1;

  return (
    <div>
      <DateFilter onApply={(s, e) => { setDates({ start: s, end: e }); load(s, e); }} />
      {loading ? <Spinner /> : data && (
        <>
          {/* Summary stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="Total Revenue" value={formatCurrency(data.total_revenue)} color="text-green-600 dark:text-green-400" bg="bg-green-50 dark:bg-green-900/20" />
            <StatCard label="Total Orders" value={data.total_orders} color="text-blue-600 dark:text-blue-400" bg="bg-blue-50 dark:bg-blue-900/20" />
            <StatCard label="Avg Order Value" value={formatCurrency(data.avg_order_value)} color="text-orange-500 dark:text-orange-400" bg="bg-orange-50 dark:bg-orange-900/20" />
            <StatCard label="Top Floor" value={data.top_floor || "—"} color="text-purple-600 dark:text-purple-400" bg="bg-purple-50 dark:bg-purple-900/20" />
          </div>

          {/* Export */}
          <div className="flex justify-end mb-3">
            <ExportBtn
              onCSV={() => downloadCSV(`floor_report_${dates.start}_${dates.end}`,
                ["Floor", "Outlet", "Revenue", "Orders", "Avg Order", "Items Sold", "% Share"],
                floors.map((f) => [f.floor_name, f.outlet_name, f.revenue, f.orders, f.avg_order_value, f.items_sold, `${f.revenue_pct}%`])
              )}
              onPrint={() => printReport({
                title: "Floor Report",
                subtitle: `${dates.start} to ${dates.end}`,
                summaryRows: [
                  ["Total Revenue", formatCurrency(data.total_revenue)],
                  ["Total Orders", String(data.total_orders)],
                  ["Avg Order Value", formatCurrency(data.avg_order_value)],
                ],
                headers: ["Floor", "Outlet", "Revenue", "Orders", "Avg Order", "Share"],
                rows: floors.map((f) => [f.floor_name, f.outlet_name, formatCurrency(f.revenue), f.orders, formatCurrency(f.avg_order_value), `${f.revenue_pct}%`]),
              })}
            />
          </div>

          {floors.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              <LayoutGrid size={32} className="mx-auto mb-3 opacity-30" />
              No floor data for this period. Orders must be linked to tables that belong to a floor.
            </div>
          ) : (
            <div className="space-y-3">
              {floors.map((floor, idx) => {
                const colorBar  = FLOOR_COLORS[idx % FLOOR_COLORS.length];
                const colorText = FLOOR_TEXT[idx % FLOOR_TEXT.length];
                const colorBg   = FLOOR_BG[idx % FLOOR_BG.length];
                const isOpen    = expanded === (floor.floor_id ?? "__unassigned__");
                const pct       = maxRevenue > 0 ? Math.max((floor.revenue / maxRevenue) * 100, 2) : 2;
                const isUnassigned = !floor.floor_id;

                return (
                  <div key={floor.floor_id ?? "__unassigned__"}
                    className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">

                    {/* Floor row — click to expand */}
                    <button
                      onClick={() => setExpanded(isOpen ? null : (floor.floor_id ?? "__unassigned__"))}
                      className="w-full text-left px-3 sm:px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">

                      <div className="flex items-center gap-3 mb-3">
                        {/* Color dot + name */}
                        <div className={cn("w-3 h-3 rounded-full flex-shrink-0", isUnassigned ? "bg-gray-400" : colorBar)} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={cn("font-bold text-sm", isUnassigned ? "text-gray-500 dark:text-gray-400 italic" : "text-gray-900 dark:text-white")}>
                              {floor.floor_name}
                            </span>
                            {floor.outlet_name && (
                              <span className="text-[10px] font-semibold px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full">
                                {floor.outlet_name}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Quick stats */}
                        <div className="flex items-center gap-4 flex-shrink-0 text-right">
                          <div className="hidden sm:block">
                            <p className="text-[11px] text-gray-400 leading-tight">Orders</p>
                            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{floor.orders}</p>
                          </div>
                          <div className="hidden sm:block">
                            <p className="text-[11px] text-gray-400 leading-tight">Avg</p>
                            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{formatCurrency(floor.avg_order_value)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-400 leading-tight">Revenue</p>
                            <p className={cn("text-sm font-black", isUnassigned ? "text-gray-500" : colorText)}>{formatCurrency(floor.revenue)}</p>
                          </div>
                          <div className="w-12 text-right">
                            <span className={cn("text-xs font-bold px-1.5 py-0.5 rounded-lg", isUnassigned ? "bg-gray-100 dark:bg-gray-700 text-gray-500" : colorBg, isUnassigned ? "" : colorText)}>
                              {floor.revenue_pct}%
                            </span>
                          </div>
                          <ChevronRight size={16} className={cn("text-gray-400 transition-transform flex-shrink-0", isOpen && "rotate-90")} />
                        </div>
                      </div>

                      {/* Revenue bar */}
                      <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                        <div className={cn("h-2 rounded-full transition-all", isUnassigned ? "bg-gray-400" : colorBar)}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </button>

                    {/* Drill-down section */}
                    {isOpen && (
                      <div className="border-t border-gray-100 dark:border-gray-700 px-3 sm:px-5 py-4 grid sm:grid-cols-2 gap-5">

                        {/* Top items */}
                        <div>
                          <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Top Items</h4>
                          {floor.top_items.length === 0 ? (
                            <p className="text-xs text-gray-400">No item data</p>
                          ) : (
                            <div className="space-y-2">
                              {floor.top_items.map((item, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <span className="w-5 h-5 flex-shrink-0 bg-gray-100 dark:bg-gray-700 rounded-full text-[10px] font-bold text-gray-500 dark:text-gray-400 flex items-center justify-center">{i + 1}</span>
                                  <span className="flex-1 text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{item.name}</span>
                                  <span className="text-xs text-gray-400 flex-shrink-0">{item.quantity}×</span>
                                  <span className={cn("text-xs font-bold flex-shrink-0 tabular-nums", isUnassigned ? "text-gray-500" : colorText)}>{formatCurrency(item.revenue)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Top staff */}
                        <div>
                          <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Staff Performance</h4>
                          {floor.top_staff.length === 0 ? (
                            <p className="text-xs text-gray-400">No staff data</p>
                          ) : (
                            <div className="space-y-2">
                              {floor.top_staff.map((s, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <div className="w-5 h-5 flex-shrink-0 rounded-full bg-violet-100 dark:bg-violet-900/40 text-[10px] font-bold text-violet-600 dark:text-violet-300 flex items-center justify-center">
                                    {(s.name || "?").charAt(0).toUpperCase()}
                                  </div>
                                  <span className="flex-1 text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{s.name || "Unknown"}</span>
                                  <span className="text-xs text-gray-400 flex-shrink-0">{s.orders} orders</span>
                                  <span className={cn("text-xs font-bold flex-shrink-0 tabular-nums", isUnassigned ? "text-gray-500" : colorText)}>{formatCurrency(s.revenue)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Mobile: orders/avg stats */}
                        <div className="sm:hidden flex gap-4 pt-2 border-t border-gray-100 dark:border-gray-700">
                          <div>
                            <p className="text-[11px] text-gray-400">Orders</p>
                            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{floor.orders}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-400">Avg Order</p>
                            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{formatCurrency(floor.avg_order_value)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-400">Items Sold</p>
                            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{floor.items_sold}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function ReportsSection({ view = "sales" }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center">
          <BarChart2 size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">Reports</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{VIEW_LABELS[view] || view}</p>
        </div>
      </div>

      {view === "sales"         && <SalesTab />}
      {view === "cost"          && <CostTab />}
      {view === "staff"         && <StaffTab />}
      {view === "payments"      && <PaymentsTab />}
      {view === "items"         && <SalesByItemTab />}
      {view === "category"      && <SalesByCategoryTab />}
      {view === "discounts"     && <DiscountTab />}
      {view === "daily-summary" && <DailySummaryTab />}
      {view === "shifts"        && <ShiftReportTab />}
      {view === "tax"           && <TaxReportTab />}
      {view === "floors"        && <FloorReportTab />}
    </div>
  );
}
