import { test, expect } from "../fixtures/base";

test.describe("Admin - /api/admin/users", () => {
  test("GET /api/admin/users 403 for non-admin", async ({ userClient }) => {
    const res = await userClient.adminListUsers();
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Forbidden");
  });

  test("GET /api/admin/users returns paginated list for admin", async ({
    adminClient,
  }) => {
    const res = await adminClient.adminListUsers();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.users).toBeDefined();
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(3); // admin, user, other
    expect(typeof body.hasMore).toBe("boolean");

    // Each user should have expected fields
    const user = body.users[0];
    expect(user.id).toBeTruthy();
    expect(user.name).toBeTruthy();
    expect(user.email).toBeTruthy();
    expect(typeof user.libraryCount).toBe("number");
    expect(Array.isArray(user.flags)).toBe(true);
  });

  test("GET /api/admin/users/$id returns user detail", async ({
    adminClient,
    userId,
  }) => {
    const res = await adminClient.adminGetUser(userId);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.user).toBeDefined();
    expect(body.user.id).toBe(userId);
    expect(body.user.email).toBe("testuser@test.com");
    expect(body.libraries).toBeDefined();
    expect(Array.isArray(body.libraries)).toBe(true);
    expect(body.flags).toBeDefined();
    expect(body.apiKeys).toBeDefined();
  });

  test("GET /api/admin/users/$id 404 for non-existent user", async ({
    adminClient,
  }) => {
    const res = await adminClient.adminGetUser("nonexistent-user-id-12345");
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  test("POST /api/admin/users/$id/flags adds flag", async ({
    adminClient,
    userId,
  }) => {
    const res = await adminClient.adminSetFlag(
      userId,
      "add",
      "warned",
      "test warning"
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.action).toBe("added");
    expect(body.flag).toBe("warned");

    // Verify the flag was added
    const userRes = await adminClient.adminGetUser(userId);
    const userBody = await userRes.json();
    const hasFlag = userBody.flags.some((f: any) => f.flag === "warned");
    expect(hasFlag).toBe(true);

    // Clean up: remove the flag
    await adminClient.adminSetFlag(userId, "remove", "warned");
  });

  test("POST /api/admin/users/$id/flags removes flag", async ({
    adminClient,
    userId,
  }) => {
    // First add a flag
    await adminClient.adminSetFlag(userId, "add", "verified", "test verified");

    // Now remove it
    const res = await adminClient.adminSetFlag(userId, "remove", "verified");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.action).toBe("removed");
    expect(body.flag).toBe("verified");

    // Verify the flag was removed
    const userRes = await adminClient.adminGetUser(userId);
    const userBody = await userRes.json();
    const hasFlag = userBody.flags.some((f: any) => f.flag === "verified");
    expect(hasFlag).toBe(false);
  });

  test("POST /api/admin/users/$id/flags 400 for invalid flag name", async ({
    adminClient,
    userId,
  }) => {
    const res = await adminClient.adminSetFlag(
      userId,
      "add",
      "invalid-flag-name"
    );
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid flag");
  });

  test("POST /api/admin/users/$id/flags 403 for non-admin", async ({
    userClient,
    otherUserId,
  }) => {
    const res = await userClient.adminSetFlag(
      otherUserId,
      "add",
      "warned",
      "should not work"
    );
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Forbidden");
  });
});
