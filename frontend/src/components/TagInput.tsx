import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Tag } from "@ryty/shared";
import { api } from "../services/api";
import { TAG_NAME_MAX_LENGTH } from "@ryty/shared";

interface TagInputProps {
  /** Controlled tag names. */
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}

/**
 * Fast tag entry: type a name and press "," (or Enter) to add it as a chip.
 * Autocomplete shows matching public tags (debounced, cached); unknown tags
 * are created server-side on submit. Backspace removes the last chip.
 */
export function TagInput({ value, onChange, placeholder, ariaLabel, autoFocus }: TagInputProps) {
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef<Map<string, Tag[]>>(new Map());

  // Debounced autocomplete with a small in-memory cache.
  useEffect(() => {
    const query = text.trim();
    if (!query) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const cached = cacheRef.current.get(query.toLowerCase());
      if (cached) {
        setSuggestions(cached);
        setOpen(cached.length > 0);
        return;
      }
      try {
        const results = await api.listTags(query);
        if (cancelled) return;
        cacheRef.current.set(query.toLowerCase(), results);
        setSuggestions(results);
        setOpen(results.length > 0);
        setHighlight(0);
      } catch {
        // autocomplete is non-critical
      }
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [text]);

  // Close the dropdown when clicking outside.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const addTag = (raw: string) => {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, TAG_NAME_MAX_LENGTH);
    if (!name) return;
    if (value.some((t) => t.toLowerCase() === name.toLowerCase())) {
      setText("");
      return;
    }
    onChange([...value, name]);
    setText("");
    setOpen(false);
  };

  const removeTag = (name: string) => {
    onChange(value.filter((t) => t !== name));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      if (open && suggestions[highlight] && text.trim()) {
        addTag(suggestions[highlight].name);
      } else {
        addTag(text);
      }
    } else if (e.key === "Backspace" && !text && value.length > 0) {
      onChange(value.slice(0, -1));
    } else if (e.key === "ArrowDown" && open) {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp" && open) {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const exactMatch = useMemo(
    () => suggestions.some((s) => s.name.toLowerCase() === text.trim().toLowerCase()),
    [suggestions, text],
  );

  return (
    <div ref={containerRef} className="relative">
      <div className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-1.5 py-1">
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
          >
            {tag}
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              className="rounded-full hover:text-danger"
              onClick={() => removeTag(tag)}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={text}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          placeholder={value.length === 0 ? placeholder : undefined}
          maxLength={TAG_NAME_MAX_LENGTH}
          className="h-6 min-w-24 flex-1 border-0 bg-transparent text-sm text-text placeholder:text-faint focus:outline-none"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
        />
      </div>
      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-[var(--radius)] border border-border bg-surface py-1 shadow-lg"
        >
          {suggestions.map((tag, i) => (
            <li key={tag.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={`w-full px-3 py-1.5 text-start text-sm ${
                  i === highlight ? "bg-accent-soft text-accent" : "text-text hover:bg-surface-2"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep input focus
                  addTag(tag.name);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                {tag.name}
              </button>
            </li>
          ))}
          {text.trim() && !exactMatch && (
            <li>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-start text-sm text-accent hover:bg-accent-soft"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(text);
                }}
              >
                + {text.trim()}
              </button>
            </li>
          )}
        </ul>
      )}
      <p className="mt-1 text-xs text-faint">{placeholder && value.length > 0 ? placeholder : null}</p>
    </div>
  );
}
