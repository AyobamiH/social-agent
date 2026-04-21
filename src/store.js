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
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const DATA_DIR = path.join(__dirname, '..', 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');
const USED_FILE = path.join(DATA_DIR, 'used_ids.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
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
    writeJSON(USED_FILE, [...ids].slice(-500));
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
