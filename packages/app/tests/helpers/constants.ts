export const ADMIN_USER = {
  email: "admin@test.com",
  password: "AdminPass123!",
  name: "Admin User",
};

export const TEST_USER = {
  email: "testuser@test.com",
  password: "TestPass123!",
  name: "Test User",
};

export const OTHER_USER = {
  email: "other@test.com",
  password: "OtherPass123!",
  name: "Other User",
};

export const CRON_SECRET = "test-cron-secret";

export const TEST_LIBRARY = {
  libraryId: "test-lib-1",
  name: "test-library",
  description: "A test library for e2e tests",
  chunks: [
    {
      id: "test-lib-1:chunk-1",
      title: "Getting Started",
      content: "This is the getting started guide for test-library. Install with npm install test-library.",
      url: "https://example.com/docs/getting-started",
      tokenCount: 20,
    },
    {
      id: "test-lib-1:chunk-2",
      title: "API Reference",
      content: "The main export is the createClient function which accepts a config object.",
      url: "https://example.com/docs/api",
      tokenCount: 18,
    },
    {
      id: "test-lib-1:chunk-3",
      title: "Configuration",
      content: "Configuration options include host, port, timeout, and retries.",
      url: "https://example.com/docs/config",
      tokenCount: 12,
    },
  ],
};

export const PUBLIC_LIBRARY = {
  libraryId: "public-lib-1",
  name: "public-library",
  description: "A public library owned by another user",
  isPublic: 1,
  chunks: [
    {
      id: "public-lib-1:chunk-1",
      title: "Public Docs",
      content: "This is a publicly accessible library with documentation.",
      url: "https://example.com/public/docs",
      tokenCount: 12,
    },
  ],
};

export const PRIVATE_LIBRARY = {
  libraryId: "private-lib-1",
  name: "private-library",
  description: "A private library owned by another user",
  isPublic: 0,
  chunks: [
    {
      id: "private-lib-1:chunk-1",
      title: "Private Docs",
      content: "This is a private library that should not be accessible to other users.",
      url: "https://example.com/private/docs",
      tokenCount: 14,
    },
  ],
};

export const AUTH_STATE_DIR = "tests/.auth";
export const USER_AUTH_STATE = `${AUTH_STATE_DIR}/user.json`;
export const ADMIN_AUTH_STATE = `${AUTH_STATE_DIR}/admin.json`;
export const OTHER_AUTH_STATE = `${AUTH_STATE_DIR}/other.json`;
