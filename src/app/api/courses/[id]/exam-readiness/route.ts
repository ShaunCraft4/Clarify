import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse } from "@/lib/api";
import { computeExamReadiness } from "@/lib/exam-readiness";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireCourse(id);
    const readiness = await computeExamReadiness(supabase, id);
    return NextResponse.json(readiness);
  });
}
