"use client";

import { useRef, useState } from "react";
import { commitStudioNumber, formatStudioNumber } from "@/lib/studio/number-input";

const fieldClass = "mt-1 h-10 w-full rounded-xl border border-line bg-background px-3 text-sm";

export function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const display = draft ?? formatStudioNumber(value);

  function confirm(raw: string) {
    if (cancelRef.current) {
      cancelRef.current = false;
      setDraft(null);
      return;
    }
    const next = commitStudioNumber(raw, min, max);
    setDraft(null);
    if (next === null) return;
    if (next !== value) onCommit(next);
  }

  return (
    <label className="block text-sm">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <input
        className={fieldClass}
        inputMode="decimal"
        value={display}
        onFocus={() => setDraft(formatStudioNumber(value))}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => confirm(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            (event.currentTarget as HTMLInputElement).blur();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            cancelRef.current = true;
            setDraft(null);
            (event.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}
