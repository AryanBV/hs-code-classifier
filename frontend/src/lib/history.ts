/**
 * Guest history + record store, in localStorage. Survives reloads; ready to
 * "migrate on login" once Supabase `classifications` is provisioned.
 * Used by the result flow (write), the history page (list), and the permalink
 * page (read by id) in this no-DB build.
 */
import type { UiClassification } from "./types";

export interface HistoryRecord {
  id: string;
  query: string;
  createdAt: number;
  result: UiClassification;
}

const KEY = "prevyl.history.v1";

function safeRead(): HistoryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite(records: HistoryRecord[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(records.slice(0, 100)));
  } catch {
    /* quota or disabled storage: silently skip */
  }
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `r_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function listHistory(): HistoryRecord[] {
  return safeRead().sort((a, b) => b.createdAt - a.createdAt);
}

export function getHistoryRecord(id: string): HistoryRecord | null {
  return safeRead().find((r) => r.id === id) ?? null;
}

/** Persist a successful classification. Returns the stored record (with id). */
export function saveHistory(query: string, result: UiClassification, createdAt: number): HistoryRecord {
  const record: HistoryRecord = { id: makeId(), query, createdAt, result };
  const next = [record, ...safeRead().filter((r) => !(r.query === query && r.result.hsCode === result.hsCode))];
  safeWrite(next);
  return record;
}

export function clearHistory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
