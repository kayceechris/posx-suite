import React, { useEffect, useState } from "react";
import {
  ArrowLeft, CheckCircle2, ChevronDown, Flame, Menu, Minus, Monitor, Plus, Printer, Search, ShoppingCart, Trash2, X,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBusiness } from "../context/BusinessContext";
import Sidebar from "../components/Sidebar";
import TerminalSettingsModal from "../components/TerminalSettingsModal";
import { api } from "../lib/api";
import { cn, formatCurrency } from "../lib/utils";
import { printService } from "../utils/printService";

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

function PaymentModal({ total, onClose, onConfirm, paymentTypes }) {
  const defaults = [
    { name: "cash", label: "Cash" },
    { name: "card", label: "Card" },
    { name: "mobile", label: "Mobile Pay" },
  ];
  const methods = paymentTypes?.length
    ? paymentTypes.map((p) => ({ name: p.name, label: p.name }))
    : defaults;
  const [method, setMethod] = useState(methods[0]?.name || "cash");
  const [amountPaid, setAmountPaid] = useState(total.toFixed(2));

  const paid = parseFloat(amountPaid) || 0;
  const change = Math.max(0, paid - total);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-sm overflow-hidden max-h-[95vh] overflow-y-auto">
        <div className="bg-emerald-500 p-6 text-white text-center">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/75 mb-1">Total Amount</p>
          <p className="text-4xl font-black tabular-nums">{formatCurrency(total)}</p>
        </div>
        <div className="p-5 space-y-4">
          {/* Payment method */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-1.5">
              Payment Method
            </label>
            <div className="relative">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-2xl text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:border-emerald-400 appearance-none font-semibold"
              >
                {methods.map((m) => <option key={m.name} value={m.name}>{m.label}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Amount paid */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-1.5">
              Amount Paid
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 dark:border-gray-600 rounded-2xl text-sm bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:border-emerald-400 font-bold text-xl"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={() => setAmountPaid(total.toFixed(2))} className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-all">Exact</button>
              {[10, 20, 50, 100].map((amt) => (
                <button key={amt} onClick={() => setAmountPaid(amt.toFixed(2))} className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 active:scale-95 transition-all">{amt}</button>
              ))}
            </div>
          </div>

          {/* Change */}
          <div className="bg-emerald-50 dark:bg-emerald-900/30 border-2 border-emerald-200 dark:border-emerald-700/50 rounded-2xl px-5 py-3.5 flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Change</span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(change)}</span>
          </div>

          <button onClick={() => onConfirm(method)} className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-base hover:bg-emerald-600 active:bg-emerald-700 flex items-center justify-center gap-2">
            <CheckCircle2 size={18} />
            Confirm Payment
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
  const navigate = useNavigate();

  const isBarTab = !!barTabId;
  const entityId = tableId || barTabId;

  const [entity, setEntity] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedTerminal, setSelectedTerminal] = useState(
    () => localStorage.getItem("pos_terminal") || ""
  );
  const [selectedOutlet, setSelectedOutlet] = useState(
    () => localStorage.getItem("pos_outlet") || ""
  );
  const [showTerminalModal, setShowTerminalModal] = useState(false);
  const [customerName, setCustomerName] = useState("");

  const [cart, setCart] = useState([]);
  const [showPay, setShowPay] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [prods, cats, terms, outs, ptypes, entityData] = await Promise.all([
          api.getProducts(),
          api.getCategories(),
          api.getTerminals(),
          api.getOutlets(),
          api.getPaymentTypes().catch(() => []),
          isBarTab ? api.getBarTabs().then((list) => list.find((b) => b.id === entityId)) : api.getTables().then((list) => list.find((t) => t.id === entityId)),
        ]);
        setProducts(prods.filter((p) => p.active !== false));
        setCategories(cats);
        setTerminals(terms);
        setOutlets(outs);
        setPaymentTypes(ptypes);
        if (terms.length > 0) setSelectedTerminal(terms[0].id);

        // Auth guard: waiter/cashier can only access their own occupied table
        if (entityData && entityData.status === "occupied") {
          const ownerKey = isBarTab ? "staff_id" : "waiter_id";
          const isPrivileged = ["admin", "manager"].includes(user?.role);
          if (!isPrivileged && entityData[ownerKey] !== user?.id) {
            navigate("/tables", { replace: true });
            return;
          }
          // Load the existing order into the cart
          if (entityData.current_order_id) {
            try {
              const existingOrder = await api.getOrder(entityData.current_order_id);
              if (existingOrder?.items?.length) {
                setCart(existingOrder.items.map((item) => ({
                  product_id: item.product_id,
                  product_name: item.product_name || item.name,
                  quantity: item.quantity || item.qty || 1,
                  price: item.price,
                  total: item.total,
                })));
              }
              if (existingOrder?.customer_name) setCustomerName(existingOrder.customer_name);
            } catch {
              // Non-fatal: order may have already completed
            }
          }
        }
        setEntity(entityData || null);
      } catch (err) {
        showToast("Failed to load data", "error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [entityId, isBarTab]);

  const addToCart = (product) => {
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
        quantity: 1,
        price: product.price,
        total: product.price,
      }];
    });
  };

  const changeQty = (productId, delta) => {
    setCart((prev) =>
      prev.map((i) =>
        i.product_id === productId
          ? { ...i, quantity: i.quantity + delta, total: (i.quantity + delta) * i.price }
          : i
      ).filter((i) => i.quantity > 0)
    );
  };

  const removeFromCart = (productId) =>
    setCart((prev) => prev.filter((i) => i.product_id !== productId));

  const subtotal = cart.reduce((s, i) => s + i.total, 0);
  const total = subtotal;

  const filtered = products.filter((p) => {
    const matchesSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCat = activeCategory === "all" || p.category_id === activeCategory;
    return matchesSearch && matchesCat;
  });

  const outlet = outlets[0] || null;

  const buildOrderPayload = (status, paymentMethod) => ({
    outlet_id: entity?.outlet_id || outlet?.id || "",
    terminal_id: selectedTerminal || null,
    table_id: isBarTab ? null : entityId,
    table_number: isBarTab ? null : entity?.number,
    customer_name: customerName.trim() || null,
    items: cart,
    subtotal,
    tax: 0,
    discount: 0,
    total,
    payment_method: paymentMethod,
    status,
    service_mode: "table_service",
  });

  const hasWaiterModule = !settings?.service_mode || settings.service_mode !== "quick_service";

  const isWaiter = user?.role === "waiter";
  const canPrintBill = cart.length > 0 && !isWaiter;
  const canCharge = !isWaiter;
  const isHeldOrder = !!(entity?.current_order_id);
  const canModify = !isHeldOrder
    || ["admin", "manager"].includes(user?.role)
    || (user?.permissions || []).includes("delete_held_order_items");

  const handlePrintBill = () => {
    let usbPrinter = null;
    try {
      const saved = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
      usbPrinter = saved.find((x) => x.mode === "usb" && x.type === "receipt") || null;
    } catch (_) {}
    const bs = settings?.bill_settings || {};
    printService.printReceipt({
      businessName: settings?.business_name || "Restaurant",
      address: settings?.address || "",
      phone: settings?.phone || "",
      tableName: `${isBarTab ? "Bar Tab" : "Table"} ${entity?.number || ""}`,
      cashier: user?.name || "",
      items: cart.map((i) => ({ name: i.product_name, quantity: i.quantity, price: i.price })),
      subtotal,
      taxAmount: total - subtotal,
      discount: 0,
      total,
      footer: bs.receipt_footer || "Thank you!",
      docType: "BILL",
    }, { printer: usbPrinter }).catch((e) => showToast(e.message, "error"));
  };

  const handlePrintReceipt = (method) => {
    let usbPrinter = null;
    try {
      const saved = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
      usbPrinter = saved.find((x) => x.mode === "usb" && x.type === "receipt") || null;
    } catch (_) {}
    const bs = settings?.bill_settings || {};
    printService.printReceipt({
      businessName: settings?.business_name || "Restaurant",
      address: settings?.address || "",
      phone: settings?.phone || "",
      tableName: `${isBarTab ? "Bar Tab" : "Table"} ${entity?.number || ""}`,
      cashier: user?.name || "",
      items: cart.map((i) => ({ name: i.product_name, quantity: i.quantity, price: i.price })),
      subtotal,
      taxAmount: total - subtotal,
      discount: 0,
      total,
      paymentMethod: method,
      footer: bs.receipt_footer || "Thank you!",
    }, { printer: usbPrinter }).catch((e) => showToast(e.message, "error"));
  };

  const handleSendToKitchen = async () => {
    if (cart.length === 0) { showToast("Add at least one item", "error"); return; }
    setSubmitting(true);
    try {
      await api.createOrder(buildOrderPayload("sent_to_kitchen", "pending"));
      showToast("Order sent to kitchen!");
      // Print kitchen/bar tickets for each configured station
      try {
        const saved = JSON.parse(localStorage.getItem("pos_saved_printers") || "[]");
        const kitchenPrinters = saved.filter((x) => x.type === "kitchen");
        for (const kp of kitchenPrinters) {
          const printerConfig = kp.mode === "usb" ? { printer: kp } : { ip: kp.ip_address, port: kp.port || 9100 };
          printService.printKitchenTicket({
            tableName: `${isBarTab ? "Bar Tab" : "Table"} ${entity?.number || ""}`,
            orderNo: "",
            items: cart.map((i) => ({ name: i.product_name, quantity: i.quantity })),
            station: kp.name || "KITCHEN",
          }, printerConfig).catch(console.warn);
        }
      } catch (_) {}
      setCart([]);
      setCustomerName("");
      navigate("/tables");
    } catch (err) {
      showToast(err.message || "Failed to send to kitchen", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleHold = async () => {
    if (cart.length === 0) { showToast("Add at least one item", "error"); return; }
    setSubmitting(true);
    try {
      await api.createOrder(buildOrderPayload("held", "pending"));
      showToast("Order held!");
      setCart([]);
      setCustomerName("");
      navigate("/tables");
    } catch (err) {
      showToast(err.message || "Failed to hold order", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleComplete = async (method) => {
    setSubmitting(true);
    setShowPay(false);
    try {
      await api.createOrder(buildOrderPayload("completed", method));
      handlePrintReceipt(method);
      showToast(`Order completed via ${method}!`);
      setCart([]);
      setCustomerName("");
      navigate("/tables");
    } catch (err) {
      showToast(err.message || "Failed to complete order", "error");
    } finally {
      setSubmitting(false);
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
        </header>

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

            <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide flex-shrink-0 border-b border-gray-100 dark:border-gray-700">
              <button
                onClick={() => setActiveCategory("all")}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
                  activeCategory === "all"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                )}>
                All
              </button>
              {categories.map((cat) => (
                <button key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
                    activeCategory === cat.id
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  )}>
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                  {filtered.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="bg-white dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-600 rounded-2xl overflow-hidden hover:border-blue-300 hover:shadow-md transition-all text-left group"
                    >
                      {product.image ? (
                        <img src={api.getImageUrl(product.image)} alt={product.name} className="w-full aspect-[4/3] object-cover" />
                      ) : (
                        <div className="w-full aspect-[4/3] bg-gradient-to-br from-gray-100 dark:from-gray-600 to-gray-200 dark:to-gray-700 flex items-center justify-center">
                          <ShoppingCart size={24} className="text-gray-300 dark:text-gray-500" />
                        </div>
                      )}
                      <div className="p-2.5">
                        <p className="font-semibold text-gray-900 dark:text-white text-sm leading-tight truncate">{product.name}</p>
                        <p className="text-blue-600 dark:text-blue-400 font-black text-sm mt-0.5">{formatCurrency(product.price)}</p>
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
                        <button onClick={() => changeQty(item.product_id, -1)}
                          className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center transition-colors">
                          <Minus size={12} className="text-gray-600 dark:text-gray-300" />
                        </button>
                        <span className="w-5 text-center font-bold text-sm dark:text-white">{item.quantity}</span>
                        <button onClick={() => changeQty(item.product_id, 1)}
                          className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center justify-center transition-colors">
                          <Plus size={12} className="text-gray-600 dark:text-gray-300" />
                        </button>
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

            {cart.length > 0 && (
              <div className="px-4 pt-3 pb-2 border-t border-gray-100 dark:border-gray-700">
                <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-1">
                  <span>Subtotal</span><span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="flex justify-between font-black text-gray-900 dark:text-white text-base mb-3">
                  <span>Total</span><span className="text-green-600 dark:text-green-400">{formatCurrency(total)}</span>
                </div>
              </div>
            )}

            <div className="px-4 pb-4 space-y-2 flex-shrink-0">
              {hasWaiterModule && (
                <button
                  onClick={handleSendToKitchen}
                  disabled={submitting || cart.length === 0}
                  className="w-full py-3 bg-orange-500 text-white rounded-2xl font-bold text-sm hover:bg-orange-600 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                  <Flame size={16} />
                  Send to Kitchen
                </button>
              )}
              {canPrintBill && (
                <button
                  onClick={handlePrintBill}
                  disabled={cart.length === 0}
                  className="w-full py-3 bg-indigo-500 text-white rounded-2xl font-bold text-sm hover:bg-indigo-600 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                  <Printer size={16} />
                  Print Bill
                </button>
              )}
              <button
                onClick={handleHold}
                disabled={submitting || cart.length === 0}
                className="w-full py-3 bg-gray-800 dark:bg-gray-600 text-white rounded-2xl font-bold text-sm hover:bg-gray-900 dark:hover:bg-gray-500 disabled:opacity-40 transition-colors">
                Hold Order
              </button>
              {canCharge && (
                <button
                  onClick={() => { if (cart.length > 0) setShowPay(true); }}
                  disabled={submitting || cart.length === 0}
                  className="w-full py-3 bg-emerald-500 text-white rounded-2xl font-bold text-sm hover:bg-emerald-600 disabled:opacity-40 transition-colors">
                  Complete Order
                </button>
              )}
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
                        <button onClick={() => changeQty(item.product_id, -1)} className="w-9 h-9 rounded-xl bg-red-500 hover:bg-red-600 active:scale-95 flex items-center justify-center transition-all shadow-sm">
                          <Minus size={14} className="text-white" />
                        </button>
                        <span className="font-black text-lg text-gray-900 dark:text-white w-6 text-center tabular-nums">{item.quantity}</span>
                        <button onClick={() => changeQty(item.product_id, 1)} className="w-9 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 flex items-center justify-center transition-all shadow-sm">
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
          {cart.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-700 px-5 pt-4 pb-8 bg-white dark:bg-gray-900 flex-shrink-0">
              <div className="flex justify-between font-black text-gray-900 dark:text-white text-lg mb-4">
                <span>Total</span>
                <span className="text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(total)}</span>
              </div>
              {hasWaiterModule && (
                <button onClick={handleSendToKitchen} disabled={submitting} className="w-full py-3.5 bg-orange-500 text-white rounded-2xl font-bold text-sm hover:bg-orange-600 disabled:opacity-40 flex items-center justify-center gap-2 mb-2">
                  <Flame size={16} />Send to Kitchen
                </button>
              )}
              {canPrintBill && (
                <button onClick={() => { handlePrintBill(); setShowCart(false); }} disabled={submitting} className="w-full py-3.5 bg-indigo-500 text-white rounded-2xl font-bold text-sm hover:bg-indigo-600 disabled:opacity-40 flex items-center justify-center gap-2 mb-2">
                  <Printer size={16} />Print Bill
                </button>
              )}
              {canCharge && (
                <button
                  onClick={() => { setShowCart(false); setShowPay(true); }}
                  disabled={submitting}
                  className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-base hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-40"
                >
                  Charge {formatCurrency(total)}
                </button>
              )}
              <button onClick={handleHold} disabled={submitting} className="w-full py-3 mt-2 bg-gray-800 dark:bg-gray-700 text-white rounded-2xl font-bold text-sm hover:bg-gray-900 disabled:opacity-40">
                Hold Order
              </button>
            </div>
          )}
        </div>
      )}

      {showPay && (
        <PaymentModal
          total={total}
          paymentTypes={paymentTypes}
          onClose={() => setShowPay(false)}
          onConfirm={handleComplete}
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
