# Social Agent

Fetches posts by `u/advanced_pudding9228` from `r/openclawbot` and `r/lovablebuildershub`, transforms them into platform-native content with OpenAI GPT-4o, generates images with DALL-E 3, and posts to **Threads + Instagram + Facebook Group** at **5AM · 7AM · 12PM · 3PM** daily.

Dashboard at **http://localhost:4001**.

Runs alongside `linkedin-agent` (port 4000) on the same server.

Maintainer context for humans and coding agents lives in `AGENTS.md`.

---

## Quick start

```bash
git clone https://github.com/AyobamiH/social-agent.git
cd social-agent
npm install
cp .env.example .env
nano .env          # fill in your credentials
npm run fetch      # test the pipeline
npm run queue      # preview all 3 platform versions
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

### 4. Facebook Group ID
Found in the group URL: `facebook.com/groups/GROUP_ID`

---

## How each platform is written differently

| Platform | Length | Tone | Hashtags | Image |
|---|---|---|---|---|
| Threads | 500 chars max | Punchy, direct | 2-3 | None |
| Instagram | 150 words | Storytelling | 10-15 | DALL-E 3 generated |
| Facebook | 300 words | Conversational | 3-5 | None |

---

## CLI commands

| Command | What it does |
|---|---|
| `npm run fetch` | Fetch Reddit + transform for all 3 platforms |
| `npm run queue` | Preview all platform versions per slot |
| `npm run status` | Show slot fill status |
| `npm run post-now` | Post all slots immediately |
| `npm run deploy` | Pull from GitHub + restart |

---

## Cost per fetch cycle

- 4 posts × 3 GPT-4o calls = ~12 API calls (~$0.05)
- 4 DALL-E 3 images = ~$0.16
- **Total per day: ~$0.21**
