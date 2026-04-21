import * as fs from 'node:fs';
import * as path from 'node:path';

export interface AppConfig {
  REDDIT_USER: string;
  REDDIT_ALLOWED_SUBS: Set<string>;
  REDDIT_SORT: string;
  REDDIT_LIMIT: number;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  AI_STYLE: string;
  CUSTOM_PROMPT: string;
  META_ACCESS_TOKEN: string;
  META_GRAPH_VERSION: string;
  THREADS_GRAPH_VERSION: string;
  ENABLE_THREADS: boolean;
  ENABLE_INSTAGRAM: boolean;
  ENABLE_FACEBOOK: boolean;
  THREADS_ACCESS_TOKEN: string;
  THREADS_USER_ID: string;
  FACEBOOK_PAGE_ACCESS_TOKEN: string;
  INSTAGRAM_ACCOUNT_ID: string;
  FACEBOOK_GROUP_ID: string;
  FACEBOOK_USER_ID: string;
  FACEBOOK_PAGE_ID: string;
  TIMEZONE: string;
  GUI_PORT: number;
}

const envPath = path.join(__dirname, '.env');

if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 0) continue;

    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');

    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}

const allowedSubs = new Set(
  (process.env.REDDIT_ALLOWED_SUBS || 'openclawbot,lovablebuildershub')
    .split(',')
    .map(sub => sub.trim().toLowerCase())
    .filter(Boolean)
);

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

const config: AppConfig = {
  REDDIT_USER:         process.env.REDDIT_USER         || 'advanced_pudding9228',
  REDDIT_ALLOWED_SUBS: allowedSubs,
  REDDIT_SORT:         process.env.REDDIT_SORT         || 'new',
  REDDIT_LIMIT:        parseInt(process.env.REDDIT_LIMIT || '50', 10),
  OPENAI_API_KEY:      process.env.OPENAI_API_KEY      || '',
  OPENAI_MODEL:        process.env.OPENAI_MODEL        || 'gpt-4o',
  AI_STYLE:            process.env.AI_STYLE            || 'conversational',
  CUSTOM_PROMPT:       process.env.CUSTOM_PROMPT       || '',
  META_ACCESS_TOKEN:   process.env.META_ACCESS_TOKEN   || '',
  META_GRAPH_VERSION:  process.env.META_GRAPH_VERSION  || 'v25.0',
  THREADS_GRAPH_VERSION:
    process.env.THREADS_GRAPH_VERSION ||
    process.env.META_GRAPH_VERSION    ||
    'v25.0',
  ENABLE_THREADS:      parseBooleanEnv(process.env.ENABLE_THREADS, true),
  ENABLE_INSTAGRAM:    parseBooleanEnv(process.env.ENABLE_INSTAGRAM, true),
  ENABLE_FACEBOOK:     parseBooleanEnv(process.env.ENABLE_FACEBOOK, true),
  THREADS_ACCESS_TOKEN:
    process.env.THREADS_ACCESS_TOKEN ||
    process.env.META_ACCESS_TOKEN    ||
    '',
  THREADS_USER_ID:      process.env.THREADS_USER_ID      || '',
  FACEBOOK_PAGE_ACCESS_TOKEN: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '',
  INSTAGRAM_ACCOUNT_ID: process.env.INSTAGRAM_ACCOUNT_ID || '',
  FACEBOOK_GROUP_ID:    process.env.FACEBOOK_GROUP_ID    || '',
  FACEBOOK_USER_ID:     process.env.FACEBOOK_USER_ID     || '',
  FACEBOOK_PAGE_ID:     process.env.FACEBOOK_PAGE_ID     || '',
  TIMEZONE:             process.env.TIMEZONE             || 'Europe/London',
  GUI_PORT:             parseInt(process.env.GUI_PORT || '4001', 10),
};

export default config;
