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
const config_1 = __importDefault(require("../config"));
const ai = __importStar(require("./ai"));
const logger = __importStar(require("./logger"));
const reddit = __importStar(require("./reddit"));
const store = __importStar(require("./store"));
const publish_1 = require("./publish");
const SLOTS = [
    { id: 's1', label: '5:00 AM' },
    { id: 's2', label: '7:00 AM' },
    { id: 's3', label: '12:00 PM' },
    { id: 's4', label: '3:00 PM' },
];
const cmd = process.argv[2];
async function main() {
    switch (cmd) {
        case 'status': {
            const queue = store.getQueue();
            console.log('\n── Queue ─────────────────────────');
            for (const slot of SLOTS) {
                const item = queue[slot.id];
                console.log(`  ${slot.label.padEnd(8)} ${item ? '● ' + (item.title || '').substring(0, 50) : '(empty)'}`);
            }
            console.log(`\n  Reddit posts used: ${store.getUsedIds().size}`);
            console.log('──────────────────────────────────\n');
            break;
        }
        case 'queue': {
            const queue = store.getQueue();
            for (const slot of SLOTS) {
                const item = queue[slot.id];
                if (!item)
                    continue;
                console.log(`\n┌── ${slot.label} ──────────────────`);
                console.log('THREADS:\n' + item.threads);
                console.log('\nINSTAGRAM:\n' + item.instagram);
                console.log('\nFACEBOOK:\n' + item.facebook);
                console.log('\nIMAGE URL:\n' + (item.imageUrl || 'none'));
                if (item.ids && Object.keys(item.ids).length) {
                    console.log('\nPOSTED IDS:\n' + JSON.stringify(item.ids, null, 2));
                }
                if (item.publishErrors && Object.keys(item.publishErrors).length) {
                    console.log('\nPUBLISH ERRORS:\n' + JSON.stringify(item.publishErrors, null, 2));
                }
                console.log('└────────────────────────────────');
            }
            break;
        }
        case 'history': {
            const history = store.getHistory().slice(0, 5);
            if (!history.length) {
                console.log('No history yet.');
                break;
            }
            for (const entry of history) {
                console.log(`\n[${entry.postedAt}] ${entry.slot} — ${entry.title || ''}`);
                console.log(`Threads: ${entry.ids?.threads || 'failed'} | Instagram: ${entry.ids?.instagram || 'failed'} | Facebook: ${entry.ids?.facebook || 'failed'}`);
                if (entry.errors?.length) {
                    console.log('Errors: ' + entry.errors.join(', '));
                }
            }
            break;
        }
        case 'fetch': {
            logger.info('Manual fetch triggered');
            const posts = await reddit.fetchPosts(config_1.default.REDDIT_SORT, config_1.default.REDDIT_LIMIT);
            logger.info(`Fetched ${posts.length} posts`);
            const used = store.getUsedIds();
            const fresh = posts.filter(post => !used.has(post.id));
            logger.info(`${fresh.length} unseen`);
            let filled = 0;
            for (const post of fresh) {
                const slot = SLOTS.find(candidate => !store.getSlotPost(candidate.id));
                if (!slot) {
                    logger.info('All slots full');
                    break;
                }
                logger.info(`Transforming: "${post.title.substring(0, 50)}"`);
                const content = await ai.transformAll(post);
                const queuedItem = {
                    redditId: post.id,
                    title: post.title,
                    ...content,
                };
                store.setSlotPost(slot.id, queuedItem);
                store.markUsed(post.id);
                logger.info(`Filled ${slot.label}`);
                filled++;
            }
            logger.info(`Done. ${filled} slots filled.`);
            break;
        }
        case 'post-now': {
            logger.info('Manual post-now triggered');
            for (const slot of SLOTS) {
                const item = store.getSlotPost(slot.id);
                if (!item) {
                    logger.warn(`${slot.label} empty`);
                    continue;
                }
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
                    logger.info(`${slot.label} posted | active:${result.activePlatforms.join(',') || 'none'} | ` +
                        `T:${result.ids.threads || '-'} | IG:${result.ids.instagram || '-'} | FB:${result.ids.facebook || '-'}`);
                }
                else {
                    store.setSlotPost(slot.id, result.nextItem);
                    logger.warn(`${slot.label} retained | pending:${result.pendingPlatforms.join(',')}`);
                }
            }
            break;
        }
        default:
            console.log(`
Social Agent CLI
────────────────
  npm run fetch      Fetch Reddit + transform for all platforms
  npm run queue      Preview queued content per platform
  npm run status     Show slot fill status
  npm run history    Last 5 posting batches
  npm run post-now   Post all slots immediately
  npm start          Start agent (cron + dashboard)
      `);
    }
}
void main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('CLI error:', message);
    process.exit(1);
});
