import React, { useEffect, useState } from "react";
import { Plus, X, UserCircle } from "lucide-react";
import { api } from "../lib/api";
import { formatCurrency } from "../lib/utils";

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:text-gray-300"><X size={20} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function CustomersSection() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    api.getCustomers().then(setCustomers).catch(console.error).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault(); setSaving(true); setFormError("");
    try {
      await api.createCustomer(form);
      setShowAdd(false); setForm({ name: "", phone: "", email: "" }); load();
    } catch (err) { setFormError(err.message); }
    finally { setSaving(false); }
  };

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || "").includes(search) ||
    (c.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Customers</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">{customers.length} registered customers</p>
        </div>
        <button onClick={() => { setShowAdd(true); setFormError(""); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors">
          <Plus size={16} /> Add Customer
        </button>
      </div>

      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, phone or email…"
        className="w-full mb-4 px-4 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" />

      <div className="bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-300 dark:border-gray-600 shadow-sm">
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-700">
              {filtered.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 flex-shrink-0 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold text-sm">
                    {c.name?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{c.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{c.phone || c.email || "No contact"}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-green-600">{formatCurrency(c.total_spent || 0)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{c.total_orders || 0} order{c.total_orders !== 1 ? "s" : ""}</p>
                  </div>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="py-16 text-center">
                  <UserCircle size={40} className="mx-auto text-gray-200 mb-3" />
                  <p className="text-gray-400 text-sm">No customers found</p>
                </div>
              )}
            </div>

            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-[480px]">
                <thead>
                  <tr className="text-[11px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700">
                    <th className="text-left px-4 py-3">Customer</th>
                    <th className="text-left px-4 py-3">Phone</th>
                    <th className="text-left px-4 py-3">Email</th>
                    <th className="text-left px-4 py-3">Orders</th>
                    <th className="text-left px-4 py-3">Total Spent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 flex-shrink-0 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center font-bold text-sm">
                            {c.name?.[0]?.toUpperCase()}
                          </div>
                          <span className="font-semibold text-gray-900 dark:text-white text-sm">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm whitespace-nowrap">{c.phone || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm">{c.email || "—"}</td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white font-semibold text-sm text-center">{c.total_orders || 0}</td>
                      <td className="px-4 py-3 text-green-600 font-semibold text-sm whitespace-nowrap">{formatCurrency(c.total_spent || 0)}</td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-16 text-center">
                      <UserCircle size={40} className="mx-auto text-gray-200 mb-3" />
                      <p className="text-gray-400 text-sm">No customers found</p>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showAdd && (
        <Modal title="Add Customer" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAdd} className="space-y-4">
            {[["name", "Full Name", "e.g. Jane Doe", true], ["phone", "Phone", "+1 234 567 890", false], ["email", "Email", "jane@example.com", false]].map(([key, label, ph, req]) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">{label}{req ? "" : " (optional)"}</label>
                <input required={req} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-blue-500" placeholder={ph} />
              </div>
            ))}
            {formError && <p className="text-red-500 text-xs">{formError}</p>}
            <button type="submit" disabled={saving}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {saving ? "Adding…" : "Add Customer"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
