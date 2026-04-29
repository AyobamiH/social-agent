# Social Agent

`social-agent` turns selected Reddit posts into platform-native social drafts, banks reusable angles, fills four daily queue slots, and publishes to whichever platforms are enabled.

Current platform surface:
- LinkedIn
- Threads
- X/Twitter
- Instagram
- Facebook Group

Dashboard: [http://localhost:4001](http://localhost:4001)

Maintainer context for humans and coding agents lives in `AGENTS.md`.

## What changed recently

- The runtime is now TS-first with a split model: `tsx` for source-driven dev tooling and compiled `dist/` output for the production service.
- X is now a first-class platform in the content model, queue, history, API, dashboard, and publish flow.
- X is text-only in this runtime and posts through `POST /2/tweets`.
- X live-post smoke testing is confirmed working with OAuth 2.0 user-context credentials as of April 29, 2026.
- The content engine banks source summaries plus reusable angles so one Reddit source can support multiple future posts.

Tracked default profile:
- `ENABLE_THREADS=true`
- `ENABLE_INSTAGRAM=true`
- `ENABLE_LINKEDIN=false`
- `ENABLE_X=false`
- `ENABLE_FACEBOOK=false`

## Quick start

```bash
git clone https://github.com/AyobamiH/social-agent.git
cd social-agent
npm install
cp .env.example .env
# fill in your credentials
npm run build
npm run fetch
npm run queue
npm run start:pm2
pm2 save && pm2 startup
```

## Runtime model

- Author in TypeScript.
- Use `npm run dev` for source-driven local development through `tsx`.
- Use `npm run build` to compile the runtime into `dist/`.
- Use `npm start` or `npm run start:pm2` to run the compiled `dist/` service.
- Do not edit generated build output by hand.
- Runtime state now lives primarily in `data/automation.sqlite` and `data/control-plane.sqlite`.
- The build copies `public/` and `content-os/` into `dist/` so the compiled runtime stays self-contained.

## Platform setup

### LinkedIn

Set:

```env
ENABLE_LINKEDIN=true
LINKEDIN_TOKEN=...
LINKEDIN_PERSON_URN=urn:li:person:...
```

The LinkedIn publisher uses the UGC Posts API and is text-only.

### X / Twitter

Set OAuth 2.0 user-context credentials:

```env
ENABLE_X=true
X_OAUTH2_ACCESS_TOKEN=...
X_OAUTH2_REFRESH_TOKEN=...
X_CLIENT_ID=...
X_CLIENT_SECRET=...
X_REDIRECT_URI=http://127.0.0.1:4001/auth/x/callback
```

`X_OAUTH2_CLIENT_ID` and `X_OAUTH2_CLIENT_SECRET` are also accepted aliases for the labels shown in the X developer portal.

OAuth 1.0a user-context credentials are still supported:

```env
ENABLE_X=true
X_API_KEY=...
X_API_SECRET=...
X_ACCESS_TOKEN=...
X_ACCESS_TOKEN_SECRET=...
```

Notes:
- Preferred path is OAuth 2.0 user-context credentials with an access token, refresh token, client ID, and client secret from the same X app.
- OAuth 2.0 user-context posting is supported through the dashboard connect flow at `/auth/x/start` or by importing portal-generated tokens with `npm run import-x-oauth2`.
- OAuth 1.0a user-context auth also posts through `POST /2/tweets`.
- App-only bearer tokens are not valid for posting.
- Validate the token with `npm run test-x`.
- Publish a deliberate live smoke test with `npm run test-x -- --live-post`.
- The latest confirmed live smoke test posted as `@JohnWOE15`: `https://x.com/i/web/status/2049570569494958455`.
- If auth passes but publish is rejected by X for credits or access tier, the app automatically keeps X in draft-only mode for a cooldown window so other platforms can continue publishing.

### Threads / Instagram / Facebook

Get a Meta token from [Meta Graph API Explorer](https://developers.facebook.com/tools/explorer) with:
- `threads_basic`
- `threads_content_publish`
- `instagram_basic`
- `instagram_content_publish`
- `pages_read_engagement`
- `pages_show_list`
- `publish_to_groups`
- `groups_access_member_info`

Resolve the Threads user ID:

```bash
curl "https://graph.threads.net/me?fields=id,username&access_token=YOUR_THREADS_TOKEN"
```

Resolve the Instagram account from the linked Page:

```bash
curl "https://graph.facebook.com/v25.0/me/accounts?access_token=YOUR_TOKEN"
curl "https://graph.facebook.com/v25.0/PAGE_ID?fields=instagram_business_account&access_token=YOUR_TOKEN"
```

If `FACEBOOK_PAGE_ID` is set, the app can auto-discover the linked Instagram business account and derive a Page access token for Instagram publishing.

Find the Facebook Group ID from `facebook.com/groups/GROUP_ID`.

## Platform behavior

| Platform | Format | Writing shape | Media |
|---|---|---|---|
| LinkedIn | Text post | Concrete, professional, operational | None |
| Threads | Text post | Punchy, direct, conversational | None |
| X | Text post | Sharp, reply-worthy, under 280 chars | None |
| Instagram | Caption + image | Visual, clear, save-worthy | DALL-E image persisted to Cloudinary when enabled |
| Facebook | Text post | Conversational with practical framing | None |

## Commands

| Command | What it does |
|---|---|
| `npm run typecheck` | Validate TypeScript without emitting |
| `npm run build` | Compile runtime output into `dist/` |
| `npm run dev` | Start the scheduler and dashboard from TypeScript through `tsx` |
| `npm start` | Start the compiled scheduler and dashboard from `dist/` |
| `npm run smoke:dist` | Smoke-test the compiled CLI/runtime wiring |
| `npm run fetch` | Fill empty queue slots from banked angles or fresh Reddit sources |
| `npm run queue` | Preview queued drafts for every enabled platform |
| `npm run status` | Show slot occupancy and memory counts |
| `npm run memory` | Show source and angle inventory |
| `npm run history` | Show recent publish history |
| `npm run post-now` | Publish queued slots immediately |
| `npm run test-meta` | Diagnose Meta credentials and linked assets |
| `npm run test-x` | Validate X auth and optionally live-post a test update |
| `npm run import-x-oauth2` | Import X OAuth 2.0 user-context tokens generated in the X developer portal |
| `npm run test` | Run the local security hardening regression suite |
| `npm run backup` | Snapshot `APP_DATA_DIR` into `backups/` |
| `npm run restore -- --from <backup-dir>` | Restore a backup into `APP_DATA_DIR` |
| `npm run deploy -- --ref origin/main` | Backup data, rebuild `dist/`, restart PM2 on `dist/src/agent.js`, and health-check |

## Operational notes

- Draft generation skips disabled platforms to protect token spend.
- Existing queued items can auto-hydrate missing X drafts from stored source and angle memory when X is enabled later.
- X is confirmed working with the current OAuth 2.0 user-context app; if X later rejects publishing for credits or access tier, the runtime falls back to draft-only mode for X.
- Instagram image generation only runs when Instagram is enabled, and generated images are uploaded to Cloudinary so queued posts do not rely on temporary DALL-E URLs.
- Failed platforms no longer force the whole queue item to disappear.
- Partial success is supported, so one platform can succeed while another is retained for retry.
- The API, CLI, and cron now share the same automation gate and SQLite-backed lock layer.
