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
exports.getBillingState = getBillingState;
exports.canAccessAutomation = canAccessAutomation;
exports.hasUsers = hasUsers;
exports.getSession = getSession;
exports.assertCsrf = assertCsrf;
exports.destroySession = destroySession;
exports.bootstrapOwner = bootstrapOwner;
exports.login = login;
exports.changePassword = changePassword;
exports.getRuntimeSettings = getRuntimeSettings;
exports.getRuntimeSecrets = getRuntimeSecrets;
exports.getRuntimeSecretPresence = getRuntimeSecretPresence;
exports.updateRuntimeSettings = updateRuntimeSettings;
exports.updateRuntimeSecrets = updateRuntimeSecrets;
exports.getStoredRuntimeConfigPatch = getStoredRuntimeConfigPatch;
exports.getSetupStatus = getSetupStatus;
exports.updateBillingFromStripeSubscription = updateBillingFromStripeSubscription;
exports.updateBillingCheckoutState = updateBillingCheckoutState;
exports.recordAudit = recordAudit;
exports.getAuditLogs = getAuditLogs;
exports.getDbHealth = getDbHealth;
const crypto = __importStar(require("node:crypto"));
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const node_sqlite_1 = require("node:sqlite");
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'control-plane.sqlite');
const KEY_FILE = path.join(DATA_DIR, 'control-plane.key');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
const db = new node_sqlite_1.DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS app_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS app_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    csrf_token TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    user_agent TEXT,
    ip TEXT
  );

  CREATE TABLE IF NOT EXISTS app_singletons (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    ip TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_app_sessions_token_hash ON app_sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON app_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_app_audit_logs_created_at ON app_audit_logs(created_at DESC);
`);
function nowIso() {
    return new Date().toISOString();
}
function getTrialDays() {
    const parsed = Number.parseInt(process.env.TRIAL_DAYS || '7', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}
function getSessionTtlDays() {
    const parsed = Number.parseInt(process.env.SESSION_TTL_DAYS || '30', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
}
function getSingleton(key) {
    const row = db.prepare('SELECT value FROM app_singletons WHERE key = ?').get(key);
    return row?.value;
}
function setSingleton(key, value) {
    const now = nowIso();
    db.prepare(`
    INSERT INTO app_singletons (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value, now);
}
function parseJson(value, fallback) {
    if (!value)
        return fallback;
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
function getEncryptionKey() {
    const envKey = process.env.APP_ENCRYPTION_KEY?.trim();
    if (envKey) {
        if (/^[A-Fa-f0-9]{64}$/.test(envKey)) {
            return Buffer.from(envKey, 'hex');
        }
        return Buffer.from(envKey, 'base64');
    }
    if (fs.existsSync(KEY_FILE)) {
        return Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'base64');
    }
    const key = crypto.randomBytes(32);
    fs.writeFileSync(KEY_FILE, key.toString('base64'), { encoding: 'utf8', mode: 0o600 });
    return key;
}
function encryptString(plainText) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
        iv: iv.toString('base64'),
        tag: tag.toString('base64'),
        data: encrypted.toString('base64'),
    });
}
function decryptString(envelope) {
    if (!envelope)
        return '';
    const parsed = parseJson(envelope, {});
    if (!parsed.iv || !parsed.tag || !parsed.data)
        return '';
    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'));
    const decrypted = Buffer.concat([
        decipher.update(Buffer.from(parsed.data, 'base64')),
        decipher.final(),
    ]);
    return decrypted.toString('utf8');
}
function randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString('base64url');
}
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}
function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const derived = crypto.scryptSync(password, salt, 64, {
        N: 16384,
        r: 8,
        p: 1,
        maxmem: 128 * 1024 * 1024,
    });
    return [
        'scrypt',
        '16384',
        '8',
        '1',
        salt.toString('base64'),
        derived.toString('base64'),
    ].join('$');
}
function verifyPassword(password, storedHash) {
    const [algo, n, r, p, saltB64, derivedB64] = storedHash.split('$');
    if (algo !== 'scrypt' || !n || !r || !p || !saltB64 || !derivedB64) {
        return false;
    }
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(derivedB64, 'base64');
    const derived = crypto.scryptSync(password, salt, expected.length, {
        N: Number.parseInt(n, 10),
        r: Number.parseInt(r, 10),
        p: Number.parseInt(p, 10),
        maxmem: 128 * 1024 * 1024,
    });
    if (expected.length !== derived.length)
        return false;
    return crypto.timingSafeEqual(expected, derived);
}
function normalizeEmail(email) {
    return email.trim().toLowerCase();
}
function toAuthUser(row) {
    return {
        id: row.id,
        email: row.email,
        role: row.role,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastLoginAt: row.last_login_at || undefined,
    };
}
function getUserByEmail(email) {
    return db.prepare('SELECT * FROM app_users WHERE email = ?').get(normalizeEmail(email));
}
function getUserById(id) {
    return db.prepare('SELECT * FROM app_users WHERE id = ?').get(id);
}
function upsertBillingState(next) {
    const normalized = {
        ...next,
        updatedAt: nowIso(),
    };
    setSingleton('billing_state', JSON.stringify(normalized));
    return normalized;
}
function defaultBillingState() {
    return {
        status: 'setup',
        updatedAt: nowIso(),
    };
}
function normalizeBillingState(state) {
    const now = Date.now();
    if (state.status === 'trialing' && state.trialEndsAt) {
        const trialEnds = new Date(state.trialEndsAt).getTime();
        if (Number.isFinite(trialEnds) && now > trialEnds) {
            return {
                ...state,
                status: 'canceled',
                lockedReason: 'Trial expired without an active subscription',
                updatedAt: nowIso(),
            };
        }
    }
    return state;
}
function getBillingState() {
    const stored = parseJson(getSingleton('billing_state'), defaultBillingState());
    const normalized = normalizeBillingState(stored);
    if (JSON.stringify(normalized) !== JSON.stringify(stored)) {
        upsertBillingState(normalized);
    }
    const accessActive = normalized.status === 'active' || normalized.status === 'trialing';
    return {
        ...normalized,
        accessActive,
        prices: {
            monthlyGbp: 8.99,
            yearlyGbp: 89,
        },
    };
}
function canAccessAutomation() {
    return getBillingState().accessActive;
}
function hasUsers() {
    const row = db.prepare('SELECT COUNT(*) AS count FROM app_users').get();
    return row.count > 0;
}
function createSessionForUser(user, userAgent, ip) {
    const token = randomToken(32);
    const csrfToken = randomToken(24);
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + getSessionTtlDays() * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`
    INSERT INTO app_sessions (
      user_id, token_hash, csrf_token, expires_at, created_at, last_seen_at, user_agent, ip
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(user.id, hashToken(token), csrfToken, expiresAt, createdAt, createdAt, userAgent || null, ip || null);
    return {
        token,
        csrfToken,
        user,
        expiresAt,
    };
}
function getSession(token) {
    if (!token)
        return undefined;
    const session = db.prepare('SELECT * FROM app_sessions WHERE token_hash = ?').get(hashToken(token));
    if (!session)
        return undefined;
    if (new Date(session.expires_at).getTime() <= Date.now()) {
        db.prepare('DELETE FROM app_sessions WHERE id = ?').run(session.id);
        return undefined;
    }
    db.prepare('UPDATE app_sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), session.id);
    const user = getUserById(session.user_id);
    if (!user) {
        db.prepare('DELETE FROM app_sessions WHERE id = ?').run(session.id);
        return undefined;
    }
    return {
        user: toAuthUser(user),
        sessionId: session.id,
        sessionToken: token,
        csrfToken: session.csrf_token,
        expiresAt: session.expires_at,
    };
}
function assertCsrf(session, providedToken) {
    if (!session || !providedToken)
        return false;
    if (session.csrfToken.length !== providedToken.length)
        return false;
    return crypto.timingSafeEqual(Buffer.from(session.csrfToken, 'utf8'), Buffer.from(providedToken, 'utf8'));
}
function destroySession(token) {
    if (!token)
        return;
    db.prepare('DELETE FROM app_sessions WHERE token_hash = ?').run(hashToken(token));
}
function bootstrapOwner(email, password, userAgent, ip) {
    if (hasUsers()) {
        throw new Error('Owner already exists');
    }
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
        throw new Error('Valid email is required');
    }
    if (password.length < 12) {
        throw new Error('Password must be at least 12 characters');
    }
    const createdAt = nowIso();
    const result = db.prepare(`
    INSERT INTO app_users (email, role, password_hash, created_at, updated_at)
    VALUES (?, 'owner', ?, ?, ?)
  `).run(normalizedEmail, hashPassword(password), createdAt, createdAt);
    const user = getUserById(Number(result.lastInsertRowid));
    if (!user) {
        throw new Error('Failed to create owner account');
    }
    const trialStartedAt = createdAt;
    const trialEndsAt = new Date(Date.now() + getTrialDays() * 24 * 60 * 60 * 1000).toISOString();
    upsertBillingState({
        status: 'trialing',
        trialStartedAt,
        trialEndsAt,
        updatedAt: createdAt,
    });
    recordAudit('auth.bootstrap', 'system', {
        email: normalizedEmail,
        trialEndsAt,
    }, ip, user.id);
    return createSessionForUser(toAuthUser(user), userAgent, ip);
}
function login(email, password, userAgent, ip) {
    const user = getUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
        throw new Error('Invalid email or password');
    }
    db.prepare('UPDATE app_users SET last_login_at = ?, updated_at = ? WHERE id = ?')
        .run(nowIso(), nowIso(), user.id);
    recordAudit('auth.login', 'user', { email: user.email }, ip, user.id);
    return createSessionForUser(toAuthUser({
        ...user,
        last_login_at: nowIso(),
    }), userAgent, ip);
}
function changePassword(userId, currentPassword, nextPassword) {
    const user = getUserById(userId);
    if (!user) {
        throw new Error('User not found');
    }
    if (!verifyPassword(currentPassword, user.password_hash)) {
        throw new Error('Current password is incorrect');
    }
    if (nextPassword.length < 12) {
        throw new Error('Password must be at least 12 characters');
    }
    db.prepare('UPDATE app_users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(hashPassword(nextPassword), nowIso(), userId);
}
function getRuntimeSettings() {
    return parseJson(getSingleton('runtime_settings'), {});
}
function getRuntimeSecrets() {
    const encrypted = getSingleton('runtime_secrets');
    return parseJson(decryptString(encrypted), {});
}
function getRuntimeSecretPresence() {
    const secrets = getRuntimeSecrets();
    return {
        OPENAI_API_KEY: Boolean(secrets.OPENAI_API_KEY),
        LINKEDIN_TOKEN: Boolean(secrets.LINKEDIN_TOKEN),
        LINKEDIN_PERSON_URN: Boolean(secrets.LINKEDIN_PERSON_URN),
        THREADS_ACCESS_TOKEN: Boolean(secrets.THREADS_ACCESS_TOKEN),
        THREADS_USER_ID: Boolean(secrets.THREADS_USER_ID),
        META_ACCESS_TOKEN: Boolean(secrets.META_ACCESS_TOKEN),
        FACEBOOK_PAGE_ACCESS_TOKEN: Boolean(secrets.FACEBOOK_PAGE_ACCESS_TOKEN),
        INSTAGRAM_ACCOUNT_ID: Boolean(secrets.INSTAGRAM_ACCOUNT_ID),
        FACEBOOK_GROUP_ID: Boolean(secrets.FACEBOOK_GROUP_ID),
        FACEBOOK_USER_ID: Boolean(secrets.FACEBOOK_USER_ID),
        FACEBOOK_PAGE_ID: Boolean(secrets.FACEBOOK_PAGE_ID),
    };
}
function sanitizeRuntimeSettingsPatch(patch) {
    const next = {};
    if (typeof patch.REDDIT_USER === 'string')
        next.REDDIT_USER = patch.REDDIT_USER.trim();
    if (Array.isArray(patch.REDDIT_ALLOWED_SUBS)) {
        next.REDDIT_ALLOWED_SUBS = patch.REDDIT_ALLOWED_SUBS.map(value => String(value).trim().toLowerCase()).filter(Boolean);
    }
    if (typeof patch.REDDIT_SORT === 'string')
        next.REDDIT_SORT = patch.REDDIT_SORT.trim() || 'new';
    if (typeof patch.REDDIT_LIMIT === 'number' && Number.isFinite(patch.REDDIT_LIMIT)) {
        next.REDDIT_LIMIT = Math.max(1, Math.min(100, Math.round(patch.REDDIT_LIMIT)));
    }
    if (typeof patch.OPENAI_MODEL === 'string')
        next.OPENAI_MODEL = patch.OPENAI_MODEL.trim();
    if (typeof patch.AI_STYLE === 'string')
        next.AI_STYLE = patch.AI_STYLE.trim();
    if (typeof patch.CUSTOM_PROMPT === 'string')
        next.CUSTOM_PROMPT = patch.CUSTOM_PROMPT;
    if (typeof patch.ENABLE_LINKEDIN === 'boolean')
        next.ENABLE_LINKEDIN = patch.ENABLE_LINKEDIN;
    if (typeof patch.ENABLE_THREADS === 'boolean')
        next.ENABLE_THREADS = patch.ENABLE_THREADS;
    if (typeof patch.ENABLE_INSTAGRAM === 'boolean')
        next.ENABLE_INSTAGRAM = patch.ENABLE_INSTAGRAM;
    if (typeof patch.ENABLE_FACEBOOK === 'boolean')
        next.ENABLE_FACEBOOK = patch.ENABLE_FACEBOOK;
    if (typeof patch.META_GRAPH_VERSION === 'string')
        next.META_GRAPH_VERSION = patch.META_GRAPH_VERSION.trim();
    if (typeof patch.THREADS_GRAPH_VERSION === 'string')
        next.THREADS_GRAPH_VERSION = patch.THREADS_GRAPH_VERSION.trim();
    if (typeof patch.TIMEZONE === 'string')
        next.TIMEZONE = patch.TIMEZONE.trim();
    return next;
}
function updateRuntimeSettings(patch) {
    const current = getRuntimeSettings();
    const next = {
        ...current,
        ...sanitizeRuntimeSettingsPatch(patch),
    };
    setSingleton('runtime_settings', JSON.stringify(next));
    return next;
}
function updateRuntimeSecrets(patch) {
    const current = getRuntimeSecrets();
    const next = { ...current };
    for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') {
            delete next[key];
            continue;
        }
        if (typeof value === 'string') {
            next[key] = value.trim();
        }
    }
    setSingleton('runtime_secrets', encryptString(JSON.stringify(next)));
    return next;
}
function getStoredRuntimeConfigPatch() {
    return {
        ...getRuntimeSettings(),
        ...getRuntimeSecrets(),
    };
}
function getSetupStatus() {
    const hasOwner = hasUsers();
    return {
        initialized: hasOwner,
        hasOwner,
        billing: getBillingState(),
        secretStorageReady: true,
    };
}
function updateBillingFromStripeSubscription(subscription) {
    const statusValue = String(subscription.status || '').trim();
    const mappedStatus = (['trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid'].includes(statusValue)
        ? statusValue
        : 'setup');
    const trialEndsAt = typeof subscription.trial_end === 'number'
        ? new Date(subscription.trial_end * 1000).toISOString()
        : undefined;
    const currentPeriodEnd = typeof subscription.current_period_end === 'number'
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : undefined;
    const next = upsertBillingState({
        ...getBillingState(),
        status: mappedStatus,
        trialEndsAt,
        currentPeriodEnd,
        stripeCustomerId: typeof subscription.customer === 'string' ? subscription.customer : undefined,
        stripeSubscriptionId: typeof subscription.id === 'string' ? subscription.id : undefined,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
        lockedReason: mappedStatus === 'active' || mappedStatus === 'trialing'
            ? undefined
            : `Subscription is ${mappedStatus}`,
        updatedAt: nowIso(),
    });
    return {
        ...next,
        accessActive: next.status === 'active' || next.status === 'trialing',
        prices: {
            monthlyGbp: 8.99,
            yearlyGbp: 89,
        },
    };
}
function updateBillingCheckoutState(patch) {
    const next = upsertBillingState({
        ...getBillingState(),
        ...patch,
        updatedAt: nowIso(),
    });
    return {
        ...next,
        accessActive: next.status === 'active' || next.status === 'trialing',
        prices: {
            monthlyGbp: 8.99,
            yearlyGbp: 89,
        },
    };
}
function recordAudit(action, target, metadata = {}, ip, actorUserId) {
    db.prepare(`
    INSERT INTO app_audit_logs (actor_user_id, action, target, metadata_json, ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(actorUserId || null, action, target, JSON.stringify(metadata), ip || null, nowIso());
}
function getAuditLogs(limit = 100) {
    const rows = db.prepare(`
    SELECT * FROM app_audit_logs
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit);
    return rows.map(row => ({
        id: row.id,
        actorUserId: row.actor_user_id || undefined,
        action: row.action,
        target: row.target,
        metadata: parseJson(row.metadata_json, {}),
        ip: row.ip || undefined,
        createdAt: row.created_at,
    }));
}
function getDbHealth() {
    return { ok: true, path: DB_FILE };
}
