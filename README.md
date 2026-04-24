# Social Agent

Fetches posts by `u/advanced_pudding9228` from `r/openclawbot` and `r/lovablebuildershub`, transforms them into platform-native content with OpenAI GPT-4o, generates images with DALL-E 3, and posts to **LinkedIn + Threads + Instagram + Facebook Group** at **5AM · 7AM · 12PM · 3PM** daily.

Dashboard at **http://localhost:4001**.

The LinkedIn publishing slice has now been merged into this repo so `social-agent` can become the single runtime for every platform.

Maintainer context for humans and coding agents lives in `AGENTS.md`.

The tracked default profile is still **Threads + Instagram**, with Facebook still disabled until the group permission issue is resolved and LinkedIn left off until its merged slice is verified live in this repo.

The platform drafting rules now live in `content-os/` so the generator uses a source-extraction step instead of naive line-by-line rewriting.

The content system now keeps a source registry plus an angle bank so one Reddit post can feed multiple future posts without re-extracting the same source every time.

---

## Quick start

```bash
git clone https://github.com/AyobamiH/social-agent.git
cd social-agent
npm install
cp .env.example .env
nano .env          # fill in your credentials
npm run fetch      # test the pipeline
npm run queue      # preview all platform versions
npm run start:pm2
pm2 save && pm2 startup
```

---

## Getting your Meta credentials

### 1. Meta Access Token
Go to https://developers.facebook.com/tools/explorer  
Select your app → generate token with these permissions:
- `threads_basic`
- `threads_content_publish`
- `instagram_basic`
- `instagram_content_publish`
- `pages_read_engagement`
- `pages_show_list`
- `publish_to_groups`
- `groups_access_member_info`

### 2. Threads User ID
```bash
curl "https://graph.threads.net/me?fields=id,username&access_token=YOUR_THREADS_TOKEN"
```

### 3. Instagram Account ID
```bash
# Get your Facebook Pages
curl "https://graph.facebook.com/v25.0/me/accounts?access_token=YOUR_TOKEN"

# Get Instagram account linked to a Page
curl "https://graph.facebook.com/v25.0/PAGE_ID?fields=instagram_business_account&access_token=YOUR_TOKEN"
```

If `FACEBOOK_PAGE_ID` is set, the app can auto-discover the linked Instagram business account and derive a Page access token for Instagram publishing.

Instagram publishing has been live-tested successfully against the currently accessible Page-linked account.

### 3b. LinkedIn credentials
Generate a LinkedIn user token with `w_member_social`, then set:

```env
ENABLE_LINKEDIN=true
LINKEDIN_TOKEN=...
LINKEDIN_PERSON_URN=urn:li:person:...
```

The merged LinkedIn publisher uses the UGC Posts API (`/v2/ugcPosts`) and publishes text-only posts as the authenticated member.

### 4. Facebook Group ID
Found in the group URL: `facebook.com/groups/GROUP_ID`

---

## How each platform is written differently

| Platform | Length | Tone | Hashtags | Image |
|---|---|---|---|---|
| LinkedIn | 120-220 words | Concrete, professional, work-real | Optional and minimal | None |
| Threads | 500 chars max | Punchy, direct | Optional and minimal | None |
| Instagram | Caption-first, save-worthy | Clear, visual, emotionally legible | Minimal | DALL-E 3 generated |
| Facebook | 300 words | Conversational | Optional | None |

---

## CLI commands

| Command | What it does |
|---|---|
| `npm run fetch` | Fetch Reddit + transform for all enabled platforms |
| `npm run queue` | Preview all platform versions per slot |
| `npm run status` | Show slot fill status |
| `npm run memory` | Show source/angle memory counts |
| `npm run post-now` | Post all slots immediately |
| `npm run deploy` | Pull from GitHub + restart |

---

## Cost per fetch cycle

- New sources use one extraction pass to bank multiple reusable angles.
- Queued posts only draft enabled platforms, and banked angles can be reused later without re-extracting the source.
- Instagram image generation only runs when Instagram is enabled.
- Exact OpenAI cost depends on how many platforms are enabled and which model you choose in `.env`.
