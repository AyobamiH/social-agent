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
exports.getQueue = getQueue;
exports.getSlotPost = getSlotPost;
exports.setSlotPost = setSlotPost;
exports.clearSlotPost = clearSlotPost;
exports.getUsedIds = getUsedIds;
exports.markUsed = markUsed;
exports.logHistory = logHistory;
exports.getHistory = getHistory;
exports.getPostsPendingPoll = getPostsPendingPoll;
exports.updateEngagement = updateEngagement;
exports.getSources = getSources;
exports.getSource = getSource;
exports.getAngles = getAngles;
exports.getAngle = getAngle;
exports.getAnglesForSource = getAnglesForSource;
exports.getReadyAngles = getReadyAngles;
exports.getNextReadyAngleForSource = getNextReadyAngleForSource;
exports.sourceHasActiveAngles = sourceHasActiveAngles;
exports.isSourceExhausted = isSourceExhausted;
exports.bankSourceExtraction = bankSourceExtraction;
exports.markAngleQueued = markAngleQueued;
exports.releaseQueuedAngle = releaseQueuedAngle;
exports.discardAngle = discardAngle;
exports.markAnglePublished = markAnglePublished;
exports.reconcileSourceStatus = reconcileSourceStatus;
exports.getMemoryStats = getMemoryStats;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const DATA_DIR = path.join(__dirname, '..', 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');
const USED_FILE = path.join(DATA_DIR, 'used_ids.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const SOURCES_FILE = path.join(DATA_DIR, 'sources.json');
const ANGLES_FILE = path.join(DATA_DIR, 'angles.json');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
const EMPTY_QUEUE = { s1: null, s2: null, s3: null, s4: null };
function readJSON(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch {
        return fallback;
    }
}
function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
function nowIso() {
    return new Date().toISOString();
}
function sortAngles(a, b) {
    return (b.sourceCreated - a.sourceCreated ||
        b.strength - a.strength ||
        a.id.localeCompare(b.id));
}
function uniqStrings(values) {
    return [...new Set(values.filter(Boolean))];
}
function getQueue() {
    return readJSON(QUEUE_FILE, EMPTY_QUEUE);
}
function getSlotPost(slotId) {
    return getQueue()[slotId] || null;
}
function setSlotPost(slotId, item) {
    const queue = getQueue();
    queue[slotId] = item;
    writeJSON(QUEUE_FILE, queue);
}
function clearSlotPost(slotId) {
    const queue = getQueue();
    queue[slotId] = null;
    writeJSON(QUEUE_FILE, queue);
}
function getUsedIds() {
    return new Set(readJSON(USED_FILE, []));
}
function markUsed(id) {
    const ids = getUsedIds();
    ids.add(id);
    writeJSON(USED_FILE, [...ids].slice(-1000));
}
function logHistory(entry) {
    const history = readJSON(HISTORY_FILE, []);
    history.unshift(entry);
    writeJSON(HISTORY_FILE, history.slice(0, 200));
}
function getHistory() {
    return readJSON(HISTORY_FILE, []);
}
function getPostsPendingPoll() {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const twoDays = 48 * 60 * 60 * 1000;
    return readJSON(HISTORY_FILE, []).filter(entry => {
        if (!entry.postedAt || entry.engagement?.polledAt) {
            return false;
        }
        const age = now - new Date(entry.postedAt).getTime();
        return age >= oneDay && age <= twoDays;
    });
}
function updateEngagement(postedAt, engagement) {
    const history = readJSON(HISTORY_FILE, []);
    const index = history.findIndex(entry => entry.postedAt === postedAt);
    if (index >= 0) {
        history[index].engagement = {
            ...engagement,
            polledAt: new Date().toISOString(),
        };
        writeJSON(HISTORY_FILE, history);
    }
}
function getSources() {
    return readJSON(SOURCES_FILE, []);
}
function getSource(redditId) {
    return getSources().find(source => source.redditId === redditId);
}
function getAngles() {
    return readJSON(ANGLES_FILE, []);
}
function getAngle(angleId) {
    return getAngles().find(angle => angle.id === angleId);
}
function getAnglesForSource(redditId) {
    return getAngles()
        .filter(angle => angle.redditId === redditId)
        .sort(sortAngles);
}
function getReadyAngles(limit, excludeRedditIds) {
    const excluded = excludeRedditIds || new Set();
    const ready = getAngles()
        .filter(angle => angle.status === 'ready' && !excluded.has(angle.redditId))
        .sort(sortAngles);
    return typeof limit === 'number' ? ready.slice(0, limit) : ready;
}
function getNextReadyAngleForSource(redditId, expectedHash) {
    return getAnglesForSource(redditId)
        .filter(angle => angle.status === 'ready')
        .find(angle => !expectedHash || angle.sourceHash === expectedHash);
}
function sourceHasActiveAngles(redditId) {
    return getAnglesForSource(redditId).some(angle => angle.status === 'ready' || angle.status === 'queued');
}
function isSourceExhausted(redditId, contentHash) {
    const source = getSource(redditId);
    if (source) {
        if (source.contentHash !== contentHash)
            return false;
        return source.status === 'exhausted';
    }
    return getUsedIds().has(redditId);
}
function bankSourceExtraction(post, contentHash, extraction) {
    const now = nowIso();
    const sources = getSources();
    const angles = getAngles();
    const sourceIndex = sources.findIndex(source => source.redditId === post.id);
    const existingSource = sourceIndex >= 0 ? sources[sourceIndex] : undefined;
    const matchingAngles = angles
        .filter(angle => angle.redditId === post.id && angle.sourceHash === contentHash)
        .sort(sortAngles);
    if (matchingAngles.length) {
        const mergedSource = {
            redditId: post.id,
            title: post.title,
            selftext: post.selftext,
            url: post.url,
            subreddit: post.subreddit,
            author: post.author,
            created: post.created,
            contentHash,
            status: matchingAngles.some(angle => angle.status === 'ready' || angle.status === 'queued')
                ? 'banked'
                : 'exhausted',
            summary: extraction.summary,
            angleIds: uniqStrings([
                ...(existingSource?.angleIds || []),
                ...matchingAngles.map(angle => angle.id),
            ]),
            lastSeenAt: now,
            extractedAt: existingSource?.extractedAt || now,
            exhaustedAt: matchingAngles.some(angle => angle.status === 'ready' || angle.status === 'queued')
                ? undefined
                : existingSource?.exhaustedAt || now,
            lastQueuedAt: existingSource?.lastQueuedAt,
            lastPublishedAt: existingSource?.lastPublishedAt,
        };
        if (sourceIndex >= 0) {
            sources[sourceIndex] = mergedSource;
        }
        else {
            sources.push(mergedSource);
        }
        writeJSON(SOURCES_FILE, sources);
        if (mergedSource.status === 'exhausted') {
            markUsed(post.id);
        }
        return {
            source: mergedSource,
            readyAngles: matchingAngles.filter(angle => angle.status === 'ready'),
        };
    }
    const newAngles = extraction.angles.map((angle, index) => ({
        id: `${post.id}:${contentHash.slice(0, 12)}:${index + 1}`,
        redditId: post.id,
        sourceHash: contentHash,
        sourceCreated: post.created,
        sourceTitle: post.title,
        label: angle.label,
        thesis: angle.thesis,
        hook: angle.hook,
        supportingPoints: angle.supportingPoints,
        practicalConsequence: angle.practicalConsequence,
        specificExample: angle.specificExample,
        audienceFit: angle.audienceFit,
        strength: angle.strength,
        status: 'ready',
        createdAt: now,
    }));
    angles.push(...newAngles);
    writeJSON(ANGLES_FILE, angles);
    const nextSource = {
        redditId: post.id,
        title: post.title,
        selftext: post.selftext,
        url: post.url,
        subreddit: post.subreddit,
        author: post.author,
        created: post.created,
        contentHash,
        status: newAngles.length ? 'banked' : 'exhausted',
        summary: extraction.summary,
        angleIds: uniqStrings([
            ...(existingSource?.angleIds || []),
            ...newAngles.map(angle => angle.id),
        ]),
        lastSeenAt: now,
        extractedAt: now,
        exhaustedAt: newAngles.length ? undefined : now,
        lastQueuedAt: existingSource?.lastQueuedAt,
        lastPublishedAt: existingSource?.lastPublishedAt,
    };
    if (sourceIndex >= 0) {
        sources[sourceIndex] = nextSource;
    }
    else {
        sources.push(nextSource);
    }
    writeJSON(SOURCES_FILE, sources);
    if (!newAngles.length) {
        markUsed(post.id);
    }
    return { source: nextSource, readyAngles: newAngles };
}
function markAngleQueued(angleId, slotId) {
    const now = nowIso();
    const angles = getAngles();
    const index = angles.findIndex(angle => angle.id === angleId);
    if (index < 0)
        return undefined;
    const nextAngle = {
        ...angles[index],
        status: 'queued',
        queuedAt: now,
        lastQueuedSlot: slotId,
        lastError: undefined,
    };
    angles[index] = nextAngle;
    writeJSON(ANGLES_FILE, angles);
    const sources = getSources();
    const sourceIndex = sources.findIndex(source => source.redditId === nextAngle.redditId);
    if (sourceIndex >= 0) {
        sources[sourceIndex] = {
            ...sources[sourceIndex],
            status: 'banked',
            lastQueuedAt: now,
            exhaustedAt: undefined,
            lastSeenAt: now,
        };
        writeJSON(SOURCES_FILE, sources);
    }
    return nextAngle;
}
function releaseQueuedAngle(angleId) {
    const angles = getAngles();
    const index = angles.findIndex(angle => angle.id === angleId);
    if (index < 0)
        return undefined;
    const current = angles[index];
    if (current.status !== 'queued')
        return current;
    const nextAngle = {
        ...current,
        status: 'ready',
        queuedAt: undefined,
        lastQueuedSlot: undefined,
    };
    angles[index] = nextAngle;
    writeJSON(ANGLES_FILE, angles);
    reconcileSourceStatus(nextAngle.redditId);
    return nextAngle;
}
function discardAngle(angleId, reason) {
    const now = nowIso();
    const angles = getAngles();
    const index = angles.findIndex(angle => angle.id === angleId);
    if (index < 0)
        return undefined;
    const nextAngle = {
        ...angles[index],
        status: 'discarded',
        discardedAt: now,
        lastError: reason,
        lastQueuedSlot: undefined,
    };
    angles[index] = nextAngle;
    writeJSON(ANGLES_FILE, angles);
    reconcileSourceStatus(nextAngle.redditId);
    return nextAngle;
}
function markAnglePublished(angleId) {
    const now = nowIso();
    const angles = getAngles();
    const index = angles.findIndex(angle => angle.id === angleId);
    if (index < 0)
        return undefined;
    const nextAngle = {
        ...angles[index],
        status: 'published',
        publishedAt: now,
        lastQueuedSlot: undefined,
        lastError: undefined,
    };
    angles[index] = nextAngle;
    writeJSON(ANGLES_FILE, angles);
    const sources = getSources();
    const sourceIndex = sources.findIndex(source => source.redditId === nextAngle.redditId);
    if (sourceIndex >= 0) {
        sources[sourceIndex] = {
            ...sources[sourceIndex],
            lastPublishedAt: now,
            lastSeenAt: now,
        };
        writeJSON(SOURCES_FILE, sources);
    }
    reconcileSourceStatus(nextAngle.redditId);
    return nextAngle;
}
function reconcileSourceStatus(redditId) {
    const sources = getSources();
    const sourceIndex = sources.findIndex(source => source.redditId === redditId);
    if (sourceIndex < 0)
        return undefined;
    const now = nowIso();
    const source = sources[sourceIndex];
    const active = getAnglesForSource(redditId).some(angle => angle.status === 'ready' || angle.status === 'queued');
    const nextSource = {
        ...source,
        status: active ? 'banked' : 'exhausted',
        exhaustedAt: active ? undefined : source.exhaustedAt || now,
        lastSeenAt: now,
    };
    sources[sourceIndex] = nextSource;
    writeJSON(SOURCES_FILE, sources);
    if (!active) {
        markUsed(redditId);
    }
    return nextSource;
}
function getMemoryStats() {
    const sources = getSources();
    const angles = getAngles();
    return {
        sources: {
            total: sources.length,
            banked: sources.filter(source => source.status === 'banked').length,
            exhausted: sources.filter(source => source.status === 'exhausted').length,
        },
        angles: {
            total: angles.length,
            ready: angles.filter(angle => angle.status === 'ready').length,
            queued: angles.filter(angle => angle.status === 'queued').length,
            published: angles.filter(angle => angle.status === 'published').length,
            discarded: angles.filter(angle => angle.status === 'discarded').length,
        },
        legacyUsedIds: getUsedIds().size,
    };
}
