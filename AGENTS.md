# Social Agent Knowledge Base

This file is the fast-start context for LLMs and human maintainers working in this repo.

## What This Project Does

`social-agent` turns selected Reddit posts into platform-specific social posts, queues them into four daily slots, and publishes them to enabled social platforms.

Current content flow:
1. Fetch posts from allowed subreddits.
2. Filter to posts by `REDDIT_USER`.
3. Rewrite into Threads, Instagram, and Facebook variants with OpenAI.
4. Generate one DALL-E image URL for the Instagram variant.
5. Save each transformed item into a slot in `data/queue.json`.
6. Publish only to enabled platforms.
7. Save publish IDs and history in `data/history.json`.

## Runtime Layout

- `config.ts`: loads `.env`, exposes runtime config, and now supports per-platform toggles.
- `src/agent.ts`: cron scheduler and startup checks.
- `src/cli.ts`: local operations like `fetch`, `queue`, `status`, and `post-now`.
- `src/server.ts`: dashboard/API server on `GUI_PORT`.
- `src/publish.ts`: shared publish orchestrator. This is the main place to change multi-platform posting behavior.
- `src/threads.ts`: Threads publisher using `graph.threads.net` `/me/...` endpoints.
- `src/instagram.ts`: Instagram publisher using Graph API media container + publish flow.
- `src/facebook.ts`: Facebook Group publisher using Graph API feed posts.
- `src/test-meta.ts`: Meta diagnostics for identity, Page, Instagram linkage, Group access, and Threads account checks.
- `src/store.ts`: queue/history persistence in the `data/` directory.
- `src/ai.ts`: OpenAI text transforms plus DALL-E image generation.
- `src/reddit.ts`: Reddit fetcher for allowed subreddits.

## Important Build Rule

This repo is authored in TypeScript, but runtime JS is emitted in place.

- Edit `.ts` files, not generated `.js` files.
- Run `npm run build` after TypeScript changes.
- The app still executes `src/*.js`, so stale JS will cause confusing behavior if you forget to rebuild.

## Current Platform State

As of April 21, 2026:

- Threads posting is confirmed working.
- Instagram posting is confirmed working against the currently accessible Page-linked account.
- Threads now uses its own token path through `THREADS_ACCESS_TOKEN`.
- Threads uses `/me`, `/me/threads`, and `/me/threads_publish` on `graph.threads.net`.
- Facebook/Instagram Graph defaults were bumped to `v25.0`.
- Instagram can now auto-discover the page-linked `instagram_business_account` and derive a Page access token from `FACEBOOK_PAGE_ID` + `META_ACCESS_TOKEN`.
- Queue retry behavior is safe: failed platforms no longer delete queued items.
- Partial success is supported: one platform can succeed without forcing the whole slot to fail.

Current live operational mode in `.env`:

- `ENABLE_THREADS=true`
- `ENABLE_INSTAGRAM=true`
- `ENABLE_FACEBOOK=false`

This was done because:

- Threads and Instagram are both confirmed working
- the Facebook Group still returns `(#3) Missing Permission`
- Facebook is the only platform still intentionally disabled

## Meta Config Notes

Do not mix these IDs up:

- `FACEBOOK_USER_ID`: the Facebook user account ID returned by `/me`
- `FACEBOOK_PAGE_ID`: the Facebook Page ID returned by `/me/accounts`
- `INSTAGRAM_ACCOUNT_ID`: must be the Page-linked `instagram_business_account` ID, not a Facebook user ID
- `FACEBOOK_PAGE_ACCESS_TOKEN`: optional override for Instagram publishing; otherwise the app derives it from the configured Page
- `THREADS_USER_ID`: the Threads account ID returned by `graph.threads.net/me`
- `FACEBOOK_GROUP_ID`: the Group object ID used for `/feed`

Current known live values discovered during diagnostics:

- `FACEBOOK_USER_ID=1483119573444544`
- `FACEBOOK_PAGE_ID=123393450677299`
- `INSTAGRAM_ACCOUNT_ID=17841453638630920`
- `THREADS_USER_ID=25914281681582868`

Do not commit real secrets from `.env`.

## Platform Toggles

These env vars control which platforms are active:

- `ENABLE_THREADS`
- `ENABLE_INSTAGRAM`
- `ENABLE_FACEBOOK`

Behavior:

- Disabled platforms are skipped by `src/publish.ts`.
- A slot is considered complete if every enabled platform succeeds.
- Disabled platforms do not keep a queue item stuck in retry status.

## Commands That Matter

- `npm run build`: compile TypeScript to runtime JS in place
- `npm run typecheck`: TypeScript validation without emitting JS
- `npm run test-meta`: diagnose Meta setup
- `npm run fetch`: fill empty queue slots from Reddit
- `npm run queue`: inspect queued content and publish IDs/errors
- `npm run status`: show which slots are filled
- `npm run post-now`: immediately post every queued slot to enabled platforms
- `npm start`: build and start cron + dashboard

## Data Files

- `data/queue.json`: current slot queue
- `data/used_ids.json`: dedupe list of Reddit posts already used
- `data/history.json`: successful/partial publish history plus errors
- `data/agent.log`: dashboard log feed

These files are runtime state, not source code.

## Known Risks

- Instagram posting depends on the currently accessible Page continuing to expose the linked `instagram_business_account`.
- Facebook Group posting still depends on app/token/group permissions that are not fixed in code.
- DALL-E image URLs are temporary. If an Instagram slot sits too long before posting, the image URL may expire.
- Runtime JS can drift from TypeScript if `npm run build` is skipped.

## Good First Checks When Something Breaks

1. Run `npm run build`.
2. Run `npm run test-meta`.
3. Run `npm run queue`.
4. Inspect `data/history.json` and `data/queue.json`.
5. Confirm `.env` platform toggles match intended behavior.

## If You Need To Change Publishing Behavior

Start here:

- `src/publish.ts` for platform orchestration
- `src/agent.ts` for cron/startup rules
- `src/cli.ts` and `src/server.ts` for manual/API posting behavior

For Meta diagnostics:

- `src/test-meta.ts`

For Threads-specific work:

- `src/threads.ts`
