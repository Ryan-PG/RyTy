import { NavLink, Outlet, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Activity,
  BarChart3,
  CalendarDays,
  Clock3,
  Home,
  LogOut,
  Settings2,
  UserRound,
} from "lucide-react";
import { useAuth } from "../stores/AuthContext";
import { useTimer } from "../stores/TimerContext";
import { Badge } from "./ui";
import { formatLocalDate, formatToday, todayIn } from "../utils/format";

function NavItem({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex items-center gap-2.5 rounded-[var(--radius)] px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? "bg-accent-soft text-accent"
            : "text-muted hover:bg-surface-2 hover:text-text"
        }`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

function MobileNavItem({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
          isActive ? "text-accent" : "text-muted"
        }`
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}

/**
 * Responsive application shell: bottom navigation on mobile, compact
 * sidebar-style top navigation on desktop. Navigation stays quiet so the
 * primary action (activity entry) leads the screen.
 */
export function AppShell() {
  const { t } = useTranslation();
  const { user, language, logout } = useAuth();
  const { active } = useTimer();
  const navigate = useNavigate();

  const timezone = user?.timezone ?? "UTC";
  const dateFormat = user?.dateFormat ?? "gregorian";
  const today = todayIn(timezone);

  const items = [
    { to: "/", icon: <Home className="size-4.5" />, label: t("nav.dashboard") },
    { to: "/activities", icon: <Activity className="size-4.5" />, label: t("nav.activities") },
    { to: "/reports", icon: <BarChart3 className="size-4.5" />, label: t("nav.reports") },
  ];
  const adminItems = [
    { to: "/admin", icon: <Settings2 className="size-4.5" />, label: t("nav.admin") },
  ];
  const mobileItems = user?.role === "admin" ? [...items, ...adminItems] : items;

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Desktop header */}
      <header className="sticky top-0 z-30 hidden border-b border-border bg-surface/95 backdrop-blur md:block">
        <div className="mx-auto flex h-14 max-w-4xl items-center gap-4 px-4">
          <NavLink to="/" className="flex items-center gap-2 font-semibold text-text">
            <img src="/favicon.svg" alt="" className="size-6" />
            RyTy
          </NavLink>
          <nav className="flex items-center gap-1" aria-label={t("nav.dashboard")}>
            {[...items, ...(user?.role === "admin" ? adminItems : [])].map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-3">
            {active && (
              <NavLink to="/" className="flex items-center gap-1.5">
                <Badge tone="accent">
                  <Clock3 className="size-3" aria-hidden />
                  {t("timer.activeNotice")}
                </Badge>
              </NavLink>
            )}
            {/* Today's date in the calendar chosen in Admin → Settings. */}
            <span className="hidden items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted md:inline-flex">
              <CalendarDays className="size-3.5 shrink-0" aria-hidden />
              <span className="whitespace-nowrap">
                {formatToday(timezone, language, dateFormat)}
              </span>
            </span>
            <NavLink
              to="/account"
              className="flex items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-text"
            >
              <UserRound className="size-4" />
              <span>{user?.username}</span>
            </NavLink>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 rounded-[var(--radius)] px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-danger"
              title={t("nav.logout")}
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface/95 px-4 backdrop-blur md:hidden">
        <div className="flex items-center gap-2 font-semibold">
          <img src="/favicon.svg" alt="" className="size-6" />
          RyTy
        </div>
        {/* Compact date: short month/day + year; hidden while the timer
            badge needs the room. */}
        {!active && (
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate whitespace-nowrap">
              {formatLocalDate(today, language, { year: "numeric", month: "short", day: "numeric" }, dateFormat)}
            </span>
          </span>
        )}
        {active && (
          <NavLink to="/">
            <Badge tone="accent">
              <Clock3 className="size-3" aria-hidden />
              {t("timer.activeNotice")}
            </Badge>
          </NavLink>
        )}
        <NavLink
          to="/account"
          className="flex items-center gap-1.5 rounded-[var(--radius)] px-2 py-1.5 text-sm text-muted"
        >
          <UserRound className="size-4" />
          <span className="max-w-28 truncate">{user?.username}</span>
        </NavLink>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-24 pt-4 md:pb-10">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
        aria-label={t("nav.dashboard")}
      >
        {mobileItems.map((item) => (
          <MobileNavItem key={item.to} {...item} />
        ))}
        <MobileNavItem to="/account" icon={<UserRound className="size-4.5" />} label={t("nav.account")} />
      </nav>
    </div>
  );
}
