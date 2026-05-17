import React, { useEffect, useState, useCallback } from "react";
import { Calendar, ChevronDown, ChevronRight, X, BarChart2 } from "lucide-react";
import { api } from "../lib/api";
import { cn, formatCurrency } from "../lib/utils";

const VIEW_LABELS = {
  sales: "Sales",
  cost: "Cost Analysis",
  staff: "Staff Performance",
  payments: "Payment Methods",
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
    <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 shadow-sm px-5 py-4 mb-6 flex items-center gap-3">
      <Calendar size={18} className="text-gray-400 flex-shrink-0" />
      <input
        type="date"
        value={start}
        onChange={(e) => setStart(e.target.value)}
        className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-gray-50 dark:bg-gray-900"
      />
      <span className="text-gray-400 text-sm font-medium">to</span>
      <input
        type="date"
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-400 bg-gray-50 dark:bg-gray-900"
      />
      <button
        onClick={() => onApply(start, end)}
        className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
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
      <p className={cn("text-lg sm:text-2xl font-black break-all leading-tight", color)}>{value}</p>
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
          <div className="grid grid-cols-3 gap-4 mb-6">
            <StatCard label="Total Revenue" value={formatCurrency(data.total_revenue)} color="text-green-600" bg="bg-green-50" />
            <StatCard label="Total Orders" value={data.total_orders} color="text-blue-600" bg="bg-blue-50" />
            <StatCard label="Avg Order Value" value={formatCurrency(data.avg_order_value)} color="text-orange-500" bg="bg-orange-50" />
          </div>

          {/* Daily Sales horizontal bar chart */}
          {data.daily_sales?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm mb-6">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-white">Daily Sales</h3>
              </div>
              <div className="px-6 py-4 space-y-3">
                {data.daily_sales.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400 w-20 flex-shrink-0">{d.date}</span>
                    <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-5 relative">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${Math.max(((d.revenue || 0) / maxRevenue) * 100, 2)}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-green-600 dark:text-green-400 w-28 text-right flex-shrink-0 whitespace-nowrap">
                      {formatCurrency(d.revenue)}
                    </span>
                    <span className="text-xs text-gray-400 w-12 text-right flex-shrink-0">
                      {d.orders}×
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Products */}
          {data.top_products?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-white">Top Products</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-6 py-3 w-10">#</th>
                    <th className="text-left px-6 py-3">Product</th>
                    <th className="text-right px-6 py-3">Qty</th>
                    <th className="text-right px-6 py-3">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.top_products.map((p, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900">
                      <td className="px-6 py-3 text-gray-400 text-sm">{i + 1}</td>
                      <td className="px-6 py-3 font-semibold text-gray-900 dark:text-white text-sm">{p.name}</td>
                      <td className="px-6 py-3 text-gray-600 dark:text-gray-300 text-sm text-right">{p.quantity}</td>
                      <td className="px-6 py-3 font-semibold text-green-600 text-sm text-right">{formatCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
          <div className="grid grid-cols-3 gap-4 mb-6">
            <StatCard label="Total Revenue" value={formatCurrency(data.total_revenue)} color="text-blue-600" bg="bg-blue-50" />
            <StatCard label="Total Cost" value={formatCurrency(data.total_cost)} color="text-orange-500" bg="bg-orange-50" />
            <StatCard label="Gross Profit" value={formatCurrency(data.total_profit)} color="text-green-600" bg="bg-green-50" />
          </div>

          {data.products?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="font-bold text-gray-900 dark:text-white">Product Cost Breakdown</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-6 py-3">Product</th>
                    <th className="text-right px-6 py-3">Qty</th>
                    <th className="text-right px-6 py-3">Cost</th>
                    <th className="text-right px-6 py-3">Revenue</th>
                    <th className="text-right px-6 py-3">Profit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.products.map((p, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900">
                      <td className="px-6 py-3 font-semibold text-gray-900 dark:text-white text-sm">{p.name}</td>
                      <td className="px-6 py-3 text-gray-600 dark:text-gray-300 text-sm text-right">{p.quantity ?? "—"}</td>
                      <td className="px-6 py-3 text-orange-500 text-sm text-right">{formatCurrency(p.cost)}</td>
                      <td className="px-6 py-3 text-blue-600 font-semibold text-sm text-right">{formatCurrency(p.revenue)}</td>
                      <td className="px-6 py-3 text-green-600 font-semibold text-sm text-right">{formatCurrency(p.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Staff Performance ────────────────────────────────────────────────────────

function OrderItemsPanel({ order, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div>
            <p className="font-bold text-gray-900 dark:text-white">Order #{order.order_number}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(order.created_at).toLocaleString()} · {order.payment_method || "pending"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-6 py-3">Item</th>
                <th className="text-right px-6 py-3">Qty</th>
                <th className="text-right px-6 py-3">Price</th>
                <th className="text-right px-6 py-3">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(order.items || []).map((item, i) => (
                <tr key={i}>
                  <td className="px-6 py-3 font-medium text-gray-900 dark:text-white text-sm">{item.product_name || item.name}</td>
                  <td className="px-6 py-3 text-gray-600 dark:text-gray-300 text-sm text-right">{item.quantity}</td>
                  <td className="px-6 py-3 text-gray-600 dark:text-gray-300 text-sm text-right">{formatCurrency(item.price)}</td>
                  <td className="px-6 py-3 font-semibold text-green-600 text-sm text-right">{formatCurrency((item.price || 0) * (item.quantity || 1))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
            <span className="font-bold text-gray-700 dark:text-gray-200">Total</span>
            <span className="font-black text-green-600 text-lg">{formatCurrency(order.total)}</span>
          </div>
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
      .then(setOrders).catch(console.error).finally(() => setLoading(false));
  }, [staff, dateRange]);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 flex items-end sm:items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
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
              <table className="w-full">
                <thead>
                  <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-6 py-3">Order #</th>
                    <th className="text-left px-6 py-3">Date</th>
                    <th className="text-right px-6 py-3">Items</th>
                    <th className="text-right px-6 py-3">Total</th>
                    <th className="text-left px-6 py-3">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map((o) => (
                    <tr
                      key={o.id}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedOrder(o)}
                    >
                      <td className="px-6 py-3 font-semibold text-blue-600 text-sm">{o.order_number}</td>
                      <td className="px-6 py-3 text-gray-500 dark:text-gray-400 text-sm">{new Date(o.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-3 text-gray-600 dark:text-gray-300 text-sm text-right">{o.items?.length ?? 0}</td>
                      <td className="px-6 py-3 font-semibold text-green-600 text-sm text-right">{formatCurrency(o.total)}</td>
                      <td className="px-6 py-3 text-sm">
                        <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-xs capitalize">
                          {o.payment_method || "pending"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      {selectedOrder && <OrderItemsPanel order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </>
  );
}

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

  const ROLE_COLORS = {
    admin: "bg-red-100 text-red-700",
    manager: "bg-blue-100 text-blue-700",
    cashier: "bg-green-100 text-green-700",
    waiter: "bg-amber-100 text-amber-700",
  };

  return (
    <div>
      <DateFilter onApply={load} />
      {loading ? <Spinner /> : data && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white">Staff Sales Performance</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-6 py-3 w-10">#</th>
                <th className="text-left px-6 py-3">Staff</th>
                <th className="text-left px-6 py-3">Role</th>
                <th className="text-right px-6 py-3">Orders</th>
                <th className="text-right px-6 py-3">Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(data.staff || []).map((s, i) => (
                <tr
                  key={i}
                  className="hover:bg-blue-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedStaff(s)}
                >
                  <td className="px-6 py-3 text-gray-400 text-sm">{i + 1}</td>
                  <td className="px-6 py-3 font-bold text-gray-900 dark:text-white text-sm">{s.name || "Unknown"}</td>
                  <td className="px-6 py-3">
                    <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide",
                      ROLE_COLORS[s.role] || "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400")}>
                      {s.role || "unknown"}
                    </span>
                  </td>
                  <td className="px-6 py-3 font-semibold text-gray-900 dark:text-white text-sm text-right">{s.orders}</td>
                  <td className="px-6 py-3 font-semibold text-green-600 text-sm text-right">{formatCurrency(s.revenue)}</td>
                </tr>
              ))}
              {(data.staff || []).length === 0 && (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm">No data for this period</td></tr>
              )}
            </tbody>
          </table>
          {(data.staff || []).length > 0 && (
            <p className="px-6 py-3 text-xs text-gray-400 border-t border-gray-50">
              Click a row to view individual orders and items
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
      .then((all) => setOrders(all.filter((o) => (o.payment_method || "").toLowerCase() === method.toLowerCase())))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [method, dateRange]);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 flex items-end sm:items-center justify-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
            <div>
              <p className="font-bold text-gray-900 dark:text-white capitalize">Orders — {method}</p>
              <p className="text-xs text-gray-400 mt-0.5">{orders.length} orders found</p>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
          </div>
          <div className="overflow-y-auto flex-1">
            {loading ? <Spinner /> : orders.length === 0 ? (
              <p className="px-6 py-10 text-center text-gray-400 text-sm">No orders found for this payment method.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-6 py-3">Order #</th>
                    <th className="text-left px-6 py-3">Date</th>
                    <th className="text-left px-6 py-3">Customer</th>
                    <th className="text-right px-6 py-3">Items</th>
                    <th className="text-right px-6 py-3">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orders.map((o) => (
                    <tr
                      key={o.id}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => setSelectedOrder(o)}
                    >
                      <td className="px-6 py-3 font-semibold text-blue-600 text-sm">{o.order_number}</td>
                      <td className="px-6 py-3 text-gray-500 dark:text-gray-400 text-sm">{new Date(o.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-3 text-gray-600 dark:text-gray-300 text-sm">{o.customer_name || "Walk-in"}</td>
                      <td className="px-6 py-3 text-gray-600 dark:text-gray-300 text-sm text-right">{o.items?.length ?? 0}</td>
                      <td className="px-6 py-3 font-semibold text-green-600 text-sm text-right">{formatCurrency(o.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      {selectedOrder && <OrderItemsPanel order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </>
  );
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
          {/* Method cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
            {(data.methods || []).map((m, i) => (
              <button
                key={i}
                onClick={() => setSelectedMethod(m.method)}
                className={cn(
                  "text-left rounded-2xl border-2 p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5",
                  METHOD_COLORS[i % METHOD_COLORS.length]
                )}
              >
                <p className="font-semibold text-gray-700 dark:text-gray-100 capitalize mb-2">{m.method || "Unknown"}</p>
                <p className="text-2xl font-black text-blue-600 dark:text-blue-400 mb-1">{formatCurrency(m.total)}</p>
                <p className="text-xs text-gray-500 dark:text-gray-300">{m.count} transaction{m.count !== 1 ? "s" : ""}</p>
              </button>
            ))}
            {(data.methods || []).length === 0 && (
              <p className="col-span-3 py-10 text-center text-gray-400 text-sm">No payment data for this period.</p>
            )}
          </div>

          {(data.methods || []).length > 0 && (
            <p className="text-xs text-gray-400 mb-2">Click a payment method card to view its orders</p>
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

// ─── Main export ──────────────────────────────────────────────────────────────

export default function ReportsSection({ view = "sales" }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center">
          <BarChart2 size={20} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Reports</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">{VIEW_LABELS[view] || view}</p>
        </div>
      </div>

      {view === "sales" && <SalesTab />}
      {view === "cost" && <CostTab />}
      {view === "staff" && <StaffTab />}
      {view === "payments" && <PaymentsTab />}
    </div>
  );
}
