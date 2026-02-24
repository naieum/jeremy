import { test, expect } from "../fixtures/base";

test.describe("API Keys - CRUD operations", () => {
  test("GET /api/keys returns user's keys", async ({ userClient }) => {
    const res = await userClient.listKeys();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.keys).toBeDefined();
    expect(Array.isArray(body.keys)).toBe(true);
    // The setup script created at least one key for the user
    expect(body.keys.length).toBeGreaterThanOrEqual(1);
    // Each key should have expected fields
    for (const key of body.keys) {
      expect(key.id).toBeTruthy();
      expect(key.name).toBeTruthy();
      expect(key.keyPrefix).toBeTruthy();
      expect(key.permissions).toBeTruthy();
    }
  });

  test("POST /api/keys creates key with jrmy_ prefix, returns raw key once", async ({
    userClient,
  }) => {
    const keyName = `test-key-create-${Date.now()}`;
    const res = await userClient.createKey(keyName);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.key).toBeTruthy();
    expect(body.key.startsWith("jrmy_")).toBe(true);
    expect(body.key.length).toBe(5 + 64); // "jrmy_" + 64 hex chars
    expect(body.keyPrefix).toBe(body.key.slice(0, 12));
    expect(body.name).toBe(keyName);

    // Clean up
    await userClient.deleteKey(body.id);
  });

  test("POST /api/keys default permission is 'read'", async ({
    userClient,
  }) => {
    const keyName = `test-key-default-perm-${Date.now()}`;
    const res = await userClient.createKey(keyName);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.permissions).toBe("read");

    // Clean up
    await userClient.deleteKey(body.id);
  });

  test("admin user can create 'admin' permission key", async ({
    adminClient,
  }) => {
    const keyName = `test-admin-key-${Date.now()}`;
    const res = await adminClient.createKey(keyName, "admin");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.permissions).toBe("admin");

    // Clean up
    await adminClient.deleteKey(body.id);
  });

  test("non-admin creating 'admin' key gets downgraded to 'read'", async ({
    userClient,
  }) => {
    const keyName = `test-key-downgrade-${Date.now()}`;
    const res = await userClient.createKey(keyName, "admin");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.permissions).toBe("read");

    // Clean up
    await userClient.deleteKey(body.id);
  });

  test("DELETE /api/keys removes own key", async ({ userClient }) => {
    // Create a key first
    const keyName = `test-key-delete-${Date.now()}`;
    const createRes = await userClient.createKey(keyName);
    expect(createRes.status()).toBe(200);
    const created = await createRes.json();

    // Delete it
    const deleteRes = await userClient.deleteKey(created.id);
    expect(deleteRes.status()).toBe(200);
    const deleteBody = await deleteRes.json();
    expect(deleteBody.success).toBe(true);

    // Verify it no longer appears in the list
    const listRes = await userClient.listKeys();
    const listBody = await listRes.json();
    const found = listBody.keys.find((k: any) => k.id === created.id);
    expect(found).toBeUndefined();
  });

  test("DELETE /api/keys 404 for other user's key", async ({
    userClient,
    adminClient,
  }) => {
    // Create a key as admin
    const keyName = `test-key-other-delete-${Date.now()}`;
    const createRes = await adminClient.createKey(keyName);
    expect(createRes.status()).toBe(200);
    const created = await createRes.json();

    // Try to delete it as the regular user
    const deleteRes = await userClient.deleteKey(created.id);
    expect(deleteRes.status()).toBe(404);

    // Clean up as admin
    await adminClient.deleteKey(created.id);
  });
});
