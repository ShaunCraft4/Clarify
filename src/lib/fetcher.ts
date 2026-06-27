import { createClient } from "@/lib/supabase/client";

async function authHeaders(extra?: HeadersInit): Promise<HeadersInit> {
  const supabase = createClient();
  // Refresh the browser session so cookies stay valid for long requests.
  await supabase.auth.getSession();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return {
    ...(session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {}),
    ...extra,
  };
}

export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const auth = await authHeaders(options?.headers);
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    cache: "no-store",
    headers: {
      ...(options?.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...auth,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || `Request failed (${res.status})`
    );
  }
  return data as T;
}

/** Default fetcher for SWR — key is the API path. */
export function swrFetcher<T = unknown>(url: string): Promise<T> {
  return apiFetch<T>(url);
}
