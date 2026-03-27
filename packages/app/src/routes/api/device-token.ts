import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { createDb, schema } from "~/server/db";
import { eq } from "drizzle-orm";
import { generateApiKey, hashKey } from "~/server/middleware/api-auth";

export const Route = createFileRoute("/api/device-token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            device_code: string;
            client_id: string;
            grant_type?: string;
          };

          if (!body.device_code || !body.client_id) {
            return Response.json(
              { error: "invalid_request", error_description: "device_code and client_id are required" },
              { status: 400 }
            );
          }

          const db = createDb(env.DB);

          const [record] = await db
            .select()
            .from(schema.deviceCode)
            .where(eq(schema.deviceCode.deviceCode, body.device_code))
            .limit(1);

          if (!record) {
            return Response.json(
              { error: "invalid_grant", error_description: "Invalid device code" },
              { status: 400 }
            );
          }

          // Check expiry
          if (record.expiresAt && record.expiresAt.getTime() < Date.now()) {
            return Response.json(
              { error: "expired_token", error_description: "Device code has expired" },
              { status: 400 }
            );
          }

          // Check client_id match
          if (record.clientId && record.clientId !== body.client_id) {
            return Response.json(
              { error: "invalid_grant", error_description: "Client ID mismatch" },
              { status: 400 }
            );
          }

          // Rate limit polling (5s minimum interval)
          if (record.lastPolledAt) {
            const elapsed = Date.now() - record.lastPolledAt.getTime();
            const minInterval = (record.pollingInterval ?? 5) * 1000;
            if (elapsed < minInterval) {
              return Response.json(
                { error: "slow_down", error_description: "Polling too frequently" },
                { status: 400 }
              );
            }
          }

          // Update last polled time
          await db
            .update(schema.deviceCode)
            .set({ lastPolledAt: new Date(), updatedAt: new Date() })
            .where(eq(schema.deviceCode.id, record.id));

          if (record.status === "pending") {
            return Response.json(
              { error: "authorization_pending", error_description: "Authorization pending" },
              { status: 400 }
            );
          }

          if (record.status === "denied") {
            return Response.json(
              { error: "access_denied", error_description: "Access denied by user" },
              { status: 400 }
            );
          }

          if (record.status === "approved" && record.userId) {
            // Create an API key for the user
            const rawKey = generateApiKey();
            const keyHashValue = await hashKey(rawKey);
            const keyId = crypto.randomUUID();

            await db.insert(schema.apiKeys).values({
              id: keyId,
              userId: record.userId,
              name: "MCP (auto)",
              keyHash: keyHashValue,
              keyPrefix: rawKey.slice(0, 12),
              permissions: "admin",
            });

            // Clean up the device code
            await db.delete(schema.deviceCode).where(eq(schema.deviceCode.id, record.id));

            return Response.json({
              access_token: rawKey,
              token_type: "Bearer",
              scope: record.scope ?? "",
            });
          }

          return Response.json(
            { error: "invalid_grant", error_description: "Unexpected device code status" },
            { status: 400 }
          );
        } catch (e: any) {
          console.error("Device token error:", e?.message);
          return Response.json(
            { error: "server_error", error_description: "Internal error" },
            { status: 500 }
          );
        }
      },
    },
  },
});
