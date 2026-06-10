import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  Plus, Pencil, Trash2, X, Tag, Upload, Printer, Download,
  FileText, CheckSquare, Square, ChevronDown, Search, RefreshCw,
  FileUp, FileDown, BarChart2, GalleryThumbnails, ChefHat, UtensilsCrossed,
} from "lucide-react";
import ImageLibraryModal from "../components/ImageLibraryModal";
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
  const [groups, setGroups] = useState([]);
  const [brands, setBrands] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [terminals, setTerminals] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState("");
  const [filterBrand, setFilterBrand] = useState("");
  const [page, setPage] = useState(1);
  const [productModal, setProductModal] = useState(null);
  const [bulkModal, setBulkModal] = useState(false);
  const PAGE_SIZE = 10;

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.getProducts(), api.getGroups(), api.getBrands(),
      api.getOutlets(), api.getTerminals(), api.getUnits(),
    ])
      .then(([p, g, b, o, t, u]) => {
        setProducts(p); setGroups(g); setBrands(b);
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
    if (filterGroup && p.category_id !== filterGroup) return false;
    if (filterBrand && p.brand_id !== filterBrand) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, filterGroup, filterBrand]);

  const groupName = (id) => groups.find((g) => g.id === id)?.name || "";
  const groupColor = (id) => groups.find((g) => g.id === id)?.color || "#9CA3AF";

  const handleDelete = async (p) => {
    if (!window.confirm(`Delete "${p.name}"?`)) return;
    try { await api.deleteProduct(p.id); load(); }
    catch (err) { alert(err.message); }
  };

  const clearFilters = filterGroup || filterBrand || search;

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
            className="flex items-center gap-2 px-3 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors"
            title="Bulk Set Terminal Prices"
          >
            <BarChart2 size={15} />
            <span className="hidden sm:inline">Bulk Set Terminal Prices</span>
          </button>
          <button
            onClick={() => setProductModal({ mode: "add" })}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            <span className="hidden sm:inline">New Product</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm p-4 mb-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by product name…"
              className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500">
              <option value="">All groups</option>
              {["food", "drinks"].map((mc) => {
                const opts = groups.filter((g) => g.main_category === mc);
                return opts.length > 0 ? (
                  <optgroup key={mc} label={mc === "food" ? "Food" : "Drinks"}>
                    {opts.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </optgroup>
                ) : null;
              })}
              {groups.filter((g) => !g.main_category).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select value={filterBrand} onChange={(e) => setFilterBrand(e.target.value)}
              className="flex-1 sm:flex-none px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500">
              <option value="">All brands</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {clearFilters && (
              <button onClick={() => { setSearch(""); setFilterGroup(""); setFilterBrand(""); }}
                className="p-2.5 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-gray-400 hover:text-gray-700 dark:text-gray-200 hover:border-gray-300 transition-colors flex-shrink-0">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Group chips grouped by main_category */}
        {groups.length > 0 && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button onClick={() => setFilterGroup("")}
              className={cn("px-4 py-1.5 rounded-full text-sm font-semibold transition-colors",
                !filterGroup ? "bg-gray-900 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200")}>
              All
            </button>
            {["food", "drinks", null].flatMap((mc) =>
              groups.filter((g) => (mc ? g.main_category === mc : !g.main_category)).map((g) => (
                <button key={g.id} onClick={() => setFilterGroup(g.id === filterGroup ? "" : g.id)}
                  className={cn("px-4 py-1.5 rounded-full text-sm font-semibold transition-colors text-white")}
                  style={{ backgroundColor: g.id === filterGroup ? g.color : g.color + "CC" }}>
                  {g.name}
                </button>
              ))
            )}
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
                <div className="absolute top-2 right-2 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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
                <p className="text-xs mt-0.5" style={{ color: groupColor(p.category_id) }}>{groupName(p.category_id)}</p>
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
          groups={groups}
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
  barcode: "", image: "", description: "",
  active: true, terminal_prices: [],
};

function resizeImageFile(file, maxPx = 800, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxPx || height > maxPx) {
        if (width >= height) { height = Math.round(height * maxPx / width); width = maxPx; }
        else { width = Math.round(width * maxPx / height); height = maxPx; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); resolve(file); };
    img.src = objectUrl;
  });
}

function ProductModal({ mode, product, groups, brands, units, outlets, terminals, onClose, onSaved }) {
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
        description: product.description || "",
        active: product.active !== false,
        terminal_prices: product.terminal_prices || [],
      };
    }
    return { ...EMPTY_FORM, category_id: groups[0]?.id || "" };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
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
    e.target.value = "";
    setUploading(true);
    try {
      const resizedBlob = await resizeImageFile(file);
      const resized = new File([resizedBlob], file.name || "upload.jpg", { type: resizedBlob.type || "image/jpeg" });
      const result = await api.uploadImage(resized);
      f("image", result.url);
      setImagePreview(result.fullUrl);
    } catch (err) {
      setError("Image upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleLibrarySelect = ({ url, fullUrl }) => {
    f("image", url);
    setImagePreview(fullUrl);
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
      // Per-outlet price overrides. Only keep rows where the user actually
      // typed a price (cost-only overrides without a price would be
      // ambiguous — the cashier reads price first).
      terminal_prices: (form.terminal_prices || [])
        .filter((tp) => tp.outlet_id && tp.price !== "" && tp.price != null)
        .map((tp) => ({
          outlet_id: tp.outlet_id,
          terminal_id: null,
          price: parseFloat(tp.price) || 0,
          cost_price: tp.cost_price !== "" && tp.cost_price != null ? (parseFloat(tp.cost_price) || 0) : 0,
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

        {/* Group */}
        <div>
          <label className={label}>Group</label>
          <select required value={form.category_id} onChange={(e) => f("category_id", e.target.value)} className={input}>
            <option value="">Select group…</option>
            {["food", "drinks"].map((mc) => {
              const opts = groups.filter((g) => g.main_category === mc);
              return opts.length > 0 ? (
                <optgroup key={mc} label={mc === "food" ? "Food" : "Drinks"}>
                  {opts.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </optgroup>
              ) : null;
            })}
            {groups.filter((g) => !g.main_category).length > 0 && (
              <optgroup label="Other">
                {groups.filter((g) => !g.main_category).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </optgroup>
            )}
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

        {/* Outlet (terminal dropdown removed — pricing is per-outlet now) */}
        <div>
          <label className={label}>Outlet</label>
          <select value={form.outlet_id} onChange={(e) => f("outlet_id", e.target.value)} className={input}>
            <option value="">All Outlets</option>
            {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
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

        {/* Per-Outlet Price Overrides
            Default Cost/Markup/Sales Price above is used unless a row
            below explicitly overrides for a given outlet. The cashier
            view picks the active-outlet override automatically. */}
        <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-start justify-between mb-2 gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Per-Outlet Prices</p>
              <p className="text-xs text-gray-400">Optional. Override sales / cost price per outlet — Club &amp; Lounge, Main Restaurant, etc.</p>
            </div>
          </div>
          {(() => {
            const overrideByOutlet = {};
            (form.terminal_prices || []).forEach((tp) => { if (tp.outlet_id) overrideByOutlet[tp.outlet_id] = tp; });
            const setOverride = (outletId, key, val) => {
              const existing = form.terminal_prices || [];
              const idx = existing.findIndex((tp) => tp.outlet_id === outletId);
              const next = [...existing];
              if (idx >= 0) {
                next[idx] = { ...next[idx], [key]: val };
              } else {
                next.push({ outlet_id: outletId, terminal_id: null, price: "", cost_price: "", [key]: val });
              }
              f("terminal_prices", next);
            };
            const clearOverride = (outletId) => {
              f("terminal_prices", (form.terminal_prices || []).filter((tp) => tp.outlet_id !== outletId));
            };
            if (outlets.length === 0) {
              return <p className="text-xs text-gray-400 italic">No outlets configured yet.</p>;
            }
            return (
              <div className="space-y-2">
                <div className="hidden sm:grid grid-cols-[1fr_120px_120px_28px] gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                  <span>Outlet</span>
                  <span className="text-right">Cost</span>
                  <span className="text-right">Sales Price</span>
                  <span />
                </div>
                {outlets.map((o) => {
                  const ov = overrideByOutlet[o.id] || {};
                  const has = ov.price !== "" && ov.price != null;
                  return (
                    <div key={o.id} className="grid grid-cols-[1fr_100px_100px_28px] sm:grid-cols-[1fr_120px_120px_28px] gap-2 items-center">
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{o.name}</p>
                      <input type="number" step="0.01" min="0"
                        value={ov.cost_price ?? ""}
                        onChange={(e) => setOverride(o.id, "cost_price", e.target.value)}
                        placeholder={form.cost_price || "0.00"}
                        className="w-full px-2 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-xs text-right focus:outline-none focus:border-blue-500" />
                      <input type="number" step="0.01" min="0"
                        value={ov.price ?? ""}
                        onChange={(e) => setOverride(o.id, "price", e.target.value)}
                        placeholder={form.price || "0.00"}
                        className="w-full px-2 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-xs text-right font-bold focus:outline-none focus:border-blue-500" />
                      <button type="button"
                        onClick={() => clearOverride(o.id)}
                        disabled={!has}
                        title="Clear override for this outlet"
                        className="text-gray-300 hover:text-red-500 disabled:opacity-30 transition-colors">
                        <X size={15} />
                      </button>
                    </div>
                  );
                })}
                <p className="text-[10px] text-gray-400 italic mt-1">
                  Blank rows fall back to the default Cost / Sales Price above.
                </p>
              </div>
            );
          })()}
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
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                className="px-3 py-2 border-2 border-gray-200 dark:border-gray-700 rounded-xl text-sm hover:border-blue-400 transition-colors flex items-center gap-2 text-gray-600 dark:text-gray-300 disabled:opacity-50">
                <Upload size={14} /> {uploading ? "Uploading…" : "Upload New"}
              </button>
              <button type="button" onClick={() => setShowLibrary(true)} disabled={uploading}
                className="px-3 py-2 border-2 border-indigo-200 dark:border-indigo-700 rounded-xl text-sm hover:border-indigo-400 transition-colors flex items-center gap-2 text-indigo-600 dark:text-indigo-400 disabled:opacity-50">
                <GalleryThumbnails size={14} /> From Library
              </button>
              {uploading && <span className="text-xs text-gray-400">Compressing &amp; uploading…</span>}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
            </div>
            {imagePreview && (
              <div className="relative w-24 h-24 rounded-xl overflow-hidden border-2 border-gray-300 dark:border-gray-700">
                <img src={imagePreview} alt="preview" className="w-full h-full object-cover"
                  onError={() => setImagePreview(null)} />
                <button type="button" onClick={() => { setImagePreview(null); f("image", ""); }}
                  className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70">
                  <X size={10} />
                </button>
              </div>
            )}
          </div>
        </div>
        {showLibrary && (
          <ImageLibraryModal onSelect={handleLibrarySelect} onClose={() => setShowLibrary(false)} />
        )}

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
                className="w-full pl-8 pr-3 py-2 border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:border-blue-500" />
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

// ─── Groups View ──────────────────────────────────────────────────────────────
const MC_LABELS = { food: "Food", drinks: "Drinks" };
const MC_COLORS = {
  food:   { bg: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300", dot: "bg-orange-500" },
  drinks: { bg: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",         dot: "bg-blue-500" },
};

function GroupsView() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", color: "#3B82F6", main_category: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    api.getGroups().then(setGroups).catch(console.error).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const openAdd = () => { setEditing(null); setForm({ name: "", color: "#3B82F6", main_category: "" }); setError(""); setModal(true); };
  const openEdit = (g) => { setEditing(g); setForm({ name: g.name, color: g.color || "#3B82F6", main_category: g.main_category || "" }); setError(""); setModal(true); };
  const closeModal = () => { setModal(false); setEditing(null); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true); setError("");
    try {
      if (editing) { await api.updateGroup(editing.id, form); }
      else { await api.createGroup(form); }
      closeModal(); load();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (g) => {
    if (!window.confirm(`Delete group "${g.name}"?`)) return;
    try { await api.deleteGroup(g.id); load(); }
    catch (err) { alert(err.message); }
  };

  // Split groups by main_category for display
  const foodGroups   = groups.filter((g) => g.main_category === "food");
  const drinksGroups = groups.filter((g) => g.main_category === "drinks");
  const otherGroups  = groups.filter((g) => !g.main_category);

  const GroupCard = ({ g }) => {
    const mc = MC_COLORS[g.main_category] || null;
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
            <div className="min-w-0">
              <span className="font-semibold text-gray-900 dark:text-white text-sm truncate block">{g.name}</span>
              {mc && (
                <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5", mc.bg)}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", mc.dot)} />
                  {MC_LABELS[g.main_category]}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => openEdit(g)} className="text-gray-400 hover:text-blue-500 transition-colors p-1">
              <Pencil size={14} />
            </button>
            <button onClick={() => handleDelete(g)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const Section = ({ label, icon, items }) => items.length === 0 ? null : (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest">{label} ({items.length})</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((g) => <GroupCard key={g.id} g={g} />)}
      </div>
    </div>
  );

  return (
    <div>
      <SectionHeader
        title="Groups"
        icon={<Tag size={20} className="text-orange-600" />}
        iconBg="bg-orange-100"
        action={
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors">
            <Plus size={16} /> Add Group
          </button>
        }
      />

      {/* Two main categories banner */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { mc: "food",   label: "Food → Kitchen Store",   icon: <UtensilsCrossed size={18} className="text-orange-500" />, bg: "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800", count: foodGroups.length },
          { mc: "drinks", label: "Drinks → Bar Store",     icon: <ChefHat size={18} className="text-blue-500" />,          bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",       count: drinksGroups.length },
        ].map(({ mc, label, icon, bg, count }) => (
          <div key={mc} className={cn("rounded-2xl border-2 p-4 flex items-center gap-3", bg)}>
            <div className="w-9 h-9 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm flex-shrink-0">{icon}</div>
            <div>
              <p className="font-bold text-gray-900 dark:text-white text-sm">{label}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{count} group{count !== 1 ? "s" : ""}</p>
            </div>
          </div>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <>
          <Section label="Food Groups" icon={<UtensilsCrossed size={13} className="text-orange-500" />} items={foodGroups} />
          <Section label="Drinks Groups" icon={<ChefHat size={13} className="text-blue-500" />} items={drinksGroups} />
          {otherGroups.length > 0 && <Section label="Other" icon={<Tag size={13} className="text-gray-400" />} items={otherGroups} />}
          {groups.length === 0 && <p className="text-center text-gray-400 text-sm py-10">No groups yet — add one above</p>}
        </>
      )}

      {modal && (
        <Modal title={editing ? "Edit Group" : "Add Group"} onClose={closeModal}>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Group Name</label>
              <input required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Starters, Cocktails, Soft Drinks…"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" />
            </div>

            {/* Main Category picker */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Main Category</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "food",   label: "Food",   sub: "→ Kitchen Store", icon: <UtensilsCrossed size={16} />, active: "border-orange-500 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300" },
                  { value: "drinks", label: "Drinks", sub: "→ Bar Store",     icon: <ChefHat size={16} />,         active: "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300" },
                ].map(({ value, label, sub, icon, active }) => (
                  <button key={value} type="button"
                    onClick={() => setForm({ ...form, main_category: form.main_category === value ? "" : value })}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-3 rounded-xl border-2 text-left transition-all",
                      form.main_category === value ? active : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300"
                    )}>
                    {icon}
                    <div>
                      <p className="font-bold text-sm leading-tight">{label}</p>
                      <p className="text-[10px] opacity-70">{sub}</p>
                    </div>
                  </button>
                ))}
              </div>
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
                        className="w-14 px-2 py-1 border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-xs text-center focus:outline-none focus:border-blue-500" />
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

// ─── Image Library View ───────────────────────────────────────────────────────
function ImageLibraryView() {
  const [items, setItems]         = useState([]);
  const [page, setPage]           = useState(1);
  const [pages, setPages]         = useState(1);
  const [total, setTotal]         = useState(0);
  const [search, setSearch]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting]   = useState(null);
  const [uploadErr, setUploadErr] = useState("");
  const [syncing, setSyncing]     = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [fetching, setFetching]   = useState(false);
  const [fetchResult, setFetchResult] = useState(null);
  const [flushing, setFlushing]   = useState(false);
  const [flushResult, setFlushResult] = useState(null);
  const fileRef                   = useRef();
  const searchTimeout             = useRef(null);

  const BASE_URL = process.env.REACT_APP_BACKEND_URL || "https://posx-suite.vercel.app";
  const imgUrl = (id) => `${BASE_URL}/api/images/${id}`;
  const formatSize = (b) => {
    if (!b) return "";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  };

  const load = useCallback(async (p, q) => {
    setLoading(true);
    try {
      const res = await api.getImages(p, q);
      setItems(res.items);
      setPages(res.pages);
      setTotal(res.total);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(1, ""); }, [load]);

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => { setPage(1); load(1, val); }, 350);
  };

  const handlePageChange = (p) => { setPage(p); load(p, search); };

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploadErr("");
    setUploading(true);
    let failed = 0;
    for (const file of Array.from(files)) {
      try {
        const blob = await resizeImageFile(file);
        const named = new File([blob], file.name || "upload.jpg", { type: blob.type || "image/jpeg" });
        await api.uploadImage(named);
      } catch { failed++; }
    }
    setUploading(false);
    if (failed > 0) setUploadErr(`${failed} file(s) failed to upload.`);
    load(1, search);
    setPage(1);
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? Products using this image will lose it.`)) return;
    setDeleting(item.id);
    try { await api.deleteImage(item.id); load(page, search); }
    catch { alert("Failed to delete."); }
    finally { setDeleting(null); }
  };

  const [dragOver, setDragOver] = useState(false);

  const handleSyncFromProducts = async () => {
    if (syncing) return;
    if (!window.confirm("Scan all products and download any external images into the Image Library? Products already using a library image are skipped.")) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.syncProductImages();
      setSyncResult(res);
      load(1, search);
    } catch (err) {
      setSyncResult({ error: err.message || "Sync failed" });
    } finally {
      setSyncing(false);
    }
  };

  const handleFlush = async () => {
    if (flushing) return;
    const confirmText = window.prompt(
      'Type "FLUSH" to permanently delete every image in the Image Library and unlink them from products.'
    );
    if (confirmText !== "FLUSH") return;
    setFlushing(true);
    setFlushResult(null);
    try {
      const res = await api.clearImageLibrary();
      setFlushResult(res);
      load(1, search);
    } catch (err) {
      setFlushResult({ error: err.message || "Flush failed" });
    } finally {
      setFlushing(false);
    }
  };

  const handleAutoFetch = async () => {
    if (fetching) return;
    if (!window.confirm("Search the web for images of every product that doesn't have one, and attach the top result automatically? This is best-effort — review results in the Products list afterwards.")) return;
    setFetching(true);
    setFetchResult(null);
    try {
      const res = await api.autoFetchProductImages({ only_missing: true });
      setFetchResult(res);
      load(1, search);
    } catch (err) {
      setFetchResult({ error: err.message || "Auto-fetch failed" });
    } finally {
      setFetching(false);
    }
  };

  return (
    <div>
      <SectionHeader
        title="Image Library"
        icon={<GalleryThumbnails size={20} className="text-indigo-600" />}
        iconBg="bg-indigo-100"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={handleFlush} disabled={flushing || syncing || fetching || uploading}
              className="flex items-center gap-2 px-3 py-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-xl text-sm font-semibold hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 transition-colors"
              title="Permanently delete every image in the library and unlink them from products">
              {flushing ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /> Flushing…
                </span>
              ) : "Flush Library"}
            </button>
            <button onClick={handleAutoFetch} disabled={fetching || syncing || uploading || flushing}
              className="flex items-center gap-2 px-3 py-2 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-xl text-sm font-semibold hover:bg-emerald-200 dark:hover:bg-emerald-900/50 disabled:opacity-50 transition-colors"
              title="Search the web for images of products that don't have one, and attach automatically">
              {fetching ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /> Fetching…
                </span>
              ) : "Find Images Online"}
            </button>
            <button onClick={handleSyncFromProducts} disabled={syncing || fetching || uploading || flushing}
              className="flex items-center gap-2 px-3 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-xl text-sm font-semibold hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50 transition-colors"
              title="Download external product images and add them to the library">
              {syncing ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" /> Syncing…
                </span>
              ) : "Sync from Products"}
            </button>
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors">
              <Upload size={15} /> {uploading ? "Uploading…" : "Upload Images"}
            </button>
          </div>
        }
      />

      {flushResult && (
        <div className={`mb-4 p-4 rounded-2xl border-2 text-sm ${
          flushResult.error
            ? "border-red-300 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
            : "border-red-300 bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300"
        }`}>
          {flushResult.error ? (
            <p className="font-bold">{flushResult.error}</p>
          ) : (
            <p>
              <strong>Image Library flushed.</strong> Deleted <strong>{flushResult.images_deleted}</strong> image(s) ·
              Unlinked from <strong>{flushResult.products_unlinked}</strong> product(s).
            </p>
          )}
        </div>
      )}

      {fetchResult && (
        <div className={`mb-4 p-4 rounded-2xl border-2 text-sm ${
          fetchResult.error
            ? "border-red-300 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
            : "border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300"
        }`}>
          {fetchResult.error ? (
            <p className="font-bold">{fetchResult.error}</p>
          ) : (
            <>
              <p className="font-bold mb-1">Online image fetch complete</p>
              <p>
                Scanned <strong>{fetchResult.scanned}</strong> · Attached <strong>{fetchResult.attached}</strong> · No result <strong>{fetchResult.no_result}</strong> · Download failed <strong>{fetchResult.download_failed}</strong>
              </p>
              <p className="text-xs opacity-80 mt-1">Results are best-effort. Review products in the catalog and replace anything that's wrong.</p>
              {fetchResult.errors?.length > 0 && (
                <ul className="mt-2 text-xs opacity-80 list-disc pl-4 space-y-0.5 max-h-32 overflow-y-auto">
                  {fetchResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      {syncResult && (
        <div className={`mb-4 p-4 rounded-2xl border-2 text-sm ${
          syncResult.error
            ? "border-red-300 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
            : "border-green-300 bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300"
        }`}>
          {syncResult.error ? (
            <p className="font-bold">{syncResult.error}</p>
          ) : (
            <>
              <p className="font-bold mb-1">Sync complete</p>
              <p>
                Scanned <strong>{syncResult.scanned}</strong> · Downloaded <strong>{syncResult.downloaded}</strong> · Already in library <strong>{syncResult.already_in_library}</strong> · Skipped <strong>{syncResult.skipped}</strong> · Failed <strong>{syncResult.failed}</strong>
              </p>
              {syncResult.errors?.length > 0 && (
                <ul className="mt-2 text-xs opacity-80 list-disc pl-4 space-y-0.5">
                  {syncResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => fileRef.current?.click()}
        className={[
          "border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors mb-6",
          dragOver
            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20"
            : "border-gray-300 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50/40 dark:hover:bg-indigo-900/10",
        ].join(" ")}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2 text-indigo-500">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-medium">Uploading…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <GalleryThumbnails size={32} className="opacity-40" />
            <p className="text-sm font-medium">Drop images here or click to browse</p>
            <p className="text-xs">JPG, PNG, WebP, GIF — up to 10 MB each — multiple files supported</p>
          </div>
        )}
      </div>

      {uploadErr && <p className="text-sm text-red-500 mb-4">{uploadErr}</p>}

      {/* Search + count */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by filename…"
            className="w-full pl-8 pr-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500" />
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{total} image{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Grid */}
      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-gray-400">
          <GalleryThumbnails size={40} className="opacity-25 mb-3" />
          <p className="text-sm">{search ? "No images match your search" : "No images yet — upload some above"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {items.map((item) => (
            <div key={item.id}
              className="group relative rounded-xl overflow-hidden border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-400 transition-all">
              <div className="aspect-square bg-gray-100 dark:bg-gray-700">
                <img src={imgUrl(item.id)} alt={item.name} loading="lazy"
                  className="w-full h-full object-cover" />
              </div>
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
              <button onClick={() => handleDelete(item)} disabled={deleting === item.id}
                className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-red-600 rounded-full items-center justify-center hidden group-hover:flex transition-colors">
                {deleting === item.id
                  ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Trash2 size={11} className="text-white" />}
              </button>
              <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="truncate">{item.name}</p>
                {item.size && <p className="text-white/70">{formatSize(item.size)}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button onClick={() => handlePageChange(page - 1)} disabled={page <= 1 || loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40">
            <ChevronDown size={15} className="rotate-90" />
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">{page} / {pages}</span>
          <button onClick={() => handlePageChange(page + 1)} disabled={page >= pages || loading}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40">
            <ChevronDown size={15} className="-rotate-90" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Recipes View ─────────────────────────────────────────────────────────────
const COMMON_UNITS = ["g", "kg", "ml", "L", "pcs", "cups", "tbsp", "tsp", "oz", "lb", "slice", "whole", "portion"];

function RecipeModal({ product, recipe, ingredientsCatalog = [], sourceStore = "kitchen", onSave, onClose }) {
  const empty = { id: crypto.randomUUID(), name: "", quantity: "", unit: "g", ingredient_id: "" };
  const [ingredients, setIngredients] = useState(
    recipe?.ingredients?.length
      ? recipe.ingredients.map((i) => ({
          ...i,
          quantity: String(i.quantity),
          ingredient_id: i.ingredient_id || i.product_id || "", // back-compat with old field
        }))
      : [{ ...empty }]
  );
  const [notes, setNotes]         = useState(recipe?.notes || "");
  const [prepTime, setPrepTime]   = useState(String(recipe?.prep_time || ""));
  const [servings, setServings]   = useState(String(recipe?.servings || "1"));
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  // Units come from the Products → Units catalog so all unit selectors
  // in the app stay in sync with what the venue actually uses. Falls
  // back to COMMON_UNITS for fresh installs that haven't created any
  // units yet.
  const [unitOptions, setUnitOptions] = useState(COMMON_UNITS);
  useEffect(() => {
    api.getUnits?.().then((units) => {
      const names = (units || []).map((u) => u.abbreviation || u.name).filter(Boolean);
      if (names.length) setUnitOptions(names);
    }).catch(() => {});
  }, []);

  const updateIng = (idx, key, val) => {
    setIngredients((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const next = { ...it, [key]: val };
      // When user picks an ingredient from the catalog, auto-fill its name + unit
      if (key === "ingredient_id" && val) {
        const found = ingredientsCatalog.find((x) => x.id === val);
        if (found) {
          next.name = found.name;
          if (found.unit) next.unit = found.unit;
        }
      }
      return next;
    }));
  };

  const addIng = () => setIngredients((prev) => [...prev, { ...empty, id: crypto.randomUUID() }]);
  const removeIng = (idx) => setIngredients((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    const filled = ingredients.filter((i) => i.name.trim() || i.ingredient_id);
    if (filled.length === 0) { setError("Add at least one ingredient."); return; }
    setSaving(true); setError("");
    try {
      await onSave({
        ingredients: filled.map((i) => ({
          id: i.id,
          name: i.name.trim(),
          quantity: parseFloat(i.quantity) || 0,
          unit: i.unit,
          ingredient_id: i.ingredient_id || null,
        })),
        notes,
        prep_time: parseInt(prepTime) || 0,
        servings: parseInt(servings) || 1,
      });
      onClose();
    } catch (e) { setError(e.message || "Failed to save."); }
    finally { setSaving(false); }
  };

  const inp = "w-full px-3 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-green-500";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
              <ChefHat size={18} className="text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">{recipe ? "Edit Recipe" : "Create Recipe"}</h3>
              <p className="text-xs text-gray-400 truncate max-w-xs">{product.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Meta row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Prep Time (min)</label>
              <input type="number" min="0" value={prepTime} onChange={(e) => setPrepTime(e.target.value)} className={inp} placeholder="e.g. 15" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Servings</label>
              <input type="number" min="1" value={servings} onChange={(e) => setServings(e.target.value)} className={inp} placeholder="1" />
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Ingredients
                <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${sourceStore === "bar" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"}`}>
                  from {sourceStore === "bar" ? "Bar Store" : "Kitchen Store"}
                </span>
              </label>
              <button type="button" onClick={addIng}
                className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors">
                <Plus size={12} /> Add
              </button>
            </div>
            {ingredientsCatalog.length === 0 && (
              <div className="mb-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-300">
                No ingredients available in the <strong>{sourceStore === "bar" ? "Bar" : "Kitchen"} Store</strong> yet.
                Transfer ingredients from the Main Store first, then add them here.
              </div>
            )}
            <div className="space-y-2">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_80px_90px_24px] gap-2 px-1">
                <span className="text-[10px] font-semibold text-gray-400 uppercase">Ingredient</span>
                <span className="text-[10px] font-semibold text-gray-400 uppercase">Qty</span>
                <span className="text-[10px] font-semibold text-gray-400 uppercase">Unit</span>
                <span />
              </div>
              {ingredients.map((ing, idx) => (
                <div key={ing.id} className="grid grid-cols-[1fr_80px_90px_24px] gap-2 items-center">
                  <select
                    value={ing.ingredient_id || ""}
                    onChange={(e) => updateIng(idx, "ingredient_id", e.target.value)}
                    className="px-2.5 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-green-500 truncate"
                  >
                    <option value="">— select ingredient —</option>
                    {ingredientsCatalog.map((it) => (
                      <option key={it.id} value={it.id}>{it.name}</option>
                    ))}
                    {/* Keep existing selection visible even if it's no longer in store */}
                    {ing.ingredient_id && !ingredientsCatalog.find((c) => c.id === ing.ingredient_id) && (
                      <option value={ing.ingredient_id}>{ing.name || "(unknown)"}</option>
                    )}
                  </select>
                  <input
                    type="number" min="0" step="0.01"
                    value={ing.quantity} onChange={(e) => updateIng(idx, "quantity", e.target.value)}
                    placeholder="0"
                    className="px-2.5 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-green-500 text-center"
                  />
                  <select value={ing.unit} onChange={(e) => updateIng(idx, "unit", e.target.value)}
                    className="px-2 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-green-500">
                    {unitOptions.map((u) => <option key={u}>{u}</option>)}
                    <option value={ing.unit && !unitOptions.includes(ing.unit) ? ing.unit : "custom"}>custom</option>
                  </select>
                  <button type="button" onClick={() => removeIng(idx)} disabled={ingredients.length === 1}
                    className="text-gray-300 hover:text-red-500 disabled:opacity-30 transition-colors">
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Preparation Notes</label>
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Cooking steps, tips, allergen info…"
              className={`${inp} resize-none`} />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : "Save Recipe"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecipesView() {
  const [products, setProducts]   = useState([]);
  const [recipes, setRecipes]     = useState({});   // keyed by product_id
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [categories, setCategories] = useState([]);
  const [ingredientsCatalog, setIngredientsCatalog] = useState([]);
  const [kitchenStock, setKitchenStock] = useState([]);
  const [barStock, setBarStock]         = useState([]);
  const [modal, setModal]         = useState(null);  // { product, recipe | null }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prods, cats, recs, ings, kStock, bStock] = await Promise.all([
        api.getProducts(),
        api.getGroups(),
        api.getRecipes(),
        api.getIngredients().catch(() => []),
        api.getStock(null, "kitchen").catch(() => []),
        api.getStock(null, "bar").catch(() => []),
      ]);
      setProducts(prods);
      setCategories(cats);
      setIngredientsCatalog(ings);
      setKitchenStock(kStock);
      setBarStock(bStock);
      const map = {};
      recs.forEach((r) => { map[r.product_id] = r; });
      setRecipes(map);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  // Build the ingredient subset for a given product: pulls from kitchen store
  // (food products) or bar store (drinks products) based on its category.
  const getIngredientsForProduct = (product) => {
    const cat = categories.find((c) => c.id === product.category_id);
    const mainCat = (cat?.main_category || "food").toLowerCase();
    const store = mainCat === "drinks" ? barStock : kitchenStock;
    const idsInStore = new Set(store.map((s) => s.ingredient_id));
    return ingredientsCatalog.filter((i) => idsInStore.has(i.id));
  };

  useEffect(() => { load(); }, [load]);

  const handleSave = async (productId, data) => {
    await api.upsertRecipe(productId, data);
    await load();
  };

  const handleDelete = async (productId) => {
    if (!window.confirm("Delete this recipe?")) return;
    await api.deleteRecipe(productId);
    await load();
  };

  const filtered = products.filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterCat && p.category_id !== filterCat) return false;
    return true;
  });

  const withRecipe    = filtered.filter((p) => recipes[p.id]);
  const withoutRecipe = filtered.filter((p) => !recipes[p.id]);

  return (
    <div>
      <SectionHeader
        title="Recipes"
        icon={<ChefHat size={20} className="text-green-600" />}
        iconBg="bg-green-100"
        action={
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {Object.keys(recipes).length} recipe{Object.keys(recipes).length !== 1 ? "s" : ""} of {products.length} products
          </span>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
            className="w-full pl-8 pr-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-green-500" />
        </div>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)}
          className="px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-green-500">
          <option value="">All Groups</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading ? <Spinner /> : (
        <div className="space-y-8">
          {/* Products with recipes */}
          {withRecipe.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">With Recipe ({withRecipe.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {withRecipe.map((p) => {
                  const recipe = recipes[p.id];
                  return (
                    <div key={p.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-green-200 dark:border-green-800 p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{p.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? "s" : ""}
                            {recipe.prep_time ? ` · ${recipe.prep_time} min` : ""}
                            {recipe.servings > 1 ? ` · ${recipe.servings} servings` : ""}
                          </p>
                        </div>
                        <span className="flex-shrink-0 w-6 h-6 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                          <ChefHat size={13} className="text-green-600 dark:text-green-400" />
                        </span>
                      </div>
                      {/* Ingredient preview */}
                      <div className="flex flex-wrap gap-1 mb-3">
                        {recipe.ingredients.slice(0, 4).map((ing) => (
                          <span key={ing.id} className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                            {ing.quantity > 0 ? `${ing.quantity}${ing.unit} ` : ""}{ing.name}
                          </span>
                        ))}
                        {recipe.ingredients.length > 4 && (
                          <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-400 rounded-full">
                            +{recipe.ingredients.length - 4} more
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setModal({ product: p, recipe })}
                          className="flex-1 py-1.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center gap-1">
                          <Pencil size={11} /> Edit
                        </button>
                        <button onClick={() => handleDelete(p.id)}
                          className="py-1.5 px-3 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-xs text-red-400 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Products without recipes */}
          {withoutRecipe.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">No Recipe Yet ({withoutRecipe.length})</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {withoutRecipe.map((p) => (
                  <div key={p.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-4 shadow-sm flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{p.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{categories.find((c) => c.id === p.category_id)?.name || "—"}</p>
                    </div>
                    <button onClick={() => setModal({ product: p, recipe: null })}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-900/30 border-2 border-green-200 dark:border-green-700 text-green-700 dark:text-green-400 rounded-xl text-xs font-semibold hover:bg-green-100 transition-colors">
                      <Plus size={12} /> Recipe
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-20 text-gray-400">
              <UtensilsCrossed size={40} className="opacity-25 mb-3" />
              <p className="text-sm">No products match your search</p>
            </div>
          )}
        </div>
      )}

      {modal && (
        <RecipeModal
          product={modal.product}
          recipe={modal.recipe}
          ingredientsCatalog={getIngredientsForProduct(modal.product)}
          sourceStore={(categories.find((c) => c.id === modal.product.category_id)?.main_category || "food").toLowerCase() === "drinks" ? "bar" : "kitchen"}
          onSave={(data) => handleSave(modal.product.id, data)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

// ─── Root Export ─────────────────────────────────────────────────────────────
export default function ProductsSection({ view = "all-products", onViewChange }) {
  switch (view) {
    case "all-products":   return <AllProductsView autoOpen={false} />;
    case "create-product": return <AllProductsView autoOpen={true} />;
    case "groups":         return <GroupsView />;
    case "brands":         return <BrandsView />;
    case "units":          return <UnitsView />;
    case "print-labels":   return <PrintLabelsView />;
    case "import":         return <ImportExportView />;
    case "image-library":  return <ImageLibraryView />;
    case "recipes":        return <RecipesView />;
    default:               return <AllProductsView autoOpen={false} />;
  }
}
