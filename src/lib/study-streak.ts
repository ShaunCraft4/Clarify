import { apiFetch } from "@/lib/fetcher";

const STORAGE_KEY = "clarify:study-streak";
export const STUDY_STREAK_EVENT = "clarify:study-streak-updated";

export interface StudyStreakState {
  streak: number;
  lastStudyDate: string | null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function writeLocal(state: StudyStreakState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function emit(state: StudyStreakState) {
  writeLocal(state);
  window.dispatchEvent(new CustomEvent(STUDY_STREAK_EVENT, { detail: state }));
}

/** Synchronous local cache read — used for instant first paint. */
export function getStudyStreak(): StudyStreakState {
  if (typeof window === "undefined") {
    return { streak: 0, lastStudyDate: null };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { streak: 0, lastStudyDate: null };
    const parsed = JSON.parse(raw) as StudyStreakState;
    return {
      streak: Math.max(0, Number(parsed.streak) || 0),
      lastStudyDate: parsed.lastStudyDate ?? null,
    };
  } catch {
    return { streak: 0, lastStudyDate: null };
  }
}

/**
 * Load the authoritative streak from the user's account, updating the local
 * cache and notifying listeners. Falls back to the local cache on failure.
 */
export async function loadStudyStreak(): Promise<StudyStreakState> {
  if (typeof window === "undefined") return { streak: 0, lastStudyDate: null };
  try {
    const data = await apiFetch<{
      streak: number;
      lastStudyDate: string | null;
      persisted?: boolean;
    }>("/api/study-streak");
    const state: StudyStreakState = {
      streak: Math.max(0, Number(data.streak) || 0),
      lastStudyDate: data.lastStudyDate ?? null,
    };
    // Only trust the server when the table is actually present.
    if (data.persisted !== false) emit(state);
    return state;
  } catch {
    return getStudyStreak();
  }
}

/**
 * Record one study session for today. Updates the local cache immediately for
 * snappy UI, then persists to the account and reconciles with the server value
 * so the streak is shared across browsers/devices.
 */
export async function recordStudyActivity(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const today = todayISO();
  const local = getStudyStreak();
  const alreadyToday = local.lastStudyDate === today;

  // Optimistic local update for instant feedback.
  if (!alreadyToday) {
    const optimisticStreak =
      local.lastStudyDate === yesterdayISO() ? local.streak + 1 : 1;
    emit({ streak: optimisticStreak, lastStudyDate: today });
  }

  // Persist to the account and reconcile with the authoritative value.
  try {
    const data = await apiFetch<{
      streak: number;
      lastStudyDate: string | null;
      persisted?: boolean;
    }>("/api/study-streak", { method: "POST" });
    if (data.persisted !== false) {
      emit({
        streak: Math.max(0, Number(data.streak) || 0),
        lastStudyDate: data.lastStudyDate ?? today,
      });
    }
  } catch {
    /* keep the optimistic local value */
  }

  return !alreadyToday;
}
