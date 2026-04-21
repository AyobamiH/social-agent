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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLATFORM_STEPS = void 0;
exports.publishQueuedItem = publishQueuedItem;
const facebook = __importStar(require("./facebook"));
const instagram = __importStar(require("./instagram"));
const threads = __importStar(require("./threads"));
const config_1 = __importDefault(require("../config"));
const PLATFORM_STEPS = [
    { key: 'threads', label: 'Threads', run: item => threads.publish(item.threads) },
    { key: 'instagram', label: 'Instagram', run: item => instagram.publish(item.instagram, item.imageUrl) },
    { key: 'facebook', label: 'Facebook', run: item => facebook.publish(item.facebook) },
];
exports.PLATFORM_STEPS = PLATFORM_STEPS;
function getPlatformAvailability(step, item) {
    switch (step.key) {
        case 'threads':
            if (!config_1.default.ENABLE_THREADS)
                return { enabled: false, reason: 'disabled via ENABLE_THREADS=false' };
            if (!config_1.default.THREADS_ACCESS_TOKEN)
                return { enabled: false, reason: 'THREADS_ACCESS_TOKEN not set' };
            if (!item.threads?.trim())
                return { enabled: false, reason: 'Threads post text is empty' };
            return { enabled: true };
        case 'instagram':
            if (!config_1.default.ENABLE_INSTAGRAM)
                return { enabled: false, reason: 'disabled via ENABLE_INSTAGRAM=false' };
            if (!config_1.default.FACEBOOK_PAGE_ACCESS_TOKEN && !config_1.default.META_ACCESS_TOKEN) {
                return { enabled: false, reason: 'FACEBOOK_PAGE_ACCESS_TOKEN or META_ACCESS_TOKEN not set' };
            }
            if (!config_1.default.INSTAGRAM_ACCOUNT_ID && !config_1.default.FACEBOOK_PAGE_ID) {
                return { enabled: false, reason: 'INSTAGRAM_ACCOUNT_ID or FACEBOOK_PAGE_ID not set' };
            }
            if (!item.instagram?.trim())
                return { enabled: false, reason: 'Instagram caption is empty' };
            if (!item.imageUrl?.trim())
                return { enabled: false, reason: 'imageUrl is empty' };
            return { enabled: true };
        case 'facebook':
            if (!config_1.default.ENABLE_FACEBOOK)
                return { enabled: false, reason: 'disabled via ENABLE_FACEBOOK=false' };
            if (!config_1.default.META_ACCESS_TOKEN)
                return { enabled: false, reason: 'META_ACCESS_TOKEN not set' };
            if (!config_1.default.FACEBOOK_GROUP_ID)
                return { enabled: false, reason: 'FACEBOOK_GROUP_ID not set' };
            if (!item.facebook?.trim())
                return { enabled: false, reason: 'Facebook post text is empty' };
            return { enabled: true };
    }
}
async function publishQueuedItem(item, logger) {
    const nextItem = {
        ...item,
        ids: { ...(item.ids || {}) },
    };
    const errors = [];
    const publishErrors = {};
    const activePlatforms = [];
    const skippedPlatforms = [];
    for (const step of PLATFORM_STEPS) {
        const availability = getPlatformAvailability(step, nextItem);
        if (!availability.enabled) {
            skippedPlatforms.push(step.key);
            logger?.warn(`[${step.label}] Skipped — ${availability.reason}`);
            continue;
        }
        activePlatforms.push(step.key);
        if (nextItem.ids?.[step.key]) {
            logger?.info(`[${step.label}] Skipped — already posted (${nextItem.ids[step.key]})`);
            continue;
        }
        try {
            const postId = await step.run(nextItem);
            nextItem.ids = { ...(nextItem.ids || {}), [step.key]: postId };
            logger?.info(`[${step.label}] Posted — ID: ${postId}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            publishErrors[step.key] = message;
            errors.push(`${step.label}: ${message}`);
            logger?.error(`[${step.label}] Failed: ${message}`);
        }
    }
    if (Object.keys(publishErrors).length) {
        nextItem.publishErrors = publishErrors;
    }
    else {
        delete nextItem.publishErrors;
    }
    nextItem.lastPublishAttemptAt = new Date().toISOString();
    const pendingPlatforms = PLATFORM_STEPS
        .filter(step => activePlatforms.includes(step.key))
        .filter(step => !nextItem.ids?.[step.key])
        .map(step => step.key);
    if (!activePlatforms.length) {
        const message = 'No enabled platforms are configured for this publish run';
        errors.push(message);
        logger?.error(message);
    }
    return {
        nextItem,
        ids: nextItem.ids || {},
        errors,
        pendingPlatforms,
        activePlatforms,
        skippedPlatforms,
        completed: activePlatforms.length > 0 && pendingPlatforms.length === 0,
    };
}
