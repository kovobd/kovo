import "@/styles/admin.css";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAdmin } from "@/hooks/useAdmin";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard, Package, ShoppingCart, Users, Settings,
  LogOut, Menu, X, Tag,
  FolderTree, Percent, MonitorSmartphone, Mail,
  Home, Store, Search, Command, ChevronRight, Inbox, Bell, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";
import { useReorderReminderAttention } from "@/hooks/useReorderReminderAttention";
import { useUnreadInquiries } from "@/hooks/useUnreadInquiries";
import NotificationBell from "@/components/admin/NotificationBell";
import { settingsTabs } from "@/components/admin/SettingsLayout";
import AdminErrorBoundary from "@/components/admin/AdminErrorBoundary";
import { setRuntimeR2Base } from "@/lib/cdnImage";

const useAdminNoIndex = () => {
  useEffect(() => {
    let el = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const created = !el;
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "robots");
      document.head.appendChild(el);
    }
    const prev = el.getAttribute("content");
    el.setAttribute("content", "noindex,nofollow");
    return () => {
      if (created) el?.remove();
      else if (prev !== null) el?.setAttribute("content", prev);
    };
  }, []);
};

const prefetchAdminRoutes = (role: "admin" | "staff" | string | null) => {
  const run = () => {
    import("@/pages/admin/Dashboard");
    import("@/pages/admin/Products");
    import("@/pages/admin/Orders");
    import("@/components/admin/TaxonomyLayout");
    import("@/components/admin/SettingsLayout");
    if (role === "admin") {
      import("@/pages/admin/Customers");
      import("@/pages/admin/CouponManager");
      import("@/pages/admin/OfferManager");
      import("@/pages/admin/InquiriesManager");
    }
    // Warm every settings tab module so navigation between them is instant.
    import("@/components/admin/SettingsLayout").then(mod => {
      const tabs = (mod as { settingsTabs?: Array<{ load: () => Promise<unknown> }> }).settingsTabs;
      tabs?.forEach(t => { try { t.load(); } catch { /* noop */ } });
    });
  };
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void })
      .requestIdleCallback?.(run, { timeout: 2000 });
  } else {
    setTimeout(run, 200);
  }
};

interface NavItem {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  end?: boolean;
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  { to: "/admin", icon: LayoutDashboard, label: "Dashboard", end: true },
  { to: "/admin/pos", icon: MonitorSmartphone, label: "POS" },
  { to: "/admin/products", icon: Package, label: "Products" },
  { to: "/admin/taxonomy", icon: FolderTree, label: "Taxonomy" },
  { to: "/admin/orders", icon: ShoppingCart, label: "Orders" },
  { to: "/admin/incomplete-orders", icon: Inbox, label: "Incomplete" },
  { to: "/admin/customers", icon: Users, label: "Customers" },
  { to: "/admin/reorder-reminders", icon: Bell, label: "Re-order Reminders" },
  { to: "/admin/coupons", icon: Tag, label: "Coupons" },
  { to: "/admin/offers", icon: Percent, label: "Offers" },
  { to: "/admin/inquiries", icon: Mail, label: "Inquiries" },
  { to: "/admin/ecomdrive-logs", icon: Activity, label: "EcomDrive Logs", adminOnly: true },
];

const STAFF_ALLOWED = new Set(["Dashboard", "POS", "Products", "Taxonomy", "Orders", "Incomplete", "Settings"]);
const STAFF_SETTINGS_ALLOWED = new Set([
  "Homepage", "Shop Page", "Footer", "Floating Icons", "Delivery", "Courier API",
  "Invoice", "Tracking", "Meta Health", "About", "Contact", "Policies", "Featured Categories",
  "Announcement", "Direct Order",
]);

const ROUTE_LOADERS: Record<string, () => Promise<unknown>> = {
  "/admin": () => import("@/pages/admin/Dashboard"),
  "/admin/pos": () => import("@/pages/admin/POS"),
  "/admin/products": () => import("@/pages/admin/Products"),
  "/admin/taxonomy": () => import("@/components/admin/TaxonomyLayout"),
  "/admin/orders": () => import("@/pages/admin/Orders"),
  "/admin/incomplete-orders": () => import("@/pages/admin/IncompleteOrders"),
  "/admin/customers": () => import("@/pages/admin/Customers"),
  "/admin/reorder-reminders": () => import("@/pages/admin/ReorderReminders"),
  "/admin/coupons": () => import("@/pages/admin/CouponManager"),
  "/admin/offers": () => import("@/pages/admin/OfferManager"),
  "/admin/inquiries": () => import("@/pages/admin/InquiriesManager"),
  "/admin/roles": () => import("@/pages/admin/UserRoles"),
  "/admin/ecomdrive-logs": () => import("@/pages/admin/EcomDriveLogs"),
};
const prefetched = new Set<string>();
const prefetchRoute = (to: string) => {
  if (prefetched.has(to)) return;
  prefetched.add(to);
  ROUTE_LOADERS[to]?.();
};
const prefetchSetting = (load: () => Promise<unknown>, key: string) => {
  if (prefetched.has(key)) return;
  prefetched.add(key);
  load();
};

const AdminLayout = () => {
  useAdminNoIndex();
  const { user, role, loading, isAdmin } = useAdmin();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { unseenByType, markSeen } = useAdminNotifications();
  const { data: reminderAttention } = useReorderReminderAttention();
  const { count: unreadInquiries } = useUnreadInquiries();

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Update once per minute — seconds are not displayed, so 1s ticks were wasted re-renders.
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = currentTime.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const formattedTime = currentTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  // Auto-clear unread badge when admin opens the related page
  useEffect(() => {
    if (location.pathname.startsWith("/admin/orders") && unseenByType.order > 0) {
      markSeen("order");
    }
    if (location.pathname.startsWith("/admin/incomplete-orders") && unseenByType.incomplete_order > 0) {
      markSeen("incomplete_order");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, unseenByType.order, unseenByType.incomplete_order]);

  const badgeFor = (to: string): number => {
    if (to === "/admin/orders") return unseenByType.order;
    if (to === "/admin/incomplete-orders") return unseenByType.incomplete_order;
    if (to === "/admin/reorder-reminders") return reminderAttention?.total ?? 0;
    if (to === "/admin/inquiries") return unreadInquiries;
    return 0;
  };

  useEffect(() => {
    if (!loading && (!user || !role)) navigate("/admin/login");
    if (!loading && user && role) prefetchAdminRoutes(role);
  }, [user, role, loading, navigate]);

  useEffect(() => {
    if (!user || role !== "admin") return;
    let cancelled = false;
    supabase.functions.invoke("admin-credentials", { body: { action: "status" } })
      .then(({ data }) => {
        if (cancelled) return;
        const fields = (data as any)?.services?.r2?.fields ?? [];
        const publicBase = fields.find((f: any) => f?.key === "R2_PUBLIC_BASE_URL")?.preview;
        if (publicBase) setRuntimeR2Base(publicBase);
      })
      .catch(() => { /* keep env fallback */ });
    return () => { cancelled = true; };
  }, [user, role]);

  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sidebarOpen]);


  const filteredItems = useMemo(() => navItems.filter(item => {
    if (item.adminOnly && !isAdmin) return false;
    if (role === "staff" && !STAFF_ALLOWED.has(item.label)) return false;
    return true;
  }), [role, isAdmin]);

  const isActive = (path: string, end?: boolean) =>
    end ? location.pathname === path : location.pathname.startsWith(path);
  const isSettingsPath = location.pathname.startsWith("/admin/settings") || location.pathname.startsWith("/admin/roles");
  const roleLabel = role === "admin" ? "Admin" : role === "staff" ? "Staff" : role ?? "";

  // Persisted collapsible Settings — closed by default
  const [settingsOpen, setSettingsOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("admin:settings-open") === "1";
  });
  useEffect(() => {
    try { window.localStorage.setItem("admin:settings-open", settingsOpen ? "1" : "0"); } catch { /* noop */ }
  }, [settingsOpen]);

  // Apply admin theme to <body> so Radix portals (Dialog, Popover, Select,
  // Dropdown, Tooltip, Toast) inherit admin tokens instead of storefront ones.
  useEffect(() => {
    document.body.classList.add("admin-shell");
    return () => { document.body.classList.remove("admin-shell"); };
  }, []);

  const visibleSettings = useMemo(
    () => settingsTabs.filter(t => {
      if (t.to === "/admin/roles") return isAdmin;
      if (role === "staff" && !STAFF_SETTINGS_ALLOWED.has(t.label)) return false;
      return true;
    }),
    [role, isAdmin]
  );

  const authed = !!user && !!role;
  if (!loading && !authed) return null;

  const handleLogout = async () => { await supabase.auth.signOut(); navigate("/admin/login"); };

  return (
    <div className="admin-shell min-h-screen flex">

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[3px] lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "a-sidebar fixed lg:sticky top-0 left-0 z-50 h-screen w-[232px] flex flex-col",
          "transition-transform duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
        onTouchStart={(e) => {
          const t = e.touches[0];
          (e.currentTarget as HTMLElement & { _ts?: number })._ts = t.clientX;
        }}
        onTouchMove={(e) => {
          const el = e.currentTarget as HTMLElement & { _ts?: number };
          if (el._ts == null) return;
          const dx = e.touches[0].clientX - el._ts;
          if (dx < -60) { setSidebarOpen(false); el._ts = undefined; }
        }}
      >
        {/* Brand */}
        <div className="a-sidebar-brand flex items-center justify-between">
          <div className="min-w-0 leading-none">
            <h2
              className="font-semibold text-[13px] uppercase tracking-[0.22em]"
              style={{ color: "hsl(var(--a-ink))", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Inter', system-ui, sans-serif" }}
            >
              Admin
            </h2>
            <div className="text-[10.5px] font-medium tracking-tight tabular-nums mt-1.5" style={{ color: "hsl(var(--a-soft))" }}>
              {formattedDate} · {formattedTime}
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-md hover:bg-[hsl(var(--a-sunken))] transition-colors"
            style={{ color: "hsl(var(--a-muted))" }}
            aria-label="Close menu"
          >
            <X size={16} />
          </button>
        </div>


        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 pt-1 pb-2 space-y-0.5">
          {filteredItems.map(item => {
            const active = isActive(item.to, item.end);
            const badge = badgeFor(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onMouseEnter={() => prefetchRoute(item.to)}
                onTouchStart={() => prefetchRoute(item.to)}
                onClick={() => setSidebarOpen(false)}
                className={cn("a-nav-item", active && "is-active")}
              >
                <item.icon size={15} strokeWidth={active ? 2.1 : 1.7} />
                <span className="flex-1 truncate">{item.label}</span>
                {badge > 0 && (
                  <span className="a-nav-badge" aria-label={`${badge} unread`}>
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </NavLink>
            );
          })}

          {/* Settings — collapsible group */}
          {visibleSettings.length > 0 && (
            <div className="pt-0.5">
              <button
                type="button"
                onClick={() => setSettingsOpen(o => !o)}
                aria-expanded={settingsOpen}
                aria-controls="admin-settings-submenu"
                className={cn("a-nav-item w-full text-left", isSettingsPath && "is-active")}
              >
                <Settings size={15} strokeWidth={isSettingsPath ? 2.1 : 1.7} />
                <span className="flex-1 truncate">Settings</span>
                <ChevronRight size={13} className={cn("a-nav-caret", settingsOpen && "is-open")} />
              </button>
              <div
                id="admin-settings-submenu"
                className={cn("a-nav-sub-list", settingsOpen && "is-open")}
              >
                <div>
                  <div className="a-nav-sub-inner">
                    {visibleSettings.map(tab => {
                      const subActive = location.pathname.startsWith(tab.to);
                      return (
                        <NavLink
                          key={tab.to}
                          to={tab.to}
                          onMouseEnter={() => prefetchSetting(tab.load, tab.to)}
                          onTouchStart={() => prefetchSetting(tab.load, tab.to)}
                          onClick={() => setSidebarOpen(false)}
                          className={cn("a-nav-sub", subActive && "is-active")}
                        >
                          <tab.icon size={12} strokeWidth={subActive ? 2.1 : 1.7} />
                          <span className="truncate">{tab.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </nav>

        {/* Footer */}
        <div className="a-sidebar-footer p-2 space-y-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2.5 text-[12px] h-8 rounded-lg hover:bg-[hsl(var(--a-sunken))]"
            style={{ color: "hsl(var(--a-muted))" }}
            onClick={() => window.open("/", "_blank", "noopener,noreferrer")}
          >
            <Home size={13} /> View store
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2.5 text-[12px] h-8 rounded-lg hover:bg-[hsl(var(--a-danger-bg))] hover:text-[hsl(var(--a-danger))]"
            style={{ color: "hsl(var(--a-soft))" }}
            onClick={handleLogout}
          >
            <LogOut size={13} /> Sign out
          </Button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 min-h-screen pb-[env(safe-area-inset-bottom)]">
        {/* Mobile header — stable 52px height, no layout shift */}
        <header
          className="sticky top-0 z-30 px-2 flex items-center gap-1 lg:hidden"
          style={{
            height: 52,
            background: "hsl(var(--a-canvas) / 0.85)",
            backdropFilter: "blur(14px) saturate(180%)",
            WebkitBackdropFilter: "blur(14px) saturate(180%)",
            boxShadow: "inset 0 -1px 0 hsl(var(--a-stroke))",
          }}
        >
          <button
            onClick={() => setSidebarOpen(true)}
            className="h-11 w-11 inline-flex items-center justify-center rounded-xl hover:bg-[hsl(var(--a-sunken))] active:bg-[hsl(var(--a-canvas-2))] transition-colors"
            style={{ color: "hsl(var(--a-ink))" }}
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <span
            className="text-[15px] font-semibold flex-1 tracking-tight truncate px-1"
            style={{
              color: "hsl(var(--a-ink))",
              letterSpacing: "-0.022em",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Inter', system-ui, sans-serif",
            }}
          >
            Admin
          </span>
          <NotificationBell />
        </header>


        <div className="p-3 sm:p-5 lg:p-7 max-w-[1280px] mx-auto w-full min-w-0">
          {/* Desktop top bar with notification bell (clock lives in the sidebar) */}
          <div className="hidden lg:flex items-center justify-end mb-1 -mt-1">
            <NotificationBell />
          </div>
          {/* Page fade — keyed on top-level section so sub-tab switches
              (taxonomy/settings) don't remount the layout and flash old data. */}
          {(() => {
            const segs = location.pathname.split("/").filter(Boolean);
            // /admin -> "admin", /admin/taxonomy/categories -> "admin/taxonomy"
            const sectionKey = segs.slice(0, 2).join("/") || "admin";
            return (
              <div key={sectionKey} className="a-page-fade">
                {authed && (
                  <AdminErrorBoundary label={location.pathname}>
                    <Outlet />
                  </AdminErrorBoundary>
                )}
              </div>
            );
          })()}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
