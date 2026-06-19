import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient, createClientWithToken } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface AuthedContext {
  supabase: SupabaseClient;
  user: User;
}

/**
 * Resolve the signed-in user or throw 401.
 * Tries cookie session first, then Authorization: Bearer (needed when cookie
 * refresh lags on long-running API handlers like search / notes).
 */
export async function requireUser(): Promise<AuthedContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return { supabase, user };

  const hdrs = await headers();
  const auth = hdrs.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token) {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error && data.user) {
        return {
          supabase: createClientWithToken(token),
          user: data.user,
        };
      }
    }
  }

  throw new ApiError(401, "Not authenticated");
}

/** Ensure the user owns the course, returning it. */
export async function requireCourse(courseId: string) {
  const { supabase, user } = await requireUser();
  const { data: course, error } = await supabase
    .from("courses")
    .select("*")
    .eq("id", courseId)
    .single();
  if (error || !course) throw new ApiError(404, "Course not found");
  return { supabase, user, course };
}

/** Wrap a route handler, converting ApiError/exceptions into JSON responses. */
export function handle(
  fn: () => Promise<NextResponse | Response>
): Promise<NextResponse | Response> {
  return fn().catch((err) => {
    if (err instanceof ApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[api error]", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  });
}
