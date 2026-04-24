import * as fs from 'node:fs';
import * as path from 'node:path';

import { getStoredRuntimeConfigPatch } from './src/control-plane';

export interface AppConfig {
  REDDIT_USER: string;
  REDDIT_ALLOWED_SUBS: Set<string>;
  REDDIT_SORT: string;
  REDDIT_LIMIT: number;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  AI_STYLE: string;
  CUSTOM_PROMPT: string;
  ENABLE_LINKEDIN: boolean;
  META_ACCESS_TOKEN: string;
  META_GRAPH_VERSION: string;
  THREADS_GRAPH_VERSION: string;
  ENABLE_THREADS: boolean;
  ENABLE_INSTAGRAM: boolean;
  ENABLE_FACEBOOK: boolean;
  LINKEDIN_TOKEN: string;
  LINKEDIN_PERSON_URN: string;
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

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function toSubSet(value: string | string[] | Set<string> | undefined, fallback: string): Set<string> {
  if (value instanceof Set) return new Set(value);
  const entries = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : fallback.split(',');

  return new Set(
    entries
      .map(sub => String(sub).trim().toLowerCase())
      .filter(Boolean)
  );
}

function buildBaseConfig(): AppConfig {
  return {
    REDDIT_USER: process.env.REDDIT_USER || 'advanced_pudding9228',
    REDDIT_ALLOWED_SUBS: toSubSet(process.env.REDDIT_ALLOWED_SUBS, 'openclawbot,lovablebuildershub'),
    REDDIT_SORT: process.env.REDDIT_SORT || 'new',
    REDDIT_LIMIT: Number.parseInt(process.env.REDDIT_LIMIT || '50', 10),
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o',
    AI_STYLE: process.env.AI_STYLE || 'conversational',
    CUSTOM_PROMPT: process.env.CUSTOM_PROMPT || '',
    ENABLE_LINKEDIN: parseBooleanEnv(process.env.ENABLE_LINKEDIN, false),
    META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN || '',
    META_GRAPH_VERSION: process.env.META_GRAPH_VERSION || 'v25.0',
    THREADS_GRAPH_VERSION:
      process.env.THREADS_GRAPH_VERSION ||
      process.env.META_GRAPH_VERSION ||
      'v25.0',
    ENABLE_THREADS: parseBooleanEnv(process.env.ENABLE_THREADS, true),
    ENABLE_INSTAGRAM: parseBooleanEnv(process.env.ENABLE_INSTAGRAM, true),
    ENABLE_FACEBOOK: parseBooleanEnv(process.env.ENABLE_FACEBOOK, true),
    LINKEDIN_TOKEN: process.env.LINKEDIN_TOKEN || '',
    LINKEDIN_PERSON_URN: process.env.LINKEDIN_PERSON_URN || '',
    THREADS_ACCESS_TOKEN:
      process.env.THREADS_ACCESS_TOKEN ||
      process.env.META_ACCESS_TOKEN ||
      '',
    THREADS_USER_ID: process.env.THREADS_USER_ID || '',
    FACEBOOK_PAGE_ACCESS_TOKEN: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '',
    INSTAGRAM_ACCOUNT_ID: process.env.INSTAGRAM_ACCOUNT_ID || '',
    FACEBOOK_GROUP_ID: process.env.FACEBOOK_GROUP_ID || '',
    FACEBOOK_USER_ID: process.env.FACEBOOK_USER_ID || '',
    FACEBOOK_PAGE_ID: process.env.FACEBOOK_PAGE_ID || '',
    TIMEZONE: process.env.TIMEZONE || 'Europe/London',
    GUI_PORT: Number.parseInt(process.env.GUI_PORT || '4001', 10),
  };
}

const config: AppConfig = buildBaseConfig();

export function applyRuntimeConfig(patch: Record<string, unknown>): AppConfig {
  if (typeof patch.REDDIT_USER === 'string') {
    config.REDDIT_USER = patch.REDDIT_USER;
  }
  if (
    typeof patch.REDDIT_ALLOWED_SUBS === 'string'
    || Array.isArray(patch.REDDIT_ALLOWED_SUBS)
    || patch.REDDIT_ALLOWED_SUBS instanceof Set
  ) {
    config.REDDIT_ALLOWED_SUBS = toSubSet(
      patch.REDDIT_ALLOWED_SUBS as string | string[] | Set<string>,
      [...config.REDDIT_ALLOWED_SUBS].join(',')
    );
  }
  if (typeof patch.REDDIT_SORT === 'string') config.REDDIT_SORT = patch.REDDIT_SORT;
  if (typeof patch.REDDIT_LIMIT === 'number' && Number.isFinite(patch.REDDIT_LIMIT)) config.REDDIT_LIMIT = patch.REDDIT_LIMIT;
  if (typeof patch.OPENAI_API_KEY === 'string') config.OPENAI_API_KEY = patch.OPENAI_API_KEY;
  if (typeof patch.OPENAI_MODEL === 'string') config.OPENAI_MODEL = patch.OPENAI_MODEL;
  if (typeof patch.AI_STYLE === 'string') config.AI_STYLE = patch.AI_STYLE;
  if (typeof patch.CUSTOM_PROMPT === 'string') config.CUSTOM_PROMPT = patch.CUSTOM_PROMPT;
  if (typeof patch.ENABLE_LINKEDIN === 'boolean') config.ENABLE_LINKEDIN = patch.ENABLE_LINKEDIN;
  if (typeof patch.META_ACCESS_TOKEN === 'string') config.META_ACCESS_TOKEN = patch.META_ACCESS_TOKEN;
  if (typeof patch.META_GRAPH_VERSION === 'string') config.META_GRAPH_VERSION = patch.META_GRAPH_VERSION;
  if (typeof patch.THREADS_GRAPH_VERSION === 'string') config.THREADS_GRAPH_VERSION = patch.THREADS_GRAPH_VERSION;
  if (typeof patch.ENABLE_THREADS === 'boolean') config.ENABLE_THREADS = patch.ENABLE_THREADS;
  if (typeof patch.ENABLE_INSTAGRAM === 'boolean') config.ENABLE_INSTAGRAM = patch.ENABLE_INSTAGRAM;
  if (typeof patch.ENABLE_FACEBOOK === 'boolean') config.ENABLE_FACEBOOK = patch.ENABLE_FACEBOOK;
  if (typeof patch.LINKEDIN_TOKEN === 'string') config.LINKEDIN_TOKEN = patch.LINKEDIN_TOKEN;
  if (typeof patch.LINKEDIN_PERSON_URN === 'string') config.LINKEDIN_PERSON_URN = patch.LINKEDIN_PERSON_URN;
  if (typeof patch.THREADS_ACCESS_TOKEN === 'string') config.THREADS_ACCESS_TOKEN = patch.THREADS_ACCESS_TOKEN;
  if (typeof patch.THREADS_USER_ID === 'string') config.THREADS_USER_ID = patch.THREADS_USER_ID;
  if (typeof patch.FACEBOOK_PAGE_ACCESS_TOKEN === 'string') config.FACEBOOK_PAGE_ACCESS_TOKEN = patch.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (typeof patch.INSTAGRAM_ACCOUNT_ID === 'string') config.INSTAGRAM_ACCOUNT_ID = patch.INSTAGRAM_ACCOUNT_ID;
  if (typeof patch.FACEBOOK_GROUP_ID === 'string') config.FACEBOOK_GROUP_ID = patch.FACEBOOK_GROUP_ID;
  if (typeof patch.FACEBOOK_USER_ID === 'string') config.FACEBOOK_USER_ID = patch.FACEBOOK_USER_ID;
  if (typeof patch.FACEBOOK_PAGE_ID === 'string') config.FACEBOOK_PAGE_ID = patch.FACEBOOK_PAGE_ID;
  if (typeof patch.TIMEZONE === 'string') config.TIMEZONE = patch.TIMEZONE;

  return config;
}

export function reloadRuntimeConfigFromStorage(): AppConfig {
  return applyRuntimeConfig(getStoredRuntimeConfigPatch());
}

reloadRuntimeConfigFromStorage();

export default config;
