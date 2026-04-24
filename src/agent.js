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
const logger = __importStar(require("./logger"));
const content_engine_1 = require("./content-engine");
const publish_1 = require("./publish");
const store_1 = require("./store");
const runtime_policy_1 = require("./runtime-policy");
require("./server");
const SLOTS = [
    { id: 's1', cron: '0 5  * * *', label: '5:00 AM' },
    { id: 's2', cron: '0 7  * * *', label: '7:00 AM' },
    { id: 's3', cron: '0 12 * * *', label: '12:00 PM' },
    { id: 's4', cron: '0 15 * * *', label: '3:00 PM' },
];
function logAutomationGate(prefix) {
    const gate = (0, runtime_policy_1.getAutomationGate)();
    if (gate.allowed) {
        logger.info(`${prefix} | automation ready | platforms:${gate.readiness.enabledPlatforms.join(', ') || 'none'} | billing:${gate.billing.status}`);
        return;
    }
    logger.warn(`${prefix} | automation paused | ${gate.reasons.join(' | ')}`);
}
async function refresh() {
    const gate = (0, runtime_policy_1.getAutomationGate)();
    if (!gate.allowed) {
        logger.warn(`Refresh skipped | ${gate.reasons.join(' | ')}`);
        return;
    }
    logger.info(`=== Social Agent refresh — u/${config_1.default.REDDIT_USER} ===`);
    const stats = await (0, content_engine_1.fillEmptySlots)(SLOTS, logger);
    const memory = (0, store_1.getMemoryStats)();
    logger.info(`Refresh summary | fetched:${stats.fetched} filled:${stats.filled} reused:${stats.reusedAngles} extracted:${stats.extractedSources} exhausted:${stats.exhaustedSources}`);
    logger.info(`Memory summary | sources banked:${memory.sources.banked} exhausted:${memory.sources.exhausted} | angles ready:${memory.angles.ready} queued:${memory.angles.queued} published:${memory.angles.published}`);
    logger.info('=== Refresh done ===');
}
async function fireSlot(slot) {
    const gate = (0, runtime_policy_1.getAutomationGate)();
    if (!gate.allowed) {
        logger.warn(`${slot.label} skipped | ${gate.reasons.join(' | ')}`);
        return;
    }
    const item = (0, store_1.getSlotPost)(slot.id);
    if (!item) {
        logger.warn(`${slot.label} slot empty — skipping`);
        return;
    }
    const enabledLabels = (0, runtime_policy_1.getEnabledPlatformLabels)();
    logger.info(`Firing ${slot.label} — posting to ${enabledLabels.length ? enabledLabels.join(', ') : 'no enabled platforms'}`);
    const result = await (0, publish_1.publishQueuedItem)(item, logger);
    (0, content_engine_1.finalizePublishResult)(slot, item, result);
    if (result.completed) {
        logger.info(`${slot.label} posted successfully${result.activePlatforms.length ? ` to ${result.activePlatforms.join(', ')}` : ''}`);
    }
    else {
        logger.warn(`${slot.label} retained in queue for retry — pending: ${result.pendingPlatforms.join(', ')}`);
    }
}
async function start() {
    logger.info('Social Agent starting...');
    logAutomationGate('Startup status');
    node_cron_1.default.schedule('30 4 * * *', () => {
        void refresh();
    }, { timezone: config_1.default.TIMEZONE });
    logger.info('Daily refresh scheduled at 4:30 AM');
    for (const slot of SLOTS) {
        node_cron_1.default.schedule(slot.cron, () => {
            void fireSlot(slot);
        }, { timezone: config_1.default.TIMEZONE });
        logger.info(`Slot scheduled: ${slot.label}`);
    }
    await refresh();
    logger.info(`Social Agent running. Dashboard/API → http://localhost:${config_1.default.GUI_PORT}`);
}
void start().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Fatal: ' + message);
    process.exit(1);
});
