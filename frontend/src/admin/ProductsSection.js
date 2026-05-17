import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  Plus, Pencil, Trash2, X, Tag, Upload, Printer, Download,
  FileText, CheckSquare, Square, ChevronDown, Search, RefreshCw,
  FileUp, FileDown, BarChart2,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { api } from "../lib/api";
import { cn, formatCurrency } from "../lib/utils";

// ─── Shared Modal ─────────────────────────────────────────────────────────────
function Modal({ title, icon, subtitle, onClose, children, maxWidth = "max-w-lg" }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className={cn("bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full overflow-y-auto", maxWidth, "max-h-[92vh]")}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <div className="flex items-center gap-3">
            {icon && <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">{icon}</div>}
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
              {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300 mt-1"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;
}

function SectionHeader({ title, icon, iconBg = "bg-orange-100", action }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", iconBg)}>{icon}</div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">{title}</h1>
      </div>
      {action}
    </div>
  );
}

// ─── All Products View ────────────────────────────────────────────────────────
function AllProductsView({ autoOpen }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [page, setPage] = useState(1);
  const [productModal, setProductModal] = useState(null);
  const [bulkModal, setBulkModal] = useState(false);
  const PAGE_SIZE = 10;

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.getProducts(), api.getCategories(), api.getBrands(),
      api.getOutlets(), api.getTerminals(), api.getUnits(),
    ])
      .then(([p, c, b, o, t, u]) => {
        setProducts(p); setCategories(c); setBrands(b);
        setOutlets(o); setTerminals(t); setUnits(u);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (autoOpen && !loading) setProductModal({ mode: "add" });
  }, [autoOpen, loading]);

  const filtered = products.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCategory && p.category_id !== filterCategory) return false;
    if (filterBrand && p.brand_id !== filterBrand) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, filterCategory, filterBrand]);

  const catName = (id) => categories.find((c) => c.id === id)?.name || "";
  const catColor = (id) => categories.find((c) => c.id === id)?.color || "#9CA3AF";

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    try { await api.deleteProduct(p.id); load(); }
    catch (err) { alert(err.message); }
  };

  const clearFilters = filterCategory || filterBrand || search;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <Tag size={20} className="text-orange-600" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Product Management</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBulkModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors"
          >
            <BarChart2 size={15} /> Bulk Set Terminal Prices
          </button>
          <button
            onClick={() => setProductModal({ mode: "add" })}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} /> New Product
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product name…"
              className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
            className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500 min-w-[160px]">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)}
            className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500 min-w-[140px]">
            <option value="">All brands</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {clearFilters && (
            <button onClick={() => { setSearch(""); setFilterCategory(""); setFilterBrand(""); }}
              className="p-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-gray-400 hover:text-gray-700 dark:text-gray-200 hover:border-gray-300 transition-colors">
              <X size={16} />
            </button>
          )}
        </div>

        {/* Category chips */}
        {categories.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button onClick={() => setFilterCategory("")}
              className={cn("px-4 py-1.5 rounded-full text-sm font-semibold transition-colors",
                !filterCategory ? "bg-gray-900 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200")}>
              All
            </button>
            {categories.map((c) => (
              <button key={c.id} onClick={() => setFilterCategory(c.id === filterCategory ? "" : c.id)}
                className={cn("px-4 py-1.5 rounded-full text-sm font-semibold transition-colors text-white")}
                style={{ backgroundColor: c.id === filterCategory ? c.color : c.color + "CC" }}>
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Products grid */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-gray-900 dark:text-white">Products</h2>
        <span className="text-sm text-gray-500 dark:text-gray-400">{filtered.length} of {products.length}</span>
      </div>

      {loading ? <Spinner /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {paginated.map((p) => (
            <div key={p.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden hover:shadow-md transition-shadow group">
              <div className="relative h-40 bg-gray-100 dark:bg-gray-700">
                {p.image
                  ? <img src={api.getImageUrl(p.image)} alt={p.name} className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                  : <div className="w-full h-full flex items-center justify-center"><Tag size={32} className="text-gray-300" /></div>}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setProductModal({ mode: "edit", product: p })}
                    className="w-8 h-8 bg-white dark:bg-gray-800 rounded-lg shadow flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-blue-600 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(p)}
                    className="w-8 h-8 bg-white dark:bg-gray-800 rounded-lg shadow flex items-center justify-center text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="p-3">
                <p className="font-bold text-gray-900 dark:text-white text-sm truncate">{p.name}</p>
                <p className="text-xs mt-0.5" style={{ color: catColor(p.category_id) }}>{catName(p.category_id)}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="font-bold text-green-600 text-sm">{formatCurrency(p.price)}</span>
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold",
                    p.active ? "bg-green-100 text-green-700" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400")}>
                    {p.active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-4 py-16 text-center text-gray-400">
              <Tag size={40} className="mx-auto mb-3 opacity-30" />
              <p>No products found</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Page {safePage} of {totalPages} &mdash; {filtered.length} products
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={safePage === 1}
              className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >«</button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >‹ Prev</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 2)
              .reduce((acc, n, idx, arr) => {
                if (idx > 0 && n - arr[idx - 1] > 1) acc.push("...");
                acc.push(n);
                return acc;
              }, [])
              .map((item, idx) =>
                item === "..." ? (
                  <span key={`ellipsis-${idx}`} className="px-2 py-2 text-sm text-gray-400">…</span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setPage(item)}
                    className={cn(
                      "w-9 h-9 rounded-xl text-sm font-semibold transition-colors",
                      safePage === item
                        ? "bg-blue-600 text-white shadow"
                        : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    )}
                  >{item}</button>
                )
              )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >Next ›</button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={safePage === totalPages}
              className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >»</button>
          </div>
        </div>
      )}

      {productModal && (
        <ProductModal
          mode={productModal.mode}
          product={productModal.product}
          categories={categories}
          brands={brands}
          units={units}
          outlets={outlets}
          terminals={terminals}
          onClose={() => setProductModal(null)}
          onSaved={() => { setProductModal(null); load(); }}
        />
      )}

      {bulkModal && (
        <BulkPriceModal
          products={products}
          outlets={outlets}
          terminals={terminals}
          onClose={() => setBulkModal(false)}
          onApplied={() => { setBulkModal(false); load(); }}
        />
      )}
    </div>
  );
}

// ─── Product Modal (Add / Edit) ───────────────────────────────────────────────
const EMPTY_FORM = {
  name: "", category_id: "", brand_id: "", unit_id: "",
  outlet_id: "", terminal_id: "",
  cost_price: "", markup_percentage: "", price: "",
  barcode: "", image: "", imageUrl: "", description: "",
  active: true, terminal_prices: [],
};

function ProductModal({ mode, product, categories, brands, units, outlets, terminals, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    if (mode === "edit" && product) {
      return {
        name: product.name || "",
        category_id: product.category_id || "",
        brand_id: product.brand_id || "",
        unit_id: product.unit_id || "",
        outlet_id: product.outlet_id || "",
        terminal_id: product.terminal_id || "",
        cost_price: product.cost_price ?? "",
        markup_percentage: product.markup_percentage ?? "",
        price: product.price ?? "",
        barcode: product.barcode || "",
        image: product.image || "",
        imageUrl: product.image || "",
        description: product.description || "",
        active: product.active !== false,
        terminal_prices: product.terminal_prices || [],
      };
    }
    return { ...EMPTY_FORM, category_id: categories[0]?.id || "" };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState(
    mode === "edit" && product?.image ? api.getImageUrl(product.image) : null
  );
  const fileRef = useRef();

  const f = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  // Auto-calc price from cost + markup
  const handleMarkupChange = (val) => {
    f("markup_percentage", val);
    const cost = parseFloat(form.cost_price);
    const mk = parseFloat(val);
    if (!isNaN(cost) && !isNaN(mk) && cost > 0) {
      f("price", (cost * (1 + mk / 100)).toFixed(2));
    }
  };
  const handleCostChange = (val) => {
    f("cost_price", val);
    const cost = parseFloat(val);
    const mk = parseFloat(form.markup_percentage);
    if (!isNaN(cost) && !isNaN(mk) && cost > 0) {
      f("price", (cost * (1 + mk / 100)).toFixed(2));
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const result = await api.uploadImage(file);
      f("image", result.url);
      setImagePreview(result.fullUrl);
      f("imageUrl", result.url);
    } catch (err) {
      setError("Image upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleImageUrlChange = (val) => {
    f("imageUrl", val);
    f("image", val);
    setImagePreview(val || null);
  };

  // Terminal prices helpers
  const addTerminalPrice = () =>
    f("terminal_prices", [...form.terminal_prices, { outlet_id: "", terminal_id: "", price: "", cost_price: "" }]);
  const removeTerminalPrice = (i) =>
    f("terminal_prices", form.terminal_prices.filter((_, idx) => idx !== i));
  const updateTerminalPrice = (i, key, val) =>
    f("terminal_prices", form.terminal_prices.map((tp, idx) => idx === i ? { ...tp, [key]: val } : tp));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    const data = {
      name: form.name.trim(),
      category_id: form.category_id,
      brand_id: form.brand_id || null,
      unit_id: form.unit_id || null,
      outlet_id: form.outlet_id || null,
      terminal_id: form.terminal_id || null,
      cost_price: parseFloat(form.cost_price) || 0,
      markup_percentage: parseFloat(form.markup_percentage) || 0,
      price: parseFloat(form.price) || 0,
      barcode: form.barcode.trim() || null,
      image: form.image.trim() || null,
      description: form.description.trim() || null,
      active: form.active,
      terminal_prices: form.terminal_prices
        .filter((tp) => tp.terminal_id && tp.price !== "")
        .map((tp) => ({
          outlet_id: tp.outlet_id || null,
          terminal_id: tp.terminal_id,
          price: parseFloat(tp.price) || 0,
          cost_price: parseFloat(tp.cost_price) || 0,
        })),
    };
    try {
      if (mode === "add") await api.createProduct(data);
      else await api.updateProduct(product.id, data);
      onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const label = "block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5";
  const input = "w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500";

  return (
    <Modal title={mode === "add" ? "Add New Product" : "Edit Product"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className={label}>Name</label>
          <input required value={form.name} onChange={(e) => f("name", e.target.value)}
            className={input} placeholder="Product name…" autoFocus />
        </div>

        {/* Category */}
        <div>
          <label className={label}>Category</label>
          <select required value={form.category_id} onChange={(e) => f("category_id", e.target.value)} className={input}>
            <option value="">Select category…</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Brand + Unit */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Brand</label>
            <select value={form.brand_id} onChange={(e) => f("brand_id", e.target.value)} className={input}>
              <option value="">None</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Unit</label>
            <select value={form.unit_id} onChange={(e) => f("unit_id", e.target.value)} className={input}>
              <option value="">None</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        </div>

        {/* Outlet + Terminal */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Outlet</label>
            <select value={form.outlet_id} onChange={(e) => f("outlet_id", e.target.value)} className={input}>
              <option value="">All Outlets</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Terminal</label>
            <select value={form.terminal_id} onChange={(e) => f("terminal_id", e.target.value)} className={input}>
              <option value="">All Terminals</option>
              {terminals.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        {/* Cost / Markup / Price */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={label}>Cost Price</label>
            <input type="number" step="0.01" min="0" value={form.cost_price}
              onChange={(e) => handleCostChange(e.target.value)}
              className={input} placeholder="0.00" />
          </div>
          <div>
            <label className={label}>Markup %</label>
            <input type="number" step="0.01" min="0" value={form.markup_percentage}
              onChange={(e) => handleMarkupChange(e.target.value)}
              className={input} placeholder="0" />
          </div>
          <div>
            <label className={label}>Sales Price</label>
            <input required type="number" step="0.01" min="0" value={form.price}
              onChange={(e) => f("price", e.target.value)}
              className={input} placeholder="0.00" />
          </div>
        </div>

        {/* Additional Terminal Prices */}
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Additional Terminal Prices</p>
              <p className="text-xs text-gray-400">Optional. Override price per terminal (e.g. Bar vs Kitchen).</p>
            </div>
            <button type="button" onClick={addTerminalPrice}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors">
              <Plus size={13} /> Add Terminal Price
            </button>
          </div>
          {form.terminal_prices.length === 0
            ? <p className="text-xs text-gray-400 italic">No terminal-specific prices. Default Outlet/Terminal/Price above will be used.</p>
            : form.terminal_prices.map((tp, i) => (
              <div key={i} className="flex items-center gap-2 mt-2">
                <select value={tp.outlet_id} onChange={(e) => updateTerminalPrice(i, "outlet_id", e.target.value)}
                  className="flex-1 px-2 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-lg text-xs focus:outline-none focus:border-blue-500">
                  <option value="">Any Outlet</option>
                  {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <select value={tp.terminal_id} onChange={(e) => updateTerminalPrice(i, "terminal_id", e.target.value)}
                  className="flex-1 px-2 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-lg text-xs focus:outline-none focus:border-blue-500">
                  <option value="">Pick terminal…</option>
                  {terminals.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <input type="number" step="0.01" min="0" value={tp.price}
                  onChange={(e) => updateTerminalPrice(i, "price", e.target.value)}
                  placeholder="Price" className="w-24 px-2 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-lg text-xs focus:outline-none focus:border-blue-500" />
                <button type="button" onClick={() => removeTerminalPrice(i)}
                  className="text-gray-300 hover:text-red-500 transition-colors"><X size={15} /></button>
              </div>
            ))
          }
        </div>

        {/* Barcode */}
        <div>
          <label className={label}>Barcode</label>
          <input value={form.barcode} onChange={(e) => f("barcode", e.target.value)}
            className={input} placeholder="Scan or type barcode" />
        </div>

        {/* Image */}
        <div>
          <label className={label}>Product Image</label>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => fileRef.current?.click()}
                className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm hover:border-gray-300 transition-colors flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <Upload size={14} /> {uploading ? "Uploading…" : "Choose File"}
              </button>
              <span className="text-sm text-gray-400">{uploading ? "Uploading…" : "No file chosen"}</span>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
            <input value={form.imageUrl} onChange={(e) => handleImageUrlChange(e.target.value)}
              className={input} placeholder="Or paste image URL" />
            {imagePreview && (
              <div className="relative w-24 h-24 rounded-xl overflow-hidden border-2 border-gray-300 dark:border-gray-700">
                <img src={imagePreview} alt="preview" className="w-full h-full object-cover"
                  onError={() => setImagePreview(null)} />
                <button type="button" onClick={() => { setImagePreview(null); f("image", ""); f("imageUrl", ""); }}
                  className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70">
                  <X size={10} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className={label}>Description</label>
          <textarea rows={3} value={form.description} onChange={(e) => f("description", e.target.value)}
            className={cn(input, "resize-none")} placeholder="Optional product description…" />
        </div>

        {/* Active toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.active} onChange={(e) => f("active", e.target.checked)}
            className="w-4 h-4 rounded accent-blue-600" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Active (visible to cashiers)</span>
        </label>

        {error && <p className="text-red-500 text-xs bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <div className="space-y-2 pt-1">
          <button type="submit" disabled={saving || uploading}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : mode === "add" ? "Create" : "Save Changes"}
          </button>
          <button type="button" onClick={onClose}
            className="w-full py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Bulk Terminal Price Modal ────────────────────────────────────────────────
const BULK_MODES = [
  { value: "percent_markup_from_base", label: "Markup % from base price" },
  { value: "percent_markup_from_cost", label: "Markup % from cost price" },
  { value: "fixed", label: "Fixed price" },
  { value: "delta", label: "Delta (±amount)" },
];

function computeNew(product, mode, value, roundTo) {
  const base = product.price || 0;
  const cost = product.cost_price || 0;
  const v = parseFloat(value) || 0;
  let p;
  if (mode === "fixed") p = v;
  else if (mode === "percent_markup_from_base") p = base * (1 + v / 100);
  else if (mode === "percent_markup_from_cost") p = cost > 0 ? cost * (1 + v / 100) : base;
  else p = base + v; // delta
  const rt = parseFloat(roundTo);
  if (!isNaN(rt) && rt > 0) p = Math.round(p / rt) * rt;
  return parseFloat(p.toFixed(2));
}

function BulkPriceModal({ products, outlets, terminals, onClose, onApplied }) {
  const [outletId, setOutletId] = useState("");
  const [terminalId, setTerminalId] = useState("");
  const [mode, setMode] = useState("percent_markup_from_base");
  const [value, setValue] = useState("10");
  const [roundTo, setRoundTo] = useState("");
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  const filtered = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleAll = () =>
    setSelected(selected.length === filtered.length ? [] : filtered.map((p) => p.id));
  const toggleOne = (id) =>
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const isPercent = mode !== "fixed" && mode !== "delta";
  const valueLabel = mode === "delta" ? "Amount" : isPercent ? "Percent (%)" : "Fixed Price";

  const handleApply = async () => {
    if (!terminalId) { setError("Terminal is required"); return; }
    if (selected.length === 0) { setError("Select at least one product"); return; }
    setApplying(true); setError("");
    try {
      const result = await api.bulkSetTerminalPrices({
        product_ids: selected,
        terminal_id: terminalId,
        outlet_id: outletId || null,
        mode,
        value: parseFloat(value) || 0,
        round_to: parseFloat(roundTo) || null,
      });
      alert(`Done! ${result.updated} updated, ${result.skipped} skipped.`);
      onApplied();
    } catch (err) { setError(err.message); }
    finally { setApplying(false); }
  };

  const input = "w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500";

  return (
    <Modal
      title="Bulk Set Terminal Prices"
      icon={<BarChart2 size={20} className="text-green-600" />}
      subtitle="Pick products, pick a terminal, pick how to compute prices — apply in one click."
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Outlet + Terminal */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Outlet (Optional)</label>
            <select value={outletId} onChange={(e) => setOutletId(e.target.value)} className={input}>
              <option value="">Any Outlet</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Terminal *</label>
            <select value={terminalId} onChange={(e) => setTerminalId(e.target.value)} className={input}>
              <option value="">Pick terminal</option>
              {terminals.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </div>

        {/* Mode + Value + Round */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={input}>
              {BULK_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">{valueLabel}</label>
            <input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} className={input} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Round to Nearest (Optional)</label>
          <input type="number" step="0.01" min="0" value={roundTo} onChange={(e) => setRoundTo(e.target.value)}
            placeholder="e.g. 0.5, 1" className="w-48 px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" />
        </div>

        {/* Product list */}
        <div className="border-2 border-gray-300 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="w-full pl-8 pr-3 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <button onClick={toggleAll}
              className="px-3 py-2 border-2 border-gray-300 dark:border-gray-700 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-white dark:bg-gray-800 transition-colors whitespace-nowrap">
              {selected.length === filtered.length && filtered.length > 0 ? "Deselect all" : "Select all"}
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{selected.length} selected</span>
          </div>
          <div className="overflow-y-auto max-h-56">
            <table className="w-full">
              <thead>
                <tr className="text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                  <th className="text-left px-4 py-2 w-8"></th>
                  <th className="text-left px-4 py-2">Product</th>
                  <th className="text-right px-4 py-2">Base</th>
                  <th className="text-right px-4 py-2">→ New</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((p) => {
                  const newPrice = computeNew(p, mode, value, roundTo);
                  const isSelected = selected.includes(p.id);
                  return (
                    <tr key={p.id} onClick={() => toggleOne(p.id)}
                      className={cn("cursor-pointer hover:bg-blue-50 transition-colors", isSelected && "bg-blue-50")}>
                      <td className="px-4 py-2.5">
                        <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center transition-colors",
                          isSelected ? "bg-blue-600 border-blue-600" : "border-gray-300")}>
                          {isSelected && <div className="w-2 h-2 bg-white dark:bg-gray-800 rounded-sm" />}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-sm font-medium text-gray-900 dark:text-white">{p.name}</td>
                      <td className="px-4 py-2.5 text-sm text-right text-gray-500 dark:text-gray-400">{(p.price || 0).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-sm text-right font-semibold text-green-600">{newPrice.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {error && <p className="text-red-500 text-xs bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose}
            className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
            Cancel
          </button>
          <button onClick={handleApply} disabled={applying}
            className="flex-1 py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-50 transition-colors">
            {applying ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Categories View ──────────────────────────────────────────────────────────
function CategoriesView() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", color: "#3B82F6" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    api.getCategories().then(setCategories).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm({ name: "", color: "#3B82F6" }); setError(""); setModal(true); };
  const openEdit = (c) => { setEditing(c); setForm({ name: c.name, color: c.color || "#3B82F6" }); setError(""); setModal(true); };
  const closeModal = () => { setModal(false); setEditing(null); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      if (editing) { await api.updateCategory(editing.id, form); }
      else { await api.createCategory(form); }
      closeModal(); load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete category "${c.name}"?`)) return;
    try { await api.deleteCategory(c.id); load(); }
    catch (err) { alert(err.message); }
  };

  return (
    <div>
      <SectionHeader
        title="Categories"
        icon={<Tag size={20} className="text-orange-600" />}
        iconBg="bg-orange-100"
        action={
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors">
            <Plus size={16} /> Add Category
          </button>
        }
      />
      {loading ? <Spinner /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {categories.map((c) => (
            <div key={c.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 p-4 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ backgroundColor: c.color }} />
                <span className="font-semibold text-gray-900 dark:text-white text-sm truncate">{c.name}</span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                <button onClick={() => openEdit(c)} className="text-gray-400 hover:text-blue-500 transition-colors p-1">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(c)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {categories.length === 0 && <p className="col-span-4 text-center text-gray-400 text-sm py-10">No categories yet</p>}
        </div>
      )}

      {modal && (
        <Modal title={editing ? "Edit Category" : "Add Category"} onClose={closeModal}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Name</label>
              <input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Color</label>
              <div className="flex items-center gap-3">
                <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-14 h-12 rounded-xl cursor-pointer border-2 border-gray-200 dark:border-gray-700 p-1 flex-shrink-0" />
                <div className="w-8 h-8 rounded-full border-2 border-gray-200 dark:border-gray-600" style={{ backgroundColor: form.color }} />
                <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">{form.color}</span>
              </div>
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={closeModal}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? (editing ? "Saving…" : "Creating…") : (editing ? "Save Changes" : "Create")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Brands View ──────────────────────────────────────────────────────────────
function BrandsView() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    api.getBrands().then(setBrands).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm({ name: "", description: "" }); setError(""); setModal(true); };
  const openEdit = (b) => { setEditing(b); setForm({ name: b.name, description: b.description || "" }); setError(""); setModal(true); };
  const closeModal = () => { setModal(false); setEditing(null); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      if (editing) { await api.updateBrand(editing.id, form); }
      else { await api.createBrand(form); }
      closeModal(); load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (b) => {
    if (!window.confirm(`Delete brand "${b.name}"?`)) return;
    try { await api.deleteBrand(b.id); load(); }
    catch (err) { alert(err.message); }
  };

  return (
    <div>
      <SectionHeader
        title="Brands"
        icon={<Tag size={20} className="text-purple-600" />}
        iconBg="bg-purple-100"
        action={
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors">
            <Plus size={16} /> Add Brand
          </button>
        }
      />
      {loading ? <Spinner /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {brands.map((b) => (
            <div key={b.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{b.name}</p>
                  {b.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{b.description}</p>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(b)} className="text-gray-400 hover:text-blue-500 transition-colors p-1">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleDelete(b)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {brands.length === 0 && <p className="col-span-4 text-center text-gray-400 text-sm py-10">No brands yet</p>}
        </div>
      )}

      {modal && (
        <Modal title={editing ? "Edit Brand" : "Add Brand"} onClose={closeModal}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Brand Name</label>
              <input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Description (optional)</label>
              <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500 resize-none" />
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={closeModal}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? (editing ? "Saving…" : "Creating…") : (editing ? "Save Changes" : "Create")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Units View ───────────────────────────────────────────────────────────────
const DEFAULT_UNITS = [
  { name: "pcs",    abbreviation: "pcs" },
  { name: "carton", abbreviation: "ctn" },
  { name: "kg",     abbreviation: "kg" },
  { name: "g",      abbreviation: "g" },
  { name: "litre",  abbreviation: "L" },
  { name: "dozen",  abbreviation: "doz" },
  { name: "box",    abbreviation: "box" },
  { name: "pack",   abbreviation: "pk" },
  { name: "bag",    abbreviation: "bag" },
  { name: "crate",  abbreviation: "crt" },
];

function UnitsView() {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", abbreviation: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    api.getUnits().then(setUnits).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm({ name: "", abbreviation: "" }); setError(""); setModal(true); };
  const openEdit = (u) => { setEditing(u); setForm({ name: u.name, abbreviation: u.abbreviation || "" }); setError(""); setModal(true); };
  const closeModal = () => { setModal(false); setEditing(null); };

  const handleSeedDefaults = async () => {
    setSeeding(true);
    const toAdd = DEFAULT_UNITS.filter(
      d => !units.find(u => u.name.toLowerCase() === d.name.toLowerCase())
    );
    await Promise.all(toAdd.map(d => api.createUnit(d)));
    load();
    setSeeding(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      if (editing) { await api.updateUnit(editing.id, form); }
      else { await api.createUnit(form); }
      closeModal(); load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete unit "${u.name}"?`)) return;
    try { await api.deleteUnit(u.id); load(); }
    catch (err) { alert(err.message); }
  };

  return (
    <div>
      <SectionHeader
        title="Units"
        icon={<Tag size={20} className="text-teal-600" />}
        iconBg="bg-teal-100"
        action={
          <div className="flex items-center gap-2">
            <button onClick={handleSeedDefaults} disabled={seeding}
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-600 text-white rounded-xl font-semibold text-sm hover:bg-gray-700 transition-colors disabled:opacity-50">
              {seeding ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
              {seeding ? "Loading…" : "Load Defaults"}
            </button>
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors">
              <Plus size={16} /> Add Unit
            </button>
          </div>
        }
      />
      {loading ? <Spinner /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {units.map((u) => (
            <div key={u.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 p-4 shadow-sm flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{u.name}</p>
                {u.abbreviation && <p className="text-xs text-gray-400">{u.abbreviation}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                <button onClick={() => openEdit(u)} className="text-gray-400 hover:text-blue-500 transition-colors p-1">
                  <Pencil size={14} />
                </button>
                <button onClick={() => handleDelete(u)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {units.length === 0 && <p className="col-span-4 text-center text-gray-400 text-sm py-10">No units yet</p>}
        </div>
      )}

      {modal && (
        <Modal title={editing ? "Edit Unit" : "Add Unit"} onClose={closeModal}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Unit Name</label>
              <input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Kilogram, Piece, Litre"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Abbreviation</label>
              <input value={form.abbreviation} onChange={(e) => setForm({ ...form, abbreviation: e.target.value })}
                placeholder="e.g. kg, pcs, L"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" />
            </div>
            {error && <p className="text-red-500 text-xs">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={closeModal}
                className="flex-1 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {saving ? (editing ? "Saving…" : "Creating…") : (editing ? "Save Changes" : "Create")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Print Labels View ────────────────────────────────────────────────────────
const LABEL_SIZES = [
  { value: "small", label: "Small (40x20mm)", w: "150px", h: "75px" },
  { value: "medium", label: "Medium (50x30mm)", w: "189px", h: "113px" },
  { value: "large", label: "Large (60x40mm)", w: "227px", h: "151px" },
];

function PrintLabelsView() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState({}); // { productId: copies }
  const [labelSize, setLabelSize] = useState("medium");
  const [showPrice, setShowPrice] = useState(true);
  const [showBarcode, setShowBarcode] = useState(true);
  const [copies, setCopies] = useState(1);

  useEffect(() => {
    api.getProducts().then(setProducts).catch(console.error).finally(() => setLoading(false));
  }, []);

  const filtered = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.barcode && p.barcode.toLowerCase().includes(search.toLowerCase()))
  );

  const toggleProduct = (id) => {
    setSelected((prev) => {
      if (prev[id]) {
        const n = { ...prev }; delete n[id]; return n;
      }
      return { ...prev, [id]: copies };
    });
  };

  const setCopiesForProduct = (id, val) =>
    setSelected((prev) => ({ ...prev, [id]: Math.max(1, parseInt(val) || 1) }));

  const removeSelected = (id) =>
    setSelected((prev) => { const n = { ...prev }; delete n[id]; return n; });

  const totalLabels = Object.values(selected).reduce((s, c) => s + c, 0);
  const selectedProducts = Object.keys(selected).map((id) => products.find((p) => p.id === id)).filter(Boolean);

  const size = LABEL_SIZES.find((s) => s.value === labelSize) || LABEL_SIZES[1];

  const handlePrint = () => {
    if (selectedProducts.length === 0) { alert("Select at least one product."); return; }
    const win = window.open("", "_blank", "width=800,height=600");
    const labels = selectedProducts.flatMap((p) =>
      Array(selected[p.id] || 1).fill(null).map(() => `
        <div class="label" style="width:${size.w};height:${size.h};border:1px solid #ccc;padding:6px;margin:4px;display:inline-flex;flex-direction:column;justify-content:space-between;box-sizing:border-box;">
          <p style="font-weight:bold;font-size:11px;margin:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${p.name}</p>
          ${showPrice ? `<p style="font-size:13px;font-weight:bold;color:#16a34a;margin:2px 0;">${formatCurrency(p.price)}</p>` : ""}
          ${showBarcode && p.barcode ? `<p style="font-size:9px;color:#555;margin:0;">â–Œâ–Œâ–Œ ${p.barcode}</p>` : ""}
        </div>
      `)
    ).join("");

    win.document.write(`
      <!DOCTYPE html><html><head><title>Print Labels</title>
      <style>body{margin:16px;font-family:sans-serif;}@media print{body{margin:0;}}</style>
      </head><body>${labels}<script>window.onload=function(){window.print();}<\/script></body></html>
    `);
    win.document.close();
  };

  return (
    <div>
      <SectionHeader
        title="Print Labels"
        icon={<Printer size={20} className="text-gray-600 dark:text-gray-300" />}
        iconBg="bg-gray-100 dark:bg-gray-700"
        action={
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors">
            <Printer size={15} /> Print Labels
          </button>
        }
      />

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Product list */}
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products by name or barcode…"
                className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="overflow-y-auto max-h-[calc(100vh-280px)]">
            {loading ? <Spinner /> : filtered.map((p) => (
              <div key={p.id} onClick={() => toggleProduct(p.id)}
                className={cn("flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors",
                  selected[p.id] && "bg-blue-50")}>
                <div className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                  selected[p.id] ? "bg-blue-600 border-blue-600" : "border-gray-300")}>
                  {selected[p.id] && <div className="w-2 h-2 bg-white dark:bg-gray-800 rounded-full" />}
                </div>
                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-700">
                  {p.image
                    ? <img src={api.getImageUrl(p.image)} alt="" className="w-full h-full object-cover" onError={(e) => { e.target.style.display = "none"; }} />
                    : <div className="w-full h-full flex items-center justify-center"><Tag size={14} className="text-gray-300" /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{p.name}</p>
                  <p className="text-xs text-gray-400">
                    {formatCurrency(p.price)}{p.barcode ? ` | ${p.barcode}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Settings panel */}
        <div className="w-full lg:w-72 flex-shrink-0 space-y-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 dark:text-white mb-4">Label Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Label Size</label>
                <select value={labelSize} onChange={(e) => setLabelSize(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500">
                  {LABEL_SIZES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Printer</label>
                <select className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500">
                  <option>Browser Print Dialog</option>
                </select>
              </div>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Show Price</span>
                <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)}
                  className="w-4 h-4 accent-blue-600" />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Show Barcode</span>
                <input type="checkbox" checked={showBarcode} onChange={(e) => setShowBarcode(e.target.checked)}
                  className="w-4 h-4 accent-blue-600" />
              </label>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Copies per product</label>
                <input type="number" min="1" value={copies} onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
          </div>

          {/* Selected panel */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 dark:text-white mb-3">Selected ({Object.keys(selected).length})</h3>
            {selectedProducts.length === 0
              ? <p className="text-xs text-gray-400 italic">Click products to select them for label printing</p>
              : (
                <div className="space-y-2">
                  {selectedProducts.map((p) => (
                    <div key={p.id} className="flex items-center gap-2">
                      <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">{p.name}</span>
                      <input type="number" min="1" value={selected[p.id]}
                        onChange={(e) => setCopiesForProduct(p.id, e.target.value)}
                        className="w-14 px-2 py-1 border-2 border-gray-300 dark:border-gray-700 rounded-lg text-xs text-center focus:outline-none focus:border-blue-500" />
                      <button onClick={() => removeSelected(p.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors"><X size={14} /></button>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400 pt-1 border-t border-gray-100 dark:border-gray-700">Total: {totalLabels} labels</p>
                </div>
              )
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Import & Export View ─────────────────────────────────────────────────────
function ImportExportView() {
  const [tab, setTab] = useState("import");
  const [productFile, setProductFile] = useState(null);
  const [stockFile, setStockFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [stockImporting, setStockImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [stockResult, setStockResult] = useState(null);
  const productFileRef = useRef();
  const stockFileRef = useRef();

  const handleProductImport = async () => {
    if (!productFile) { alert("Choose a CSV file first."); return; }
    setImporting(true); setResult(null);
    try {
      const r = await api.importProductsCSV(productFile);
      setResult(r);
      setProductFile(null);
      if (productFileRef.current) productFileRef.current.value = "";
    } catch (err) { alert("Import failed: " + err.message); }
    finally { setImporting(false); }
  };

  const handleStockImport = async () => {
    if (!stockFile) { alert("Choose a CSV file first."); return; }
    setStockImporting(true); setStockResult(null);
    try {
      const r = await api.importStockCSV(stockFile);
      setStockResult(r);
      setStockFile(null);
      if (stockFileRef.current) stockFileRef.current.value = "";
    } catch (err) { alert("Import failed: " + err.message); }
    finally { setStockImporting(false); }
  };

  const [exporting, setExporting] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);

  const downloadHandler = (fn) => async () => {
    try { await fn(); }
    catch (err) { alert("Download failed: " + err.message); }
  };

  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const products = await api.getProducts();
      const headers = ["Name", "Category", "Price", "Cost Price", "Barcode", "Active", "Description"];
      const rows = products.map((p) => [
        p.name,
        p.category || "",
        p.price ?? "",
        p.cost_price ?? "",
        p.barcode || "",
        p.active !== false ? "Yes" : "No",
        (p.description || "").replace(/\n/g, " "),
      ]);
      const csv = [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `products_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Export failed: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleExportPDF = async () => {
    setPdfExporting(true);
    try {
      const products = await api.getProducts();
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

      doc.setFontSize(18);
      doc.setTextColor(30, 58, 95);
      doc.text("Product List", 14, 20);

      doc.setFontSize(9);
      doc.setTextColor(107, 114, 128);
      doc.text(`Generated: ${new Date().toLocaleString()}  ·  ${products.length} products`, 14, 27);

      autoTable(doc, {
        startY: 33,
        head: [["#", "Name", "Category", "Price", "Cost Price", "Barcode", "Status"]],
        body: products.map((p, i) => [
          i + 1,
          p.name || "—",
          p.category || "—",
          p.price != null ? Number(p.price).toFixed(2) : "—",
          p.cost_price != null ? Number(p.cost_price).toFixed(2) : "—",
          p.barcode || "—",
          p.active !== false ? "Active" : "Inactive",
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        didParseCell: (data) => {
          if (data.column.index === 6 && data.section === "body") {
            data.cell.styles.textColor = data.cell.raw === "Active" ? [22, 163, 74] : [220, 38, 38];
          }
        },
      });

      doc.save(`products_${new Date().toISOString().split("T")[0]}.pdf`);
    } catch (err) {
      alert("Export failed: " + err.message);
    } finally {
      setPdfExporting(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Import &amp; Export"
        icon={<FileUp size={20} className="text-green-600" />}
        iconBg="bg-green-100"
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {[["import", "Import Products"], ["stock", "Stock Update"], ["export", "Export"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn("px-5 py-2.5 text-sm font-semibold transition-colors border-b-2 -mb-px",
              tab === id ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:text-gray-200")}>
            {label}
          </button>
        ))}
      </div>

      {tab === "import" && (
        <div className="max-w-xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6 space-y-5">
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-lg mb-1">Import Products from CSV</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Upload a CSV file to create new products or update existing ones (matched by name).</p>
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 text-sm space-y-2">
              <div>
                <p className="font-semibold text-gray-700 dark:text-gray-200">Required columns:</p>
                <p className="text-gray-500 dark:text-gray-400 font-mono text-xs mt-1">Name, Category, Cost Price, Markup %, Price</p>
              </div>
              <div>
                <p className="font-semibold text-gray-700 dark:text-gray-200">Optional columns:</p>
                <p className="text-gray-500 dark:text-gray-400 font-mono text-xs mt-1">Brand, Unit, Outlet, Terminal, Barcode, Description, Active</p>
              </div>
              <p className="text-xs text-gray-400">Brand / Unit / Outlet / Terminal can be the name (e.g. "Main Outlet") or the raw id. If left blank, the product won't be tied to that entity.</p>
            </div>

            <button onClick={downloadHandler(api.downloadProductsTemplate)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
              <Download size={16} /> Download Example Sheet (Template)
            </button>

            <div
              onClick={() => productFileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
              <FileText size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500 dark:text-gray-400">{productFile ? productFile.name : "Click to choose CSV file"}</p>
              <input ref={productFileRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => setProductFile(e.target.files?.[0] || null)} />
            </div>

            {result && (
              <div className={cn("rounded-xl p-4 text-sm", result.errors?.length ? "bg-yellow-50 border border-yellow-200" : "bg-green-50 border border-green-200")}>
                <p className="font-semibold text-gray-800 dark:text-gray-100">{result.message}</p>
                {result.errors?.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-yellow-800">
                    {result.errors.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
                    {result.errors.length > 10 && <li>…and {result.errors.length - 10} more</li>}
                  </ul>
                )}
              </div>
            )}

            <button onClick={handleProductImport} disabled={importing || !productFile}
              className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
              <FileUp size={16} /> {importing ? "Importing…" : "Import Products"}
            </button>
          </div>
        </div>
      )}

      {tab === "stock" && (
        <div className="max-w-xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6 space-y-5">
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-lg mb-1">Update Stock Quantities</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Upload a CSV to update stock quantities only — without affecting product details (name, price, etc.). Matches products by name or barcode.</p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">CSV columns:</p>
              <p className="font-mono text-sm text-amber-800">Name, Barcode, Quantity, Min Quantity, Outlet</p>
              <p className="text-xs text-amber-600 mt-1">Match product by Name or Barcode + Quantity. Outlet accepts the outlet name or id (defaults to the main outlet).</p>
            </div>

            <button onClick={downloadHandler(api.downloadStockTemplate)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
              <Download size={16} /> Download Example Sheet (Template)
            </button>
            <button onClick={downloadHandler(api.downloadCurrentStockCSV)}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
              <Download size={16} /> Download Current Stock CSV
            </button>

            <div
              onClick={() => stockFileRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-amber-400 hover:bg-amber-50 transition-colors">
              <FileText size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500 dark:text-gray-400">{stockFile ? stockFile.name : "Click to choose CSV file"}</p>
              <input ref={stockFileRef} type="file" accept=".csv" className="hidden"
                onChange={(e) => setStockFile(e.target.files?.[0] || null)} />
            </div>

            {stockResult && (
              <div className={cn("rounded-xl p-4 text-sm", stockResult.errors?.length ? "bg-yellow-50 border border-yellow-200" : "bg-green-50 border border-green-200")}>
                <p className="font-semibold text-gray-800 dark:text-gray-100">{stockResult.message}</p>
                {stockResult.errors?.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-yellow-800">
                    {stockResult.errors.slice(0, 10).map((e, i) => <li key={i}>• {e}</li>)}
                    {stockResult.errors.length > 10 && <li>…and {stockResult.errors.length - 10} more</li>}
                  </ul>
                )}
              </div>
            )}

            <button onClick={handleStockImport} disabled={stockImporting || !stockFile}
              className="w-full flex items-center justify-center gap-2 py-3 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 disabled:opacity-50 transition-colors">
              <FileUp size={16} /> {stockImporting ? "Updating…" : "Update Stock"}
            </button>
          </div>
        </div>
      )}

      {tab === "export" && (
        <div className="grid grid-cols-2 gap-4 max-w-xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center">
              <FileDown size={28} className="text-green-600" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Export CSV</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Download all products as a spreadsheet file</p>
            </div>
            <button onClick={handleExportCSV} disabled={exporting}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-50 transition-colors">
              <Download size={15} /> {exporting ? "Exporting…" : "Download CSV"}
            </button>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-6 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center">
              <FileText size={28} className="text-red-500" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Export PDF</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Download product list as a formatted PDF</p>
            </div>
            <button onClick={handleExportPDF} disabled={pdfExporting}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-500 text-white rounded-xl font-bold text-sm hover:bg-red-600 disabled:opacity-50 transition-colors">
              <Download size={15} /> {pdfExporting ? "Preparing…" : "Download PDF"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Root Export ─────────────────────────────────────────────────────────────
export default function ProductsSection({ view = "all-products", onViewChange }) {
  switch (view) {
    case "all-products":  return <AllProductsView autoOpen={false} />;
    case "create-product": return <AllProductsView autoOpen={true} />;
    case "categories":   return <CategoriesView />;
    case "brands":       return <BrandsView />;
    case "units":        return <UnitsView />;
    case "print-labels": return <PrintLabelsView />;
    case "import":       return <ImportExportView />;
    default:             return <AllProductsView autoOpen={false} />;
  }
}
