import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import { generateText } from "@/lib/ai/gemini";
import {
  NO_SPEECH_SENTINEL,
  extractNotesTitle,
  speechNotesSystem,
  transcriptNotesPrompt,
} from "@/lib/ai/speech-notes";
import { MAX_TRANSCRIPT_CHARS, MIN_TRANSCRIPT_CHARS } from "@/lib/audio";

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { course } = await requireCourse(id);

    const body = await req.json();
    const transcript = String(body.transcript ?? "").trim();

    if (transcript.length < MIN_TRANSCRIPT_CHARS) {
      throw new ApiError(
        400,
        `That transcript is too short to work with — paste at least ${MIN_TRANSCRIPT_CHARS} characters.`
      );
    }
    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      throw new ApiError(
        400,
        `That transcript is ${transcript.length.toLocaleString()} characters — the limit is ${MAX_TRANSCRIPT_CHARS.toLocaleString()}. Split it into a couple of parts and generate notes for each.`
      );
    }

    const notes = await generateText(
      transcriptNotesPrompt(transcript),
      speechNotesSystem(course.name)
    );

    if (!notes || notes.includes(NO_SPEECH_SENTINEL)) {
      throw new ApiError(
        400,
        "We couldn't find anything to write notes from in that transcript."
      );
    }

    return NextResponse.json({
      title: extractNotesTitle(notes, `${course.name} — Transcript Notes`),
      notes,
    });
  });
}
