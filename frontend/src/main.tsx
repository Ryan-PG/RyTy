import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import "./index.css";
import { AuthProvider, useAuth } from "./stores/AuthContext";
import { TimerProvider } from "./stores/TimerContext";
import { ProjectsProvider } from "./stores/ProjectsContext";
import { ToastProvider } from "./stores/ToastContext";
import { initI18n } from "./i18n";
import { AppShell } from "./components/AppShell";
import { Spinner } from "./components/ui";
import { LoginPage } from "./pages/LoginPage";
import { SetupPage } from "./pages/SetupPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ActivitiesPage } from "./pages/ActivitiesPage";
import { ReportsPage } from "./pages/ReportsPage";
import { AdminPage } from "./pages/AdminPage";
import { AccountPage } from "./pages/AccountPage";

function FullScreenSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg">
      <Spinner className="size-6 text-muted" />
    </div>
  );
}

/** Redirect to /setup when the initial admin password is not configured. */
function AppRoutes() {
  const { status, user, appInfo } = useAuth();
  const location = useLocation();

  if (status === "loading") return <FullScreenSpinner />;

  if (status === "unauthenticated") {
    const path = location.pathname;
    const setupIncomplete =
      appInfo !== null && !appInfo.adminExists && !appInfo.bootstrapConfigured;
    if (path === "/setup" || path === "/login") {
      // The setup screen is authoritative when configuration is missing.
      if (setupIncomplete && path !== "/setup") return <Navigate to="/setup" replace />;
      return <PublicRoutes />;
    }
    return <Navigate to={setupIncomplete ? "/setup" : "/login"} replace />;
  }

  // Authenticated.
  if (user?.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  return <AppRoutesShell />;
}

function PublicRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function AppRoutesShell() {
  const { user } = useAuth();
  return (
    <ProjectsProvider>
      <TimerProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/activities" element={<ActivitiesPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route
              path="/admin"
              element={user?.role === "admin" ? <AdminPage /> : <Navigate to="/" replace />}
            />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </TimerProvider>
    </ProjectsProvider>
  );
}

async function bootstrap() {
  await initI18n();
  createRoot(document.getElementById("root")!).render(
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>,
  );
}

void bootstrap();
