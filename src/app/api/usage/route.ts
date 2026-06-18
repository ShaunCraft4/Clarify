import { NextResponse } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { getUsage } from "@/lib/ai/usage";

export async function GET() {
  return handle(async () => {
    await requireUser();
    return NextResponse.json(getUsage());
  });
}
