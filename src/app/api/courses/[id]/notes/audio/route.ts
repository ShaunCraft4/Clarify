import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import { generateFromAudio } from "@/lib/ai/gemini";
import {
  AUDIO_NOTES_PROMPT,
  NO_SPEECH_SENTINEL,
  extractNotesTitle,
  speechNotesSystem,
} from "@/lib/ai/speech-notes";
import {
  MAX_AUDIO_BYTES,
  formatBytes,
  resolveAudioMimeType,
} from "@/lib/audio";

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { course } = await requireCourse(id);

    const form = await req.formData();
    const file = form.get("audio");

    if (!(file instanceof File)) {
      throw new ApiError(400, "No audio file was uploaded.");
    }
    if (file.size === 0) {
      throw new ApiError(400, "That audio file is empty.");
    }
    if (file.size > MAX_AUDIO_BYTES) {
      throw new ApiError(
        400,
        `That recording is ${formatBytes(file.size)} — the limit is ${formatBytes(
          MAX_AUDIO_BYTES
        )}. Compress it to MP3, split it up, or paste a transcript instead.`
      );
    }

    const mimeType = resolveAudioMimeType(file.type, file.name);
    if (!mimeType) {
      throw new ApiError(
        400,
        "That file type isn't supported. Use MP3, WAV, M4A, AAC, OGG, FLAC, or WEBM audio."
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const notes = await generateFromAudio(
      buffer,
      mimeType,
      AUDIO_NOTES_PROMPT,
      speechNotesSystem(course.name)
    );

    if (!notes || notes.includes(NO_SPEECH_SENTINEL)) {
      throw new ApiError(
        400,
        "We couldn't hear any speech in that recording. Check your microphone or try a clearer file."
      );
    }

    return NextResponse.json({
      title: extractNotesTitle(notes, `${course.name} — Audio Notes`),
      notes,
    });
  });
}
