import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { createAuth } from "~/server/auth";
import { DashboardNav } from "~/components/nav";

const getSession = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequestHeaders();
  const host = headers.get("x-forwarded-host") || headers.get("host") || "";
  const proto = headers.get("x-forwarded-proto") || "http";
  const origin = host ? `${proto}://${host}` : undefined;
  const auth = createAuth(env as any, origin);
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const isAdmin = session.user.id === (env as any).ADMIN_USER_ID;
  return { user: session.user, isAdmin };
});

export const Route = createFileRoute("/dashboard")({
  beforeLoad: async () => {
    const result = await getSession();
    if (!result) {
      throw redirect({ to: "/login" });
    }
    return { user: result.user, isAdmin: result.isAdmin };
  },
  component: DashboardLayout,
});

function DashboardLayout() {
  return (
    <div className="min-h-screen">
      <DashboardNav />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}
