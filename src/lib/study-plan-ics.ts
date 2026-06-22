import type { StudyPlanDay } from "@/lib/types";

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, "\\n");
}

function toIcsDate(dateStr: string): string {
  return dateStr.replace(/-/g, "");
}

function uid(day: number): string {
  return `clarify-study-day-${day}-${Date.now()}@clarify`;
}

export function studyPlanToIcs(
  plan: StudyPlanDay[],
  courseName: string,
  hoursPerDay: number
): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

  const events = plan.map((day) => {
    const topics =
      day.topics?.length > 0 ? day.topics.join(", ") : courseName;
    const summary = escapeIcs(`Study: ${topics}`);
    const taskLines = (day.tasks ?? []).map((t) => `• ${t}`).join("\n");
    const description = escapeIcs(
      [`${hoursPerDay}h planned`, taskLines].filter(Boolean).join("\n\n")
    );

    return [
      "BEGIN:VEVENT",
      `UID:${uid(day.day)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(day.date)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      "END:VEVENT",
    ].join("\r\n");
  });

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Clarify//Study Plan//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}
