import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { CircleAlert, ShieldCheck, Terminal } from "lucide-react";
import { api } from "../services/api";
import type { SetupStatus } from "@ryty/shared";
import { Spinner } from "../components/ui";

function CodeBlock({ children }: { children: string }) {
  return (
    <pre
      dir="ltr"
      className="overflow-x-auto rounded-[var(--radius)] border border-border bg-surface-2 p-2.5 text-xs text-text"
    >
      <code>{children}</code>
    </pre>
  );
}

/**
 * First-run setup screen. Never collects secrets — it only explains how to
 * configure the initial administrator password in the server environment.
 */
export function SetupPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<(SetupStatus & { appName?: string }) | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setStatus(await api.setupStatus());
      } catch {
        setError(true);
      }
    };
    void load();
  }, []);

  if (error) {
    return (
      <Centered>
        <p className="text-sm text-danger">{t("common.errorGeneric")}</p>
        <Link to="/login" className="text-sm text-accent hover:underline">
          {t("setup.openLogin")}
        </Link>
      </Centered>
    );
  }

  if (!status) {
    return (
      <Centered>
        <Spinner className="size-5 text-muted" />
        <p className="text-sm text-muted">{t("setup.checking")}</p>
      </Centered>
    );
  }

  if (status.adminExists || (status.bootstrapConfigured && status.adminExists)) {
    return (
      <Centered>
        <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-border bg-surface p-5 text-center shadow-sm">
          <ShieldCheck className="mx-auto mb-2 size-8 text-success" aria-hidden />
          <h1 className="text-lg font-semibold">{t("setup.adminReady")}</h1>
          <Link
            to="/login"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-[var(--radius)] bg-accent px-4 text-sm font-medium text-accent-text hover:bg-accent-hover"
          >
            {t("setup.openLogin")}
          </Link>
        </div>
      </Centered>
    );
  }

  if (!status.bootstrapConfigured) {
    return (
      <Centered>
        <div className="w-full max-w-lg rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <CircleAlert className="size-5 text-warning" aria-hidden />
            <h1 className="text-lg font-semibold">{t("setup.title")}</h1>
          </div>
          <p className="text-sm text-muted">{t("setup.subtitle")}</p>
          <p className="mt-2 rounded-[var(--radius)] bg-warning-soft p-2.5 text-sm text-warning">
            {t("setup.missingPassword")}
          </p>

          <section className="mt-4">
            <h2 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
              <Terminal className="size-4 text-muted" aria-hidden />
              {t("setup.cloudflareTitle")}
            </h2>
            <p className="mb-1.5 text-sm text-muted">{t("setup.cloudflareSteps")}</p>
            <CodeBlock>npx wrangler secret put INITIAL_ADMIN_PASSWORD</CodeBlock>
          </section>

          <section className="mt-4">
            <h2 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
              <Terminal className="size-4 text-muted" aria-hidden />
              {t("setup.dockerTitle")}
            </h2>
            <p className="mb-1.5 text-sm text-muted">{t("setup.dockerSteps")}</p>
            <CodeBlock>INITIAL_ADMIN_PASSWORD=choose-a-long-random-password</CodeBlock>
          </section>

          <p className="mt-4 flex items-start gap-2 rounded-[var(--radius)] bg-surface-2 p-2.5 text-xs text-muted">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden />
            {t("setup.securityNote")}
          </p>

          {status.bootstrapUsername && (
            <p className="mt-3 text-xs text-faint">
              {t("setup.configuredUsername")}: <code dir="ltr">{status.bootstrapUsername}</code>
            </p>
          )}

          <div className="mt-4 text-center">
            <Link to="/login" className="text-sm text-accent hover:underline">
              {t("setup.openLogin")}
            </Link>
          </div>
        </div>
      </Centered>
    );
  }

  // Bootstrap configured but no admin yet — the first login with the
  // configured credentials will create the account. Point the user to login.
  return (
    <Centered>
      <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-border bg-surface p-5 text-center shadow-sm">
        <h1 className="text-lg font-semibold">{t("setup.openLogin")}</h1>
        <p className="mt-1 text-sm text-muted">
          {t("setup.configuredUsername")}: <code dir="ltr">{status.bootstrapUsername}</code>
        </p>
        <Link
          to="/login"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-[var(--radius)] bg-accent px-4 text-sm font-medium text-accent-text hover:bg-accent-hover"
        >
          {t("auth.signIn")}
        </Link>
      </div>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-8">
      {children}
    </div>
  );
}
