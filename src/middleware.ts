import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options?: CookieOptions };

const PUBLIC_PATHS = ["/login", "/signup", "/auth"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

/**
 * The upload routes — `api/courses/:id/notes/audio` and `api/courses/:id/materials`
 * — are excluded on purpose. Next.js buffers the request body so middleware can
 * inspect it, and that buffer is capped, so a large upload gets truncated and its
 * multipart body is corrupt before the route ever sees it. Both routes
 * authenticate themselves via `requireCourse`, so skipping middleware costs
 * nothing and lets big files stream through.
 *
 * This must stay a single literal string: Next reads `matcher` by statically
 * analysing the source at build time, so anything it can't evaluate there (a
 * template literal, a variable, `.join()`) silently leaves middleware running on
 * every request — including `_next/static`, which breaks the logged-out app.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/courses/[^/]+/notes/audio|api/courses/[^/]+/materials|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
