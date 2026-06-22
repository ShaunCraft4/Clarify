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

/** Record one study session for today. Returns true if the streak was updated. */
export function recordStudyActivity(): boolean {
  if (typeof window === "undefined") return false;

  const today = todayISO();
  const state = getStudyStreak();
  if (state.lastStudyDate === today) return false;

  let streak = 1;
  if (state.lastStudyDate === yesterdayISO()) {
    streak = state.streak + 1;
  }

  const next: StudyStreakState = { streak, lastStudyDate: today };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }

  window.dispatchEvent(new CustomEvent(STUDY_STREAK_EVENT, { detail: next }));
  return true;
}
