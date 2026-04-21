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
const node_cron_1 = __importDefault(require("node-cron"));
const config_1 = __importDefault(require("../config"));
const ai = __importStar(require("./ai"));
const logger = __importStar(require("./logger"));
const reddit = __importStar(require("./reddit"));
const store = __importStar(require("./store"));
const publish_1 = require("./publish");
require("./server");
const SLOTS = [
    { id: 's1', cron: '0 5  * * *', label: '5:00 AM' },
    { id: 's2', cron: '0 7  * * *', label: '7:00 AM' },
    { id: 's3', cron: '0 12 * * *', label: '12:00 PM' },
    { id: 's4', cron: '0 15 * * *', label: '3:00 PM' },
];
function getEnabledPlatformLabels() {
    const labels = [];
    if (config_1.default.ENABLE_THREADS)
        labels.push('Threads');
    if (config_1.default.ENABLE_INSTAGRAM)
        labels.push('Instagram');
    if (config_1.default.ENABLE_FACEBOOK)
        labels.push('Facebook');
    return labels;
}
async function refresh() {
    logger.info(`=== Social Agent refresh — u/${config_1.default.REDDIT_USER} ===`);
    const posts = await reddit.fetchPosts(config_1.default.REDDIT_SORT, config_1.default.REDDIT_LIMIT);
    logger.info(`Fetched ${posts.length} posts from allowed subreddits`);
    const used = store.getUsedIds();
    const fresh = posts.filter(post => !used.has(post.id));
    logger.info(`${fresh.length} unseen posts`);
    let filled = 0;
    for (const post of fresh) {
        const emptySlot = SLOTS.find(slot => !store.getSlotPost(slot.id));
        if (!emptySlot)
            break;
        logger.info(`Transforming for all platforms: "${post.title.substring(0, 50)}"`);
        try {
            const content = await ai.transformAll(post);
            const queuedItem = {
                redditId: post.id,
                title: post.title,
                ...content,
            };
            store.setSlotPost(emptySlot.id, queuedItem);
            store.markUsed(post.id);
            logger.info(`Filled slot ${emptySlot.label} — image: ${content.imageUrl ? 'yes' : 'no'}`);
            filled++;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.error(`Transform failed for "${post.title.substring(0, 40)}": ${message}`);
        }
    }
    logger.info(`=== Refresh done. ${filled} slots filled ===`);
}
async function fireSlot(slot) {
    const item = store.getSlotPost(slot.id);
    if (!item) {
        logger.warn(`${slot.label} slot empty — skipping`);
        return;
    }
    const enabledLabels = getEnabledPlatformLabels();
    logger.info(`Firing ${slot.label} — posting to ${enabledLabels.length ? enabledLabels.join(', ') : 'no enabled platforms'}`);
    const result = await (0, publish_1.publishQueuedItem)(item, logger);
    if (result.completed) {
        store.clearSlotPost(slot.id);
        store.logHistory({
            slot: slot.label,
            title: item.title,
            threads: item.threads,
            instagram: item.instagram,
            facebook: item.facebook,
            imageUrl: item.imageUrl,
            postedAt: new Date().toISOString(),
            ids: result.ids,
            errors: result.errors,
        });
        logger.info(`${slot.label} posted successfully${result.activePlatforms.length ? ` to ${result.activePlatforms.join(', ')}` : ''}`);
    }
    else {
        store.setSlotPost(slot.id, result.nextItem);
        logger.warn(`${slot.label} retained in queue for retry — pending: ${result.pendingPlatforms.join(', ')}`);
    }
}
async function start() {
    logger.info('Social Agent starting...');
    const missing = [];
    const enabledLabels = getEnabledPlatformLabels();
    if (!config_1.default.OPENAI_API_KEY) {
        missing.push('OPENAI_API_KEY');
    }
    if (config_1.default.ENABLE_THREADS && !config_1.default.THREADS_ACCESS_TOKEN) {
        missing.push('THREADS_ACCESS_TOKEN');
    }
    if (config_1.default.ENABLE_INSTAGRAM) {
        if (!config_1.default.META_ACCESS_TOKEN)
            missing.push('META_ACCESS_TOKEN');
        if (!config_1.default.INSTAGRAM_ACCOUNT_ID)
            missing.push('INSTAGRAM_ACCOUNT_ID');
    }
    if (config_1.default.ENABLE_FACEBOOK) {
        if (!config_1.default.META_ACCESS_TOKEN)
            missing.push('META_ACCESS_TOKEN');
        if (!config_1.default.FACEBOOK_GROUP_ID)
            missing.push('FACEBOOK_GROUP_ID');
    }
    if (!enabledLabels.length) {
        logger.error('No publishing platforms are enabled — set ENABLE_THREADS, ENABLE_INSTAGRAM, or ENABLE_FACEBOOK in .env');
        process.exit(1);
    }
    if (missing.length) {
        logger.error(`Missing config: ${[...new Set(missing)].join(', ')} — check your .env`);
        process.exit(1);
    }
    logger.info(`Enabled publishing platforms: ${enabledLabels.join(', ')}`);
    await refresh();
    node_cron_1.default.schedule('30 4 * * *', () => {
        void refresh();
    }, { timezone: config_1.default.TIMEZONE });
    logger.info('Daily refresh at 4:30 AM');
    for (const slot of SLOTS) {
        node_cron_1.default.schedule(slot.cron, () => {
            void fireSlot(slot);
        }, { timezone: config_1.default.TIMEZONE });
        logger.info(`Slot scheduled: ${slot.label}`);
    }
    logger.info(`Social Agent running. Dashboard → http://localhost:${config_1.default.GUI_PORT}`);
}
void start().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Fatal: ' + message);
    process.exit(1);
});
