import React, { useEffect, useState, useCallback } from "react";
import {
  CalendarDays, ChevronDown, Clock, Phone, Mail, Users, Plus, Pencil,
  Trash2, X, CheckCircle2, XCircle, UserCheck, AlertCircle, Search,
} from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_META = {
  confirmed:  { label: "Confirmed",  color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",    dot: "bg-blue-500"   },
  seated:     { label: "Seated",     color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", dot: "bg-green-500"  },
  cancelled:  { label: "Cancelled",  color: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",        dot: "bg-gray-400"   },
  no_show:    { label: "No-show",    color: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",         dot: "bg-red-500"    },
};

function fmt12(time24) {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Reservation Modal ────────────────────────────────────────────────────────
function ReservationModal({ reservation, tables, outlets, onClose, onSave }) {
  const isEdit = !!reservation;
  const defaultOutlet = outlets[0]?.id || "";
  const outletTables = (outletId) => tables.filter((t) => t.outlet_id === outletId);

  const [form, setForm] = useState({
    table_id: reservation?.table_id || "",
    table_number: reservation?.table_number || "",
    outlet_id: reservation?.outlet_id || defaultOutlet,
    customer_name: reservation?.customer_name || "",
    customer_phone: reservation?.customer_phone || "",
    customer_email: reservation?.customer_email || "",
    party_size: reservation?.party_size || 2,
    date: reservation?.date || todayISO(),
    time: reservation?.time || "19:00",
    duration: reservation?.duration || 90,
    notes: reservation?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filteredTables = outletTables(form.outlet_id);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleTableChange = (tableId) => {
    const tbl = tables.find((t) => t.id === tableId);
    set("table_id", tableId);
    set("table_number", tbl?.number || "");
  };

  const handleOutletChange = (outletId) => {
    set("outlet_id", outletId);
    set("table_id", "");
    set("table_number", "");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.table_id) { setError("Please select a table"); return; }
    if (!form.customer_name.trim()) { setError("Customer name is required"); return; }
    setSaving(true); setError("");
    try {
      if (isEdit) {
        await api.updateReservation(reservation.id, form);
      } else {
        await api.createReservation(form);
      }
      onSave();
    } catch (err) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="bg-gradient-to-r from-purple-600 to-violet-600 p-5 text-white rounded-t-3xl">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-black text-lg">{isEdit ? "Edit Reservation" : "New Reservation"}</h3>
              <p className="text-white/70 text-sm">Fill in the booking details below</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Outlet + Table */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Outlet</label>
              <div className="relative">
                <select
                  value={form.outlet_id}
                  onChange={(e) => handleOutletChange(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-purple-500 appearance-none"
                >
                  {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Table *</label>
              <div className="relative">
                <select
                  value={form.table_id}
                  onChange={(e) => handleTableChange(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-purple-500 appearance-none"
                >
                  <option value="">Select table…</option>
                  {filteredTables.map((t) => (
                    <option key={t.id} value={t.id}>Table {t.number} ({t.seats} seats)</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Customer name */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Customer Name *</label>
            <input
              required
              value={form.customer_name}
              onChange={(e) => set("customer_name", e.target.value)}
              placeholder="Full name"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-purple-500 dark:placeholder-gray-500"
            />
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Phone</label>
              <input
                type="tel"
                value={form.customer_phone}
                onChange={(e) => set("customer_phone", e.target.value)}
                placeholder="+1 234 567 8900"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-purple-500 dark:placeholder-gray-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Email</label>
              <input
                type="email"
                value={form.customer_email}
                onChange={(e) => set("customer_email", e.target.value)}
                placeholder="customer@email.com"
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-purple-500 dark:placeholder-gray-500"
              />
            </div>
          </div>

          {/* Date + Time + Party Size + Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Date *</label>
              <input
                required
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Time *</label>
              <input
                required
                type="time"
                value={form.time}
                onChange={(e) => set("time", e.target.value)}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Party Size</label>
              <div className="flex items-center border-2 border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden">
                <button type="button" onClick={() => set("party_size", Math.max(1, form.party_size - 1))}
                  className="px-3 py-2.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 font-bold transition-colors text-sm">−</button>
                <span className="flex-1 text-center font-black text-gray-900 dark:text-white text-sm">{form.party_size}</span>
                <button type="button" onClick={() => set("party_size", Math.min(50, form.party_size + 1))}
                  className="px-3 py-2.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 font-bold transition-colors text-sm">+</button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Duration (min)</label>
              <div className="relative">
                <select
                  value={form.duration}
                  onChange={(e) => set("duration", parseInt(e.target.value))}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-purple-500 appearance-none"
                >
                  {[30, 45, 60, 90, 120, 150, 180].map((d) => (
                    <option key={d} value={d}>{d >= 60 ? `${d / 60}h${d % 60 ? ` ${d % 60}m` : ""}` : `${d}m`}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Special requests, allergies, occasion…"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-sm bg-white dark:bg-gray-700 dark:text-white focus:outline-none focus:border-purple-500 resize-none dark:placeholder-gray-500"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 rounded-xl px-3 py-2.5 text-sm">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-[2] py-2.5 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Reservation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Reservation Card ─────────────────────────────────────────────────────────
function ReservationCard({ res, onEdit, onStatusChange, onDelete }) {
  const meta = STATUS_META[res.status] || STATUS_META.confirmed;
  const isActive = res.status === "confirmed" || res.status === "seated";

  return (
    <div className={cn(
      "bg-white dark:bg-gray-800 border-2 rounded-2xl p-4 transition-all",
      res.status === "confirmed" ? "border-purple-200 dark:border-purple-700/50" :
      res.status === "seated"    ? "border-green-200 dark:border-green-700/50" :
      "border-gray-200 dark:border-gray-700 opacity-70"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold", meta.color)}>
              <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
              {meta.label}
            </span>
            <span className="text-[11px] font-bold text-gray-400">Table {res.table_number}</span>
          </div>

          <p className="font-black text-gray-900 dark:text-white text-base leading-tight truncate">{res.customer_name}</p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Clock size={11} />
              {fmt12(res.time)} · {res.duration >= 60 ? `${res.duration / 60}h${res.duration % 60 ? `${res.duration % 60}m` : ""}` : `${res.duration}m`}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Users size={11} />
              {res.party_size} {res.party_size === 1 ? "guest" : "guests"}
            </span>
            {res.customer_phone && (
              <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <Phone size={11} />
                {res.customer_phone}
              </span>
            )}
          </div>

          {res.notes && (
            <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500 italic truncate">"{res.notes}"</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5 flex-shrink-0">
          <button onClick={() => onEdit(res)} title="Edit"
            className="w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-600 text-gray-400 hover:text-blue-600 hover:border-blue-300 transition-colors">
            <Pencil size={13} />
          </button>
          {res.status === "confirmed" && (
            <button onClick={() => onStatusChange(res.id, "seated")} title="Mark as Seated"
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-green-200 dark:border-green-700 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
              <UserCheck size={13} />
            </button>
          )}
          {isActive && (
            <button onClick={() => onStatusChange(res.id, "no_show")} title="Mark as No-show"
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-orange-200 dark:border-orange-700 text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors">
              <XCircle size={13} />
            </button>
          )}
          {isActive && (
            <button onClick={() => onStatusChange(res.id, "cancelled")} title="Cancel reservation"
              className="w-8 h-8 flex items-center justify-center rounded-xl border border-red-200 dark:border-red-700 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              <X size={13} />
            </button>
          )}
          <button onClick={() => onDelete(res)} title="Delete"
            className="w-8 h-8 flex items-center justify-center rounded-xl border border-gray-200 dark:border-gray-600 text-gray-300 hover:text-red-500 hover:border-red-300 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Section ─────────────────────────────────────────────────────────────
export default function ReservationsSection() {
  const [reservations, setReservations] = useState([]);
  const [tables, setTables] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayISO());
  const [selectedOutlet, setSelectedOutlet] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      // No date filter = show all; date set = filter to that day
      const filters = {};
      if (date) filters.date = date;
      if (selectedOutlet) filters.outlet_id = selectedOutlet;
      const [res, tbl, out] = await Promise.all([
        api.getReservations(filters),
        api.getTables(),
        api.getOutlets(),
      ]);
      setReservations(res);
      setTables(tbl);
      setOutlets(out);
    } catch (err) {
      setLoadError(err.message || "Failed to load reservations");
    } finally {
      setLoading(false);
    }
  }, [date, selectedOutlet]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (id, newStatus) => {
    try {
      await api.updateReservation(id, { status: newStatus });
      setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status: newStatus } : r));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (res) => {
    if (!window.confirm(`Delete reservation for ${res.customer_name}?`)) return;
    try {
      await api.deleteReservation(res.id);
      setReservations((prev) => prev.filter((r) => r.id !== res.id));
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSaved = () => {
    setModal(null);
    load();
  };

  const filtered = reservations.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.customer_name.toLowerCase().includes(q) ||
        (r.customer_phone || "").includes(q) ||
        r.table_number.toLowerCase().includes(q);
    }
    return true;
  });

  // Stats
  const counts = reservations.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const totalGuests = reservations
    .filter((r) => r.status === "confirmed" || r.status === "seated")
    .reduce((s, r) => s + r.party_size, 0);

  const STATUS_TABS = [
    { id: "all",       label: "All",       count: reservations.length },
    { id: "confirmed", label: "Confirmed", count: counts.confirmed || 0 },
    { id: "seated",    label: "Seated",    count: counts.seated || 0 },
    { id: "cancelled", label: "Cancelled", count: counts.cancelled || 0 },
    { id: "no_show",   label: "No-show",   count: counts.no_show || 0 },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Reservations</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            {filtered.length} booking{filtered.length !== 1 ? "s" : ""} · {totalGuests} guests expected
          </p>
        </div>
        <button
          onClick={() => setModal({ mode: "add" })}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl font-semibold text-sm hover:bg-purple-700 transition-colors"
        >
          <Plus size={16} /> New Reservation
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: "Confirmed", value: counts.confirmed || 0, color: "text-blue-600 dark:text-blue-400",  bg: "bg-blue-50 dark:bg-blue-900/20" },
          { label: "Seated",    value: counts.seated || 0,    color: "text-green-600 dark:text-green-400", bg: "bg-green-50 dark:bg-green-900/20" },
          { label: "No-show",   value: counts.no_show || 0,   color: "text-red-600 dark:text-red-400",     bg: "bg-red-50 dark:bg-red-900/20" },
          { label: "Guests",    value: totalGuests,            color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/20" },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className={cn("rounded-2xl p-4", bg)}>
            <p className={cn("text-2xl font-black", color)}>{value}</p>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        {/* Date */}
        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
          <CalendarDays size={15} className="text-gray-400" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-sm bg-transparent text-gray-700 dark:text-gray-200 focus:outline-none"
          />
        </div>

        {/* Outlet */}
        {outlets.length > 1 && (
          <div className="relative">
            <select
              value={selectedOutlet}
              onChange={(e) => setSelectedOutlet(e.target.value)}
              className="pl-3 pr-8 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-white rounded-xl text-sm focus:outline-none appearance-none"
            >
              <option value="">All Outlets</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-2 flex-1 min-w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
          <Search size={14} className="text-gray-400 flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, table…"
            className="flex-1 text-sm bg-transparent text-gray-700 dark:text-gray-200 focus:outline-none dark:placeholder-gray-500"
          />
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 mb-5 overflow-x-auto">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={cn(
              "flex-shrink-0 px-3.5 py-2 rounded-xl text-sm font-bold transition-all",
              statusFilter === tab.id
                ? "bg-purple-600 text-white shadow-sm"
                : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-purple-300"
            )}
          >
            {tab.label}
            <span className={cn(
              "ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-black",
              statusFilter === tab.id ? "bg-white/20" : "bg-gray-100 dark:bg-gray-700"
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Load error */}
      {loadError && (
        <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-600 dark:text-red-400 rounded-xl px-4 py-3 mb-4 text-sm">
          <AlertCircle size={15} className="flex-shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <CalendarDays size={48} className="text-gray-200 dark:text-gray-700 mb-4" />
          <p className="font-bold text-gray-500 dark:text-gray-400">No reservations{date ? ` for ${date}` : ""}</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            {search ? "Try a different search" :
             date ? <span>Try a different date or <button onClick={() => setDate("")} className="text-purple-500 underline">clear the date filter</button></span> :
             "Create one with the button above"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((res) => (
            <ReservationCard
              key={res.id}
              res={res}
              onEdit={(r) => setModal({ mode: "edit", reservation: r })}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <ReservationModal
          reservation={modal.mode === "edit" ? modal.reservation : null}
          tables={tables}
          outlets={outlets}
          onClose={() => setModal(null)}
          onSave={handleSaved}
        />
      )}
    </div>
  );
}
