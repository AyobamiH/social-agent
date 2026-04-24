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
const logger = __importStar(require("./logger"));
const store = __importStar(require("./store"));
const content_engine_1 = require("./content-engine");
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
            const memory = store.getMemoryStats();
            const xPublishState = store.getPlatformPublishState('x');
            console.log('\n── Queue ─────────────────────────');
            for (const slot of SLOTS) {
                const item = queue[slot.id];
                console.log(`  ${slot.label.padEnd(8)} ${item ? '● ' + (item.title || '').substring(0, 50) : '(empty)'}`);
            }
            console.log(`\n  Exhausted sources: ${memory.sources.exhausted}`);
            console.log(`  Banked sources:    ${memory.sources.banked}`);
            console.log(`  Ready angles:      ${memory.angles.ready}`);
            console.log(`  Queued angles:     ${memory.angles.queued}`);
            console.log(`  Published angles:  ${memory.angles.published}`);
            console.log(`  Legacy used IDs:   ${memory.legacyUsedIds}`);
            if (xPublishState?.publishBlockedUntil && Date.parse(xPublishState.publishBlockedUntil) > Date.now()) {
                console.log(`  X publish mode:    draft-only until ${xPublishState.publishBlockedUntil}`);
            }
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
                console.log(`ANGLE: ${item.angleLabel || 'legacy'}${item.angleThesis ? ` — ${item.angleThesis}` : ''}`);
                console.log('LINKEDIN:\n' + item.linkedin);
                console.log('THREADS:\n' + item.threads);
                console.log('\nX:\n' + item.x);
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
                if (entry.angleLabel) {
                    console.log(`Angle: ${entry.angleLabel}${entry.angleThesis ? ` — ${entry.angleThesis}` : ''}`);
                }
                console.log(`LinkedIn: ${entry.ids?.linkedin || 'failed'} | ` +
                    `Threads: ${entry.ids?.threads || 'failed'} | ` +
                    `X: ${entry.ids?.x || 'failed'} | ` +
                    `Instagram: ${entry.ids?.instagram || 'failed'} | ` +
                    `Facebook: ${entry.ids?.facebook || 'failed'}`);
                if (entry.errors?.length) {
                    console.log('Errors: ' + entry.errors.join(', '));
                }
            }
            break;
        }
        case 'memory': {
            const memory = store.getMemoryStats();
            console.log('\n── Memory ───────────────────────');
            console.log(JSON.stringify(memory, null, 2));
            console.log('──────────────────────────────────\n');
            break;
        }
        case 'fetch': {
            logger.info('Manual fetch triggered');
            const stats = await (0, content_engine_1.fillEmptySlots)(SLOTS, logger);
            logger.info(`Done. filled:${stats.filled} reused:${stats.reusedAngles} extracted:${stats.extractedSources} exhausted:${stats.exhaustedSources}`);
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
                const hydratedItem = await (0, content_engine_1.hydrateQueuedItemForActivePlatforms)(slot.id, item, logger);
                const result = await (0, publish_1.publishQueuedItem)(hydratedItem, logger);
                (0, content_engine_1.finalizePublishResult)(slot, hydratedItem, result);
                if (result.completed) {
                    logger.info(`${slot.label} posted | active:${result.activePlatforms.join(',') || 'none'} | ` +
                        `LI:${result.ids.linkedin || '-'} | T:${result.ids.threads || '-'} | X:${result.ids.x || '-'} | ` +
                        `IG:${result.ids.instagram || '-'} | FB:${result.ids.facebook || '-'}`);
                }
                else {
                    logger.warn(`${slot.label} retained | pending:${result.pendingPlatforms.join(',')}`);
                }
            }
            break;
        }
        default:
            console.log(`
Social Agent CLI
────────────────
  npm run fetch      Fill empty slots from banked angles or fresh Reddit sources
  npm run queue      Preview queued content per platform
  npm run status     Show slot fill status and memory counts
  npm run history    Last 5 posting batches
  npm run post-now   Post all slots immediately
  npm run memory     Show source and angle inventory
  npm start          Start agent (cron + dashboard)
      `);
    }
}
void main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('CLI error:', message);
    process.exit(1);
});
