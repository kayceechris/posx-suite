import { useBusiness } from "../context/BusinessContext";

const CONFIGS = {
  restaurant: {
    displayName: "Restaurant",
    staffTitle: "Waiter",
    staffTitlePlural: "Waiters",
    ordersLabel: "Held Orders",
    orderLabel: "Table Order",
    orderIdLabel: (order) =>
      order.table_number
        ? `Table ${order.table_number}`
        : `Order ${order.order_number?.slice(-6) || "—"}`,
    emptyMessage: "No held orders yet.",
    emptySubMessage: "Place and hold a table order to see it here.",
    accent: "#F97316",
    accentBg: "#FFF7ED",
    accentText: "text-orange-600",
    accentBadge: "bg-orange-100 text-orange-700",
    headerBg: "from-orange-500 to-amber-500",
    icon: "UtensilsCrossed",
    emptyIcon: "ClipboardList",
    showTable: true,
    tabName: "Tab",
  },

  bar: {
    displayName: "Bar",
    staffTitle: "Bartender",
    staffTitlePlural: "Bartenders",
    ordersLabel: "Open Tabs",
    orderLabel: "Bar Tab",
    orderIdLabel: (order) =>
      order.customer_name
        ? `${order.customer_name}'s Tab`
        : `Tab #${(order.order_number || "").slice(-4) || "—"}`,
    emptyMessage: "No open tabs.",
    emptySubMessage: "Start a bar tab to see it here.",
    accent: "#EAB308",
    accentBg: "#FEFCE8",
    accentText: "text-yellow-600",
    accentBadge: "bg-yellow-100 text-yellow-700",
    headerBg: "from-yellow-500 to-orange-400",
    icon: "Beer",
    emptyIcon: "GlassWater",
    showTable: false,
    tabName: "Tab",
  },

  nightclub: {
    displayName: "Nightclub",
    staffTitle: "Host",
    staffTitlePlural: "Hosts",
    ordersLabel: "Active Tabs",
    orderLabel: "VIP Tab",
    orderIdLabel: (order) => {
      if (order.table_number) return `VIP Table ${order.table_number}`;
      if (order.customer_name) return order.customer_name;
      return `Tab #${(order.order_number || "").slice(-4) || "—"}`;
    },
    emptyMessage: "No active tabs.",
    emptySubMessage: "Open a VIP tab to see it here.",
    accent: "#8B5CF6",
    accentBg: "#F5F3FF",
    accentText: "text-violet-600",
    accentBadge: "bg-violet-100 text-violet-700",
    headerBg: "from-violet-600 to-purple-500",
    icon: "Music2",
    emptyIcon: "PartyPopper",
    showTable: true,
    tabName: "VIP Tab",
  },

  cafe: {
    displayName: "Café",
    staffTitle: "Barista",
    staffTitlePlural: "Baristas",
    ordersLabel: "Order Queue",
    orderLabel: "Order",
    orderIdLabel: (order) =>
      order.customer_name
        ? order.customer_name
        : `#${(order.order_number || "").slice(-4) || "—"}`,
    emptyMessage: "Queue is clear.",
    emptySubMessage: "Ready for the next order!",
    accent: "#10B981",
    accentBg: "#ECFDF5",
    accentText: "text-emerald-600",
    accentBadge: "bg-emerald-100 text-emerald-700",
    headerBg: "from-emerald-500 to-teal-500",
    icon: "Coffee",
    emptyIcon: "Coffee",
    showTable: false,
    tabName: "Order",
  },

  // Fallback for supermarket / retail (not in the feature spec, but handled gracefully)
  supermarket: {
    displayName: "Supermarket",
    staffTitle: "Cashier",
    staffTitlePlural: "Cashiers",
    ordersLabel: "Held Transactions",
    orderLabel: "Transaction",
    orderIdLabel: (order) => `Txn #${(order.order_number || "").slice(-6) || "—"}`,
    emptyMessage: "No held transactions.",
    emptySubMessage: "Hold a transaction to see it here.",
    accent: "#3B82F6",
    accentBg: "#EFF6FF",
    accentText: "text-blue-600",
    accentBadge: "bg-blue-100 text-blue-700",
    headerBg: "from-blue-500 to-cyan-500",
    icon: "ShoppingCart",
    emptyIcon: "ShoppingBag",
    showTable: false,
    tabName: "Transaction",
  },

  retail: {
    displayName: "Retail",
    staffTitle: "Cashier",
    staffTitlePlural: "Cashiers",
    ordersLabel: "Held Sales",
    orderLabel: "Sale",
    orderIdLabel: (order) => `Sale #${(order.order_number || "").slice(-6) || "—"}`,
    emptyMessage: "No held sales.",
    emptySubMessage: "Hold a sale to see it here.",
    accent: "#3B82F6",
    accentBg: "#EFF6FF",
    accentText: "text-blue-600",
    accentBadge: "bg-blue-100 text-blue-700",
    headerBg: "from-blue-500 to-indigo-500",
    icon: "ShoppingBag",
    emptyIcon: "Tag",
    showTable: false,
    tabName: "Sale",
  },
};

const DEFAULT_CONFIG = CONFIGS.restaurant;

export function useBusinessConfig() {
  const { settings } = useBusiness();
  const type = settings?.business_type || "restaurant";
  return CONFIGS[type] || DEFAULT_CONFIG;
}
