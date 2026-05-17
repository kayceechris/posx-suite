import React, { useEffect, useState, useRef } from "react";
import { Plus, Trash2, Check, X, Pencil, ToggleLeft, ToggleRight, Printer, AlertCircle, Settings, Receipt, CreditCard, Banknote, Smartphone, Building2, DollarSign } from "lucide-react";
import { api } from "../lib/api";
import { useBusiness } from "../context/BusinessContext";
import PrintBridgeSettings from "../components/PrintBridgeSettings";
import MobilePrinterScanner from "../components/MobilePrinterScanner";

const INPUT = "w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500";
const LABEL = "block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5";

function SectionCard({ title, children, action }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm mb-6">
      {(title || action) && (
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          {title && <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>}
          {action}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full ${wide ? "max-w-lg" : "max-w-md"} max-h-[90vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

function SaveBtn({ saving, saved, label = "Save Changes" }) {
  return (
    <button type="submit" disabled={saving}
      className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
      {saved ? <><Check size={15} /> Saved!</> : saving ? "Saving..." : label}
    </button>
  );
}

// --- Company Settings ---

const BUSINESS_TYPES = [
  { id: "restaurant", label: "Restaurant", tableService: true },
  { id: "cafe", label: "Cafe" },
  { id: "bar", label: "Bar", tableService: true },
  { id: "nightclub", label: "Nightclub", tableService: true },
  { id: "supermarket", label: "Supermarket" },
  { id: "retail", label: "Retail" },
];

function CompanySettings() {
  const { settings, refreshSettings } = useBusiness();
  const [form, setForm] = useState({ business_name: "", business_type: "restaurant", currency_symbol: "", address: "", phone: "", email: "", tax_id: "" });
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef();

  useEffect(() => {
    if (settings) {
      setForm({
        business_name: settings.business_name || "",
        business_type: settings.business_type || "restaurant",
        currency_symbol: settings.currency_symbol || "",
        address: settings.address || "",
        phone: settings.phone || "",
        email: settings.email || "",
        tax_id: settings.tax_id || "",
      });
      setLogoPreview(settings.logo_url || "");
    }
  }, [settings]);

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true); setError(""); setSaved(false);
    try {
      let payload = { ...form };
      if (logoFile) {
        const fd = new FormData();
        fd.append("file", logoFile);
        try {
          const res = await fetch("/api/upload", { method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, body: fd });
          const data = await res.json();
          if (data.url) payload.logo_url = data.url;
        } catch {}
      }
      await api.updateSettings(payload);
      await refreshSettings();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const selectedType = BUSINESS_TYPES.find((t) => t.id === form.business_type);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center">
          <Settings size={20} className="text-gray-500 dark:text-gray-400" />
        </div>
        <div>
          <p className="text-sm text-gray-400 font-medium">Settings</p>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">Company</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white text-center mb-6">Company Information</h2>
          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className={LABEL}>Company Name</label>
              <input value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                className={INPUT} placeholder="e.g. My Restaurant" />
            </div>

            <div>
              <label className={LABEL}>Business Type</label>
              <div className="grid grid-cols-3 gap-2">
                {BUSINESS_TYPES.map((t) => (
                  <button key={t.id} type="button"
                    onClick={() => setForm({ ...form, business_type: t.id })}
                    className={`px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                      form.business_type === t.id
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                        : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300"
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
              {selectedType?.tableService && (
                <p className="text-green-600 text-xs font-semibold mt-2">✓ Table service &amp; waiter pages enabled</p>
              )}
            </div>

            <div>
              <label className={LABEL}>Logo</label>
              <div className="flex items-center gap-3 mb-2">
                <input type="file" accept="image/*" ref={fileRef} onChange={handleLogoChange} className="text-sm text-gray-600 dark:text-gray-300" />
              </div>
              {logoPreview && (
                <div className="mt-2">
                  <input value={logoPreview} readOnly className={`${INPUT} text-xs text-gray-400 mb-2`} />
                  <img src={logoPreview} alt="Logo" className="h-20 object-contain border-2 border-gray-300 dark:border-gray-700 rounded-xl p-2" />
                </div>
              )}
            </div>

            <div>
              <label className={LABEL}>Address</label>
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })}
                className={INPUT} placeholder="123 Main Street" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Phone</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className={INPUT} placeholder="555-0100" />
              </div>
              <div>
                <label className={LABEL}>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={INPUT} placeholder="test@company.com" />
              </div>
            </div>

            <div>
              <label className={LABEL}>Tax ID / VAT</label>
              <input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
                className={INPUT} placeholder="TAX-12345" />
            </div>

            {error && <p className="text-red-500 text-xs">{error}</p>}
            <SaveBtn saving={saving} saved={saved} label="Save Company Info" />
          </form>
        </div>
      </div>
    </div>
  );
}

// --- Receipt Settings ---

const RECEIPT_LAYOUTS = [
  { id: "standard",  label: "Layout 1",  sub: "Standard" },
  { id: "compact",   label: "Layout 2",  sub: "Compact" },
  { id: "detailed",  label: "Layout 3",  sub: "Detailed" },
  { id: "bilingual", label: "Layout 4",  sub: "Bilingual AR+EN" },
];

const PAPER_SIZES = [
  { value: "58mm",  label: "58mm Narrow" },
  { value: "80mm",  label: "80mm Standard" },
  { value: "A4",    label: "A4 Full Page" },
];

const LOGO_SIZES = [
  { value: "small",  label: "Small  (40px)" },
  { value: "medium", label: "Medium (60px)" },
  { value: "large",  label: "Large  (90px)" },
];

const LOGO_PX = { small: 40, medium: 60, large: 90 };

const TOGGLE_FIELDS = [
  { id: "show_logo",           label: "Show Logo" },
  { id: "show_store_name",     label: "Show Store Name" },
  { id: "show_reference",      label: "Show Reference" },
  { id: "show_date",           label: "Show Date" },
  { id: "show_seller",         label: "Show Seller" },
  { id: "show_phone",          label: "Show Phone" },
  { id: "show_address",        label: "Show Address" },
  { id: "show_email",          label: "Show Email" },
  { id: "show_customer",       label: "Show Customer" },
  { id: "show_warehouse",      label: "Show Warehouse" },
  { id: "show_tax",            label: "Show Tax" },
  { id: "show_discount",       label: "Show Discount" },
  { id: "show_shipping",       label: "Show Shipping" },
  { id: "show_barcode",        label: "Show Barcode" },
  { id: "show_note",           label: "Show Note to Customer" },
  { id: "show_paid",           label: "Show Paid Line" },
  { id: "show_due",            label: "Show Due Line" },
  { id: "show_payments_table", label: "Show Payments Table" },
  { id: "show_zatca_qr",       label: "Show ZATCA QR" },
];

const DEFAULT_RS = {
  layout: "standard",
  paper_size: "80mm",
  logo_size: "medium",
  receipt_header: "",
  receipt_footer: "",
  note_to_customer: "",
  show_logo: true,
  show_store_name: true,
  show_reference: true,
  show_date: true,
  show_seller: true,
  show_phone: true,
  show_address: true,
  show_email: false,
  show_customer: true,
  show_warehouse: false,
  show_tax: true,
  show_discount: true,
  show_shipping: false,
  show_barcode: false,
  show_note: true,
  show_paid: true,
  show_due: true,
  show_payments_table: true,
  show_zatca_qr: false,
};

const DEFAULT_BS = {
  layout: "standard",
  paper_size: "80mm",
  logo_size: "medium",
  receipt_header: "",
  receipt_footer: "",
  note_to_customer: "",
  show_logo: true,
  show_store_name: true,
  show_reference: true,
  show_date: true,
  show_seller: true,
  show_phone: true,
  show_address: true,
  show_email: false,
  show_customer: true,
  show_warehouse: false,
  show_tax: true,
  show_discount: true,
  show_shipping: false,
  show_barcode: false,
  show_note: true,
  show_paid: true,
  show_due: true,
  show_payments_table: true,
  show_zatca_qr: false,
};

// --- Shared demo data ---
const DEMO = {
  storeName: "My Restaurant",
  address:   "123 Main Street, City",
  phone:     "555-0100",
  email:     "info@restaurant.com",
  ref:       "INV-00042",
  date:      "2026-05-12",
  time:      "14:35",
  seller:    "John Doe",
  customer:  "Walk-In",
  warehouse: "Main Store",
  items: [
    { name: "Jollof Rice",      qty: 2, price: 2500, total: 5000 },
    { name: "Peppered Chicken", qty: 1, price: 3500, total: 3500 },
    { name: "Soft Drink",       qty: 2, price:  500, total: 1000 },
  ],
  subtotal: 9500,
  discount: 500,
  shipping: 200,
  tax:      712.50,
  total:    9912.50,
  paid:     9912.50,
  due:      0,
  sym:      "$",
};
const fmt      = (n) => { const v = Number(n); return `${DEMO.sym}${v.toLocaleString("en", { minimumFractionDigits: v % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}`; };
const fmtTotal = (n) => `${DEMO.sym}${Number(n).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// --- Layout 1  - Standard ---
function PreviewStandard({ rs, logoPx, logoUrl }) {
  const HR = () => <div className="border-t border-dashed border-gray-300 my-1" />;
  return (
    <div className="font-mono text-[10px] leading-relaxed text-gray-800 dark:text-gray-100 w-full select-none">
      {rs.show_logo && logoUrl && <div className="flex justify-center mb-1"><img src={logoUrl} alt="" style={{ height: logoPx }} className="object-contain" /></div>}
      {rs.show_store_name && <p className="text-center font-bold text-[11px]">{DEMO.storeName}</p>}
      {rs.show_address && <p className="text-center text-gray-400">{DEMO.address}</p>}
      {rs.show_phone && <p className="text-center text-gray-400">{DEMO.phone}</p>}
      {rs.show_email && <p className="text-center text-gray-400">{DEMO.email}</p>}
      {rs.receipt_header && <><HR /><p className="text-center italic text-gray-500 dark:text-gray-400 whitespace-pre-wrap">{rs.receipt_header}</p></>}
      <HR />
      {rs.show_reference && <Row label="Invoice #" val={DEMO.ref} />}
      {rs.show_date && <Row label="Date" val={`${DEMO.date}  ${DEMO.time}`} />}
      {rs.show_seller && <Row label="Cashier" val={DEMO.seller} />}
      {rs.show_customer && <Row label="Customer" val={DEMO.customer} />}
      {rs.show_warehouse && <Row label="Store" val={DEMO.warehouse} />}
      <HR />
      <div className="flex gap-x-2 text-gray-400 border-b border-gray-300 pb-0.5 mb-0.5 text-[9px]">
        <span className="flex-1">Item</span><span className="w-6 text-right">Qty</span><span className="w-14 text-right">Total</span>
      </div>
      {DEMO.items.map((it, i) => (
        <div key={i} className="flex gap-x-2">
          <span className="flex-1 truncate">{it.name}</span>
          <span className="w-6 text-right text-gray-500 dark:text-gray-400">{it.qty}</span>
          <span className="w-14 text-right">{fmt(it.total)}</span>
        </div>
      ))}
      <HR />
      {rs.show_discount && <Row label="Discount" val={`-${fmt(DEMO.discount)}`} cls="text-red-500" />}
      {rs.show_shipping && <Row label="Shipping" val={fmt(DEMO.shipping)} />}
      {rs.show_tax && <Row label="Tax (7.5%)" val={fmt(DEMO.tax)} />}
      <div className="flex justify-between font-bold border-t border-gray-500 pt-0.5 mt-0.5">
        <span>TOTAL</span><span>{fmtTotal(DEMO.total)}</span>
      </div>
      {rs.show_paid && <Row label="Cash" val={fmt(DEMO.paid)} cls="text-green-600" />}
      {rs.show_due && <Row label="Change" val={fmt(DEMO.due)} />}
      {rs.show_payments_table && <><HR /><Row label="Payment" val="Cash" /></>}
      {rs.show_note && <><HR /><p className="text-center italic text-gray-500 dark:text-gray-400">{rs.note_to_customer || "Thank you!"}</p></>}
      {rs.receipt_footer && <p className="text-center italic text-gray-500 dark:text-gray-400 whitespace-pre-wrap mt-0.5">{rs.receipt_footer}</p>}
      {rs.show_barcode && <Barcode />}
      {rs.show_zatca_qr && <QRBlock />}
    </div>
  );
}

// --- Layout 2  - Compact ---
function PreviewCompact({ rs, logoPx, logoUrl }) {
  const HR = () => <div className="border-t border-dashed border-gray-200 dark:border-gray-700 my-0.5" />;
  return (
    <div className="font-mono text-[9px] leading-tight text-gray-800 dark:text-gray-100 w-full select-none">
      {rs.show_logo && logoUrl && <div className="flex justify-center mb-0.5"><img src={logoUrl} alt="" style={{ height: Math.round(logoPx * 0.7) }} className="object-contain" /></div>}
      {rs.show_store_name && <p className="text-center font-bold">{DEMO.storeName}</p>}
      {(rs.show_address || rs.show_phone) && (
        <p className="text-center text-gray-400 text-[8px]">
          {[rs.show_address && DEMO.address, rs.show_phone && DEMO.phone].filter(Boolean).join(" · ")}
        </p>
      )}
      {rs.receipt_header && <p className="text-center italic text-gray-400 text-[8px] whitespace-pre-wrap">{rs.receipt_header}</p>}
      <HR />
      <div className="grid grid-cols-2 gap-x-2 text-[8.5px]">
        {rs.show_reference && <><span className="text-gray-400">Ref:</span><span className="text-right">{DEMO.ref}</span></>}
        {rs.show_date && <><span className="text-gray-400">Date:</span><span className="text-right">{DEMO.date}</span></>}
        {rs.show_seller && <><span className="text-gray-400">By:</span><span className="text-right">{DEMO.seller}</span></>}
        {rs.show_customer && <><span className="text-gray-400">Cust:</span><span className="text-right">{DEMO.customer}</span></>}
      </div>
      <HR />
      {DEMO.items.map((it, i) => (
        <div key={i} className="flex gap-x-3 text-[9px]">
          <span className="flex-1 truncate">{it.name}</span>
          <span className="text-gray-400">{it.qty}x</span>
          <span className="font-medium">{fmt(it.total)}</span>
        </div>
      ))}
      <HR />
      {rs.show_discount && <Row label="Disc." val={`-${fmt(DEMO.discount)}`} cls="text-red-400 text-[9px]" />}
      {rs.show_tax && <Row label="Tax" val={fmt(DEMO.tax)} cls="text-[9px]" />}
      <div className="flex justify-between font-bold border-t border-gray-400 pt-0.5 mt-0.5">
        <span>TOTAL</span><span>{fmtTotal(DEMO.total)}</span>
      </div>
      {rs.show_paid && <Row label="Cash" val={fmt(DEMO.paid)} cls="text-green-600 text-[9px]" />}
      {rs.show_payments_table && <Row label="Payment" val="Cash" cls="text-[8px] text-gray-400" />}
      {rs.show_note && <p className="text-center italic text-gray-400 text-[8px] mt-0.5">{rs.note_to_customer || "Thank you!"}</p>}
      {rs.receipt_footer && <p className="text-center italic text-gray-400 text-[8px] whitespace-pre-wrap">{rs.receipt_footer}</p>}
      {rs.show_barcode && <Barcode small />}
      {rs.show_zatca_qr && <QRBlock small />}
    </div>
  );
}

// --- Layout 3  - Detailed ---
function PreviewDetailed({ rs, logoPx, logoUrl, tab }) {
  const HR = ({ thick }) => <div className={`my-1 ${thick ? "border-t-2 border-gray-600" : "border-t border-gray-300"}`} />;
  return (
    <div className="font-mono text-[9.5px] leading-relaxed text-gray-800 dark:text-gray-100 w-full select-none">
      {rs.show_logo && logoUrl && <div className="flex justify-center mb-1"><img src={logoUrl} alt="" style={{ height: logoPx }} className="object-contain" /></div>}
      {rs.show_store_name && <p className="text-center font-bold text-[11px] uppercase tracking-wide">{DEMO.storeName}</p>}
      {rs.show_address && <p className="text-center text-gray-400 text-[8.5px]">{DEMO.address}</p>}
      {(rs.show_phone || rs.show_email) && (
        <p className="text-center text-gray-400 text-[8.5px]">
          {[rs.show_phone && DEMO.phone, rs.show_email && DEMO.email].filter(Boolean).join("  |  ")}
        </p>
      )}
      {rs.receipt_header && <><HR /><p className="text-center italic text-gray-500 dark:text-gray-400 whitespace-pre-wrap">{rs.receipt_header}</p></>}
      <HR thick />
      <p className="text-center font-bold text-[10px] tracking-widest text-gray-600 dark:text-gray-300 uppercase">{tab === "bill" ? "Sales Bill" : "Sales Receipt"}</p>
      <HR thick />
      {rs.show_reference && <Row label="Invoice No." val={DEMO.ref} />}
      {rs.show_date && <Row label="Date" val={`${DEMO.date}  ${DEMO.time}`} />}
      {rs.show_seller && <Row label="Served By" val={DEMO.seller} />}
      {rs.show_customer && <Row label="Customer" val={DEMO.customer} />}
      {rs.show_warehouse && <Row label="Branch" val={DEMO.warehouse} />}
      <HR />
      <div className="flex gap-x-2 text-[8.5px] font-semibold text-gray-500 dark:text-gray-400 border-b border-gray-400 pb-0.5 mb-0.5">
        <span className="flex-1">Item</span>
        <span className="w-8 text-right">Qty</span>
        <span className="w-12 text-right">Price</span>
        <span className="w-12 text-right">Amount</span>
      </div>
      {DEMO.items.map((it, i) => (
        <div key={i} className="flex gap-x-2 text-[9px]">
          <span className="flex-1 truncate">{it.name}</span>
          <span className="w-8 text-right text-gray-500 dark:text-gray-400">{it.qty}</span>
          <span className="w-12 text-right text-gray-500 dark:text-gray-400">{fmt(it.price)}</span>
          <span className="w-12 text-right font-semibold">{fmt(it.total)}</span>
        </div>
      ))}
      <HR />
      <Row label="Subtotal" val={fmt(DEMO.subtotal)} cls="text-gray-500 dark:text-gray-400" />
      {rs.show_discount && <Row label="Discount" val={`-${fmt(DEMO.discount)}`} cls="text-red-500" />}
      {rs.show_shipping && <Row label="Shipping" val={fmt(DEMO.shipping)} />}
      {rs.show_tax && <Row label="VAT (7.5%)" val={fmt(DEMO.tax)} cls="text-gray-500 dark:text-gray-400" />}
      <div className="flex justify-between font-bold text-[11px] border-t-2 border-gray-600 pt-0.5 mt-0.5">
        <span>TOTAL</span><span>{fmtTotal(DEMO.total)}</span>
      </div>
      {rs.show_payments_table && (
        <><HR />
          <Row label="Cash" val={fmt(DEMO.paid)} />
          {rs.show_paid && <Row label="Paid" val={fmt(DEMO.paid)} cls="text-green-600 font-semibold" />}
          {rs.show_due && <Row label="Change" val={fmt(DEMO.due)} />}
        </>
      )}
      {rs.show_note && <><HR /><p className="text-center italic text-gray-500 dark:text-gray-400">{rs.note_to_customer || "Thank you for your business!"}</p></>}
      {rs.receipt_footer && <p className="text-center italic text-gray-500 dark:text-gray-400 whitespace-pre-wrap">{rs.receipt_footer}</p>}
      {rs.show_barcode && <Barcode />}
      {rs.show_zatca_qr && <QRBlock />}
    </div>
  );
}

// --- Layout 4  - Bilingual AR+EN ---
function PreviewBilingual({ rs, logoPx, logoUrl }) {
  const HR = () => <div className="border-t border-dashed border-gray-300 my-1" />;
  const AR = { ref: "Receipt", date: "Date", subtotal: "Subtotal", discount: "Discount", paid: "Paid", change: "Change", tax: "Tax" };
  const BiRow = ({ en, ar, val, cls = "" }) => (
    <div className={`flex justify-between text-[9px] ${cls}`}>
      <span className="text-gray-400 w-14">{en}</span>
      <span className="flex-1 text-center font-medium">{val}</span>
      <span className="text-gray-400 w-16 text-right" dir="rtl">{ar}</span>
    </div>
  );
  return (
    <div className="font-mono text-[9px] leading-relaxed text-gray-800 dark:text-gray-100 w-full select-none">
      {rs.show_logo && logoUrl && <div className="flex justify-center mb-0.5"><img src={logoUrl} alt="" style={{ height: logoPx }} className="object-contain" /></div>}
      {rs.show_store_name && (
        <div className="flex justify-between font-bold text-[10px] border-b border-gray-300 pb-0.5">
          <span>{DEMO.storeName}</span>
          <span dir="rtl">محل</span>
        </div>
      )}
      {rs.show_address && <p className="text-center text-gray-400 text-[8px]">{DEMO.address}</p>}
      {rs.show_phone && <p className="text-center text-gray-400 text-[8px]">{DEMO.phone}</p>}
      {rs.receipt_header && <><HR /><p className="text-center italic text-gray-400 text-[8.5px] whitespace-pre-wrap">{rs.receipt_header}</p></>}
      <HR />
      {rs.show_reference && <BiRow en="Ref #" ar={AR.ref} val={DEMO.ref} />}
      {rs.show_date && <BiRow en="Date" ar={AR.date} val={DEMO.date} />}
      {rs.show_seller && <BiRow en="Cashier" ar={AR.cashier} val={DEMO.seller} />}
      {rs.show_customer && <BiRow en="Customer" ar={AR.customer} val={DEMO.customer} />}
      <HR />
      {DEMO.items.map((it, i) => (
        <div key={i} className="flex gap-x-3 text-[9px] py-0.5 border-b border-gray-100 dark:border-gray-700 last:border-0">
          <span className="flex-1 truncate">{it.name}</span>
          <span className="text-gray-400">{it.qty}x</span>
          <span className="font-medium">{fmt(it.total)}</span>
        </div>
      ))}
      <HR />
      {rs.show_discount && <BiRow en="Discount" ar={AR.discount} val={`-${fmt(DEMO.discount)}`} cls="text-red-500" />}
      {rs.show_tax && <BiRow en="Tax" ar={AR.tax} val={fmt(DEMO.tax)} />}
      <div className="flex justify-between font-bold border-t-2 border-gray-600 pt-0.5 mt-0.5">
        <span>TOTAL</span><span>{fmtTotal(DEMO.total)}</span><span dir="rtl" className="text-gray-500 dark:text-gray-400 font-normal">{AR.total}</span>
      </div>
      {rs.show_paid && <BiRow en="Paid" ar={AR.paid} val={fmt(DEMO.paid)} cls="text-green-600" />}
      {rs.show_due && <BiRow en="Change" ar={AR.change} val={fmt(DEMO.due)} />}
      {rs.show_payments_table && (
        <><HR /><BiRow en="Payment" ar={AR.payment} val="Cash" /></>
      )}
      {rs.show_note && (
        <><HR />
          <p className="text-center italic text-gray-500 dark:text-gray-400 text-[8.5px]">{rs.note_to_customer || "Thank you for your patronage!"}</p>
          <p className="text-center text-gray-400 text-[8.5px]" dir="rtl">{AR.thanks}</p>
        </>
      )}
      {rs.receipt_footer && <p className="text-center italic text-gray-400 text-[8.5px] whitespace-pre-wrap">{rs.receipt_footer}</p>}
      {rs.show_barcode && <Barcode />}
      {rs.show_zatca_qr && <QRBlock />}
    </div>
  );
}

// --- Shared micro-components ---
function Row({ label, val, cls = "" }) {
  return (
    <div className={`flex justify-between ${cls}`}>
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span>{val}</span>
    </div>
  );
}
function Barcode({ small }) {
  return (
    <div className="flex flex-col items-center mt-1">
      <div className={`tracking-[0.18em] border border-gray-500 px-2 py-0.5 font-mono ${small ? "text-[7px]" : "text-[8px]"}`}>
        ||| |||| || ||| |||| |||
      </div>
      <p className={`text-gray-400 mt-0.5 ${small ? "text-[7px]" : "text-[8px]"}`}>{DEMO.ref}</p>
    </div>
  );
}
function QRBlock({ small }) {
  const sz = small ? "w-10 h-10" : "w-12 h-12";
  return (
    <div className="flex flex-col items-center mt-1">
      <div className={`border border-gray-400 grid grid-cols-3 gap-px p-1 ${sz}`}>
        {[...Array(9)].map((_, i) => (
          <div key={i} className={`rounded-sm ${[0, 2, 6, 8, 4].includes(i) ? "bg-gray-700" : "bg-gray-200"}`} />
        ))}
      </div>
      <p className={`text-gray-400 mt-0.5 ${small ? "text-[7px]" : "text-[8px]"}`}>ZATCA QR</p>
    </div>
  );
}

function ReceiptPreview({ rs, settings, tab }) {
  const logoPx = LOGO_PX[rs.logo_size] || 60;
  const logoUrl = settings?.logo_url || null;
  const props   = { rs, logoPx, logoUrl, tab };
  switch (rs.layout) {
    case "compact":   return <PreviewCompact   {...props} />;
    case "detailed":  return <PreviewDetailed  {...props} />;
    case "bilingual": return <PreviewBilingual {...props} />;
    default:          return <PreviewStandard  {...props} />;
  }
}

function ToggleSwitch({ on, onToggle }) {
  return (
    <button type="button" onClick={onToggle} className="flex-shrink-0">
      {on
        ? <ToggleRight size={26} className="text-blue-600" />
        : <ToggleLeft size={26} className="text-gray-300" />}
    </button>
  );
}

function ReceiptBillSettings() {
  const { settings, refreshSettings } = useBusiness();
  const [tab, setTab] = useState("receipt");
  const [rs, setRs] = useState(DEFAULT_RS);
  const [bs, setBs] = useState(DEFAULT_BS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (settings?.receipt_settings) setRs({ ...DEFAULT_RS, ...settings.receipt_settings });
    if (settings?.bill_settings) setBs({ ...DEFAULT_BS, ...settings.bill_settings });
  }, [settings]);

  const data = tab === "receipt" ? rs : bs;
  const setData = tab === "receipt" ? setRs : setBs;
  const set = (key, val) => setData((prev) => ({ ...prev, [key]: val }));
  const toggle = (key) => setData((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true); setError(""); setSaved(false);
    try {
      const key = tab === "receipt" ? "receipt_settings" : "bill_settings";
      await api.updateSettings({ [key]: data });
      await refreshSettings();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const label = tab === "receipt" ? "Receipt" : "Bill";

  const handlePrintDemo = () => {
    const bizName  = settings?.business_name || DEMO.storeName;
    const address  = settings?.address       || DEMO.address;
    const phone    = settings?.phone         || DEMO.phone;
    const logoUrl  = settings?.logo_url      || null;
    const sym      = localStorage.getItem("pos_currency_symbol") || "$";
    const f      = (n) => { const v = Number(n); return `${sym}${v.toLocaleString("en", { minimumFractionDigits: v % 1 !== 0 ? 2 : 0, maximumFractionDigits: 2 })}`; };
    const fTotal = (n) => `${sym}${Number(n).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const rows = DEMO.items.map(it =>
      `<tr><td>${it.name}</td><td style="text-align:center;padding:0 8px">${it.qty}</td><td style="text-align:right;padding:0 8px">${f(it.price)}</td><td style="text-align:right">${f(it.total)}</td></tr>`
    ).join("");
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const hdr = data.receipt_header ? `<p style="text-align:center;font-style:italic;margin:4px 0">${esc(data.receipt_header).replace(/\n/g, "<br>")}</p>` : "";
    const ftr = data.receipt_footer ? `<p style="text-align:center;font-style:italic;margin:4px 0">${esc(data.receipt_footer).replace(/\n/g, "<br>")}</p>` : "";
    const html = `<!DOCTYPE html><html><head><title>${label} Demo</title><style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Courier New',monospace;font-size:12px;width:80mm;padding:10px}
.c{text-align:center}.r{text-align:right}.b{font-weight:bold}.g{color:#555}
hr{border:none;border-top:1px dashed #000;margin:5px 0}
hr.s{border-top:1px solid #000}hr.t{border-top:2px solid #000}
table{width:100%;border-collapse:collapse;font-size:11px}
th{border-bottom:1px solid #999;padding-bottom:2px;text-align:left}
th:not(:first-child){text-align:right}
.row{display:flex;justify-content:space-between;margin:2px 0}
@media print{@page{margin:0;size:80mm auto}}
</style></head><body>
${logoUrl && data.show_logo ? `<div class="c"><img src="${logoUrl}" style="height:60px;object-fit:contain;margin-bottom:4px"></div>` : ""}
${data.show_store_name ? `<p class="c b" style="font-size:15px">${esc(bizName)}</p>` : ""}
${data.show_address   ? `<p class="c g">${esc(address)}</p>` : ""}
${data.show_phone     ? `<p class="c g">Tel: ${esc(phone)}</p>` : ""}
${hdr}<hr class="t">
<p class="c b" style="font-size:13px;letter-spacing:3px">${label.toUpperCase()}</p>
<hr class="t">
${data.show_reference ? `<div class="row"><span class="g">Ref #</span><span>${DEMO.ref}</span></div>` : ""}
${data.show_date      ? `<div class="row"><span class="g">Date</span><span>${DEMO.date} ${DEMO.time}</span></div>` : ""}
${data.show_seller    ? `<div class="row"><span class="g">Cashier</span><span>${DEMO.seller}</span></div>` : ""}
${data.show_customer  ? `<div class="row"><span class="g">Customer</span><span>${DEMO.customer}</span></div>` : ""}
<hr><table><thead><tr><th>Item</th><th style="text-align:center;padding:0 8px">Qty</th><th style="text-align:right;padding:0 8px">Price</th><th style="text-align:right">Total</th></tr></thead><tbody>${rows}</tbody></table><hr>
<div class="row g"><span>Subtotal</span><span>${f(DEMO.subtotal)}</span></div>
${data.show_discount ? `<div class="row" style="color:#c00"><span>Discount</span><span>-${f(DEMO.discount)}</span></div>` : ""}
${data.show_shipping ? `<div class="row g"><span>Shipping</span><span>${f(DEMO.shipping)}</span></div>` : ""}
${data.show_tax      ? `<div class="row g"><span>Tax (7.5%)</span><span>${f(DEMO.tax)}</span></div>` : ""}
<hr class="s"><div class="row b" style="font-size:15px"><span>TOTAL</span><span>${fTotal(DEMO.total)}</span></div>
${data.show_paid  ? `<div class="row" style="color:#090"><span>Paid</span><span>${f(DEMO.paid)}</span></div>` : ""}
${data.show_due   ? `<div class="row g"><span>Change</span><span>${f(DEMO.due)}</span></div>` : ""}
${data.show_note && data.note_to_customer ? `<hr><p class="c" style="font-style:italic">${esc(data.note_to_customer)}</p>` : ""}
<hr>${ftr}<p class="c g" style="font-size:10px;margin-top:4px">*** DEMO ${label.toUpperCase()} ***</p>
</body></html>`;
    const w = window.open("", "_blank", "width=420,height=700");
    if (!w) { alert("Allow popups to print demo"); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 500);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center"><Receipt size={20} className="text-gray-500 dark:text-gray-400" /></div>
        <div>
          <p className="text-sm text-gray-400 font-medium">Settings</p>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">Receipt &amp; Bill</h1>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl w-fit">
        {["receipt", "bill"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${
              tab === t
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <form onSubmit={handleSave}>
        {/* Layout Picker */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6 mb-5">
          <h3 className="font-bold text-gray-900 dark:text-white mb-4">{label} Layout</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {RECEIPT_LAYOUTS.map((l) => (
              <button key={l.id} type="button" onClick={() => set("layout", l.id)}
                className={`py-3 px-2 rounded-xl border-2 text-center transition-colors ${
                  data.layout === l.id ? "border-blue-500 bg-blue-50" : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                }`}>
                <p className={`text-sm font-bold ${data.layout === l.id ? "text-blue-700" : "text-gray-800 dark:text-gray-100"}`}>{l.label}</p>
                <p className={`text-xs mt-0.5 ${data.layout === l.id ? "text-blue-500" : "text-gray-400"}`}>{l.sub}</p>
              </button>
            ))}
          </div>
          <div>
            <label className={LABEL}>Default Layout</label>
            <select value={data.layout} onChange={(e) => set("layout", e.target.value)} className={INPUT}>
              {RECEIPT_LAYOUTS.map((l) => <option key={l.id} value={l.id}>{l.label}  -  {l.sub}</option>)}
            </select>
          </div>
        </div>

        {/* Preview + Controls */}
        <div className="flex flex-col lg:flex-row gap-5 mb-5">
          {/* Live Preview */}
          <div className="lg:w-72 flex-shrink-0">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-5 sticky top-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Live Preview</p>
                <button type="button" onClick={handlePrintDemo}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-semibold hover:bg-gray-700 transition-colors">
                  <Printer size={13} /> Print Demo {label}
                </button>
              </div>
              <div className="border-2 border-gray-300 dark:border-gray-700 rounded-xl p-3 bg-white dark:bg-gray-800 max-h-[640px] overflow-y-auto">
                <ReceiptPreview rs={data} settings={settings} tab={tab} />
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex-1 space-y-5">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6">
              <h3 className="font-bold text-gray-900 dark:text-white mb-4">{label} Header &amp; Footer</h3>
              <div className="space-y-4">
                <div>
                  <label className={LABEL}>{label} Header</label>
                  <textarea value={data.receipt_header} onChange={(e) => set("receipt_header", e.target.value)}
                    className={`${INPUT} h-16 resize-none`}
                    placeholder={"Welcome to My Restaurant!\nEnjoy your meal."} />
                  <p className="text-[10px] text-gray-400 mt-1">Shown at the top of the {tab}, below the logo/store name.</p>
                </div>
                <div>
                  <label className={LABEL}>{label} Footer</label>
                  <textarea value={data.receipt_footer} onChange={(e) => set("receipt_footer", e.target.value)}
                    className={`${INPUT} h-16 resize-none`}
                    placeholder={"Thank you for dining with us!\nPlease come again."} />
                  <p className="text-[10px] text-gray-400 mt-1">Shown at the bottom of the {tab}, above the barcode/QR.</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6">
              <h3 className="font-bold text-gray-900 dark:text-white mb-3">Note to Customer</h3>
              <textarea value={data.note_to_customer} onChange={(e) => set("note_to_customer", e.target.value)}
                className={`${INPUT} h-16 resize-none`}
                placeholder="Thank you for your patronage! Please visit again." />
              <p className="text-[10px] text-gray-400 mt-1">Shown near the totals section when "Show Note" is enabled.</p>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6">
              <h3 className="font-bold text-gray-900 dark:text-white mb-4">Show / Hide Fields</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6">
                {TOGGLE_FIELDS.map((f) => (
                  <div key={f.id} className="flex items-center justify-between py-1.5 border-b border-gray-50">
                    <span className="text-sm text-gray-700 dark:text-gray-200">{f.label}</span>
                    <ToggleSwitch on={data[f.id]} onToggle={() => toggle(f.id)} />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6">
              <h3 className="font-bold text-gray-900 dark:text-white mb-4">{label} Settings</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={LABEL}>Paper Size</label>
                  <select value={data.paper_size} onChange={(e) => set("paper_size", e.target.value)} className={INPUT}>
                    {PAPER_SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={LABEL}>Logo Size</label>
                  <select value={data.logo_size} onChange={(e) => set("logo_size", e.target.value)} className={INPUT}>
                    {LOGO_SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
        <div className="flex justify-end">
          <SaveBtn saving={saving} saved={saved} label={`Save ${label} Settings`} />
        </div>
      </form>
    </div>
  );
}

function CurrenciesSettings() {
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ code: "", symbol: "", name: "", exchange_rate: "1.0", is_default: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    api.getCurrencies().then(setCurrencies).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await api.createCurrency({ ...form, exchange_rate: parseFloat(form.exchange_rate) });
      setShowAdd(false); setForm({ code: "", symbol: "", name: "", exchange_rate: "1.0", is_default: false }); load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const toggleDefault = async (c) => {
    try { await api.updateCurrency(c.id, { is_default: !c.is_default }); load(); }
    catch (err) { alert(err.message); }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete currency "${c.code}"?`)) return;
    try { await api.deleteCurrency(c.id); load(); }
    catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center"><Settings size={20} className="text-gray-500 dark:text-gray-400" /></div>
          <div>
            <p className="text-sm text-gray-400 font-medium">Settings</p>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">Currencies</h1>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors">
          <Plus size={16} /> Add Currency
        </button>
      </div>

      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Manage Currencies</h2>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {currencies.map((c) => (
            <div key={c.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xl font-black text-gray-900 dark:text-white">{c.symbol} {c.code}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{c.name}</p>
                </div>
                <button onClick={() => handleDelete(c)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                  <span>Exchange Rate</span>
                  <span className="font-semibold text-gray-900 dark:text-white">{c.exchange_rate}</span>
                </div>
                <div className="flex items-center justify-between text-gray-500 dark:text-gray-400">
                  <span>Default Currency</span>
                  <button onClick={() => toggleDefault(c)}>
                    {c.is_default
                      ? <ToggleRight size={24} className="text-blue-600" />
                      : <ToggleLeft size={24} className="text-gray-300" />}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {currencies.length === 0 && (
            <p className="text-gray-400 text-sm col-span-3 py-10 text-center">No currencies configured</p>
          )}
        </div>
      )}

      {showAdd && (
        <Modal title="Add Currency" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className={LABEL}>Currency Code</label>
              <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className={INPUT} placeholder="USD, EUR, GBP" maxLength={5} />
            </div>
            <div>
              <label className={LABEL}>Symbol</label>
              <input required value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })}
                className={INPUT} placeholder="$, €, £" maxLength={5} />
            </div>
            <div>
              <label className={LABEL}>Name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={INPUT} placeholder="US Dollar" />
            </div>
            <div>
              <label className={LABEL}>Exchange Rate</label>
              <input required type="number" step="0.0001" min="0" value={form.exchange_rate}
                onChange={(e) => setForm({ ...form, exchange_rate: e.target.value })}
                className={INPUT} placeholder="1.0" />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => setForm({ ...form, is_default: !form.is_default })}>
                {form.is_default
                  ? <ToggleRight size={28} className="text-blue-600" />
                  : <ToggleLeft size={28} className="text-gray-300" />}
              </div>
              <span className="text-sm text-gray-700 dark:text-gray-200">Set as default currency</span>
            </label>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Adding..." : "Add Currency"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// --- Payment Types ---

const PAYMENT_ICONS = {
  cash: "Cash", card: "Card", digital_wallet: "Pay", bank_transfer: "Bank", custom: "Other",
};
const PAYMENT_TYPE_OPTIONS = ["cash", "card", "digital_wallet", "bank_transfer", "custom"];

function PaymentTypesSettings() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", type: "custom" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    api.getPaymentTypes().then(setTypes).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await api.createPaymentType(form);
      setShowAdd(false); setForm({ name: "", type: "custom" }); load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete "${t.name}"?`)) return;
    try { await api.deletePaymentType(t.id); load(); }
    catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center"><Settings size={20} className="text-gray-500 dark:text-gray-400" /></div>
          <div>
            <p className="text-sm text-gray-400 font-medium">Settings</p>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">Payment Types</h1>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors">
          <Plus size={16} /> Add Payment Type
        </button>
      </div>

      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Payment Types</h2>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {types.map((t) => (
            <div key={t.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-5 flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center mb-3">
                {t.type === "cash" && <Banknote size={22} className="text-blue-600 dark:text-blue-400" />}
                {t.type === "card" && <CreditCard size={22} className="text-blue-600 dark:text-blue-400" />}
                {t.type === "digital_wallet" && <Smartphone size={22} className="text-blue-600 dark:text-blue-400" />}
                {t.type === "bank_transfer" && <Building2 size={22} className="text-blue-600 dark:text-blue-400" />}
                {(!t.type || t.type === "custom") && <DollarSign size={22} className="text-blue-600 dark:text-blue-400" />}
              </div>
              <p className="font-bold text-gray-900 dark:text-white text-sm">{t.name}</p>
              <span className="text-xs text-gray-400 mt-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full">{t.type || "custom"}</span>
              <button onClick={() => handleDelete(t)} className="text-red-400 hover:text-red-600 transition-colors mt-3">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {types.length === 0 && <p className="text-gray-400 text-sm col-span-4 py-10 text-center">No payment types configured</p>}
        </div>
      )}

      {showAdd && (
        <Modal title="Add Payment Type" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className={LABEL}>Payment Name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={INPUT} placeholder="Mobile Wallet, Crypto, etc." />
            </div>
            <div>
              <label className={LABEL}>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                className={INPUT}>
                {PAYMENT_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Adding..." : "Add Payment"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// --- Tax Settings ---

function TaxSettings() {
  const { settings, refreshSettings } = useBusiness();
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", rate: "7.5", is_default: false, active: true });
  const [taxBehaviour, setTaxBehaviour] = useState({ tax_enabled: true, tax_mode: "inclusive" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (settings) {
      setTaxBehaviour({ tax_enabled: settings.tax_enabled !== false, tax_mode: settings.tax_mode || "inclusive" });
    }
  }, [settings]);

  const load = () => {
    setLoading(true);
    api.getTaxes().then(setTaxes).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const saveBehaviour = async () => {
    try { await api.updateSettings(taxBehaviour); await refreshSettings(); }
    catch (err) { alert(err.message); }
  };

  const handleAdd = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await api.createTax({ name: form.name, rate: parseFloat(form.rate), is_default: form.is_default, active: form.active });
      setShowAdd(false); setForm({ name: "", rate: "7.5", is_default: false, active: true }); load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete tax "${t.name}"?`)) return;
    try { await api.deleteTax(t.id); load(); }
    catch (err) { alert(err.message); }
  };

  const setDefault = async (t) => {
    try { await api.updateTax(t.id, { is_default: true }); load(); }
    catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
          <span className="text-orange-600 font-black text-sm">%</span>
        </div>
        <div>
          <p className="text-sm text-gray-400 font-medium">Settings</p>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">Tax</h1>
        </div>
      </div>

      {/* Tax Behaviour */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6 mb-6">
        <h3 className="font-bold text-gray-900 dark:text-white mb-4">Tax Behaviour</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">Enable tax on orders</p>
              <p className="text-xs text-gray-400">When disabled, no tax is calculated or shown on receipts.</p>
            </div>
            <button onClick={() => { const v = { ...taxBehaviour, tax_enabled: !taxBehaviour.tax_enabled }; setTaxBehaviour(v); api.updateSettings(v).then(refreshSettings).catch((err) => alert(err.message)); }}>
              {taxBehaviour.tax_enabled
                ? <ToggleRight size={28} className="text-blue-600" />
                : <ToggleLeft size={28} className="text-gray-300" />}
            </button>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">Tax mode</p>
              <p className="text-xs text-gray-400"><span className="font-semibold">Inclusive:</span> product price already contains tax. <span className="font-semibold">Exclusive:</span> tax is added on top of the product price.</p>
            </div>
            <select value={taxBehaviour.tax_mode}
              onChange={(e) => { const v = { ...taxBehaviour, tax_mode: e.target.value }; setTaxBehaviour(v); api.updateSettings(v).then(refreshSettings).catch(() => {}); }}
              className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500 min-w-[130px]">
              <option value="inclusive">Inclusive</option>
              <option value="exclusive">Exclusive</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tax Rates */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white">Tax Rates</h3>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors">
            <Plus size={14} /> New Tax
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                <th className="text-left px-6 py-3">Name</th>
                <th className="text-left px-6 py-3">Rate</th>
                <th className="text-left px-6 py-3">Default</th>
                <th className="text-left px-6 py-3">Active</th>
                <th className="text-right px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {taxes.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900">
                  <td className="px-6 py-3 font-semibold text-gray-900 dark:text-white text-sm">{t.name}</td>
                  <td className="px-6 py-3 font-bold text-orange-500 text-sm">{t.rate}%</td>
                  <td className="px-6 py-3">
                    {t.is_default
                      ? <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-semibold flex items-center gap-1 w-fit"><Check size={11} /> Default</span>
                      : <button onClick={() => setDefault(t)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold">Set Default</button>}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${t.active ? "bg-green-100 text-green-700" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                      {t.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button onClick={() => handleDelete(t)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
              {taxes.length === 0 && <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm">No tax rates configured</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <Modal title="New Tax" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className={LABEL}>Name</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={INPUT} placeholder="e.g. VAT, GST, Service Tax" />
            </div>
            <div>
              <label className={LABEL}>Rate (%)</label>
              <input required type="number" step="0.01" min="0" max="100" value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })} className={INPUT} placeholder="7.5" />
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-700 dark:text-gray-200">Set as default</span>
              <button type="button" onClick={() => setForm({ ...form, is_default: !form.is_default })}>
                {form.is_default ? <ToggleRight size={26} className="text-blue-600" /> : <ToggleLeft size={26} className="text-gray-300" />}
              </button>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-700 dark:text-gray-200">Active</span>
              <button type="button" onClick={() => setForm({ ...form, active: !form.active })}>
                {form.active ? <ToggleRight size={26} className="text-blue-600" /> : <ToggleLeft size={26} className="text-gray-300" />}
              </button>
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// --- Printer Groups ---

function PrinterGroupsSettings() {
  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editGroup, setEditGroup] = useState(null);
  const [form, setForm] = useState({ name: "", category_ids: [], product_ids: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([api.getPrinterGroups(), api.getCategories(), api.getProducts()])
      .then(([g, c, p]) => {
        setGroups(g);
        setCategories(c);
        setProducts(p);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const categoryName = (id) => categories.find((c) => c.id === id)?.name || id;

  const openAdd = () => {
    setForm({ name: "", category_ids: [], product_ids: [] });
    setError(""); setShowAdd(true); setEditGroup(null);
  };

  const openEdit = (g) => {
    setForm({ name: g.name, category_ids: g.category_ids || [], product_ids: g.product_ids || [] });
    setError(""); setEditGroup(g); setShowAdd(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.category_ids.length === 0 && form.product_ids.length === 0) {
      setError("Assign at least one category or product to this group.");
      return;
    }
    setSaving(true); setError("");
    try {
      if (editGroup) await api.updatePrinterGroup(editGroup.id, form);
      else await api.createPrinterGroup(form);
      setShowAdd(false); setEditGroup(null); load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (g) => {
    if (!window.confirm(`Delete group "${g.name}"?`)) return;
    try { await api.deletePrinterGroup(g.id); load(); }
    catch (err) { alert(err.message); }
  };

  const toggleItem = (key, id) => {
    setForm((prev) => ({
      ...prev,
      [key]: prev[key].includes(id) ? prev[key].filter((x) => x !== id) : [...prev[key], id],
    }));
  };

  const PrinterGroupForm = () => (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className={LABEL}>Group Name</label>
        <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          className={INPUT} placeholder="e.g. Kitchen, Bar, Hot Food" />
      </div>
      <div>
        <label className={LABEL}>Categories</label>
        <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl max-h-40 overflow-y-auto">
          {categories.map((c) => (
            <label key={c.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-0">
              <input type="checkbox" checked={form.category_ids.includes(c.id)} onChange={() => toggleItem("category_ids", c.id)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              <span className="text-sm text-gray-700 dark:text-gray-200">{c.name}</span>
            </label>
          ))}
          {categories.length === 0 && <p className="px-4 py-3 text-xs text-gray-400">No categories</p>}
        </div>
      </div>
      <div>
        <label className={LABEL}>Individual Products</label>
        <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl max-h-40 overflow-y-auto">
          {products.map((p) => (
            <label key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-0">
              <input type="checkbox" checked={form.product_ids.includes(p.id)} onChange={() => toggleItem("product_ids", p.id)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600" />
              <span className="text-sm text-gray-700 dark:text-gray-200">{p.name}</span>
            </label>
          ))}
          {products.length === 0 && <p className="px-4 py-3 text-xs text-gray-400">No products</p>}
        </div>
      </div>
      {error && <p className="text-red-500 text-xs">{error}</p>}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={() => { setShowAdd(false); setEditGroup(null); }}
          className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900">Cancel</button>
        <button type="submit" disabled={saving}
          className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50">
          {saving ? "Saving..." : editGroup ? "Save Changes" : "Create Group"}
        </button>
      </div>
    </form>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center">
            <Printer size={18} className="text-gray-600 dark:text-gray-300" />
          </div>
          <div>
            <p className="text-sm text-gray-400 font-medium">Settings</p>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">Printer Groups</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2.5 border-2 border-blue-200 text-blue-600 rounded-xl font-semibold text-sm hover:bg-blue-50 transition-colors">
            Test All Routing
          </button>
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors">
            <Plus size={16} /> Add Group
          </button>
        </div>
      </div>

      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6 text-sm text-green-800 dark:text-green-300">
        <p>Create groups and assign products or categories to them. Then go to <strong>Terminal Settings → Printers</strong> in the POS to assign a printer to each group.</p>
        <p className="mt-2 text-green-700 dark:text-green-400"><strong>Example:</strong> Create a "Kitchen" group with hot food categories, a "Bar" group with drinks — then assign your printers to those groups from the POS.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-gray-900 dark:text-white">{g.name}</p>
                  <p className="text-xs text-gray-400">{(g.category_ids || []).length + (g.product_ids || []).length} item{((g.category_ids || []).length + (g.product_ids || []).length) !== 1 ? "s" : ""} assigned</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(g)} className="text-gray-400 hover:text-blue-500 transition-colors"><Pencil size={15} /></button>
                  <button onClick={() => handleDelete(g)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(g.category_ids || []).map((id) => (
                  <span key={id} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">{categoryName(id)}</span>
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Printer size={48} className="mx-auto mb-3 opacity-20" />
              <p className="font-semibold">No printer groups</p>
              <p className="text-sm mt-1">Create groups to route orders to the correct printer</p>
            </div>
          )}
        </div>
      )}

      {(showAdd || editGroup) && (
        <Modal title={editGroup ? "Edit Printer Group" : "Add Printer Group"} onClose={() => { setShowAdd(false); setEditGroup(null); }} wide>
          <PrinterGroupForm />
        </Modal>
      )}
    </div>
  );
}

// --- Label Printer ---

function LabelPrinterSettings() {
  const [printers, setPrinters] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [systemPrinters, setSystemPrinters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", connection: "usb", outlet_id: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    const bridgeUrl = localStorage.getItem("print_bridge_url") || "";
    const printersFetch = bridgeUrl
      ? fetch(`${bridgeUrl}/printers`, { signal: AbortSignal.timeout(3000) })
          .then((r) => (r.ok ? r.json() : { printers: [] }))
          .catch(() => ({ printers: [] }))
      : Promise.resolve({ printers: [] });

    Promise.all([api.getPrinters(), api.getOutlets(), printersFetch])
      .then(([p, o, sys]) => { setPrinters(p); setOutlets(o); setSystemPrinters(sys?.printers || []); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await api.createPrinter({ name: form.name, connection_type: form.connection, outlet_id: form.outlet_id || null });
      setShowAdd(false); setForm({ name: "", connection: "usb", outlet_id: "" }); load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete printer "${p.name}"?`)) return;
    try { await api.deletePrinter(p.id); load(); }
    catch (err) { alert(err.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center">
            <Printer size={18} className="text-gray-600 dark:text-gray-300" />
          </div>
          <div>
            <p className="text-sm text-gray-400 font-medium">Settings</p>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white leading-tight">Label Printer</h1>
          </div>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors">
          <Plus size={16} /> Add Label Printer
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white">Label Printers</h3>
          <p className="text-xs text-gray-400 mt-0.5">Add label printers installed on this computer for barcode/product label printing.</p>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : printers.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">No label printers added</p>
          ) : (
            <div className="space-y-2">
              {printers.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Printer size={16} className="text-gray-500 dark:text-gray-400" />
                    <div>
                      <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{p.name}</p>
                      <p className="text-xs text-gray-400 capitalize">{p.connection_type || "usb"}</p>
                    </div>
                  </div>
                  <button onClick={() => handleDelete(p)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <Modal title="Add Label Printer" onClose={() => setShowAdd(false)}>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Select a printer installed on this computer for label printing.</p>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className={LABEL}>Printer Name</label>
              {systemPrinters.length > 0 ? (
                <select required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={INPUT}>
                  <option value="">Select printer...</option>
                  {systemPrinters.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              ) : (
                <>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={INPUT} placeholder="e.g. Zebra Label Printer" />
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> No printers detected  - enter the printer name manually
                  </p>
                </>
              )}
            </div>
            <div>
              <label className={LABEL}>Connection</label>
              <select value={form.connection} onChange={(e) => setForm({ ...form, connection: e.target.value })} className={INPUT}>
                <option value="usb">USB (System Printer)</option>
                <option value="network">Network / IP</option>
                <option value="bluetooth">Bluetooth</option>
              </select>
              {form.connection === "network" && (
                <MobilePrinterScanner
                  mode="wifi"
                  onSelectWifi={(ip) => setForm((prev) => ({ ...prev, name: prev.name || ip }))}
                />
              )}
              {form.connection === "bluetooth" && (
                <MobilePrinterScanner
                  mode="bluetooth"
                  onSelectBluetooth={(name) => setForm((prev) => ({ ...prev, name: prev.name || name }))}
                />
              )}
            </div>
            <div>
              <label className={LABEL}>Outlet</label>
              <select value={form.outlet_id} onChange={(e) => setForm({ ...form, outlet_id: e.target.value })} className={INPUT}>
                <option value="">All outlets</option>
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Adding..." : "Add Printer"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// --- Main export ---

const VIEWS = {
  company: CompanySettings,
  receipt: ReceiptBillSettings,
  currencies: CurrenciesSettings,
  "payment-types": PaymentTypesSettings,
  tax: TaxSettings,
  "printer-groups": PrinterGroupsSettings,
  "label-printer": LabelPrinterSettings,
  "print-bridge": PrintBridgeSettings,
};

export default function SettingsSection({ view = "company", onViewChange }) {
  const Component = VIEWS[view] || CompanySettings;
  return <Component onClose={onViewChange ? () => onViewChange("company") : undefined} />;
}
