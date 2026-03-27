/// <reference types="vite/client" />
import { type ReactNode, useEffect } from "react";
import {
  Outlet,
  HeadContent,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import "~/styles.css";
import { initTheme } from "~/lib/theme";
import { ToastProvider } from "~/components/ui/toast";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Jeremy - Documentation RAG for AI Coding Tools" },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  useEffect(() => {
    initTheme();
  }, []);

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-bg text-text font-sans antialiased">
        {children}
        <ToastProvider />
        <Scripts />
      </body>
    </html>
  );
}
