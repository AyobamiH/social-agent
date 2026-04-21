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
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
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
const allowedSubs = new Set((process.env.REDDIT_ALLOWED_SUBS || 'openclawbot,lovablebuildershub')
    .split(',')
    .map(sub => sub.trim().toLowerCase())
    .filter(Boolean));
function parseBooleanEnv(value, fallback) {
    if (value === undefined || value === '')
        return fallback;
    return /^(1|true|yes|on)$/i.test(value.trim());
}
const config = {
    REDDIT_USER: process.env.REDDIT_USER || 'advanced_pudding9228',
    REDDIT_ALLOWED_SUBS: allowedSubs,
    REDDIT_SORT: process.env.REDDIT_SORT || 'new',
    REDDIT_LIMIT: parseInt(process.env.REDDIT_LIMIT || '50', 10),
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o',
    AI_STYLE: process.env.AI_STYLE || 'conversational',
    CUSTOM_PROMPT: process.env.CUSTOM_PROMPT || '',
    META_ACCESS_TOKEN: process.env.META_ACCESS_TOKEN || '',
    META_GRAPH_VERSION: process.env.META_GRAPH_VERSION || 'v25.0',
    THREADS_GRAPH_VERSION: process.env.THREADS_GRAPH_VERSION ||
        process.env.META_GRAPH_VERSION ||
        'v25.0',
    ENABLE_THREADS: parseBooleanEnv(process.env.ENABLE_THREADS, true),
    ENABLE_INSTAGRAM: parseBooleanEnv(process.env.ENABLE_INSTAGRAM, true),
    ENABLE_FACEBOOK: parseBooleanEnv(process.env.ENABLE_FACEBOOK, true),
    THREADS_ACCESS_TOKEN: process.env.THREADS_ACCESS_TOKEN ||
        process.env.META_ACCESS_TOKEN ||
        '',
    THREADS_USER_ID: process.env.THREADS_USER_ID || '',
    INSTAGRAM_ACCOUNT_ID: process.env.INSTAGRAM_ACCOUNT_ID || '',
    FACEBOOK_GROUP_ID: process.env.FACEBOOK_GROUP_ID || '',
    FACEBOOK_USER_ID: process.env.FACEBOOK_USER_ID || '',
    FACEBOOK_PAGE_ID: process.env.FACEBOOK_PAGE_ID || '',
    TIMEZONE: process.env.TIMEZONE || 'Europe/London',
    GUI_PORT: parseInt(process.env.GUI_PORT || '4001', 10),
};
exports.default = config;
