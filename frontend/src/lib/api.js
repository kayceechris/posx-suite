const BASE_URL =
  process.env.REACT_APP_BACKEND_URL || "https://posx-suite.vercel.app";

function getToken() {
  return localStorage.getItem("posx_token");
}

async function requestUpload(path, file) {
  const token = getToken();
  const formData = new FormData();
  formData.append("file", file);
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });
  } catch (networkErr) {
    throw new Error(`Cannot reach server. (${networkErr.message})`);
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const b = await res.json(); detail = b.detail || detail; } catch (_) {}
    throw new Error(detail);
  }
  return res.json();
}

async function triggerDownload(path, fallbackFilename) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  } catch (networkErr) {
    throw new Error(`Cannot reach server. (${networkErr.message})`);
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const b = await res.json(); detail = b.detail || detail; } catch (_) {}
    throw new Error(detail);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
  const filename = match ? match[1].replace(/['"]/g, "") : fallbackFilename;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  } catch (networkErr) {
    throw new Error(
      `Cannot reach server at ${BASE_URL}. Check that the backend is running. (${networkErr.message})`
    );
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") {
        detail = body.detail;
      } else if (Array.isArray(body.detail)) {
        detail = body.detail.map((e) => `${e.loc?.join(".")} — ${e.msg}`).join("; ");
      } else if (body.message) {
        detail = body.message;
      } else {
        detail = JSON.stringify(body);
      }
    } catch (_) {
      const text = await res.text().catch(() => "");
      if (text) detail = text;
    }
    throw new Error(detail);
  }

  return res.json();
}

export const api = {
  // Auth
  login: (pincode) =>
    request("/api/auth/login", { method: "POST", body: JSON.stringify({ pincode }) }),
  getMe: () => request("/api/auth/me"),

  // Business settings
  getSettings: (opts) => request("/api/settings", opts || {}),
  updateSettings: (data) =>
    request("/api/settings", { method: "PUT", body: JSON.stringify(data) }),

  // First-time setup
  register: (data) =>
    request("/api/register", { method: "POST", body: JSON.stringify(data) }),

  // Orders
  createOrder: (data) =>
    request("/api/orders", { method: "POST", body: JSON.stringify(data) }),
  getOrders: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.outlet_id) params.append("outlet_id", filters.outlet_id);
    if (filters.start_date) params.append("start_date", filters.start_date);
    if (filters.end_date) params.append("end_date", filters.end_date);
    if (filters.created_by) params.append("created_by", filters.created_by);
    if (filters.order_number) params.append("order_number", filters.order_number);
    const qs = params.toString();
    return request(`/api/orders${qs ? `?${qs}` : ""}`);
  },
  getHeldOrders: () => request("/api/orders/held/list"),
  getOrder: (id) => request(`/api/orders/${id}`),
  completeOrder: (id, paymentMethod) =>
    request(`/api/orders/${id}/complete?payment_method=${encodeURIComponent(paymentMethod)}`, { method: "PUT" }),
  updateOrder: (id, data) =>
    request(`/api/orders/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  voidOrder: (id) =>
    request(`/api/orders/${id}`, { method: "PUT", body: JSON.stringify({ status: "voided" }) }),
  deleteOrder: (id) =>
    request(`/api/orders/${id}`, { method: "DELETE" }),

  // Users
  getUsers: () => request("/api/users"),
  createUser: (data) =>
    request("/api/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id, data) =>
    request(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteUser: (id) =>
    request(`/api/users/${id}`, { method: "DELETE" }),
  transferTable: (tableId, newWaiterId) =>
    request(`/api/tables/${tableId}/transfer`, { method: "POST", body: JSON.stringify({ new_waiter_id: newWaiterId }) }),

  // Outlets
  getOutlets: () => request("/api/outlets"),
  createOutlet: (data) =>
    request("/api/outlets", { method: "POST", body: JSON.stringify(data) }),
  updateOutlet: (id, data) =>
    request(`/api/outlets/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteOutlet: (id) =>
    request(`/api/outlets/${id}`, { method: "DELETE" }),

  // Terminals
  getTerminals: (outlet_id) =>
    request(`/api/terminals${outlet_id ? `?outlet_id=${outlet_id}` : ""}`),
  createTerminal: (data) =>
    request("/api/terminals", { method: "POST", body: JSON.stringify(data) }),
  updateTerminal: (id, data) =>
    request(`/api/terminals/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTerminal: (id) =>
    request(`/api/terminals/${id}`, { method: "DELETE" }),

  // Peripherals
  getPeripherals: () => request("/api/peripherals"),
  createPeripheral: (data) =>
    request("/api/peripherals", { method: "POST", body: JSON.stringify(data) }),
  deletePeripheral: (id) =>
    request(`/api/peripherals/${id}`, { method: "DELETE" }),

  // Categories
  getCategories: () => request("/api/categories"),
  createCategory: (data) =>
    request("/api/categories", { method: "POST", body: JSON.stringify(data) }),
  updateCategory: (id, data) =>
    request(`/api/categories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCategory: (id) =>
    request(`/api/categories/${id}`, { method: "DELETE" }),

  // Products
  getProducts: () => request("/api/products"),
  createProduct: (data) =>
    request("/api/products", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id, data) =>
    request(`/api/products/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProduct: (id) =>
    request(`/api/products/${id}`, { method: "DELETE" }),

  // Inventory / Stock
  getStock: (outlet_id) =>
    request(`/api/stock${outlet_id ? `?outlet_id=${outlet_id}` : ""}`),
  updateStock: (data) =>
    request("/api/stock", { method: "POST", body: JSON.stringify(data) }),
  getLowStock: () => request("/api/stock/low"),

  // Customers
  getCustomers: () => request("/api/customers"),
  createCustomer: (data) =>
    request("/api/customers", { method: "POST", body: JSON.stringify(data) }),

  // Suppliers
  getSuppliers: () => request("/api/suppliers"),
  createSupplier: (data) =>
    request("/api/suppliers", { method: "POST", body: JSON.stringify(data) }),
  updateSupplier: (id, data) =>
    request(`/api/suppliers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSupplier: (id) =>
    request(`/api/suppliers/${id}`, { method: "DELETE" }),

  // Purchase Orders
  getPurchaseOrders: () => request("/api/purchase-orders"),
  createPurchaseOrder: (data) =>
    request("/api/purchase-orders", { method: "POST", body: JSON.stringify(data) }),
  updatePurchaseOrder: (id, data) =>
    request(`/api/purchase-orders/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deletePurchaseOrder: (id) =>
    request(`/api/purchase-orders/${id}`, { method: "DELETE" }),

  // Expenses & Accounts
  getExpenses: () => request("/api/expenses"),
  createExpense: (data) =>
    request("/api/expenses", { method: "POST", body: JSON.stringify(data) }),
  deleteExpense: (id) =>
    request(`/api/expenses/${id}`, { method: "DELETE" }),
  getAccountsSummary: (start_date, end_date) => {
    const params = new URLSearchParams();
    if (start_date) params.append("start_date", start_date);
    if (end_date) params.append("end_date", end_date);
    const qs = params.toString();
    return request(`/api/accounts/summary${qs ? `?${qs}` : ""}`);
  },
  getAccountsDashboard: (start_date, end_date) => {
    const params = new URLSearchParams();
    if (start_date) params.append("start_date", start_date);
    if (end_date) params.append("end_date", end_date);
    const qs = params.toString();
    return request(`/api/accounts/dashboard${qs ? `?${qs}` : ""}`);
  },

  // Deposits
  getDeposits: () => request("/api/deposits"),
  createDeposit: (data) =>
    request("/api/deposits", { method: "POST", body: JSON.stringify(data) }),
  deleteDeposit: (id) =>
    request(`/api/deposits/${id}`, { method: "DELETE" }),

  // Account Categories
  getAccountCategories: (type) =>
    request(`/api/account-categories${type ? `?type=${type}` : ""}`),
  createAccountCategory: (data) =>
    request("/api/account-categories", { method: "POST", body: JSON.stringify(data) }),
  deleteAccountCategory: (id) =>
    request(`/api/account-categories/${id}`, { method: "DELETE" }),

  // Transfers
  getTransfers: () => request("/api/transfers"),
  createTransfer: (data) =>
    request("/api/transfers", { method: "POST", body: JSON.stringify(data) }),
  deleteTransfer: (id) =>
    request(`/api/transfers/${id}`, { method: "DELETE" }),

  // Reports
  getSalesReport: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.start_date) params.append("start_date", filters.start_date);
    if (filters.end_date) params.append("end_date", filters.end_date);
    if (filters.group_by) params.append("group_by", filters.group_by);
    return request(`/api/reports/sales?${params.toString()}`);
  },
  getCostReport: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.start_date) params.append("start_date", filters.start_date);
    if (filters.end_date) params.append("end_date", filters.end_date);
    return request(`/api/reports/cost?${params.toString()}`);
  },
  getStaffReport: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.start_date) params.append("start_date", filters.start_date);
    if (filters.end_date) params.append("end_date", filters.end_date);
    return request(`/api/reports/staff?${params.toString()}`);
  },
  getPaymentMethodsReport: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.start_date) params.append("start_date", filters.start_date);
    if (filters.end_date) params.append("end_date", filters.end_date);
    return request(`/api/reports/payment-methods?${params.toString()}`);
  },

  // Payment types
  getPaymentTypes: () => request("/api/payment-types"),
  createPaymentType: (data) =>
    request("/api/payment-types", { method: "POST", body: JSON.stringify(data) }),
  deletePaymentType: (id) =>
    request(`/api/payment-types/${id}`, { method: "DELETE" }),

  // Currencies
  getCurrencies: () => request("/api/currencies"),
  createCurrency: (data) =>
    request("/api/currencies", { method: "POST", body: JSON.stringify(data) }),
  updateCurrency: (id, data) =>
    request(`/api/currencies/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCurrency: (id) =>
    request(`/api/currencies/${id}`, { method: "DELETE" }),

  // Printers (system + saved)
  getWindowsPrinters: () => request("/api/printers/windows"),
  getPrinters: () => request("/api/printers"),
  createPrinter: (data) =>
    request("/api/printers", { method: "POST", body: JSON.stringify(data) }),
  deletePrinter: (id) =>
    request(`/api/printers/${id}`, { method: "DELETE" }),
  getAssignedPrinters: () => request("/api/printers/assigned"),
  pingPrinter: (ip_address, port) =>
    request("/api/printers/ping", { method: "POST", body: JSON.stringify({ ip_address, port }) }),
  updatePrinter: (id, data) =>
    request(`/api/printers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  testPrint: (id) =>
    request(`/api/printers/${id}/test`, { method: "POST" }),

  // Printer groups
  getPrinterGroups: () => request("/api/printer-groups"),
  createPrinterGroup: (data) =>
    request("/api/printer-groups", { method: "POST", body: JSON.stringify(data) }),
  updatePrinterGroup: (id, data) =>
    request(`/api/printer-groups/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deletePrinterGroup: (id) =>
    request(`/api/printer-groups/${id}`, { method: "DELETE" }),

  // Tables
  getTables: (outlet_id) =>
    request(`/api/tables${outlet_id ? `?outlet_id=${outlet_id}` : ""}`),
  createTable: (data) =>
    request("/api/tables", { method: "POST", body: JSON.stringify(data) }),
  updateTable: (id, data) =>
    request(`/api/tables/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTable: (id) =>
    request(`/api/tables/${id}`, { method: "DELETE" }),
  claimTable: (id) =>
    request(`/api/tables/${id}/claim`, { method: "POST" }),
  releaseTable: (id) =>
    request(`/api/tables/${id}/release`, { method: "POST" }),

  // Bar Tabs (positions)
  getBarTabs: (outlet_id) =>
    request(`/api/bar-tabs${outlet_id ? `?outlet_id=${outlet_id}` : ""}`),
  createBarTab: (data) =>
    request("/api/bar-tabs", { method: "POST", body: JSON.stringify(data) }),
  updateBarTab: (id, data) =>
    request(`/api/bar-tabs/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBarTab: (id) =>
    request(`/api/bar-tabs/${id}`, { method: "DELETE" }),
  claimBarTab: (id) =>
    request(`/api/bar-tabs/${id}/claim`, { method: "POST" }),
  releaseBarTab: (id) =>
    request(`/api/bar-tabs/${id}/release`, { method: "POST" }),
  transferBarTab: (id, newStaffId) =>
    request(`/api/bar-tabs/${id}/transfer`, { method: "POST", body: JSON.stringify({ new_staff_id: newStaffId }) }),

  // Taxes
  getTaxes: () => request("/api/taxes"),
  createTax: (data) =>
    request("/api/taxes", { method: "POST", body: JSON.stringify(data) }),
  updateTax: (id, data) =>
    request(`/api/taxes/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteTax: (id) =>
    request(`/api/taxes/${id}`, { method: "DELETE" }),

  // Analytics
  getDashboardAnalytics: () => request("/api/analytics/dashboard"),

  // Seed (dev only)
  seed: () => request("/api/seed", { method: "POST" }),

  // Image upload
  uploadImage: async (file) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("file", file);
    let res;
    try {
      res = await fetch(`${BASE_URL}/api/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
    } catch (networkErr) {
      throw new Error(`Cannot reach server. (${networkErr.message})`);
    }
    if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`);
    const data = await res.json();
    return { ...data, fullUrl: data.url.startsWith("http") ? data.url : `${BASE_URL}${data.url}` };
  },
  getImageUrl: (path) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    return `${BASE_URL}${path}`;
  },

  // Brands
  getBrands: () => request("/api/brands"),
  createBrand: (data) => request("/api/brands", { method: "POST", body: JSON.stringify(data) }),
  updateBrand: (id, data) => request(`/api/brands/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteBrand: (id) => request(`/api/brands/${id}`, { method: "DELETE" }),

  // Units
  getUnits: () => request("/api/units"),
  createUnit: (data) => request("/api/units", { method: "POST", body: JSON.stringify(data) }),
  updateUnit: (id, data) => request(`/api/units/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteUnit: (id) => request(`/api/units/${id}`, { method: "DELETE" }),

  // Bulk terminal prices
  bulkSetTerminalPrices: (data) =>
    request("/api/products/bulk-terminal-price", { method: "POST", body: JSON.stringify(data) }),

  // Product import/export
  downloadProductsTemplate: () => triggerDownload("/api/products/import/template/csv", "products_template.csv"),
  importProductsCSV: (file) => requestUpload("/api/products/import/csv", file),
  exportProductsCSV: () => triggerDownload("/api/products/export/csv", "products_export.csv"),
  exportProductsPDF: () => triggerDownload("/api/products/export/pdf", "products_export.pdf"),

  // Stock import/export
  downloadStockTemplate: () => triggerDownload("/api/stock/import/template/csv", "stock_template.csv"),
  downloadCurrentStockCSV: () => triggerDownload("/api/stock/export/csv", "stock_current.csv"),
  importStockCSV: (file) => requestUpload("/api/stock/import/csv", file),
};
