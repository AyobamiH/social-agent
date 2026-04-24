"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyRuntimeConfig = applyRuntimeConfig;
exports.reloadRuntimeConfigFromStorage = reloadRuntimeConfigFromStorage;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const control_plane_1 = require("./src/control-plane");
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx < 0)
            continue;
        const key = trimmed.substring(0, eqIdx).trim();
        const val = trimmed.substring(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (key && !(key in process.env)) {
            process.env[key] = val;
        }
    }
}
function parseBooleanEnv(value, fallback) {
    if (value === undefined || value === '')
        return fallback;
    return /^(1|true|yes|on)$/i.test(value.trim());
}
function toSubSet(value, fallback) {
    if (value instanceof Set)
        return new Set(value);
    const entries = Array.isArray(value)
        ? value
        : typeof value === 'string'
            ? value.split(',')
            : fallback.split(',');
    return new Set(entries
        .map(sub => String(sub).trim().toLowerCase())
        .filter(Boolean));
}
function buildBaseConfig() {
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
        THREADS_GRAPH_VERSION: process.env.THREADS_GRAPH_VERSION ||
            process.env.META_GRAPH_VERSION ||
            'v25.0',
        ENABLE_THREADS: parseBooleanEnv(process.env.ENABLE_THREADS, true),
        ENABLE_INSTAGRAM: parseBooleanEnv(process.env.ENABLE_INSTAGRAM, true),
        ENABLE_FACEBOOK: parseBooleanEnv(process.env.ENABLE_FACEBOOK, true),
        LINKEDIN_TOKEN: process.env.LINKEDIN_TOKEN || '',
        LINKEDIN_PERSON_URN: process.env.LINKEDIN_PERSON_URN || '',
        THREADS_ACCESS_TOKEN: process.env.THREADS_ACCESS_TOKEN ||
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
const config = buildBaseConfig();
function applyRuntimeConfig(patch) {
    if (typeof patch.REDDIT_USER === 'string') {
        config.REDDIT_USER = patch.REDDIT_USER;
    }
    if (typeof patch.REDDIT_ALLOWED_SUBS === 'string'
        || Array.isArray(patch.REDDIT_ALLOWED_SUBS)
        || patch.REDDIT_ALLOWED_SUBS instanceof Set) {
        config.REDDIT_ALLOWED_SUBS = toSubSet(patch.REDDIT_ALLOWED_SUBS, [...config.REDDIT_ALLOWED_SUBS].join(','));
    }
    if (typeof patch.REDDIT_SORT === 'string')
        config.REDDIT_SORT = patch.REDDIT_SORT;
    if (typeof patch.REDDIT_LIMIT === 'number' && Number.isFinite(patch.REDDIT_LIMIT))
        config.REDDIT_LIMIT = patch.REDDIT_LIMIT;
    if (typeof patch.OPENAI_API_KEY === 'string')
        config.OPENAI_API_KEY = patch.OPENAI_API_KEY;
    if (typeof patch.OPENAI_MODEL === 'string')
        config.OPENAI_MODEL = patch.OPENAI_MODEL;
    if (typeof patch.AI_STYLE === 'string')
        config.AI_STYLE = patch.AI_STYLE;
    if (typeof patch.CUSTOM_PROMPT === 'string')
        config.CUSTOM_PROMPT = patch.CUSTOM_PROMPT;
    if (typeof patch.ENABLE_LINKEDIN === 'boolean')
        config.ENABLE_LINKEDIN = patch.ENABLE_LINKEDIN;
    if (typeof patch.META_ACCESS_TOKEN === 'string')
        config.META_ACCESS_TOKEN = patch.META_ACCESS_TOKEN;
    if (typeof patch.META_GRAPH_VERSION === 'string')
        config.META_GRAPH_VERSION = patch.META_GRAPH_VERSION;
    if (typeof patch.THREADS_GRAPH_VERSION === 'string')
        config.THREADS_GRAPH_VERSION = patch.THREADS_GRAPH_VERSION;
    if (typeof patch.ENABLE_THREADS === 'boolean')
        config.ENABLE_THREADS = patch.ENABLE_THREADS;
    if (typeof patch.ENABLE_INSTAGRAM === 'boolean')
        config.ENABLE_INSTAGRAM = patch.ENABLE_INSTAGRAM;
    if (typeof patch.ENABLE_FACEBOOK === 'boolean')
        config.ENABLE_FACEBOOK = patch.ENABLE_FACEBOOK;
    if (typeof patch.LINKEDIN_TOKEN === 'string')
        config.LINKEDIN_TOKEN = patch.LINKEDIN_TOKEN;
    if (typeof patch.LINKEDIN_PERSON_URN === 'string')
        config.LINKEDIN_PERSON_URN = patch.LINKEDIN_PERSON_URN;
    if (typeof patch.THREADS_ACCESS_TOKEN === 'string')
        config.THREADS_ACCESS_TOKEN = patch.THREADS_ACCESS_TOKEN;
    if (typeof patch.THREADS_USER_ID === 'string')
        config.THREADS_USER_ID = patch.THREADS_USER_ID;
    if (typeof patch.FACEBOOK_PAGE_ACCESS_TOKEN === 'string')
        config.FACEBOOK_PAGE_ACCESS_TOKEN = patch.FACEBOOK_PAGE_ACCESS_TOKEN;
    if (typeof patch.INSTAGRAM_ACCOUNT_ID === 'string')
        config.INSTAGRAM_ACCOUNT_ID = patch.INSTAGRAM_ACCOUNT_ID;
    if (typeof patch.FACEBOOK_GROUP_ID === 'string')
        config.FACEBOOK_GROUP_ID = patch.FACEBOOK_GROUP_ID;
    if (typeof patch.FACEBOOK_USER_ID === 'string')
        config.FACEBOOK_USER_ID = patch.FACEBOOK_USER_ID;
    if (typeof patch.FACEBOOK_PAGE_ID === 'string')
        config.FACEBOOK_PAGE_ID = patch.FACEBOOK_PAGE_ID;
    if (typeof patch.TIMEZONE === 'string')
        config.TIMEZONE = patch.TIMEZONE;
    return config;
}
function reloadRuntimeConfigFromStorage() {
    return applyRuntimeConfig((0, control_plane_1.getStoredRuntimeConfigPatch)());
}
reloadRuntimeConfigFromStorage();
exports.default = config;
