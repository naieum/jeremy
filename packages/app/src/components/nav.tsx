import { Link, useRouteContext, useRouter } from "@tanstack/react-router";
import { signOut, useSession } from "~/server/lib/auth-client";

export function DashboardNav() {
  const { data: session } = useSession();
  const { isAdmin } = useRouteContext({ from: "/dashboard" });

  return (
    <nav className="border-b border-border bg-bg">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link to="/dashboard" className="text-lg font-bold text-text">
            jeremy
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link
              to="/dashboard/libraries"
              className="text-muted hover:text-text transition-colors [&.active]:text-text"
            >
              Libraries
            </Link>
            <Link
              to="/dashboard/keys"
              className="text-muted hover:text-text transition-colors [&.active]:text-text"
            >
              API Keys
            </Link>
            <Link
              to="/dashboard/settings"
              className="text-muted hover:text-text transition-colors [&.active]:text-text"
            >
              Settings
            </Link>
            {isAdmin && (
              <>
                <Link
                  to="/dashboard/chat"
                  className="text-muted hover:text-text transition-colors [&.active]:text-text"
                >
                  Chat
                </Link>
                <Link
                  to="/dashboard/admin"
                  className="text-muted hover:text-text transition-colors [&.active]:text-text"
                >
                  Admin
                </Link>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {session?.user && (
            <>
              <span className="text-sm text-muted">
                {session.user.name || session.user.email}
              </span>
              <button
                onClick={() => signOut({ fetchOptions: { onSuccess: () => { window.location.href = "/"; } } })}
                className="text-sm text-muted hover:text-text transition-colors"
              >
                Sign Out
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
