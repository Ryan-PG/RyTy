import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { X } from "lucide-react";

/* ------------------------------ Button ------------------------------ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  /** When set, the button renders as an anchor (e.g. file downloads). */
  href?: string;
  download?: boolean;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-text hover:bg-accent-hover disabled:bg-accent/60",
  secondary:
    "border border-border bg-surface text-text hover:bg-surface-2 disabled:text-faint",
  ghost: "text-muted hover:bg-surface-2 hover:text-text disabled:text-faint",
  danger: "bg-danger text-white hover:opacity-90 disabled:opacity-60",
};

const buttonBase =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius)] px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed";

export function Button({ variant = "primary", loading, className = "", children, disabled, href, download, ...rest }: ButtonProps) {
  const classes = `${buttonBase} ${buttonVariants[variant]} ${className}`;
  if (href !== undefined) {
    // Render as a link styled like a button. A nested <button> inside an
    // <a> would swallow the click and never trigger the navigation.
    return (
      <a
        className={classes}
        href={href}
        {...(download !== undefined ? { download } : {})}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      className={classes}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="size-3.5" />}
      {children}
    </button>
  );
}

/* ------------------------------ Spinner ----------------------------- */

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
    </svg>
  );
}

/* ------------------------------ Fields ------------------------------ */

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

const inputClass =
  "h-9 w-full rounded-[var(--radius)] border border-border bg-surface px-2.5 text-sm text-text placeholder:text-faint disabled:cursor-not-allowed disabled:text-faint focus:border-accent";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputClass} ${className}`} {...rest} />;
}

export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${inputClass} appearance-none pe-7 ${className}`} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${inputClass} min-h-16 py-1.5 ${className}`} {...rest} />;
}

/* ------------------------------- Card ------------------------------- */

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-[var(--radius-lg)] border border-border bg-surface ${className}`}>{children}</div>;
}

/* ------------------------------- Badge ------------------------------ */

type BadgeTone = "neutral" | "accent" | "warning" | "success" | "danger";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

/* ------------------------------- Modal ------------------------------ */

/**
 * Portal-based dialog. Rendering into document.body keeps the overlay above
 * everything else and — crucially — keeps a dialog's <form> out of any form
 * it is opened from: a form nested inside another form breaks submit
 * handling (the browser submits natively and React never sees the event).
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // With stacked dialogs (opened from inside another dialog) only the
      // topmost one — the last dialog in document order — reacts to Escape.
      const dialogs = document.querySelectorAll("[role='dialog']");
      if (dialogs.length > 0 && dialogs[dialogs.length - 1] !== ref.current) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-t-[var(--radius-lg)] border border-border bg-surface p-4 shadow-xl sm:rounded-[var(--radius-lg)] ${
          wide ? "sm:max-w-lg" : "sm:max-w-md"
        }`}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1 text-muted hover:bg-surface-2 hover:text-text"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------- Confirm dialog -------------------------- */

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  loading,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-muted">{message}</p>
      {children}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? "danger" : "primary"} loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

/* ---------------------------- Empty state --------------------------- */

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm font-medium text-text">{title}</p>
      {hint && <p className="max-w-xs text-sm text-muted">{hint}</p>}
      {action}
    </div>
  );
}

/* ------------------------- Segmented control ------------------------ */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex rounded-[var(--radius)] border border-border bg-surface-2 p-0.5"
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          role="tab"
          aria-selected={value === opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-sm font-medium transition-colors ${
            value === opt.value
              ? "bg-surface text-text shadow-sm border border-border"
              : "text-muted hover:text-text"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
