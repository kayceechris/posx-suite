import React, { useEffect, useState } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight, X, Shield, ChevronDown, ChevronRight, Users, Pencil } from "lucide-react";
import { api } from "../lib/api";
import { cn } from "../lib/utils";

const PERMISSION_MODULES = [
  {
    id: "products", label: "Products",
    permissions: [
      { id: "view_products", label: "View Products" },
      { id: "create_product", label: "Create Product" },
      { id: "edit_product", label: "Edit Product" },
      { id: "delete_product", label: "Delete Product" },
      { id: "import_products", label: "Import Products" },
      { id: "manage_categories", label: "Manage Categories" },
    ],
  },
  {
    id: "inventory", label: "Inventory",
    permissions: [
      { id: "view_inventory", label: "View Inventory" },
      { id: "add_stock", label: "Add Stock" },
      { id: "update_stock", label: "Update Stock" },
      { id: "transfer_stock", label: "Transfer Stock" },
      { id: "low_stock_alerts", label: "Low Stock Alerts" },
    ],
  },
  {
    id: "orders", label: "Orders",
    permissions: [
      { id: "view_orders", label: "View Orders" },
      { id: "create_order", label: "Create Order" },
      { id: "edit_order", label: "Edit Order" },
      { id: "delete_order", label: "Delete Order" },
      { id: "void_order", label: "Void Order" },
      { id: "apply_discount", label: "Apply Discount" },
      { id: "process_payment", label: "Process Payment" },
    ],
  },
  {
    id: "customers", label: "Customers",
    permissions: [
      { id: "view_customers", label: "View Customers" },
      { id: "add_customer", label: "Add Customer" },
      { id: "edit_customer", label: "Edit Customer" },
      { id: "delete_customer", label: "Delete Customer" },
      { id: "view_purchase_history", label: "View Purchase History" },
    ],
  },
  {
    id: "suppliers", label: "Suppliers",
    permissions: [
      { id: "view_suppliers", label: "View Suppliers" },
      { id: "add_supplier", label: "Add Supplier" },
      { id: "edit_supplier", label: "Edit Supplier" },
      { id: "delete_supplier", label: "Delete Supplier" },
      { id: "manage_contacts", label: "Manage Contacts" },
    ],
  },
  {
    id: "purchases", label: "Purchases",
    permissions: [
      { id: "view_purchases", label: "View Purchases" },
      { id: "create_purchase", label: "Create Purchase" },
      { id: "edit_purchase", label: "Edit Purchase" },
      { id: "delete_purchase", label: "Delete Purchase" },
      { id: "approve_purchase", label: "Approve Purchase" },
      { id: "receive_items", label: "Receive Items" },
    ],
  },
  {
    id: "tables", label: "Tables",
    permissions: [
      { id: "view_tables", label: "View Tables" },
      { id: "create_table", label: "Create Table" },
      { id: "edit_table", label: "Edit Table" },
      { id: "delete_table", label: "Delete Table" },
      { id: "assign_table", label: "Assign Table to Order" },
      { id: "transfer_table", label: "Transfer Table" },
      { id: "clear_table", label: "Clear Table" },
      { id: "print_bill", label: "Print Bill" },
    ],
  },
  {
    id: "reports", label: "Reports",
    permissions: [
      { id: "view_sales_report", label: "View Sales Report" },
      { id: "view_inventory_report", label: "View Inventory Report" },
      { id: "view_staff_report", label: "View Staff Report" },
      { id: "view_customer_report", label: "View Customer Report" },
      { id: "view_financial_report", label: "View Financial Report" },
      { id: "export_reports", label: "Export Reports" },
      { id: "view_daily_summary", label: "View Daily Summary" },
      { id: "view_product_report", label: "View Product Report" },
      { id: "view_payment_report", label: "View Payment Report" },
    ],
  },
  {
    id: "accounts", label: "Accounts",
    permissions: [
      { id: "view_accounts", label: "View Accounts" },
      { id: "manage_expenses", label: "Manage Expenses" },
      { id: "view_profit_loss", label: "View Profit & Loss" },
      { id: "manage_cash_flow", label: "Manage Cash Flow" },
    ],
  },
  {
    id: "users", label: "Users",
    permissions: [
      { id: "view_users", label: "View Users" },
      { id: "create_user", label: "Create User" },
      { id: "edit_user", label: "Edit User" },
      { id: "delete_user", label: "Delete User" },
      { id: "manage_user_types", label: "Manage User Types" },
    ],
  },
  {
    id: "settings", label: "Settings",
    permissions: [
      { id: "view_settings", label: "View Settings" },
      { id: "edit_business_info", label: "Edit Business Info" },
      { id: "manage_payment_methods", label: "Manage Payment Methods" },
      { id: "manage_tax_settings", label: "Manage Tax Settings" },
      { id: "manage_receipt_settings", label: "Manage Receipt Settings" },
      { id: "manage_integrations", label: "Manage Integrations" },
      { id: "manage_outlet_settings", label: "Manage Outlet Settings" },
    ],
  },
  {
    id: "outlets", label: "Outlets",
    permissions: [
      { id: "view_outlets", label: "View Outlets" },
      { id: "create_outlet", label: "Create Outlet" },
      { id: "edit_outlet", label: "Edit Outlet" },
      { id: "delete_outlet", label: "Delete Outlet" },
    ],
  },
];

const ADD_USER_PERMISSIONS = {
  admin: [
    { id: "view_dashboard", label: "View Dashboard" },
    { id: "manage_users", label: "Manage Users" },
    { id: "manage_products", label: "Manage Products" },
    { id: "manage_inventory", label: "Manage Inventory" },
    { id: "manage_suppliers", label: "Manage Suppliers" },
    { id: "view_reports", label: "View Reports" },
    { id: "view_accounts", label: "View Accounts" },
    { id: "manage_settings", label: "Manage Settings" },
    { id: "manage_purchases", label: "Manage Purchases" },
    { id: "approve_purchase", label: "Approve Purchase Orders" },
  ],
  pos: [
    { id: "process_sales", label: "Process Sales" },
    { id: "hold_orders", label: "Hold Orders" },
    { id: "view_all_orders", label: "View All Held Orders" },
    { id: "delete_held_order_items", label: "Delete Items from Held Orders" },
    { id: "apply_discounts", label: "Apply Discounts" },
    { id: "void_orders", label: "Void Orders" },
    { id: "manage_tables", label: "Manage Tables" },
    { id: "transfer_tables", label: "Transfer Tables" },
    { id: "release_tables", label: "Release Tables" },
    { id: "print_bill", label: "Print Bill" },
    { id: "view_customers", label: "View Customers" },
  ],
};

const ROLES = ["cashier", "waiter", "manager", "admin"];

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className={cn("bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full", wide ? "max-w-lg" : "max-w-md")}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

const ROLE_COLORS = {
  admin: "bg-red-100 text-red-700",
  manager: "bg-blue-100 text-blue-700",
  cashier: "bg-green-100 text-green-700",
  waiter: "bg-amber-100 text-amber-700",
};

const roleBadge = (role) => (
  <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide", ROLE_COLORS[role] || "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300")}>
    {role}
  </span>
);

// ─── User List ───────────────────────────────────────────────────────────────

const EMPTY_USER = { name: "", pincode: "", role: "cashier", outlet_id: "", permissions: [] };

function UserList() {
  const [users, setUsers] = useState([]);
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState(EMPTY_USER);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([api.getUsers(), api.getOutlets()])
      .then(([u, o]) => { setUsers(u); setOutlets(o); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const outletName = (id) => outlets.find((o) => o.id === id)?.name || null;

  const openAdd = () => {
    setForm(EMPTY_USER); setFormError(""); setEditUser(null); setShowAdd(true);
  };

  const openEdit = (u) => {
    setForm({ name: u.name, pincode: "", role: u.role, outlet_id: u.outlet_id || "", permissions: u.permissions || [] });
    setFormError(""); setEditUser(u); setShowAdd(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editUser && form.pincode.length < 4) { setFormError("PIN must be at least 4 digits."); return; }
    setSaving(true); setFormError("");
    try {
      const payload = { ...form, outlet_id: form.outlet_id || null };
      if (editUser) {
        if (!payload.pincode) delete payload.pincode;
        await api.updateUser(editUser.id, payload);
      } else {
        await api.createUser(payload);
      }
      setShowAdd(false); load();
    } catch (err) { setFormError(err.message); }
    finally { setSaving(false); }
  };

  const toggleActive = async (u) => {
    try { await api.updateUser(u.id, { active: !u.active }); load(); }
    catch (err) { alert(err.message); }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete user "${u.name}"?`)) return;
    try { await api.deleteUser(u.id); load(); }
    catch (err) { alert(err.message); }
  };

  const togglePerm = (id) => {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(id)
        ? prev.permissions.filter((p) => p !== id)
        : [...prev.permissions, id],
    }));
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
            <Users size={20} className="text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">User Management</h1>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-500 text-white rounded-xl font-semibold text-sm hover:bg-green-600 transition-colors"
        >
          <Plus size={16} /> Add User
        </button>
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {users.map((u) => (
            <div key={u.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-700 p-5 shadow-sm">
              <div className="flex items-start justify-between mb-2">
                <p className="font-bold text-gray-900 dark:text-white text-base">{u.name}</p>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <button onClick={() => openEdit(u)} className="text-blue-500 hover:text-blue-700 transition-colors">
                    <Pencil size={15} />
                  </button>
                  <button onClick={() => handleDelete(u)} className="text-red-400 hover:text-red-600 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {roleBadge(u.role)}
              <div className="mt-3 space-y-1 text-sm">
                {outletName(u.outlet_id) && (
                  <p className="text-gray-600 dark:text-gray-300"><span className="font-semibold">Outlet:</span> {outletName(u.outlet_id)}</p>
                )}
                <button onClick={() => toggleActive(u)} className="flex items-center gap-1.5">
                  {u.active
                    ? <><ToggleRight size={18} className="text-green-500" /><span className="text-green-600 font-semibold text-sm">Active</span></>
                    : <><ToggleLeft size={18} className="text-gray-400" /><span className="text-gray-400 font-medium text-sm">Inactive</span></>}
                </button>
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <div className="col-span-3 py-16 text-center text-gray-400">
              <Users size={40} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No users yet. Click "Add User" to get started.</p>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
              <h3 className="font-bold text-gray-900 dark:text-white text-lg">
                {editUser ? "Edit User" : "Add New User"}
              </h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600 dark:text-gray-300">
                <X size={20} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {/* NAME */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2.5 border-2 border-gray-300 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-gray-50 dark:bg-gray-900"
                  placeholder=""
                />
              </div>

              {/* PINCODE */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Pincode</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  required={!editUser}
                  value={form.pincode}
                  onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "") })}
                  className="w-full px-3 py-2.5 border-2 border-gray-300 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-gray-50 dark:bg-gray-900"
                  placeholder="4-6 digits"
                />
              </div>

              {/* ROLE */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Role</label>
                <div className="relative">
                  <select
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-2.5 border-2 border-gray-300 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:border-blue-500 bg-gray-50 dark:bg-gray-900 appearance-none"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">▾</span>
                </div>
              </div>

              {/* OUTLET (OPTIONAL) */}
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Outlet (Optional)</label>
                <div className="relative">
                  <select
                    value={form.outlet_id}
                    onChange={(e) => setForm({ ...form, outlet_id: e.target.value })}
                    className="w-full px-3 py-2.5 border-2 border-blue-400 rounded-xl text-sm focus:outline-none focus:border-blue-600 bg-white dark:bg-gray-800 appearance-none"
                  >
                    <option value="">None</option>
                    {outlets.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">▾</span>
                </div>
              </div>

              {/* PERMISSIONS */}
              <div>
                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Permissions</p>

                {/* Admin Module */}
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">Admin Module</p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {ADD_USER_PERMISSIONS.admin.map((perm) => (
                    <label
                      key={perm.id}
                      className="flex items-center gap-2 px-3 py-2.5 border-2 border-gray-300 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(perm.id)}
                        onChange={() => togglePerm(perm.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 flex-shrink-0"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-200">{perm.label}</span>
                    </label>
                  ))}
                </div>

                {/* POS Module */}
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">POS Module</p>
                <div className="grid grid-cols-2 gap-2">
                  {ADD_USER_PERMISSIONS.pos.map((perm) => (
                    <label
                      key={perm.id}
                      className="flex items-center gap-2 px-3 py-2.5 border-2 border-gray-300 dark:border-gray-700 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(perm.id)}
                        onChange={() => togglePerm(perm.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 flex-shrink-0"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-200">{perm.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {formError && <p className="text-red-500 text-xs">{formError}</p>}
            </div>

            {/* Modal footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : editUser ? "Save Changes" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── User Types ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "posx_user_types";

function loadStoredTypes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function saveStoredTypes(types) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(types));
}

function PermissionModule({ mod, selected, onToggleModule, onTogglePermission, expanded, onToggleExpand }) {
  const selectedCount = mod.permissions.filter((p) => selected.includes(p.id)).length;
  const allSelected = selectedCount === mod.permissions.length;

  return (
    <div className="border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <div
        className="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors"
        onClick={() => onToggleExpand(mod.id)}
      >
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(e) => { e.stopPropagation(); onToggleModule(mod.id, !allSelected); }}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer flex-shrink-0"
        />
        <span className="flex-1 font-semibold text-gray-800 dark:text-gray-100 text-sm">{mod.label}</span>
        <span className="text-xs text-gray-400 font-medium mr-2">{selectedCount}/{mod.permissions.length}</span>
        <ChevronRight size={15} className={cn("text-gray-400 transition-transform", expanded && "rotate-90")} />
      </div>
      {expanded && (
        <div className="bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
          {mod.permissions.map((perm) => (
            <label key={perm.id} className="flex items-center gap-3 px-8 py-2.5 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 dark:bg-gray-700 transition-colors">
              <input
                type="checkbox"
                checked={selected.includes(perm.id)}
                onChange={() => onTogglePermission(perm.id)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 flex-shrink-0"
              />
              <span className="text-sm text-gray-700 dark:text-gray-200">{perm.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateUserTypeModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [selectedPerms, setSelectedPerms] = useState([]);
  const [expandedMods, setExpandedMods] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleModule = (modId, select) => {
    const mod = PERMISSION_MODULES.find((m) => m.id === modId);
    const ids = mod.permissions.map((p) => p.id);
    setSelectedPerms((prev) => select ? [...new Set([...prev, ...ids])] : prev.filter((p) => !ids.includes(p)));
  };

  const togglePermission = (permId) => {
    setSelectedPerms((prev) => prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]);
  };

  const toggleExpand = (modId) => {
    setExpandedMods((prev) => prev.includes(modId) ? prev.filter((m) => m !== modId) : [...prev, modId]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError("Type name is required."); return; }
    setSaving(true);
    const newType = { id: Date.now().toString(), name: name.trim(), permissions: selectedPerms, createdAt: new Date().toISOString() };
    const existing = loadStoredTypes();
    saveStoredTypes([...existing, newType]);
    onSave();
    onClose();
  };

  return (
    <Modal title="Create User Type" onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Type Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className="w-full px-3 py-2.5 border-2 border-blue-400 rounded-xl text-sm focus:outline-none focus:border-blue-600"
            placeholder="e.g. Manager, Cashier, Waiter"
          />
        </div>

        <div className="border-2 border-gray-300 dark:border-gray-700 rounded-xl overflow-hidden">
          <div className="max-h-80 overflow-y-auto">
            {PERMISSION_MODULES.map((mod) => (
              <PermissionModule
                key={mod.id}
                mod={mod}
                selected={selectedPerms}
                onToggleModule={toggleModule}
                onTogglePermission={togglePermission}
                expanded={expandedMods.includes(mod.id)}
                onToggleExpand={toggleExpand}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-red-500 text-xs">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 rounded-xl font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50 dark:bg-gray-900 transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving ? "Creating…" : "Create User Type"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function UserTypes() {
  const [types, setTypes] = useState([]);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => setTypes(loadStoredTypes());

  useEffect(() => { load(); }, []);

  const handleDelete = (id) => {
    if (!window.confirm("Delete this user type?")) return;
    saveStoredTypes(loadStoredTypes().filter((t) => t.id !== id));
    load();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Shield size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">User Types & Permissions</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Define roles with specific access controls</p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors">
          <Plus size={16} /> Add User Type
        </button>
      </div>

      {types.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <Shield size={56} className="mb-4 opacity-20" />
          <p className="font-semibold text-gray-500 dark:text-gray-400 text-base">No user types defined</p>
          <p className="text-sm mt-1">Create user types like Admin, Cashier, Waiter with specific permissions</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {types.map((type) => {
            const totalPerms = PERMISSION_MODULES.reduce((sum, m) => sum + m.permissions.length, 0);
            return (
              <div key={type.id} className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-700 p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-bold text-gray-900 dark:text-white text-base">{type.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{type.permissions.length} of {totalPerms} permissions</p>
                  </div>
                  <button onClick={() => handleDelete(type.id)} className="text-gray-300 hover:text-red-500 transition-colors ml-2 flex-shrink-0">
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {PERMISSION_MODULES.map((mod) => {
                    const count = mod.permissions.filter((p) => type.permissions.includes(p.id)).length;
                    if (count === 0) return null;
                    return (
                      <span key={mod.id} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-semibold">
                        {mod.label} ({count}/{mod.permissions.length})
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <CreateUserTypeModal onClose={() => setShowCreate(false)} onSave={load} />}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function UsersSection({ view = "list" }) {
  return view === "types" ? <UserTypes /> : <UserList />;
}
