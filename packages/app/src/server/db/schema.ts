import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ─── Discovery tables ───

export const discoverySources = sqliteTable("discovery_sources", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  name: text("name").notNull(),
  config: text("config").notNull().default("{}"),
  enabled: integer("enabled").notNull().default(1),
  schedule: text("schedule").notNull().default("weekly"),
  lastRunAt: text("last_run_at"),
  lastRunResult: text("last_run_result"),
  createdAt: text("created_at").default("(datetime('now'))"),
});

export const discoveryQueue = sqliteTable("discovery_queue", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull(),
  identifier: text("identifier").notNull(),
  name: text("name").notNull(),
  websiteUrl: text("website_url"),
  docsUrl: text("docs_url"),
  strategy: text("strategy"),
  libraryId: text("library_id"),
  status: text("status").notNull().default("pending"),
  skipReason: text("skip_reason"),
  errorMsg: text("error_msg"),
  metadata: text("metadata").default("{}"),
  discoveredAt: text("discovered_at").default("(datetime('now'))"),
  processedAt: text("processed_at"),
});

// ─── Better Auth tables ───

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", {
    mode: "timestamp",
  }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", {
    mode: "timestamp",
  }),
  scope: text("scope"),
  idToken: text("idToken"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

// ─── Device Authorization ───

export const deviceCode = sqliteTable("deviceCode", {
  id: text("id").primaryKey(),
  deviceCode: text("deviceCode").notNull(),
  userCode: text("userCode").notNull(),
  userId: text("userId"),
  clientId: text("clientId"),
  scope: text("scope"),
  status: text("status").notNull().default("pending"),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  lastPolledAt: integer("lastPolledAt", { mode: "timestamp" }),
  pollingInterval: integer("pollingInterval"),
  createdAt: integer("createdAt", { mode: "timestamp" }),
  updatedAt: integer("updatedAt", { mode: "timestamp" }),
});

// ─── Application tables ───

export const libraries = sqliteTable(
  "libraries",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    sourceUrl: text("source_url"),
    sourceType: text("source_type").default("llms_txt"),
    version: text("version"),
    chunkCount: integer("chunk_count").default(0),
    ownerId: text("owner_id").notNull(),
    isPublic: integer("is_public").default(0),
    createdAt: text("created_at").default("(datetime('now'))"),
    category: text("category").default("other"),
    contentHash: text("content_hash"),
    updatedAt: text("updated_at").default("(datetime('now'))"),
  },
  (table) => [
    index("idx_libraries_name").on(table.name),
    index("idx_libraries_category").on(table.category),
  ]
);

export const chunks = sqliteTable(
  "chunks",
  {
    id: text("id").primaryKey(),
    libraryId: text("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    title: text("title"),
    content: text("content").notNull(),
    url: text("url"),
    tokenCount: integer("token_count"),
    createdAt: text("created_at").default("(datetime('now'))"),
  },
  (table) => [index("idx_chunks_library").on(table.libraryId)]
);

export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    permissions: text("permissions").default("read"),
    lastUsedAt: text("last_used_at"),
    createdAt: text("created_at").default("(datetime('now'))"),
  },
  (table) => [
    index("idx_api_keys_hash").on(table.keyHash),
    index("idx_api_keys_user").on(table.userId),
  ]
);

export const repoConnections = sqliteTable(
  "repo_connections",
  {
    id: text("id").primaryKey(),
    libraryId: text("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    repoUrl: text("repo_url").notNull(),
    repoOwner: text("repo_owner").notNull(),
    repoName: text("repo_name").notNull(),
    verificationMethod: text("verification_method"),
    lastIngestedAt: text("last_ingested_at"),
    verificationToken: text("verification_token"),
    verifiedAt: text("verified_at"),
    githubUserId: text("github_user_id"),
    webhookSecret: text("webhook_secret"),
    createdAt: text("created_at").default("(datetime('now'))"),
  },
  (table) => [
    uniqueIndex("idx_repo_conn_library_unique").on(table.libraryId),
    index("idx_repo_conn_user").on(table.userId),
  ]
);

export const userFlags = sqliteTable(
  "user_flags",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    flag: text("flag").notNull(),
    reason: text("reason"),
    createdBy: text("created_by"),
    createdAt: text("created_at").default("(datetime('now'))"),
  },
  (table) => [
    index("idx_user_flags_user").on(table.userId),
    index("idx_user_flags_flag").on(table.flag),
  ]
);

export const docSites = sqliteTable(
  "doc_sites",
  {
    id: text("id").primaryKey(),
    libraryId: text("library_id")
      .notNull()
      .references(() => libraries.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    subdomain: text("subdomain").notNull(),
    customDomain: text("custom_domain"),
    status: text("status").default("pending"),
    buildError: text("build_error"),
    lastBuiltAt: text("last_built_at"),
    createdAt: text("created_at").default("(datetime('now'))"),
  },
  (table) => [
    uniqueIndex("idx_doc_sites_subdomain").on(table.subdomain),
    index("idx_doc_sites_library").on(table.libraryId),
  ]
);
