import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { deviceAuthorization } from "better-auth/plugins/device-authorization";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./db/schema";

export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  BASE_URL: string;
}

export function createAuth(env: AuthEnv, requestOrigin?: string) {
  const db = drizzle(env.DB, { schema });
  const baseURL = requestOrigin || env.BASE_URL;

  return betterAuth({
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "sqlite", transaction: false }),
    emailAndPassword: { enabled: true },
    trustedOrigins: [baseURL, env.BASE_URL],
    socialProviders: {
      github: {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
      },
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    plugins: [
      deviceAuthorization({
        verificationUri: "/device",
        expiresIn: "15m",
        userCodeLength: 8,
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
