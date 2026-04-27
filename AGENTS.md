# Social Agent Knowledge Base

This file is the fast-start context for LLMs and human maintainers working in this repo.

## What This Project Does

`social-agent` turns selected Reddit posts into platform-specific social posts, queues them into four daily slots, and publishes them to enabled social platforms.

Current content flow:
1. Fetch posts from allowed subreddits.
2. Filter to posts by `REDDIT_USER`.
3. Bank each Reddit source into multiple reusable angles.
4. Draft only one saved angle at a time into enabled platforms.
5. Generate an Instagram image only when Instagram is enabled.
6. Save each transformed item into the automation queue store.
7. Publish only to enabled platforms.
8. Save publish IDs and history in the automation history store.

## Runtime Layout

- `config.ts`: loads `.env`, exposes runtime config, and supports per-platform toggles.
- `src/agent.ts`: cron scheduler and startup checks.
- `src/cli.ts`: local operations like `fetch`, `queue`, `status`, and `post-now`.
- `src/server.ts`: dashboard/API server on `GUI_PORT`.
- `src/content-engine.ts`: shared source-bank / angle-bank / queue orchestration.
- `src/publish.ts`: shared publish orchestrator. This is the main place to change multi-platform posting behavior.
- `src/linkedin.ts`: LinkedIn publisher using the UGC Posts API.
- `src/x.ts`: X/Twitter publisher using OAuth 1.0a user-context by default and OAuth 2.0 user-context as fallback.
- `src/threads.ts`: Threads publisher using `graph.threads.net` `/me/...` endpoints.
- `src/instagram.ts`: Instagram publisher using Graph API media container + publish flow.
- `src/facebook.ts`: Facebook Group publisher using Graph API feed posts.
- `src/test-meta.ts`: Meta diagnostics for identity, Page, Instagram linkage, Group access, and Threads account checks.
- `src/test-x.ts`: X diagnostics for `/2/users/me` and optional live-post smoke tests.
- `src/store.ts`: SQLite-backed queue/history/source/angle/platform-state persistence with one-time legacy JSON import from the `data/` directory.
- `src/ai.ts`: source extraction, angle drafting, lightweight learning memory, and DALL-E image generation.
- `src/reddit.ts`: Reddit fetcher for allowed subreddits.
- `content-os/`: repo-ready prompt pack that defines source extraction, platform rules, quality checks, and banned phrasing.

## Important Build Rule

This repo is authored in TypeScript with a split execution model: `tsx` for source-driven dev/operator commands and compiled `dist/` output for the production service runtime.

- Edit `.ts` files, not generated build output.
- `npm run dev`, `npm run fetch`, `npm run status`, and similar operator commands run from source through `tsx`.
- `npm run build` emits compiled output into `dist/`.
- `npm start` and `npm run start:pm2` run the compiled service from `dist/src/agent.js`.
- The build copies `public/` and `content-os/` into `dist/` for the compiled runtime.

## Current Platform State

As of April 24, 2026:

- Threads posting is confirmed working.
- Instagram posting is confirmed working against the currently accessible Page-linked account.
- LinkedIn code has been merged from `linkedin-agent-v4`, but this repo has not yet live-posted to LinkedIn.
- X is implemented as a first-class text-only platform, with live auth verified through OAuth 1.0a user-context.
- X live publishing may still be blocked by X credits or access tier even when auth succeeds.
- Threads now uses its own token path through `THREADS_ACCESS_TOKEN`.
- Threads uses `/me`, `/me/threads`, and `/me/threads_publish` on `graph.threads.net`.
- Facebook/Instagram Graph defaults were bumped to `v25.0`.
- Instagram can now auto-discover the page-linked `instagram_business_account` and derive a Page access token from `FACEBOOK_PAGE_ID` + `META_ACCESS_TOKEN`.
- Queue retry behavior is safe: failed platforms no longer delete queued items.
- Partial success is supported: one platform can succeed without forcing the whole slot to fail.
- Source reuse is supported: a Reddit post is only exhausted when no banked angles remain.
- Draft generation skips disabled platforms to save tokens.
- Existing queued items can auto-hydrate missing X drafts from stored source and angle memory when X is enabled later.

Current tracked operational mode in `.env.example`:

- `ENABLE_THREADS=true`
- `ENABLE_INSTAGRAM=true`
- `ENABLE_LINKEDIN=false`
- `ENABLE_X=false`
- `ENABLE_FACEBOOK=false`

This was done because:

- Threads and Instagram are both confirmed working.
- LinkedIn has been merged but not yet verified from this repo.
- X is integrated but should stay off until a valid OAuth 1.0a or OAuth 2.0 user-context credential set is configured and tested.
- The Facebook Group still returns `(#3) Missing Permission`.

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

## X Config Notes

- Prefer `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, and `X_ACCESS_TOKEN_SECRET`.
- `X_OAUTH2_ACCESS_TOKEN` is supported as fallback if it is a real OAuth 2.0 user token.
- Do not use app-only bearer tokens or OAuth client secrets for posting.
- X is text-only in v1.
- The publisher authenticates with `account/verify_credentials` for OAuth 1.0a checks and attempts publish through the user posting endpoints supported by the configured auth mode.
- If X returns a credits/access-tier publish entitlement error, the runtime switches X into temporary draft-only mode.

## Platform Toggles

These env vars control which platforms are active:

- `ENABLE_THREADS`
- `ENABLE_INSTAGRAM`
- `ENABLE_LINKEDIN`
- `ENABLE_X`
- `ENABLE_FACEBOOK`

Behavior:

- Disabled platforms are skipped by `src/publish.ts`.
- A slot is considered complete if every enabled platform succeeds.
- Disabled platforms do not keep a queue item stuck in retry status.

## Commands That Matter

- `npm run build`: compile TypeScript to `dist/`
- `npm run typecheck`: TypeScript validation without emitting JS
- `npm run dev`: start agent (cron + dashboard) from TypeScript through `tsx`
- `npm run test-meta`: diagnose Meta setup
- `npm run test-x`: validate X auth and optionally live-post a test update
- `npm run test`: run the local security hardening regression suite
- `npm run fetch`: fill empty queue slots from Reddit
- `npm run queue`: inspect queued content and publish IDs/errors
- `npm run status`: show which slots are filled
- `npm run memory`: inspect source/angle memory counts
- `npm run history`: inspect recent publish history
- `npm run post-now`: immediately post every queued slot to enabled platforms
- `npm run backup`: snapshot `APP_DATA_DIR` into `backups/`
- `npm run restore -- --from <backup-dir>`: restore a backup into `APP_DATA_DIR`
- `npm run smoke:dist`: verify the compiled CLI/runtime wiring
- `npm start`: start compiled agent (cron + dashboard) from `dist/`

## Content OS

The repo includes a prompt pack in `content-os/`:

- `SYSTEM.md`
- `PLATFORM_RULES.md`
- `QUALITY_CHECKS.md`
- `BANNED_PHRASES.json`

`src/ai.ts` uses this OS in practice by:

- extracting a source summary plus multiple reusable angles first
- drafting natively per platform from one selected angle instead of rewriting line by line
- using lightweight learning notes from recent history to avoid repetition
- checking banned phrases
- scoring specificity, human tone, and platform fit before finalizing

## Data Files

- `data/automation.sqlite`: queue, history, sources, angles, platform-state, and automation locks
- `data/control-plane.sqlite`: users, sessions, billing, runtime config/secrets, and audit logs
- `data/queue.json`, `data/used_ids.json`, `data/history.json`, `data/sources.json`, `data/angles.json`: legacy import sources retained as runtime artifacts/backups if present
- `data/agent.log`: dashboard log feed

These files are runtime state, not source code.

## Known Risks

- Instagram posting depends on the currently accessible Page continuing to expose the linked `instagram_business_account`.
- LinkedIn posting still needs a live validation run from this repo even though the publish slice was ported from a working standalone project.
- X posting depends on a valid user-context credential set and sufficient X credits/access tier for the publish endpoint.
- Facebook Group posting still depends on app/token/group permissions that are not fixed in code.
- DALL-E image URLs are temporary. If an Instagram slot sits too long before posting, the image URL may expire.
- Compiled output can go stale if `npm run build` is skipped before `npm start` or `npm run start:pm2`.

## Good First Checks When Something Breaks

1. Run `npm run build`.
2. Run `npm run test-meta`.
3. Run `npm run test-x` if X is enabled.
4. Run `npm run status` to see whether X is in draft-only mode.
5. Run `npm run queue`.
6. Inspect `data/automation.sqlite`, `data/control-plane.sqlite`, and `data/agent.log`.
7. Confirm `.env` platform toggles match intended behavior.

## If You Need To Change Publishing Behavior

Start here:

- `src/publish.ts` for platform orchestration
- `src/agent.ts` for cron and startup rules
- `src/cli.ts` and `src/server.ts` for manual and API posting behavior

For Meta diagnostics:

- `src/test-meta.ts`

For Threads-specific work:

- `src/threads.ts`

For X-specific work:

- `src/x.ts`
