import { NextResponse } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { isMissingTable } from "@/lib/db-schema";

interface StreakRow {
  streak: number;
  last_study_date: string | null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Read the signed-in user's study streak. */
export async function GET() {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase
      .from("study_streak")
      .select("streak, last_study_date")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ streak: 0, lastStudyDate: null, persisted: false });
      }
      throw error;
    }

    const row = data as StreakRow | null;
    return NextResponse.json({
      streak: row?.streak ?? 0,
      lastStudyDate: row?.last_study_date ?? null,
      persisted: true,
    });
  });
}

/** Record study activity for today, advancing/resetting the streak server-side. */
export async function POST() {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const today = todayISO();

    const { data: existing, error: readErr } = await supabase
      .from("study_streak")
      .select("streak, last_study_date")
      .eq("user_id", user.id)
      .maybeSingle();

    if (readErr) {
      if (isMissingTable(readErr)) {
        return NextResponse.json({ streak: 0, lastStudyDate: null, persisted: false });
      }
      throw readErr;
    }

    const row = existing as StreakRow | null;

    // Already counted today — nothing to advance.
    if (row?.last_study_date === today) {
      return NextResponse.json({
        streak: row.streak,
        lastStudyDate: today,
        updated: false,
        persisted: true,
      });
    }

    const streak =
      row && row.last_study_date === yesterdayISO() ? row.streak + 1 : 1;

    const { error: upsertErr } = await supabase.from("study_streak").upsert(
      {
        user_id: user.id,
        streak,
        last_study_date: today,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (upsertErr) {
      if (isMissingTable(upsertErr)) {
        return NextResponse.json({ streak: 0, lastStudyDate: null, persisted: false });
      }
      throw upsertErr;
    }

    return NextResponse.json({
      streak,
      lastStudyDate: today,
      updated: true,
      persisted: true,
    });
  });
}
