# OAuth Setup Script for Claude Chrome

Follow these two tasks sequentially. After completing both, report back the Client IDs and Client Secrets so they can be set as Wrangler secrets.

## Task 1: Create GitHub OAuth App

1. Navigate to https://github.com/settings/developers
2. Click "OAuth Apps" in the sidebar if not already selected
3. Click "New OAuth App" (or "Register a new application")
4. Fill in the form:
   - **Application name**: `Jeremy`
   - **Homepage URL**: `https://jeremy.khuur.dev`
   - **Application description**: `Documentation RAG for Claude Code`
   - **Authorization callback URL**: `https://jeremy.khuur.dev/api/auth/callback/github`
5. Click "Register application"
6. On the next page, copy the **Client ID** — save it
7. Click "Generate a new client secret"
8. Copy the **Client Secret** — save it (it's only shown once)

Report both values when done.

## Task 2: Create Google OAuth Client

1. Navigate to https://console.cloud.google.com/apis/credentials
2. If prompted to select a project, either select an existing project or create a new one called "Jeremy"
3. Click "+ CREATE CREDENTIALS" at the top
4. Select "OAuth client ID"
5. If prompted to configure the consent screen first:
   a. Click "Configure Consent Screen"
   b. Choose "External" user type, click "Create"
   c. Fill in:
      - **App name**: `Jeremy`
      - **User support email**: select your email
      - **Developer contact email**: your email
   d. Click "Save and Continue" through the remaining steps (Scopes, Test Users, Summary)
   e. Go back to Credentials and click "+ CREATE CREDENTIALS" > "OAuth client ID" again
6. For the OAuth client ID form:
   - **Application type**: "Web application"
   - **Name**: `Jeremy`
   - **Authorized JavaScript origins**: Add `https://jeremy.khuur.dev`
   - **Authorized redirect URIs**: Add `https://jeremy.khuur.dev/api/auth/callback/google`
7. Click "Create"
8. Copy the **Client ID** and **Client Secret** from the dialog

Report both values when done.

## After Both Tasks

Once you have all 4 values (GitHub Client ID, GitHub Client Secret, Google Client ID, Google Client Secret), report them back so they can be configured as secrets on the Cloudflare Worker.
