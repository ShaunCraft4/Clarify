"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square, Trash2, Send } from "lucide-react";
import { cn } from "@/lib/cn";
import { MAX_AUDIO_BYTES, formatBytes } from "@/lib/audio";

type RecorderStatus = "idle" | "recording" | "paused" | "ready";

/** Container formats Gemini understands, in preference order. */
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/webm",
  "audio/ogg",
];

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return PREFERRED_MIME_TYPES.find((type) =>
    MediaRecorder.isTypeSupported(type)
  );
}

/**
 * Gemini downsamples all audio to 16kbps mono before transcribing, so recording
 * at the browser default (stereo, ~128kbps) buys no accuracy and makes uploads
 * ~10x slower. At this bitrate a 3-hour lecture is roughly 32MB instead of 170MB.
 */
const SPEECH_BITS_PER_SECOND = 24_000;

function extensionFor(mimeType: string): string {
  const base = mimeType.split(";")[0];
  if (base.includes("ogg")) return "ogg";
  if (base.includes("mp4")) return "m4a";
  if (base.includes("wav")) return "wav";
  return "webm";
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function AudioRecorder({
  onSend,
  busy = false,
}: {
  onSend: (audio: Blob, filename: string) => void;
  busy?: boolean;
}) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const [clip, setClip] = useState<Blob | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const clipUrlRef = useRef<string | null>(null);

  useEffect(() => {
    clipUrlRef.current = clipUrl;
  }, [clipUrl]);

  // Only tick while actively recording, so paused time isn't counted.
  useEffect(() => {
    if (status !== "recording") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [status]);

  useEffect(() => {
    return () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    };
  }, []);

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function start() {
    setError(null);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Recording isn't supported in this browser. Upload a file instead.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // Mono speech capture: half the data, and gain control helps when the
          // lecturer is across the room from the laptop.
          channelCount: 1,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const preferred = pickMimeType();
      const recorder = new MediaRecorder(stream, {
        ...(preferred ? { mimeType: preferred } : {}),
        audioBitsPerSecond: SPEECH_BITS_PER_SECOND,
      });

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || preferred || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        releaseStream();

        if (blob.size === 0) {
          setStatus("idle");
          setSeconds(0);
          setError("Nothing was recorded. Try again.");
          return;
        }

        setClip(blob);
        setClipUrl(URL.createObjectURL(blob));
        setStatus("ready");
      };

      // Emit chunks periodically so pausing/resuming can't lose buffered audio.
      recorder.start(1000);
      recorderRef.current = recorder;

      if (clipUrl) URL.revokeObjectURL(clipUrl);
      setClip(null);
      setClipUrl(null);
      setSeconds(0);
      setStatus("recording");
    } catch (err) {
      releaseStream();
      const denied =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "SecurityError");
      setError(
        denied
          ? "Microphone access was blocked. Allow it in your browser settings, then try again."
          : "Couldn't start recording. Check that a microphone is connected."
      );
    }
  }

  function pause() {
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.pause();
      setStatus("paused");
    }
  }

  function resume() {
    const recorder = recorderRef.current;
    if (recorder?.state === "paused") {
      recorder.resume();
      setStatus("recording");
    }
  }

  function stop() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  function discard() {
    if (clipUrl) URL.revokeObjectURL(clipUrl);
    setClip(null);
    setClipUrl(null);
    setSeconds(0);
    setStatus("idle");
    setError(null);
  }

  function send() {
    if (!clip) return;
    if (clip.size > MAX_AUDIO_BYTES) {
      setError(
        `That recording is ${formatBytes(clip.size)} — the limit is ${formatBytes(
          MAX_AUDIO_BYTES
        )}. Record something shorter.`
      );
      return;
    }
    onSend(clip, `recording-${Date.now()}.${extensionFor(clip.type)}`);
  }

  const isLive = status === "recording" || status === "paused";

  /** Secondary controls share the app's flat bordered-button look. */
  const controlClass =
    "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60";

  return (
    <div className="space-y-3">
      {status === "idle" && (
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-brand-400 hover:text-brand-700 disabled:opacity-60"
        >
          <Mic className="h-4 w-4" />
          Record audio now
        </button>
      )}

      {isLive && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 animate-fade-in">
          <span className="inline-flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 font-mono text-sm tabular-nums text-slate-700">
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                status === "recording"
                  ? "animate-pulse bg-red-500"
                  : "bg-amber-500"
              )}
            />
            {formatDuration(seconds)}
          </span>

          <span className="flex-1 text-sm text-slate-500">
            {status === "recording"
              ? "Recording…"
              : "Paused — resume to keep going, or stop to finish."}
          </span>

          {status === "recording" ? (
            <button type="button" onClick={pause} className={controlClass}>
              <Pause className="h-4 w-4" />
              Pause
            </button>
          ) : (
            <button type="button" onClick={resume} className={controlClass}>
              <Play className="h-4 w-4" />
              Resume
            </button>
          )}

          <button type="button" onClick={stop} className={controlClass}>
            <Square className="h-4 w-4" />
            Stop
          </button>
        </div>
      )}

      {status === "ready" && clip && (
        <div className="space-y-2.5 rounded-xl border border-slate-200 bg-white p-3 animate-fade-in">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <Mic className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
              Recording{" "}
              <span className="font-medium text-slate-800">
                {formatDuration(seconds)}
              </span>{" "}
              <span className="text-slate-400">({formatBytes(clip.size)})</span>
            </span>
            <button
              type="button"
              onClick={send}
              disabled={busy}
              className="btn-primary px-3 py-1.5 text-sm"
            >
              <Send className="h-4 w-4" />
              Send for notes
            </button>
            <button
              type="button"
              onClick={discard}
              disabled={busy}
              title="Discard recording"
              className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {clipUrl && <audio controls src={clipUrl} className="h-9 w-full" />}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
