import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { api } from "../services/api";
import { MAX_COOPS_PER_ACTIVITY } from "@ryty/shared";

interface CoopPickerProps {
  /** Controlled co-doer user ids. */
  value: number[];
  onChange: (ids: number[]) => void;
  /** The activity owner (excluded from the list). */
  ownerId: number | undefined;
  placeholder?: string;
  ariaLabel?: string;
}

interface UserOption {
  id: number;
  username: string;
}

let userCache: UserOption[] | null = null;

/**
 * Co-doer ("pair-doer") picker: chips with team member usernames and an
 * autocomplete dropdown backed by the user directory (cached per session).
 * The owner is always excluded; adding is instant (Enter or comma).
 */
export function CoopPicker({ value, onChange, ownerId, placeholder, ariaLabel }: CoopPickerProps) {
  const [text, setText] = useState("");
  const [users, setUsers] = useState<UserOption[]>(userCache ?? []);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (userCache) return;
      try {
        const list = await api.listUsersForFilter();
        if (!cancelled) {
          userCache = list;
          setUsers(list);
        }
      } catch {
        // directory is non-critical for entry
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const selectable = useMemo(
    () =>
      users.filter(
        (u) => u.id !== ownerId && !value.includes(u.id),
      ),
    [users, ownerId, value],
  );

  const matches = useMemo(() => {
    const query = text.trim().toLowerCase();
    if (!query) return selectable;
    return selectable.filter((u) => u.username.toLowerCase().includes(query));
  }, [selectable, text]);

  const addCoop = (id: number) => {
    if (value.includes(id) || value.length >= MAX_COOPS_PER_ACTIVITY) return;
    onChange([...value, id]);
    setText("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      const target = matches[highlight] ?? matches[0];
      if (target) addCoop(target.id);
      else if (text.trim()) setOpen(true);
    } else if (e.key === "Backspace" && !text && value.length > 0) {
      onChange(value.slice(0, -1));
    } else if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const usernameOf = (id: number) => users.find((u) => u.id === id)?.username ?? `#${id}`;

  return (
    <div ref={containerRef} className="relative">
      <div className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-1.5 py-1">
        {value.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-text"
          >
            <span dir="ltr">@{usernameOf(id)}</span>
            <button
              type="button"
              aria-label={`Remove ${usernameOf(id)}`}
              className="rounded-full hover:text-danger"
              onClick={() => onChange(value.filter((v) => v !== id))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {value.length < MAX_COOPS_PER_ACTIVITY && (
          <input
            type="text"
            value={text}
            aria-label={ariaLabel}
            placeholder={value.length === 0 ? placeholder : undefined}
            className="h-6 min-w-24 flex-1 border-0 bg-transparent text-sm text-text placeholder:text-faint focus:outline-none"
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(true)}
          />
        )}
      </div>
      {open && matches.length > 0 && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-[var(--radius)] border border-border bg-surface py-1 shadow-lg"
        >
          {matches.map((user, i) => (
            <li key={user.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={`w-full px-3 py-1.5 text-start text-sm ${
                  i === highlight ? "bg-accent-soft text-accent" : "text-text hover:bg-surface-2"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addCoop(user.id);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span dir="ltr">@{user.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
