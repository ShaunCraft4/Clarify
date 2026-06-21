const PINNED_KEY = "clarify:pinned-courses";
const RECENT_KEY = "clarify:recent-courses";
const MAX_RECENT = 5;

function readJsonArray(key: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

function writeJsonArray(key: string, value: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function getPinnedCourses(): string[] {
  return readJsonArray(PINNED_KEY);
}

export function setPinnedCourses(ids: string[]) {
  writeJsonArray(PINNED_KEY, ids);
}

export function togglePinnedCourse(courseId: string): string[] {
  const pinned = getPinnedCourses();
  const next = pinned.includes(courseId)
    ? pinned.filter((id) => id !== courseId)
    : [courseId, ...pinned];
  setPinnedCourses(next);
  return next;
}

export function getRecentCourses(): string[] {
  return readJsonArray(RECENT_KEY);
}

export function recordRecentCourse(courseId: string) {
  const recent = getRecentCourses().filter((id) => id !== courseId);
  recent.unshift(courseId);
  writeJsonArray(RECENT_KEY, recent.slice(0, MAX_RECENT));
}

export function sortCoursesForSidebar<T extends { id: string; name: string }>(
  courses: T[],
  pinned: string[],
  recent: string[]
): T[] {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const ordered: T[] = [];
  const seen = new Set<string>();

  for (const id of pinned) {
    const course = byId.get(id);
    if (course && !seen.has(id)) {
      ordered.push(course);
      seen.add(id);
    }
  }

  for (const id of recent) {
    const course = byId.get(id);
    if (course && !seen.has(id)) {
      ordered.push(course);
      seen.add(id);
    }
  }

  const rest = courses
    .filter((c) => !seen.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return [...ordered, ...rest];
}
