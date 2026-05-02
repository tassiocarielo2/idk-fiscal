import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const APP_PATHS_PREFIX = ["/dashboard", "/onboarding"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAppPath = APP_PATHS_PREFIX.some((p) => path === p || path.startsWith(`${p}/`));
  const isAuthPath = path === "/login" || path === "/sign-up";

  if (!user && isAppPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPath) {
    const { count } = await supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .not("accepted_at", "is", null);

    const url = request.nextUrl.clone();
    url.pathname = (count ?? 0) > 0 ? "/dashboard" : "/onboarding";
    return NextResponse.redirect(url);
  }

  return response;
}
