import { NextRequest, NextResponse } from "next/server";
import { handle, requireUser } from "@/lib/api";

export async function GET() {
  return handle(async () => {
    const { supabase } = await requireUser();
    const { data, error } = await supabase
      .from("courses")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ courses: data });
  });
}

export async function POST(req: NextRequest) {
  return handle(async () => {
    const { supabase, user } = await requireUser();
    const body = await req.json();
    const name = (body.name ?? "").toString().trim();
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("courses")
      .insert({
        name,
        description: body.description?.toString().trim() || null,
        user_id: user.id,
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ course: data }, { status: 201 });
  });
}
