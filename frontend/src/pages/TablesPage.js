import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, Menu, Monitor, RefreshCw, Unlock, LockKeyhole, CheckCircle2, CalendarDays, Users, Clock, Pin, Building2, GitMerge } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBusinessConfig } from "../hooks/useBusinessConfig";
import Sidebar from "../components/Sidebar";
import TerminalSettingsModal from "../components/TerminalSettingsModal";
import { api } from "../lib/api";
import {
  cn, sortByTableNumber, canManageAnyTable,
  reservationUrgency, RESERVATION_URGENCY_COLORS, formatReservationDateTime,
} from "../lib/utils";

// ─── Transfer Modal ───────────────────────────────────────────────────────────
function TransferModal({ entityId, isBarTab, currentOwnerId, onClose, onTransferred }) {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getUsers()
      .then((list) => setUsers(list.filter((u) => u.active && u.id !== currentOwnerId)))
      .catch(() => setError("Could not load users"))
      .finally(() => setLoading(false));
  }, [currentOwnerId]);

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      if (isBarTab) {
        await api.transferBarTab(entityId, selected);
      } else {
        await api.transferTable(entityId, selected);
      }
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
          <h3 className="font-bold text-lg">Transfer {isBarTab ? "Bar Tab" : "Table"}</h3>
          <p className="text-white/75 text-sm mt-0.5">Assign to another staff member</p>
        </div>
        <div className="p-5">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-7 h-7 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
              {users.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-4">No other staff available</p>
              )}
              {users.map((u) => (
                <button key={u.id} onClick={() => setSelected(u.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all",
                    selected === u.id
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-900/30"
                      : "border-gray-200 dark:border-gray-600 hover:border-violet-300"
                  )}>
                  <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center font-bold text-violet-600 dark:text-violet-300 flex-shrink-0 text-sm">
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
            <button onClick={onClose}
              className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-2xl font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm">
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={!selected || saving}
              className="flex-[2] py-2.5 bg-violet-600 text-white rounded-2xl font-bold hover:bg-violet-700 disabled:opacity-40 transition-colors text-sm">
              {saving ? "Transferring…" : "Transfer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Merge Modal ─────────────────────────────────────────────────────────────
function MergeModal({ table, allTables, onClose, onMerged }) {
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const candidates = allTables.filter(
    (t) => t.id !== table.id && t.status === "occupied" && !t.merged_into
  );

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true); setError("");
    try {
      await api.mergeTable(table.id, selected);
      onMerged();
    } catch (err) {
      setError(err.message || "Merge failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-5 text-white">
          <h3 className="font-bold text-lg">Merge Table {table.number}</h3>
          <p className="text-white/75 text-sm mt-0.5">Combine with another occupied table for one bill</p>
        </div>
        <div className="p-5">
          <div className="space-y-2 max-h-64 overflow-y-auto mb-4">
            {candidates.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-4">No occupied tables available to merge</p>
            )}
            {candidates.map((t) => (
              <button key={t.id} onClick={() => setSelected(t.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all",
                  selected === t.id
                    ? "border-orange-500 bg-orange-50 dark:bg-orange-900/30"
                    : "border-gray-200 dark:border-gray-600 hover:border-orange-300"
                )}>
                <div className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center font-black text-orange-600 dark:text-orange-300 flex-shrink-0 text-sm">
                  {t.number}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">Table {t.number}</p>
                  <p className="text-xs text-gray-400">{t.waiter_name || "Occupied"}</p>
                </div>
                {selected === t.id && <CheckCircle2 size={16} className="ml-auto text-orange-500" />}
              </button>
            ))}
          </div>
          {error && <p className="text-red-500 text-xs mb-3">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-600 rounded-2xl font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm">
              Cancel
            </button>
            <button onClick={handleConfirm} disabled={!selected || saving}
              className="flex-[2] py-2.5 bg-orange-500 text-white rounded-2xl font-bold hover:bg-orange-600 disabled:opacity-40 transition-colors text-sm">
              {saving ? "Merging…" : "Merge Tables"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function fmt12(time24) {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function tableStatus(entity, userId, isBarTab, reservation) {
  if (entity.status === "occupied") {
    const ownerKey = isBarTab ? "staff_id" : "waiter_id";
    return String(entity[ownerKey]) === String(userId) ? "mine" : "occupied";
  }
  if (entity.status === "reserved") return "reserved";
  if (reservation) return "reserved";
  return "available";
}

// ─── Entity Card ──────────────────────────────────────────────────────────────
function EntityCard({ entity, userId, userRole, userPermissions, isBarTab, reservation, onClick, onRelease, onTransfer, onMerge, mergedWith, primaryTable }) {
  const status = tableStatus(entity, userId, isBarTab, reservation);
  // Any user holding a table-override permission is treated as privileged,
  // so a Floor Manager / Cashier with process_payment / close_order etc.
  // can act on other waiters' tables without role-level admin rights.
  const isPrivileged = canManageAnyTable({ role: userRole, permissions: userPermissions });
  const canRelease = isPrivileged || (status === "mine" && (userPermissions?.includes("release_tables") || userPermissions?.includes("manage_tables")));
  const canTransfer = isPrivileged || (status === "mine" && userPermissions?.includes("transfer_tables"));
  const canMerge = !isBarTab && (status === "mine" || (isPrivileged && status === "occupied")) && !entity.merged_into;
  const showActions = (status === "mine" || (isPrivileged && status === "occupied")) && (canRelease || canTransfer || canMerge);

  const styles = {
    available: { card: "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 hover:border-green-400 hover:shadow-green-100", icon: "bg-green-500", label: "text-green-700 dark:text-green-400" },
    mine:      { card: "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 hover:border-blue-400 hover:shadow-blue-100",    icon: "bg-blue-500",  label: "text-blue-700 dark:text-blue-400"  },
    occupied:  { card: "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 hover:border-red-400 hover:shadow-red-100",        icon: "bg-red-500",   label: "text-red-700 dark:text-red-400"   },
    reserved:  { card: "bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700 hover:border-purple-400",               icon: "bg-purple-500", label: "text-purple-700 dark:text-purple-400" },
  };
  const s = styles[status];
  const Icon = status === "available" ? Unlock : LockKeyhole;
  const ownerName = isBarTab ? entity.staff_name : entity.waiter_name;
  const statusLabel =
    status === "mine" ? (isBarTab ? "Your Bar Tab" : "Your Table") :
    status === "available" ? "Available" :
    status === "occupied" ? "Occupied" : "Reserved";

  const urgencyColor = status === "reserved" && reservation
    ? RESERVATION_URGENCY_COLORS[reservationUrgency(reservation.date, reservation.time)]
    : null;
  // A reservation that's been seated flips the table to occupied/mine, but the
  // reservation record still comes through (reservationMap keeps "seated"
  // reservations too) — surface that link so staff can tell this occupied
  // table originated from a reservation rather than a walk-in.
  const seatedFromReservation = (status === "occupied" || status === "mine") && !!reservation;

  return (
    <div className={cn("relative rounded-3xl border-2 p-5 flex flex-col items-center gap-2 transition-all duration-200 hover:shadow-lg w-full", s.card)}>
      {urgencyColor && (
        <span
          title={formatReservationDateTime(reservation.date, reservation.time)}
          className={cn("absolute top-3 right-3 w-2.5 h-2.5 rounded-full cursor-default", urgencyColor.dot)}
        />
      )}
      {seatedFromReservation && (
        <span
          title={`Seated from reservation: ${reservation.customer_name} · ${fmt12(reservation.time)}`}
          className="absolute top-3 right-3 flex items-center justify-center w-5 h-5 rounded-full bg-purple-500 shadow-sm cursor-default"
        >
          <CalendarDays size={11} strokeWidth={2.5} className="text-white" />
        </span>
      )}
      {/* Clickable top area */}
      <button onClick={() => onClick(entity)} className="w-full flex flex-col items-center gap-2 active:scale-95">
        <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm", s.icon)}>
          {status === "reserved" && reservation
            ? <CalendarDays size={24} className="text-white" strokeWidth={2} />
            : <Icon size={24} className="text-white" strokeWidth={2} />
          }
        </div>
        <p className={cn("text-2xl font-black", s.label)}>{entity.number}</p>
        <p className={cn("text-xs font-bold uppercase tracking-wider", s.label)}>{statusLabel}</p>
        {entity.seats && <p className="text-xs text-gray-400 dark:text-gray-500">{entity.seats} seats</p>}

        {/* Reservation info */}
        {status === "reserved" && reservation && (
          <div className="w-full mt-1 bg-purple-100 dark:bg-purple-900/40 rounded-xl px-2.5 py-2 space-y-0.5">
            <p className="text-[11px] font-black text-purple-800 dark:text-purple-200 truncate">{reservation.customer_name}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {reservation.date !== new Date().toISOString().slice(0, 10) && (
                <span className="flex items-center gap-0.5 text-[10px] text-purple-600 dark:text-purple-300 font-semibold">
                  <CalendarDays size={9} /> {reservation.date}
                </span>
              )}
              <span className="flex items-center gap-0.5 text-[10px] text-purple-600 dark:text-purple-300 font-semibold">
                <Clock size={9} /> {fmt12(reservation.time)}
              </span>
              <span className="flex items-center gap-0.5 text-[10px] text-purple-600 dark:text-purple-300 font-semibold">
                <Users size={9} /> {reservation.party_size}
              </span>
            </div>
          </div>
        )}

        {(status === "occupied" || status === "mine") && (
          <span className={`flex items-center gap-1 text-[11px] font-bold truncate max-w-full px-2 py-0.5 rounded-full ${
            status === "mine"
              ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300"
              : "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300"
          }`}>
            {seatedFromReservation && <CalendarDays size={10} className="shrink-0" />}
            {ownerName || (status === "mine" ? "You" : "Occupied")}
          </span>
        )}
        {/* Merged indicator */}
        {entity.merged_into && primaryTable && (
          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300">
            <GitMerge size={10} /> Merged → T{primaryTable.number}
          </span>
        )}
        {mergedWith?.length > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300">
            <GitMerge size={10} /> +{mergedWith.map(t => `T${t.number}`).join(", ")}
          </span>
        )}
      </button>

      {/* Release + Transfer + Merge buttons */}
      {showActions && (
        <div className="flex flex-col gap-1.5 w-full mt-1">
          {(canRelease || canTransfer) && (
            <div className="flex gap-2">
              {canRelease && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRelease(entity); }}
                  className="flex-1 py-1.5 rounded-xl border-2 border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                >
                  Release
                </button>
              )}
              {canTransfer && (
                <button
                  onClick={(e) => { e.stopPropagation(); onTransfer(entity); }}
                  className="flex-1 py-1.5 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition-colors flex items-center justify-center gap-1"
                >
                  <ArrowLeftRight size={11} />
                  <span className="truncate">Move</span>
                </button>
              )}
            </div>
          )}
          {canMerge && (
            <button
              onClick={(e) => { e.stopPropagation(); onMerge(entity); }}
              className="w-full py-1.5 rounded-xl bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 transition-colors flex items-center justify-center gap-1"
            >
              <GitMerge size={11} />
              <span>Merge Tables</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TablesPage() {
  const { user } = useAuth();
  const config = useBusinessConfig();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("table");
  const [tables, setTables] = useState([]);
  const [barTabs, setBarTabs] = useState([]);
  const [floors, setFloors] = useState([]);
  const [activeFloorId, setActiveFloorId] = useState(null);
  const [defaultFloorId, setDefaultFloorId] = useState(null);
  const [reservationMap, setReservationMap] = useState({}); // table_id → reservation
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
  const [mergeTarget, setMergeTarget] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showTerminalModal, setShowTerminalModal] = useState(false);
  const [terminals, setTerminals] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [selectedTerminal, setSelectedTerminal] = useState(
    () => localStorage.getItem("pos_terminal") || ""
  );
  const [selectedOutlet, setSelectedOutlet] = useState(
    () => localStorage.getItem("pos_outlet") || ""
  );

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async (silent = false) => {
    // Don't gate the UI on the network — if we already have data
    // (SW cache, prior poll), keep showing it. The 'loading' spinner
    // only shows on the truly empty first paint, so a slow Render
    // cold start doesn't leave the user staring at a blank page.
    if (!silent) setLoading((prev) => (prev || tables.length === 0));
    try {
      const [t, b, upcoming, f] = await Promise.all([
        api.getTables(),
        api.getBarTabs(),
        api.getUpcomingReservations().catch(() => []),
        api.getFloors().catch(() => []),
      ]);
      setTables(t);
      setBarTabs(b);
      setFloors(f);
      const map = {};
      for (const r of upcoming) {
        if (!map[r.table_id]) map[r.table_id] = r;
      }
      setReservationMap(map);
    } catch {
      if (tables.length === 0) showToast("Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }, [tables.length]);

  const outletFloors = floors.filter((f) => !selectedOutlet || f.outlet_id === selectedOutlet);

  const defaultStorageKey = `pos_default_floor_${selectedOutlet || "all"}`;

  // Auto-select floor: prefer saved default, then current active if still valid, then first
  useEffect(() => {
    if (outletFloors.length === 0) { setActiveFloorId(null); return; }
    const saved = localStorage.getItem(defaultStorageKey);
    setDefaultFloorId(saved || null);
    setActiveFloorId((prev) => {
      if (saved && outletFloors.some((f) => f.id === saved)) return saved;
      if (prev && outletFloors.some((f) => f.id === prev)) return prev;
      return outletFloors[0].id;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floors, selectedOutlet]);

  const handleSetDefault = (floorId) => {
    localStorage.setItem(defaultStorageKey, floorId);
    setDefaultFloorId(floorId);
    setActiveFloorId(floorId);
    showToast(`${outletFloors.find((f) => f.id === floorId)?.name} set as default floor`);
  };

  useEffect(() => {
    load();
    Promise.all([api.getTerminals(), api.getOutlets()])
      .then(([t, o]) => { setTerminals(t); setOutlets(o); })
      .catch(console.error);
    // Keep printer cache fresh so printService works without opening Terminal Settings
    api.getAssignedPrinters().then((printers) => {
      if (printers.length > 0) localStorage.setItem("pos_saved_printers", JSON.stringify(printers));
    }).catch(() => {});
    const interval = setInterval(() => load(true), 30000);
    return () => clearInterval(interval);
  }, [load]);

  const handleEntityClick = (entity, isBarTab) => {
    const isPrivileged = canManageAnyTable(user);
    if (!isPrivileged && entity.status === "occupied") {
      const ownerKey = isBarTab ? "staff_id" : "waiter_id";
      if (entity[ownerKey] !== user?.id) {
        const ownerName = isBarTab ? entity.staff_name : entity.waiter_name;
        showToast(`This ${isBarTab ? "bar tab" : "table"} is assigned to ${ownerName || "another staff member"}`, "error");
        return;
      }
    }
    navigate(isBarTab ? `/bar-tab/${entity.id}` : `/table/${entity.id}`);
  };

  const handleRelease = async (entity, isBarTab) => {
    try {
      if (isBarTab) {
        await api.releaseBarTab(entity.id);
      } else {
        await api.releaseTable(entity.id);
      }
      showToast(`${isBarTab ? "Bar tab" : "Table"} ${entity.number} released`);
      load(true);
    } catch (err) {
      showToast(err.message || "Failed to release", "error");
    }
  };

  const handleSelectOutlet = (outletId) => {
    setSelectedOutlet(outletId);
    localStorage.setItem("pos_outlet", outletId);
    setActiveFloorId(null);
  };

  const isBarTabView = activeTab === "bartab";
  const hasFloors = !isBarTabView && outletFloors.length > 0;

  // Tables across all outlets come back together — scope to the selected
  // outlet so a multi-outlet business doesn't briefly show every outlet's
  // tables side-by-side.
  const allTables = (activeTab === "table" ? tables : barTabs)
    .filter((t) => !selectedOutlet || !t.outlet_id || t.outlet_id === selectedOutlet);

  // Derive the effective floor synchronously so we never paint the
  // unfiltered superset between floors loading and the activeFloorId
  // effect running — that one-frame flash was the "tables duplicating"
  // glitch on outlets with more than one floor.
  const effectiveFloorId = activeFloorId
    || (hasFloors ? (outletFloors.find((f) => f.id === localStorage.getItem(defaultStorageKey))?.id || outletFloors[0].id) : null);

  // Sort numerically by .number so T2 comes before T19 (not after). Only
  // apply to table view — bar tabs are normally short, custom names.
  const filteredEntities = hasFloors && effectiveFloorId
    ? allTables.filter((t) => t.floor_id === effectiveFloorId)
    : allTables;
  const entities = isBarTabView ? filteredEntities : sortByTableNumber(filteredEntities);

  const available = entities.filter((e) => !e.status || e.status === "available").length;
  const occupied = entities.filter((e) => e.status === "occupied").length;

  return (
    <div className="flex h-screen bg-[#111827] overflow-hidden">
      <Sidebar
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        onSettingsClick={() => setShowTerminalModal(true)}
        sidebarMiddle={outlets.length > 1 ? (collapsed) => (
          <div className="pt-3">
            {!collapsed && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-600 px-3 mb-1.5">
                Outlet
              </p>
            )}
            <div className="space-y-0.5">
              {outlets.map((o) => {
                const active = selectedOutlet === o.id;
                return (
                  <button
                    key={o.id}
                    onClick={() => handleSelectOutlet(o.id)}
                    title={collapsed ? o.name : undefined}
                    className={cn(
                      "w-full flex items-center rounded-xl text-sm font-medium transition-all duration-150",
                      collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                      active
                        ? "bg-blue-600/20 text-blue-400"
                        : "text-gray-400 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    <Building2
                      size={17}
                      className={active ? "text-blue-400" : "text-gray-500"}
                      strokeWidth={active ? 2.5 : 2}
                    />
                    {!collapsed && <span className="truncate">{o.name}</span>}
                    {!collapsed && active && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      />

      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900 min-w-0">
        <div className={`h-1 bg-gradient-to-r ${config.headerBg} flex-shrink-0`} />
        <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden flex items-center justify-center w-10 h-10 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex-shrink-0"
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0">
              <h1 className="font-black text-gray-900 dark:text-white text-lg tracking-tight truncate">
                {activeTab === "table" ? "Tables" : "Bar Tabs"}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {entities.length} total · {available} available · {occupied} occupied
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
              {[["table", "Table"], ["bartab", "Bar Tab"]].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => { setActiveTab(id); setActiveFloorId(outletFloors[0]?.id ?? null); }}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-sm font-bold transition-all",
                    activeTab === id
                      ? "bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => load(true)}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center gap-5 mb-4 flex-wrap">
            {[
              { label: "Available", color: "bg-green-400" },
              { label: activeTab === "table" ? "Your Tables" : "Your Bar Tabs", color: "bg-blue-400" },
              { label: "Occupied", color: "bg-red-400" },
              { label: "Reserved", color: "bg-purple-400" },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-2">
                <div className={cn("w-3.5 h-3.5 rounded-full", color)} />
                <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">{label}</span>
              </div>
            ))}
          </div>

          {/* Floor filter tabs — only shown in table view when floors exist */}
          {hasFloors && (
            <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
              {outletFloors.map((floor) => {
                const count = allTables.filter((t) => t.floor_id === floor.id).length;
                const isActive = effectiveFloorId === floor.id;
                const isDefault = defaultFloorId === floor.id;
                return (
                  <div key={floor.id} className="relative flex items-center flex-shrink-0">
                    <button
                      onClick={() => setActiveFloorId(floor.id)}
                      className={cn(
                        "pl-4 pr-8 py-1.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all border-2",
                        isActive
                          ? "bg-white dark:bg-gray-700 border-blue-500 text-blue-600 dark:text-blue-400 shadow-sm"
                          : "bg-gray-100 dark:bg-gray-800 border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300"
                      )}>
                      {floor.name} ({count})
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSetDefault(floor.id); }}
                      title={isDefault ? "Default floor" : "Set as default floor"}
                      className={cn(
                        "absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded transition-colors",
                        isDefault
                          ? "text-blue-500 dark:text-blue-400"
                          : "text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400"
                      )}>
                      <Pin size={11} fill={isDefault ? "currentColor" : "none"} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : entities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-3xl flex items-center justify-center mb-4">
                <Monitor size={40} className="text-gray-300 dark:text-gray-600" />
              </div>
              <p className="font-bold text-gray-500 text-lg">
                No {activeTab === "table" ? "tables" : "bar tabs"} configured
              </p>
              <p className="text-sm text-gray-400 mt-1">
                Ask your admin to add {activeTab === "table" ? "tables" : "bar tabs"} in Admin → Floor Management
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
              {entities.map((entity) => (
                <EntityCard
                  key={entity.id}
                  entity={entity}
                  userId={user?.id}
                  userRole={user?.role}
                  userPermissions={user?.permissions}
                  isBarTab={isBarTabView}
                  reservation={!isBarTabView ? reservationMap[entity.id] : null}
                  onClick={(e) => handleEntityClick(e, isBarTabView)}
                  onRelease={(e) => handleRelease(e, isBarTabView)}
                  onTransfer={(e) => setTransferTarget({ entity: e, isBarTab: isBarTabView })}
                  onMerge={(e) => setMergeTarget(e)}
                  mergedWith={tables.filter(t => t.merged_into === entity.id)}
                  primaryTable={entity.merged_into ? tables.find(t => t.id === entity.merged_into) : null}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Transfer modal */}
      {transferTarget && (
        <TransferModal
          entityId={transferTarget.entity.id}
          isBarTab={transferTarget.isBarTab}
          currentOwnerId={transferTarget.isBarTab ? transferTarget.entity.staff_id : transferTarget.entity.waiter_id}
          onClose={() => setTransferTarget(null)}
          onTransferred={() => {
            setTransferTarget(null);
            showToast("Transferred successfully");
            load(true);
          }}
        />
      )}

      {/* Merge modal */}
      {mergeTarget && (
        <MergeModal
          table={mergeTarget}
          allTables={tables}
          onClose={() => setMergeTarget(null)}
          onMerged={() => {
            setMergeTarget(null);
            showToast(`Table ${mergeTarget.number} merged successfully`);
            load(true);
          }}
        />
      )}

      {toast && (
        <div className={cn(
          "fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl shadow-lg text-sm font-semibold z-50 whitespace-nowrap",
          toast.type === "error" ? "bg-red-600 text-white" : "bg-gray-900 text-white"
        )}>
          {toast.msg}
        </div>
      )}

      {showTerminalModal && (
        <TerminalSettingsModal
          terminals={terminals}
          outlets={outlets}
          selectedTerminal={selectedTerminal}
          selectedOutlet={selectedOutlet}
          onSave={(term, out) => {
            const name = terminals.find((t) => t.id === term)?.name || "";
            setSelectedTerminal(term);
            setSelectedOutlet(out);
            localStorage.setItem("pos_terminal", term);
            localStorage.setItem("pos_outlet", out);
            localStorage.setItem("pos_terminal_name", name);
            setShowTerminalModal(false);
          }}
          onClose={() => setShowTerminalModal(false)}
        />
      )}
    </div>
  );
}
