import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { History, LogOut, LayoutDashboard } from "lucide-react";
import {
  Beer, Coffee, ClipboardList, Music2, ShoppingBag, ShoppingCart, UtensilsCrossed,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useBusinessConfig } from "../hooks/useBusinessConfig";
import { cn } from "../lib/utils";

const HELD_ICONS = {
  UtensilsCrossed, Beer, Coffee, Music2, ShoppingCart, ShoppingBag, ClipboardList,
};

function HeldIcon({ name, ...props }) {
  const Icon = HELD_ICONS[name] || ClipboardList;
  return <Icon {...props} />;
}

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const config = useBusinessConfig();

  const tabs = [
    {
      label: config.ordersLabel,
      icon: <HeldIcon name={config.icon} size={22} strokeWidth={2.5} />,
      path: "/held-orders",
      testId: "nav-held-orders",
    },
    {
      label: "History",
      icon: <History size={22} strokeWidth={2.5} />,
      path: "/orders",
      testId: "nav-orders",
    },
    ...(user?.role === "admin"
      ? [
          {
            label: "Admin",
            icon: <LayoutDashboard size={22} strokeWidth={2.5} />,
            path: "/admin",
            testId: "nav-admin",
          },
        ]
      : []),
  ];

  return (
    <nav
      data-testid="bottom-nav"
      className="fixed bottom-0 inset-x-0 bg-white border-t-2 border-border lg:hidden z-40"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-stretch h-16">
        {tabs.map((tab) => {
          const active = location.pathname === tab.path;
          return (
            <button
              key={tab.path}
              data-testid={tab.testId}
              onClick={() => navigate(tab.path)}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors touch-manipulation",
                active ? "text-primary" : "text-foreground-muted hover:text-foreground"
              )}
            >
              {tab.icon}
              <span className="text-[10px] font-body font-semibold leading-tight">
                {tab.label}
              </span>
              {active && (
                <span
                  className="absolute bottom-0 w-10 h-0.5 rounded-t-full bg-primary"
                  style={{ position: "static", display: "block" }}
                />
              )}
            </button>
          );
        })}

        <button
          data-testid="nav-logout"
          onClick={logout}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-foreground-muted hover:text-destructive transition-colors touch-manipulation"
        >
          <LogOut size={22} strokeWidth={2.5} />
          <span className="text-[10px] font-body font-semibold leading-tight">
            Logout
          </span>
        </button>
      </div>
    </nav>
  );
}
