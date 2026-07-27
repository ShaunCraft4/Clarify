/**
 * Shared prompting for turning spoken content into study notes. Used by both
 * the audio route (Gemini listens to the recording) and the transcript route
 * (the student supplies the text), so the two produce consistent output.
 */

const FORMATTING = `Formatting:
- Start with a single "#" title that reflects the subject.
- Use "##" for each main topic and "###" for subtopics.
- **Bold** key terms, definitions, formulas, names, and dates.
- Prefer bullet points and short paragraphs over walls of text.
- End with a "## Quick Recap" bullet list of the most important points.`;

const SHARED_CONTENT_RULES = `- Capture explanations, examples, and anything the speaker emphasised or repeated.
- Organise by topic, not strictly in the order things were said.
- Ignore filler words, false starts, tangents, and background chatter.
- If deadlines, exam dates, or tasks are mentioned, add an "## Action items" section.`;

/** Sentinel the model returns when there's nothing worth writing notes from. */
export const NO_SPEECH_SENTINEL = "NO_SPEECH_DETECTED";

export function speechNotesSystem(courseName: string): string {
  return `You are an expert tutor for "${courseName}". A student has given you a lecture, seminar, study discussion, or their own spoken notes. Turn it into polished, well-organised study notes. Output well-structured Markdown only, with no preamble or commentary about the source itself.`;
}

export const AUDIO_NOTES_PROMPT = `Listen to this recording and write thorough study notes from what is said.

${FORMATTING}

Content rules:
${SHARED_CONTENT_RULES}
- Do NOT invent anything that isn't in the recording. If a passage is inaudible or unclear, briefly note that instead of guessing.
- If the recording contains no discernible speech, reply with exactly: ${NO_SPEECH_SENTINEL}`;

export function transcriptNotesPrompt(transcript: string): string {
  return `Write thorough study notes from the lecture transcript below.

${FORMATTING}

Content rules:
${SHARED_CONTENT_RULES}
- Do NOT invent anything that isn't in the transcript. Transcripts often contain
  mis-heard words; if a passage is clearly garbled, work around it rather than
  guessing at technical detail.
- If the transcript has no meaningful content, reply with exactly: ${NO_SPEECH_SENTINEL}

TRANSCRIPT:
${transcript}`;
}

/** Use the generated "# Heading" as the note title when there is one. */
export function extractNotesTitle(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  const title = match?.[1].trim();
  return title && title.length <= 120 ? title : fallback;
}
