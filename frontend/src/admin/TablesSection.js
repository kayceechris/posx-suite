import React, { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, X, Check, LayoutGrid } from "lucide-react";
import { api } from "../lib/api";
import { cn, sortByTableNumber } from "../lib/utils";

// ─── Table card ───────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  available: "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-800 dark:text-green-300",
  occupied:  "bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700 text-red-800 dark:text-red-300",
  reserved:  "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700 text-yellow-800 dark:text-yellow-300",
};

function TableCard({ t, floorName, outletName, onEdit, onDelete }) {
  const colorClass = STATUS_COLORS[t.status] || STATUS_COLORS.available;
  return (
    <div className={cn("rounded-2xl border-2 p-4 flex flex-col items-center relative group", colorClass)}>
      <p className="text-2xl font-black mb-1">{t.number}</p>
      <p className="text-xs font-semibold opacity-75 truncate max-w-full">{outletName(t.outlet_id)}</p>
      {floorName && <p className="text-[10px] opacity-50 mt-0.5 truncate max-w-full">{floorName}</p>}
      <p className="text-xs opacity-60 mt-0.5">{t.seats || 4} seats</p>
      <div className="absolute top-2 right-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button onClick={() => onEdit(t)} className="text-blue-500 hover:text-blue-700 bg-white dark:bg-gray-800 rounded-lg p-1 shadow-sm">
          <Pencil size={13} />
        </button>
        <button onClick={() => onDelete(t)} className="text-red-500 hover:text-red-700 bg-white dark:bg-gray-800 rounded-lg p-1 shadow-sm">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ─── Table form modal ─────────────────────────────────────────────────────────
function TableModal({ mode, floors, outlets, allTables = [], fallbackOutletId = "", initialForm, onClose, onSaved }) {
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Bulk-create state (only meaningful in 'add' mode)
  const [bulk, setBulk] = useState(false);
  const [bulkPrefix, setBulkPrefix] = useState("T");
  const [bulkFrom, setBulkFrom]     = useState(1);
  const [bulkCount, setBulkCount]   = useState(5);
  const [progress, setProgress]     = useState(null); // { done, total, failed }

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Numbers already in use for THIS FLOOR (not the whole outlet). VIP /
  // Outside / Regular each get their own independent T1, T2, T3 sequence.
  const existingNumbers = (() => {
    const targetOutlet = form.outlet_id || fallbackOutletId;
    const targetFloor  = form.floor_id || null;
    if (!targetOutlet) return [];
    return allTables
      .filter((t) => t.outlet_id === targetOutlet
        && (targetFloor ? t.floor_id === targetFloor : !t.floor_id))
      .map((t) => t.number);
  })();

  // Preview the numbers a bulk run would create. Always orderly — start
  // at the requested number and produce a contiguous run of N values,
  // skipping any that are already taken on this floor so we never spawn
  // a duplicate.
  const bulkPreview = (() => {
    if (!bulk || mode !== "add") return [];
    const start = Math.max(1, parseInt(bulkFrom) || 1);
    const count = Math.max(1, Math.min(200, parseInt(bulkCount) || 1));
    const taken = new Set((existingNumbers || []).map(String));
    const out = [];
    let n = start;
    while (out.length < count && n < start + count * 10) {
      const candidate = `${bulkPrefix}${n}`;
      if (!taken.has(candidate)) out.push(candidate);
      n += 1;
    }
    return out;
  })();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      if (mode === "add" && bulk) {
        if (!form.outlet_id) { setError("Pick an outlet first."); setSaving(false); return; }
        if (bulkPreview.length === 0) { setError("Nothing to create."); setSaving(false); return; }
        const seats = parseInt(form.seats) || 4;
        const floor_id = form.floor_id || null;
        const outlet_id = form.outlet_id;
        setProgress({ done: 0, total: bulkPreview.length, failed: 0 });
        let done = 0;
        let failed = 0;
        // Serial create — each table's created_at lands in numerical
        // order so any list sorted by insertion time (database default,
        // some report views) also reads T1, T2, T3, ... not scrambled.
        // Slower than parallel but the only way to make ordering robust
        // across every consumer of the data.
        for (const number of bulkPreview) {
          try {
            await api.createTable({ number, outlet_id, floor_id, seats });
            done++;
          } catch {
            failed++;
          }
          setProgress({ done, total: bulkPreview.length, failed });
        }
        if (failed > 0) {
          setError(`Created ${done}, ${failed} failed — they may be duplicates.`);
          setSaving(false);
          return;
        }
        onSaved();
        return;
      }

      const payload = {
        number: form.number,
        outlet_id: form.outlet_id,
        floor_id: form.floor_id || null,
        seats: parseInt(form.seats) || 4,
      };
      if (mode === "add") await api.createTable(payload);
      else await api.updateTable(form.id, payload);
      onSaved();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h3 className="font-bold text-gray-900 dark:text-white">{mode === "add" ? (bulk ? "Add Multiple Tables" : "Add New Table") : "Edit Table"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mode === "add" && (
            <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 border-2 border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2">
              <div>
                <p className="text-xs font-bold text-gray-700 dark:text-gray-200">Add multiple at once</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">Create a numbered range in one click</p>
              </div>
              <button type="button" onClick={() => setBulk((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors ${bulk ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"}`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${bulk ? "translate-x-5" : ""}`} />
              </button>
            </div>
          )}

          {!bulk && (
          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Table Number</label>
            <input required value={form.number} onChange={(e) => set("number", e.target.value)} placeholder="e.g. T1, Table 1"
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" />
          </div>
          )}

          {bulk && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Prefix</label>
                  <input value={bulkPrefix} onChange={(e) => setBulkPrefix(e.target.value)} placeholder="T"
                    className="w-full px-2 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Start #</label>
                  <input type="number" min="1" inputMode="numeric" value={bulkFrom}
                    onChange={(e) => setBulkFrom(e.target.value)}
                    className="w-full px-2 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-sm text-center focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase mb-1">Count</label>
                  <input type="number" min="1" max="200" inputMode="numeric" value={bulkCount}
                    onChange={(e) => setBulkCount(e.target.value)}
                    className="w-full px-2 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-lg text-sm text-center focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-700/50 rounded-xl px-3 py-2">
                <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300 uppercase mb-1">Preview ({bulkPreview.length})</p>
                <p className="text-xs text-blue-700 dark:text-blue-300 font-mono break-all">
                  {bulkPreview.length === 0
                    ? "—"
                    : bulkPreview.slice(0, 12).join(", ") + (bulkPreview.length > 12 ? `, … (+${bulkPreview.length - 12} more)` : "")}
                </p>
                <p className="text-[10px] text-blue-600/70 dark:text-blue-400/70 mt-1">
                  Numbers that already exist in this outlet are skipped automatically.
                </p>
              </div>
              {progress && (
                <p className="text-[11px] text-gray-500">
                  Creating {progress.done} / {progress.total}{progress.failed > 0 ? ` (${progress.failed} failed)` : ""}…
                </p>
              )}
            </div>
          )}

          {floors.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Floor / Section</label>
              <select value={form.floor_id || ""} onChange={(e) => set("floor_id", e.target.value)}
                className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500">
                <option value="">— No floor —</option>
                {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Outlet</label>
            <select value={form.outlet_id} onChange={(e) => set("outlet_id", e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500">
              <option value="">Select outlet…</option>
              {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Number of Seats</label>
            <input required type="number" min="1" max="50" value={form.seats} onChange={(e) => set("seats", e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving || (bulk && bulkPreview.length === 0)}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving
                ? (bulk ? `Creating ${progress?.done ?? 0}/${progress?.total ?? bulkPreview.length}…` : "Saving…")
                : mode === "add"
                  ? (bulk ? `Create ${bulkPreview.length} Table${bulkPreview.length === 1 ? "" : "s"}` : "Create")
                  : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────
export default function TablesSection() {
  const [tables,  setTables]  = useState([]);
  const [floors,  setFloors]  = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);

  // Which outlet tab is active (null = first outlet)
  const [activeOutletId, setActiveOutletId] = useState(null);
  // Which floor tab is active within the outlet (null = all / no-floor)
  // No 'All' tab anymore — start at first floor (assigned once outlets load),
  // or fall back to __unassigned__ when an outlet has no floors yet.
  const [activeFloorId, setActiveFloorId] = useState(null);

  // Add-floor inline input
  const [showFloorInput,    setShowFloorInput]    = useState(false);
  const [newFloorName,      setNewFloorName]      = useState("");
  const [newFloorOutletId,  setNewFloorOutletId]  = useState("");
  const [floorSaving,       setFloorSaving]       = useState(false);
  const floorInputRef = useRef(null);

  // Rename-floor inline
  const [renamingFloorId, setRenamingFloorId] = useState(null);
  const [renameValue,     setRenameValue]     = useState("");

  // Table modal
  const [modal, setModal] = useState(null); // { mode, form }

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const [t, o, f] = await Promise.all([
        api.getTables(),
        api.getOutlets(),
        api.getFloors().catch(() => []),  // non-fatal — floors route may not be deployed yet
      ]);
      setTables(t);
      setOutlets(o);
      setFloors(f);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Auto-select first outlet when outlets load
  useEffect(() => {
    if (!activeOutletId && outlets.length > 0) setActiveOutletId(outlets[0].id);
  }, [outlets, activeOutletId]);

  // Reset floor tab when outlet changes
  // Whenever the outlet changes, snap to its first floor (or unassigned).
  useEffect(() => { setActiveFloorId(null); }, [activeOutletId]);

  // Focus new-floor input when it appears
  useEffect(() => {
    if (showFloorInput) floorInputRef.current?.focus();
  }, [showFloorInput]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const outletName  = (id) => outlets.find((o) => o.id === id)?.name || "";
  const floorName   = (id) => floors.find((f) => f.id === id)?.name || "";
  const multiOutlet = outlets.length > 1;

  const outletFloors = floors.filter((f) => f.outlet_id === activeOutletId);

  const outletTables = tables.filter((t) => t.outlet_id === activeOutletId);

  // Resolve the active floor on every render: explicit selection wins,
  // otherwise the first floor, otherwise the unassigned bucket. No more
  // 'All' merging across floors.
  const effectiveFloorId = activeFloorId
    || outletFloors[0]?.id
    || (outletTables.some((t) => !t.floor_id) ? "__unassigned__" : null);

  const visibleTables = sortByTableNumber(
    effectiveFloorId === "__unassigned__"
      ? outletTables.filter((t) => !t.floor_id)
      : effectiveFloorId
      ? outletTables.filter((t) => t.floor_id === effectiveFloorId)
      : outletTables
  );

  const countForFloor = (fid) => outletTables.filter((t) => t.floor_id === fid).length;
  const unassignedCount = outletTables.filter((t) => !t.floor_id).length;
  const showUnassignedTab = outletFloors.length > 0 && unassignedCount > 0;

  // ── Table actions ─────────────────────────────────────────────────────────
  const openAdd = () => {
    const defaultFloorId = effectiveFloorId && effectiveFloorId !== "__unassigned__"
      ? effectiveFloorId : outletFloors[0]?.id || "";
    setModal({
      mode: "add",
      form: { number: "", outlet_id: activeOutletId || outlets[0]?.id || "", floor_id: defaultFloorId, seats: 4 },
    });
  };

  const openEdit = (t) => setModal({
    mode: "edit",
    form: { id: t.id, number: t.number, outlet_id: t.outlet_id || "", floor_id: t.floor_id || "", seats: t.seats || 4 },
  });

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete table "${t.number}"?`)) return;
    try { await api.deleteTable(t.id); load(); }
    catch (err) { alert(err.message); }
  };

  // ── Floor actions ─────────────────────────────────────────────────────────
  const handleAddFloor = async (e) => {
    e.preventDefault();
    const targetOutlet = newFloorOutletId || activeOutletId || outlets[0]?.id;
    if (!newFloorName.trim() || !targetOutlet) return;
    setFloorSaving(true);
    try {
      const floorCount = floors.filter((f) => f.outlet_id === targetOutlet).length;
      const created = await api.createFloor({
        name: newFloorName.trim(),
        outlet_id: targetOutlet,
        sort_order: floorCount,
      });
      setNewFloorName(""); setNewFloorOutletId(""); setShowFloorInput(false);
      setActiveOutletId(targetOutlet);
      await load();
      setActiveFloorId(created.id);
    } catch (err) { alert(err.message); }
    finally { setFloorSaving(false); }
  };

  const startRename = (floor) => { setRenamingFloorId(floor.id); setRenameValue(floor.name); };

  const handleRename = async (floorId) => {
    if (!renameValue.trim()) { setRenamingFloorId(null); return; }
    try {
      await api.updateFloor(floorId, { name: renameValue.trim() });
      setRenamingFloorId(null);
      load();
    } catch (err) { alert(err.message); }
  };

  const handleDeleteFloor = async (floor) => {
    const count = outletTables.filter((t) => t.floor_id === floor.id).length;
    if (count > 0) {
      alert(`Cannot delete "${floor.name}" — it has ${count} table(s). Move or delete them first.`);
      return;
    }
    if (!window.confirm(`Delete floor "${floor.name}"?`)) return;
    try {
      await api.deleteFloor(floor.id);
      if (activeFloorId === floor.id) setActiveFloorId(null);
      load();
    } catch (err) { alert(err.message); }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
            <LayoutGrid size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-black text-gray-900 dark:text-white">Table Management</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
              {outletFloors.length} floor{outletFloors.length !== 1 ? "s" : ""}
              {" · "}{outletTables.length} table{outletTables.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-2 px-3 sm:px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors">
          <Plus size={16} /> <span className="hidden sm:inline">Add Table</span>
        </button>
      </div>

      {/* ── Outlet tabs (only when multiple outlets) ── */}
      {multiOutlet && (
        <div className="flex gap-1 mb-4 overflow-x-auto">
          {outlets.map((o) => (
            <button key={o.id} onClick={() => setActiveOutletId(o.id)}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all",
                activeOutletId === o.id
                  ? "bg-green-600 text-white shadow-sm"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
              )}>
              {o.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Floor tabs ── */}
      <div className="flex items-end gap-0.5 mb-5 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">

        {/* One tab per floor */}
        {outletFloors.map((floor) => (
          <div key={floor.id} onClick={() => { if (renamingFloorId !== floor.id) setActiveFloorId(floor.id); }}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl border-b-2 whitespace-nowrap transition-all cursor-pointer select-none",
              effectiveFloorId === floor.id
                ? "border-green-600 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            )}>
            {renamingFloorId === floor.id ? (
              <form onSubmit={(e) => { e.preventDefault(); handleRename(floor.id); }} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
                <input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => handleRename(floor.id)}
                  className="w-28 px-2 py-0.5 text-sm border-2 border-green-500 rounded-lg bg-white dark:bg-gray-700 dark:text-white focus:outline-none" />
                <button type="submit" className="text-green-600 hover:text-green-800 p-0.5"><Check size={13} /></button>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setRenamingFloorId(null)}
                  className="text-gray-400 hover:text-gray-600 p-0.5"><X size={13} /></button>
              </form>
            ) : (
              <>
                <span className="text-sm">{floor.name}</span>
                <span className="text-xs opacity-50">({countForFloor(floor.id)})</span>
                {activeFloorId === floor.id && (
                  <span className="flex items-center gap-0.5 ml-0.5" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => startRename(floor)}
                      className="text-green-500 hover:text-green-700 p-0.5 rounded transition-colors" title="Rename">
                      <Pencil size={11} />
                    </button>
                    <button onClick={() => handleDeleteFloor(floor)}
                      className="text-red-400 hover:text-red-600 p-0.5 rounded transition-colors" title="Delete floor">
                      <Trash2 size={11} />
                    </button>
                  </span>
                )}
              </>
            )}
          </div>
        ))}

        {/* Unassigned tab — only shown when floors exist but some tables have no floor */}
        {showUnassignedTab && (
          <button onClick={() => setActiveFloorId("__unassigned__")}
            className={cn(
              "px-4 py-2.5 text-sm font-bold rounded-t-xl border-b-2 whitespace-nowrap transition-all",
              effectiveFloorId === "__unassigned__"
                ? "border-amber-500 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400"
                : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400"
            )}>
            Unassigned ({unassignedCount})
          </button>
        )}

        {/* Add floor */}
        <div className="flex items-center ml-1 pb-0.5">
          {showFloorInput ? (
            <form onSubmit={handleAddFloor} className="flex flex-wrap items-center gap-1.5 max-w-full">
              <input ref={floorInputRef} value={newFloorName} onChange={(e) => setNewFloorName(e.target.value)}
                placeholder="Floor name…"
                className="w-32 sm:w-36 px-2.5 py-1.5 text-sm border-2 border-green-500 rounded-xl bg-white dark:bg-gray-700 dark:text-white focus:outline-none" />
              {multiOutlet && (
                <select
                  value={newFloorOutletId || activeOutletId || ""}
                  onChange={(e) => setNewFloorOutletId(e.target.value)}
                  className="max-w-[120px] px-2.5 py-1.5 text-sm border-2 border-green-500 rounded-xl bg-white dark:bg-gray-700 dark:text-white focus:outline-none">
                  {outlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
              <button type="submit" disabled={floorSaving || !newFloorName.trim()}
                className="px-3 py-1.5 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 disabled:opacity-40 transition-colors">
                {floorSaving ? "…" : "Add"}
              </button>
              <button type="button" onClick={() => { setShowFloorInput(false); setNewFloorName(""); setNewFloorOutletId(""); }}
                className="text-gray-400 hover:text-gray-600 p-1"><X size={15} /></button>
            </form>
          ) : (
            <button onClick={() => setShowFloorInput(true)}
              className="flex items-center gap-1 px-3 py-2 text-gray-400 hover:text-green-600 dark:hover:text-green-400 text-sm font-bold transition-colors rounded-t-xl">
              <Plus size={14} /> Floor
            </button>
          )}
        </div>
      </div>

      {/* ── Tables grid ── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visibleTables.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 mb-4 border-4 border-gray-200 dark:border-gray-700 rounded-2xl flex items-center justify-center">
            <LayoutGrid size={24} className="text-gray-300 dark:text-gray-600" />
          </div>
          <p className="font-semibold text-gray-500 dark:text-gray-400">
            {effectiveFloorId === "__unassigned__" ? "No unassigned tables" : "No tables on this floor"}
          </p>
          {effectiveFloorId !== "__unassigned__" && (
            <p className="text-sm text-gray-400 mt-1">Click "Add Table" to place the first table here</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {visibleTables.map((t) => (
            <TableCard
              key={t.id}
              t={t}
              floorName={null}
              outletName={outletName}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* ── Table modal ── */}
      {modal && (
        <TableModal
          mode={modal.mode}
          floors={outletFloors}
          outlets={outlets}
          /* Dedup is scoped to the chosen FLOOR (not the whole outlet) so
             each floor — VIP, Outside, Regular — has its own independent
             T1, T2, T3... sequence. The modal recomputes the existing
             list whenever the user changes the floor in the form. */
          allTables={tables}
          fallbackOutletId={activeOutletId}
          initialForm={modal.form}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
    </div>
  );
}
