import React, { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, Menu, Monitor, RefreshCw, Unlock, LockKeyhole, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import TerminalSettingsModal from "../components/TerminalSettingsModal";
import { api } from "../lib/api";
import { cn } from "../lib/utils";

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

// ─── Status helpers ───────────────────────────────────────────────────────────
function tableStatus(entity, userId, isBarTab) {
  if (entity.status === "occupied") {
    const ownerKey = isBarTab ? "staff_id" : "waiter_id";
    return String(entity[ownerKey]) === String(userId) ? "mine" : "occupied";
  }
  if (entity.status === "reserved") return "reserved";
  return "available";
}

// ─── Entity Card ──────────────────────────────────────────────────────────────
function EntityCard({ entity, userId, userRole, userPermissions, isBarTab, onClick, onRelease, onTransfer }) {
  const status = tableStatus(entity, userId, isBarTab);
  const isPrivileged = ["admin", "manager"].includes(userRole);
  const canRelease = isPrivileged || (status === "mine" && (userPermissions?.includes("release_tables") || userPermissions?.includes("manage_tables")));
  const canTransfer = isPrivileged || (status === "mine" && userPermissions?.includes("transfer_tables"));
  const showActions = (status === "mine" || (isPrivileged && status === "occupied")) && (canRelease || canTransfer);

  const styles = {
    available: { card: "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 hover:border-green-400 hover:shadow-green-100", icon: "bg-green-500", label: "text-green-700 dark:text-green-400" },
    mine:      { card: "bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 hover:border-blue-400 hover:shadow-blue-100",    icon: "bg-blue-500",  label: "text-blue-700 dark:text-blue-400"  },
    occupied:  { card: "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 hover:border-red-400 hover:shadow-red-100",        icon: "bg-red-500",   label: "text-red-700 dark:text-red-400"   },
    reserved:  { card: "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700",                                         icon: "bg-yellow-500",label: "text-yellow-700 dark:text-yellow-400"},
  };
  const s = styles[status];
  const Icon = status === "available" ? Unlock : LockKeyhole;
  const ownerName = isBarTab ? entity.staff_name : entity.waiter_name;
  const statusLabel =
    status === "mine" ? (isBarTab ? "Your Bar Tab" : "Your Table") :
    status === "available" ? "Available" :
    status === "occupied" ? "Occupied" : "Reserved";

  return (
    <div className={cn("rounded-3xl border-2 p-5 flex flex-col items-center gap-2 transition-all duration-200 hover:shadow-lg w-full", s.card)}>
      {/* Clickable top area */}
      <button onClick={() => onClick(entity)} className="w-full flex flex-col items-center gap-2 active:scale-95">
        <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm", s.icon)}>
          <Icon size={24} className="text-white" strokeWidth={2} />
        </div>
        <p className={cn("text-2xl font-black", s.label)}>{entity.number}</p>
        <p className={cn("text-xs font-bold uppercase tracking-wider", s.label)}>{statusLabel}</p>
        {entity.seats && <p className="text-xs text-gray-400 dark:text-gray-500">{entity.seats} seats</p>}
        {(status === "occupied" || status === "mine") && ownerName && (
          <span className="text-[10px] text-red-400 font-semibold truncate max-w-full px-1">{ownerName}</span>
        )}
      </button>

      {/* Release + Transfer buttons */}
      {showActions && (
        <div className="flex gap-2 w-full mt-1">
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
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TablesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("table");
  const [tables, setTables] = useState([]);
  const [barTabs, setBarTabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
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
    if (!silent) setLoading(true);
    try {
      const [t, b] = await Promise.all([api.getTables(), api.getBarTabs()]);
      setTables(t);
      setBarTabs(b);
    } catch {
      showToast("Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    Promise.all([api.getTerminals(), api.getOutlets()])
      .then(([t, o]) => { setTerminals(t); setOutlets(o); })
      .catch(console.error);
    const interval = setInterval(() => load(true), 30000);
    return () => clearInterval(interval);
  }, [load]);

  const handleEntityClick = (entity, isBarTab) => {
    const isPrivileged = ["admin", "manager"].includes(user?.role);
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

  const entities = activeTab === "table" ? tables : barTabs;
  const isBarTabView = activeTab === "bartab";
  const available = entities.filter((e) => !e.status || e.status === "available").length;
  const occupied = entities.filter((e) => e.status === "occupied").length;

  return (
    <div className="flex h-screen bg-[#111827] overflow-hidden">
      <Sidebar
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
        onSettingsClick={() => setShowTerminalModal(true)}
      />

      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900 min-w-0">
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
                  onClick={() => setActiveTab(id)}
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
          <div className="flex items-center gap-5 mb-6">
            {[
              { label: "Available", color: "bg-green-400" },
              { label: activeTab === "table" ? "Your Tables" : "Your Bar Tabs", color: "bg-blue-400" },
              { label: "Occupied", color: "bg-red-400" },
            ].map(({ label, color }) => (
              <div key={label} className="flex items-center gap-2">
                <div className={cn("w-3.5 h-3.5 rounded-full", color)} />
                <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">{label}</span>
              </div>
            ))}
          </div>

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
                  onClick={(e) => handleEntityClick(e, isBarTabView)}
                  onRelease={(e) => handleRelease(e, isBarTabView)}
                  onTransfer={(e) => setTransferTarget({ entity: e, isBarTab: isBarTabView })}
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
