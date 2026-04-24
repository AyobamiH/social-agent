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
const http = __importStar(require("node:http"));
const path = __importStar(require("node:path"));
const crypto = __importStar(require("node:crypto"));
const config_1 = __importStar(require("../config"));
const store = __importStar(require("./store"));
const logger = __importStar(require("./logger"));
const control_plane_1 = require("./control-plane");
const content_engine_1 = require("./content-engine");
const publish_1 = require("./publish");
const runtime_policy_1 = require("./runtime-policy");
const PORT = config_1.default.GUI_PORT;
const MAX_BODY_BYTES = Number.parseInt(process.env.MAX_BODY_BYTES || `${1024 * 1024}`, 10);
const ALLOWED_ORIGINS = (process.env.APP_ALLOWED_ORIGINS || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
const COOKIE_SECURE = parseBooleanEnv(process.env.COOKIE_SECURE, process.env.NODE_ENV === 'production');
const COOKIE_SAME_SITE = (process.env.COOKIE_SAME_SITE
    || (ALLOWED_ORIGINS.length && COOKIE_SECURE ? 'None' : 'Lax')).trim();
const SESSION_COOKIE_NAME = COOKIE_SECURE ? '__Host-social_agent_session' : 'social_agent_session';
const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const STRIPE_PRICE_MONTHLY_GBP = process.env.STRIPE_PRICE_MONTHLY_GBP || '';
const STRIPE_PRICE_YEARLY_GBP = process.env.STRIPE_PRICE_YEARLY_GBP || '';
const SLOTS = [
    { id: 's1', label: '5:00 AM', desc: 'Early risers' },
    { id: 's2', label: '7:00 AM', desc: 'Morning commute' },
    { id: 's3', label: '12:00 PM', desc: 'Lunch break' },
    { id: 's4', label: '3:00 PM', desc: 'Afternoon peak' },
];
function parseBooleanEnv(value, fallback) {
    if (value === undefined || value === '')
        return fallback;
    return /^(1|true|yes|on)$/i.test(value.trim());
}
function json(res, data, status = 200, origin) {
    applyCorsHeaders(res, origin);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
    });
    res.end(JSON.stringify(data));
}
function jsonErr(res, message, status = 500, origin, extras) {
    json(res, { error: message, ...(extras || {}) }, status, origin);
}
function parseCookies(req) {
    const raw = req.headers.cookie;
    if (!raw)
        return {};
    const cookies = {};
    for (const part of raw.split(';')) {
        const [key, ...valueParts] = part.trim().split('=');
        if (!key)
            continue;
        cookies[key] = decodeURIComponent(valueParts.join('=') || '');
    }
    return cookies;
}
function getRequestOrigin(req) {
    const origin = req.headers.origin;
    return typeof origin === 'string' ? origin : undefined;
}
function getAllowedOrigin(origin) {
    if (!origin)
        return undefined;
    return ALLOWED_ORIGINS.includes(origin) ? origin : undefined;
}
function applyCorsHeaders(res, origin) {
    if (!origin)
        return;
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
}
function buildSessionCookie(value, maxAgeSeconds) {
    const parts = [
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`,
        'Path=/',
        'HttpOnly',
        `SameSite=${COOKIE_SAME_SITE}`,
    ];
    if (COOKIE_SECURE) {
        parts.push('Secure');
    }
    if (typeof maxAgeSeconds === 'number') {
        parts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
    }
    return parts.join('; ');
}
function clearSessionCookie() {
    const parts = [
        `${SESSION_COOKIE_NAME}=`,
        'Path=/',
        'HttpOnly',
        `SameSite=${COOKIE_SAME_SITE}`,
        'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        'Max-Age=0',
    ];
    if (COOKIE_SECURE) {
        parts.push('Secure');
    }
    return parts.join('; ');
}
function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return req.socket.remoteAddress || undefined;
}
function readBody(req) {
    return new Promise((resolve, reject) => {
        let rawBody = '';
        let size = 0;
        req.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error('Request body too large'));
                req.destroy();
                return;
            }
            rawBody += chunk;
        });
        req.on('end', () => {
            if (!rawBody) {
                resolve({ rawBody: '', body: {} });
                return;
            }
            try {
                resolve({ rawBody, body: JSON.parse(rawBody) });
            }
            catch {
                reject(new Error('Invalid JSON body'));
            }
        });
        req.on('error', reject);
    });
}
function getSessionCookieMaxAge(expiresAt) {
    const expiresAtMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresAtMs)) {
        return 0;
    }
    return Math.max(0, Math.floor((expiresAtMs - Date.now()) / 1000));
}
function getErrorStatus(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'Invalid JSON body')
        return 400;
    if (message === 'Request body too large')
        return 413;
    return 500;
}
function getSlot(slotId) {
    return SLOTS.find(slot => slot.id === slotId);
}
function getEffectiveSettings() {
    return {
        REDDIT_USER: config_1.default.REDDIT_USER,
        REDDIT_ALLOWED_SUBS: [...config_1.default.REDDIT_ALLOWED_SUBS],
        REDDIT_SORT: config_1.default.REDDIT_SORT,
        REDDIT_LIMIT: config_1.default.REDDIT_LIMIT,
        OPENAI_MODEL: config_1.default.OPENAI_MODEL,
        AI_STYLE: config_1.default.AI_STYLE,
        CUSTOM_PROMPT: config_1.default.CUSTOM_PROMPT,
        ENABLE_LINKEDIN: config_1.default.ENABLE_LINKEDIN,
        ENABLE_X: config_1.default.ENABLE_X,
        META_GRAPH_VERSION: config_1.default.META_GRAPH_VERSION,
        THREADS_GRAPH_VERSION: config_1.default.THREADS_GRAPH_VERSION,
        ENABLE_THREADS: config_1.default.ENABLE_THREADS,
        ENABLE_INSTAGRAM: config_1.default.ENABLE_INSTAGRAM,
        ENABLE_FACEBOOK: config_1.default.ENABLE_FACEBOOK,
        THREADS_USER_ID: config_1.default.THREADS_USER_ID,
        FACEBOOK_USER_ID: config_1.default.FACEBOOK_USER_ID,
        FACEBOOK_PAGE_ID: config_1.default.FACEBOOK_PAGE_ID,
        INSTAGRAM_ACCOUNT_ID: config_1.default.INSTAGRAM_ACCOUNT_ID,
        FACEBOOK_GROUP_ID: config_1.default.FACEBOOK_GROUP_ID,
        TIMEZONE: config_1.default.TIMEZONE,
    };
}
function getStripeConfigSummary() {
    return {
        configured: Boolean(STRIPE_SECRET_KEY),
        webhookConfigured: Boolean(STRIPE_WEBHOOK_SECRET),
        priceIds: {
            monthly: Boolean(STRIPE_PRICE_MONTHLY_GBP),
            yearly: Boolean(STRIPE_PRICE_YEARLY_GBP),
        },
        frontendBaseUrl: FRONTEND_BASE_URL,
    };
}
async function stripeFormPost(pathname, params) {
    if (!STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        body.append(key, value);
    }
    const response = await fetch(`https://api.stripe.com${pathname}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
    });
    const payload = await response.json();
    if (!response.ok) {
        const errorMessage = typeof payload.error === 'object' && payload.error && 'message' in payload.error
            ? String(payload.error.message || 'Stripe request failed')
            : 'Stripe request failed';
        throw new Error(errorMessage);
    }
    return payload;
}
function getSubscriptionPriceId(interval) {
    if (interval === 'yearly') {
        if (!STRIPE_PRICE_YEARLY_GBP) {
            throw new Error('STRIPE_PRICE_YEARLY_GBP is not configured');
        }
        return STRIPE_PRICE_YEARLY_GBP;
    }
    if (!STRIPE_PRICE_MONTHLY_GBP) {
        throw new Error('STRIPE_PRICE_MONTHLY_GBP is not configured');
    }
    return STRIPE_PRICE_MONTHLY_GBP;
}
async function ensureStripeCustomer(user) {
    const billing = (0, control_plane_1.getBillingState)();
    if (billing.stripeCustomerId) {
        return billing.stripeCustomerId;
    }
    const customer = await stripeFormPost('/v1/customers', {
        email: user.email,
        description: 'Social Agent single-tenant customer',
    });
    const customerId = String(customer.id || '');
    if (!customerId) {
        throw new Error('Stripe did not return a customer id');
    }
    (0, control_plane_1.updateBillingCheckoutState)({ stripeCustomerId: customerId });
    return customerId;
}
function verifyStripeSignature(rawBody, signatureHeader) {
    if (!STRIPE_WEBHOOK_SECRET || !signatureHeader) {
        return false;
    }
    const parts = signatureHeader.split(',').map(part => part.trim());
    const timestampPart = parts.find(part => part.startsWith('t='));
    const signatures = parts
        .filter(part => part.startsWith('v1='))
        .map(part => part.slice(3));
    if (!timestampPart || !signatures.length) {
        return false;
    }
    const timestamp = Number.parseInt(timestampPart.slice(2), 10);
    if (!Number.isFinite(timestamp)) {
        return false;
    }
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) {
        return false;
    }
    const signedPayload = `${timestamp}.${rawBody}`;
    const expected = crypto
        .createHmac('sha256', STRIPE_WEBHOOK_SECRET)
        .update(signedPayload, 'utf8')
        .digest('hex');
    return signatures.some(signature => (signature.length === expected.length
        && crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'))));
}
const routes = [
    {
        method: 'GET',
        path: '/healthz',
        handler: (_req, res, context) => {
            json(res, {
                ok: true,
                time: new Date().toISOString(),
                db: (0, control_plane_1.getDbHealth)(),
                setup: (0, control_plane_1.getSetupStatus)(),
                readiness: (0, runtime_policy_1.getRuntimeReadiness)(),
                automation: (0, runtime_policy_1.getAutomationGate)(),
            }, 200, context.origin);
        },
    },
    {
        method: 'GET',
        path: '/api/bootstrap/status',
        handler: (_req, res, context) => {
            json(res, {
                setup: (0, control_plane_1.getSetupStatus)(),
                readiness: (0, runtime_policy_1.getRuntimeReadiness)(),
                automation: (0, runtime_policy_1.getAutomationGate)(),
                stripe: getStripeConfigSummary(),
            }, 200, context.origin);
        },
    },
    {
        method: 'GET',
        path: '/api/auth/me',
        handler: (_req, res, context) => {
            if (!context.session) {
                json(res, {
                    authenticated: false,
                    setup: (0, control_plane_1.getSetupStatus)(),
                    stripe: getStripeConfigSummary(),
                }, 200, context.origin);
                return;
            }
            json(res, {
                authenticated: true,
                user: context.session.user,
                csrfToken: context.session.csrfToken,
                billing: (0, control_plane_1.getBillingState)(),
                readiness: (0, runtime_policy_1.getRuntimeReadiness)(),
                stripe: getStripeConfigSummary(),
            }, 200, context.origin);
        },
    },
    {
        method: 'POST',
        path: '/api/auth/bootstrap',
        handler: (_req, res, context) => {
            if ((0, control_plane_1.getSetupStatus)().hasOwner) {
                jsonErr(res, 'Owner account already exists', 409, context.origin);
                return;
            }
            const email = typeof context.body.email === 'string' ? context.body.email : '';
            const password = typeof context.body.password === 'string' ? context.body.password : '';
            const session = (0, control_plane_1.bootstrapOwner)(email, password, String(_req.headers['user-agent'] || ''), context.ip);
            res.setHeader('Set-Cookie', buildSessionCookie(session.token, getSessionCookieMaxAge(session.expiresAt)));
            json(res, {
                authenticated: true,
                user: session.user,
                csrfToken: session.csrfToken,
                billing: (0, control_plane_1.getBillingState)(),
                readiness: (0, runtime_policy_1.getRuntimeReadiness)(),
            }, 201, context.origin);
        },
    },
    {
        method: 'POST',
        path: '/api/auth/login',
        handler: (_req, res, context) => {
            const email = typeof context.body.email === 'string' ? context.body.email : '';
            const password = typeof context.body.password === 'string' ? context.body.password : '';
            const session = (0, control_plane_1.login)(email, password, String(_req.headers['user-agent'] || ''), context.ip);
            res.setHeader('Set-Cookie', buildSessionCookie(session.token, getSessionCookieMaxAge(session.expiresAt)));
            json(res, {
                authenticated: true,
                user: session.user,
                csrfToken: session.csrfToken,
                billing: (0, control_plane_1.getBillingState)(),
                readiness: (0, runtime_policy_1.getRuntimeReadiness)(),
            }, 200, context.origin);
        },
    },
    {
        method: 'POST',
        path: '/api/auth/logout',
        auth: true,
        csrf: true,
        handler: (_req, res, context) => {
            (0, control_plane_1.destroySession)(context.cookies[SESSION_COOKIE_NAME]);
            res.setHeader('Set-Cookie', clearSessionCookie());
            (0, control_plane_1.recordAudit)('auth.logout', 'session', {}, context.ip, context.user?.id);
            json(res, { success: true }, 200, context.origin);
        },
    },
    {
        method: 'POST',
        path: '/api/auth/password',
        auth: true,
        csrf: true,
        handler: (_req, res, context) => {
            const currentPassword = typeof context.body.currentPassword === 'string' ? context.body.currentPassword : '';
            const nextPassword = typeof context.body.nextPassword === 'string' ? context.body.nextPassword : '';
            (0, control_plane_1.changePassword)(context.user.id, currentPassword, nextPassword);
            (0, control_plane_1.recordAudit)('auth.password.change', 'user', {}, context.ip, context.user?.id);
            json(res, { success: true }, 200, context.origin);
        },
    },
    {
        method: 'GET',
        path: '/api/settings',
        auth: true,
        handler: (_req, res, context) => {
            json(res, {
                runtime: getEffectiveSettings(),
                storedRuntimeSettings: (0, control_plane_1.getRuntimeSettings)(),
                secretPresence: (0, control_plane_1.getRuntimeSecretPresence)(),
                readiness: (0, runtime_policy_1.getRuntimeReadiness)(),
                billing: (0, control_plane_1.getBillingState)(),
            }, 200, context.origin);
        },
    },
    {
        method: 'PUT',
        path: '/api/settings/runtime',
        auth: true,
        csrf: true,
        handler: (_req, res, context) => {
            const settings = (typeof context.body.settings === 'object' && context.body.settings)
                ? context.body.settings
                : {};
            (0, control_plane_1.updateRuntimeSettings)(settings);
            (0, config_1.reloadRuntimeConfigFromStorage)();
            (0, control_plane_1.recordAudit)('settings.runtime.update', 'runtime_settings', { keys: Object.keys(settings) }, context.ip, context.user?.id);
            json(res, {
                success: true,
                runtime: getEffectiveSettings(),
                secretPresence: (0, control_plane_1.getRuntimeSecretPresence)(),
                readiness: (0, runtime_policy_1.getRuntimeReadiness)(),
            }, 200, context.origin);
        },
    },
    {
        method: 'PUT',
        path: '/api/settings/secrets',
        auth: true,
        csrf: true,
        handler: (_req, res, context) => {
            const secrets = (typeof context.body.secrets === 'object' && context.body.secrets)
                ? context.body.secrets
                : {};
            const patch = Object.fromEntries(Object.entries(secrets).map(([key, value]) => [
                key,
                value === null ? null : typeof value === 'string' ? value : '',
            ]));
            (0, control_plane_1.updateRuntimeSecrets)(patch);
            (0, config_1.reloadRuntimeConfigFromStorage)();
            (0, control_plane_1.recordAudit)('settings.secrets.update', 'runtime_secrets', { keys: Object.keys(secrets) }, context.ip, context.user?.id);
            json(res, {
                success: true,
                secretPresence: (0, control_plane_1.getRuntimeSecretPresence)(),
                readiness: (0, runtime_policy_1.getRuntimeReadiness)(),
            }, 200, context.origin);
        },
    },
    {
        method: 'GET',
        path: '/api/billing',
        auth: true,
        handler: (_req, res, context) => {
            json(res, {
                billing: (0, control_plane_1.getBillingState)(),
                stripe: getStripeConfigSummary(),
            }, 200, context.origin);
        },
    },
    {
        method: 'POST',
        path: '/api/billing/checkout-session',
        auth: true,
        csrf: true,
        handler: async (_req, res, context) => {
            const interval = context.body.interval === 'yearly' ? 'yearly' : 'monthly';
            const priceId = getSubscriptionPriceId(interval);
            const customerId = await ensureStripeCustomer(context.user);
            const session = await stripeFormPost('/v1/checkout/sessions', {
                mode: 'subscription',
                customer: customerId,
                success_url: `${FRONTEND_BASE_URL.replace(/\/$/, '')}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${FRONTEND_BASE_URL.replace(/\/$/, '')}/billing/cancel`,
                'line_items[0][price]': priceId,
                'line_items[0][quantity]': '1',
                'subscription_data[trial_period_days]': String(process.env.TRIAL_DAYS || '7'),
            });
            (0, control_plane_1.updateBillingCheckoutState)({
                stripeCustomerId: customerId,
                stripeCheckoutSessionId: String(session.id || ''),
                planInterval: interval,
            });
            (0, control_plane_1.recordAudit)('billing.checkout_session.create', 'stripe', { interval }, context.ip, context.user?.id);
            json(res, {
                id: session.id,
                url: session.url,
            }, 200, context.origin);
        },
    },
    {
        method: 'POST',
        path: '/api/billing/portal-session',
        auth: true,
        csrf: true,
        handler: async (_req, res, context) => {
            const billing = (0, control_plane_1.getBillingState)();
            if (!billing.stripeCustomerId) {
                jsonErr(res, 'No Stripe customer is linked to this installation yet', 409, context.origin);
                return;
            }
            const session = await stripeFormPost('/v1/billing_portal/sessions', {
                customer: billing.stripeCustomerId,
                return_url: `${FRONTEND_BASE_URL.replace(/\/$/, '')}/billing`,
            });
            (0, control_plane_1.recordAudit)('billing.portal_session.create', 'stripe', {}, context.ip, context.user?.id);
            json(res, { url: session.url }, 200, context.origin);
        },
    },
    {
        method: 'POST',
        path: '/api/billing/webhook',
        handler: (_req, res, context) => {
            if (!verifyStripeSignature(context.rawBody, typeof _req.headers['stripe-signature'] === 'string' ? _req.headers['stripe-signature'] : undefined)) {
                jsonErr(res, 'Invalid Stripe webhook signature', 400, context.origin);
                return;
            }
            const event = parseStripeEvent(context.rawBody);
            const eventType = String(event.type || '');
            const dataObject = (event.data && typeof event.data === 'object' && 'object' in event.data)
                ? event.data.object || {}
                : {};
            if (eventType === 'checkout.session.completed') {
                (0, control_plane_1.updateBillingCheckoutState)({
                    stripeCustomerId: typeof dataObject.customer === 'string' ? dataObject.customer : undefined,
                    stripeSubscriptionId: typeof dataObject.subscription === 'string' ? dataObject.subscription : undefined,
                    stripeCheckoutSessionId: typeof dataObject.id === 'string' ? dataObject.id : undefined,
                });
            }
            if (eventType === 'customer.subscription.created'
                || eventType === 'customer.subscription.updated'
                || eventType === 'customer.subscription.deleted'
                || eventType === 'customer.subscription.paused'
                || eventType === 'customer.subscription.resumed') {
                (0, control_plane_1.updateBillingFromStripeSubscription)(dataObject);
            }
            (0, control_plane_1.recordAudit)('billing.webhook.processed', 'stripe_webhook', { eventType }, context.ip);
            json(res, { received: true }, 200, context.origin);
        },
    },
    {
        method: 'GET',
        path: '/api/audit-logs',
        auth: true,
        handler: (_req, res, context) => {
            json(res, (0, control_plane_1.getAuditLogs)(100), 200, context.origin);
        },
    },
    {
        method: 'GET',
        path: '/api/status',
        auth: true,
        handler: (_req, res, context) => {
            const queue = store.getQueue();
            const memory = store.getMemoryStats();
            const readiness = (0, runtime_policy_1.getRuntimeReadiness)();
            const billing = (0, control_plane_1.getBillingState)();
            json(res, {
                slots: SLOTS.map(slot => ({ ...slot, post: queue[slot.id] || null })),
                stats: {
                    queued: SLOTS.filter(slot => queue[slot.id]).length,
                    posted: store.getHistory().length,
                    usedPosts: store.getUsedIds().size,
                    bankedSources: memory.sources.banked,
                    exhaustedSources: memory.sources.exhausted,
                    readyAngles: memory.angles.ready,
                    queuedAngles: memory.angles.queued,
                    publishedAngles: memory.angles.published,
                },
                memory,
                readiness,
                billing,
                config: {
                    redditUser: config_1.default.REDDIT_USER,
                    allowedSubs: [...config_1.default.REDDIT_ALLOWED_SUBS],
                    model: config_1.default.OPENAI_MODEL,
                    timezone: config_1.default.TIMEZONE,
                    platforms: {
                        linkedin: config_1.default.ENABLE_LINKEDIN,
                        threads: config_1.default.ENABLE_THREADS,
                        x: config_1.default.ENABLE_X,
                        instagram: config_1.default.ENABLE_INSTAGRAM,
                        facebook: config_1.default.ENABLE_FACEBOOK,
                    },
                },
            }, 200, context.origin);
        },
    },
    {
        method: 'GET',
        path: '/api/queue',
        auth: true,
        handler: (_req, res, context) => {
            const queue = store.getQueue();
            json(res, SLOTS.map(slot => ({ slot, post: queue[slot.id] || null })), 200, context.origin);
        },
    },
    {
        method: 'GET',
        path: '/api/history',
        auth: true,
        handler: (_req, res, context) => {
            json(res, store.getHistory().slice(0, 50), 200, context.origin);
        },
    },
    {
        method: 'GET',
        path: '/api/memory',
        auth: true,
        handler: (_req, res, context) => {
            json(res, {
                stats: store.getMemoryStats(),
                sources: store.getSources().slice(0, 50),
                recentAngles: store.getAngles().slice(-100).reverse().slice(0, 50),
            }, 200, context.origin);
        },
    },
    {
        method: 'GET',
        path: '/api/logs',
        auth: true,
        handler: (_req, res, context) => {
            const logFile = path.join(__dirname, '..', 'data', 'agent.log');
            try {
                const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
                json(res, lines.slice(-150).reverse(), 200, context.origin);
            }
            catch {
                json(res, [], 200, context.origin);
            }
        },
    },
    {
        method: 'POST',
        path: '/api/fetch',
        auth: true,
        csrf: true,
        billing: 'automation',
        handler: async (_req, res, context) => {
            const stats = await (0, content_engine_1.fillEmptySlots)(SLOTS, logger);
            logger.info(`[API] Fetch done — filled:${stats.filled} reused:${stats.reusedAngles} extracted:${stats.extractedSources}`);
            (0, control_plane_1.recordAudit)('automation.fetch', 'queue', stats, context.ip, context.user?.id);
            json(res, { ...stats, memory: store.getMemoryStats() }, 200, context.origin);
        },
    },
    {
        method: 'POST',
        path: '/api/post-slot',
        auth: true,
        csrf: true,
        billing: 'automation',
        handler: async (_req, res, context) => {
            const slot = getSlot(context.body.slotId);
            if (!slot) {
                jsonErr(res, 'Invalid slot', 400, context.origin);
                return;
            }
            const item = store.getSlotPost(slot.id);
            if (!item) {
                jsonErr(res, 'Slot is empty', 400, context.origin);
                return;
            }
            const hydratedItem = await (0, content_engine_1.hydrateQueuedItemForActivePlatforms)(slot.id, item, logger);
            const result = await (0, publish_1.publishQueuedItem)(hydratedItem, logger);
            (0, content_engine_1.finalizePublishResult)(slot, hydratedItem, result);
            (0, control_plane_1.recordAudit)('automation.post_slot', slot.id, {
                completed: result.completed,
                pendingPlatforms: result.pendingPlatforms,
            }, context.ip, context.user?.id);
            json(res, {
                success: result.completed,
                queuedForRetry: !result.completed,
                ids: result.ids,
                errors: result.errors,
                pendingPlatforms: result.pendingPlatforms,
                memory: store.getMemoryStats(),
            }, 200, context.origin);
        },
    },
    {
        method: 'POST',
        path: '/api/post-all',
        auth: true,
        csrf: true,
        billing: 'automation',
        handler: async (_req, res, context) => {
            const results = [];
            for (const slot of SLOTS) {
                const item = store.getSlotPost(slot.id);
                if (!item) {
                    results.push({ slot: slot.label, skipped: true });
                    continue;
                }
                const hydratedItem = await (0, content_engine_1.hydrateQueuedItemForActivePlatforms)(slot.id, item, logger);
                const result = await (0, publish_1.publishQueuedItem)(hydratedItem, logger);
                (0, content_engine_1.finalizePublishResult)(slot, hydratedItem, result);
                results.push({
                    slot: slot.label,
                    ids: result.ids,
                    errors: result.errors,
                    queuedForRetry: !result.completed,
                    pendingPlatforms: result.pendingPlatforms,
                });
            }
            (0, control_plane_1.recordAudit)('automation.post_all', 'queue', { processed: results.length }, context.ip, context.user?.id);
            json(res, { results, memory: store.getMemoryStats() }, 200, context.origin);
        },
    },
    {
        method: 'PUT',
        path: '/api/slot',
        auth: true,
        csrf: true,
        billing: 'automation',
        handler: (_req, res, context) => {
            const slot = getSlot(context.body.slotId);
            if (!slot) {
                jsonErr(res, 'slotId required', 400, context.origin);
                return;
            }
            const existing = store.getSlotPost(slot.id);
            const updates = (typeof context.body.updates === 'object' && context.body.updates)
                ? context.body.updates
                : {};
            store.setSlotPost(slot.id, { ...(existing || {}), ...updates });
            (0, control_plane_1.recordAudit)('automation.slot.update', slot.id, { keys: Object.keys(updates) }, context.ip, context.user?.id);
            json(res, { success: true }, 200, context.origin);
        },
    },
    {
        method: 'DELETE',
        path: '/api/slot',
        auth: true,
        csrf: true,
        billing: 'automation',
        handler: (_req, res, context) => {
            const slot = getSlot(context.body.slotId);
            if (!slot) {
                jsonErr(res, 'slotId required', 400, context.origin);
                return;
            }
            (0, content_engine_1.releaseSlot)(slot.id);
            (0, control_plane_1.recordAudit)('automation.slot.release', slot.id, {}, context.ip, context.user?.id);
            json(res, { success: true, memory: store.getMemoryStats() }, 200, context.origin);
        },
    },
];
function parseStripeEvent(rawBody) {
    try {
        return JSON.parse(rawBody);
    }
    catch {
        return {};
    }
}
const server = http.createServer(async (req, res) => {
    const origin = getAllowedOrigin(getRequestOrigin(req));
    const parsed = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = parsed.pathname || '/';
    const method = req.method || 'GET';
    if (method === 'OPTIONS') {
        applyCorsHeaders(res, origin);
        res.writeHead(204, {
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-CSRF-Token, Stripe-Signature',
            'Access-Control-Max-Age': '600',
            'Referrer-Policy': 'no-referrer',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
        });
        res.end();
        return;
    }
    const route = routes.find(entry => entry.method === method && entry.path === pathname);
    if (route) {
        try {
            const cookies = parseCookies(req);
            const { rawBody, body } = ['POST', 'PUT', 'DELETE'].includes(method)
                ? await readBody(req)
                : { rawBody: '', body: {} };
            const context = {
                body,
                rawBody,
                cookies,
                origin,
                ip: getClientIp(req),
            };
            const session = (0, control_plane_1.getSession)(cookies[SESSION_COOKIE_NAME]);
            if (session) {
                context.session = session;
                context.user = session.user;
            }
            if (route.auth && !context.session) {
                jsonErr(res, 'Authentication required', 401, origin);
                return;
            }
            if (route.csrf) {
                const csrfHeader = req.headers['x-csrf-token'];
                const csrfToken = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;
                if (!(0, control_plane_1.assertCsrf)(context.session, csrfToken)) {
                    jsonErr(res, 'Invalid CSRF token', 403, origin);
                    return;
                }
            }
            if (route.billing === 'automation') {
                const gate = (0, runtime_policy_1.getAutomationGate)();
                if (!gate.allowed) {
                    jsonErr(res, 'Automation is not available', 403, origin, { gate });
                    return;
                }
            }
            await route.handler(req, res, context);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`[API] ${method} ${pathname}: ${message}`);
            jsonErr(res, message, getErrorStatus(error), origin);
        }
        return;
    }
    const publicDir = path.join(__dirname, '..', 'public');
    const requestedPath = pathname === '/' ? '/index.html' : pathname;
    const filePath = path.join(publicDir, requestedPath.replace(/^\/+/, ''));
    if (!filePath.startsWith(publicDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const mime = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.ico': 'image/x-icon',
    }[ext] || 'application/octet-stream';
    try {
        const data = fs.readFileSync(filePath);
        applyCorsHeaders(res, origin);
        res.writeHead(200, {
            'Content-Type': mime,
            'Referrer-Policy': 'no-referrer',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
        });
        res.end(data);
    }
    catch {
        res.writeHead(404);
        res.end('Not found');
    }
});
server.listen(PORT, () => {
    logger.info(`Dashboard/API running at http://localhost:${PORT}`);
});
