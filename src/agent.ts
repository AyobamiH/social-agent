import cron from 'node-cron';

import config from '../config';

import * as ai from './ai';
import * as logger from './logger';
import * as reddit from './reddit';
import * as store from './store';

import { publishQueuedItem } from './publish';

import type { QueueItem, Slot } from './types';

import './server';

const SLOTS: Slot[] = [
  { id: 's1', cron: '0 5  * * *', label: '5:00 AM' },
  { id: 's2', cron: '0 7  * * *', label: '7:00 AM' },
  { id: 's3', cron: '0 12 * * *', label: '12:00 PM' },
  { id: 's4', cron: '0 15 * * *', label: '3:00 PM' },
];

function getEnabledPlatformLabels(): string[] {
  const labels: string[] = [];
  if (config.ENABLE_THREADS) labels.push('Threads');
  if (config.ENABLE_INSTAGRAM) labels.push('Instagram');
  if (config.ENABLE_FACEBOOK) labels.push('Facebook');
  return labels;
}

async function refresh(): Promise<void> {
  logger.info(`=== Social Agent refresh — u/${config.REDDIT_USER} ===`);

  const posts = await reddit.fetchPosts(config.REDDIT_SORT, config.REDDIT_LIMIT);
  logger.info(`Fetched ${posts.length} posts from allowed subreddits`);

  const used = store.getUsedIds();
  const fresh = posts.filter(post => !used.has(post.id));
  logger.info(`${fresh.length} unseen posts`);

  let filled = 0;

  for (const post of fresh) {
    const emptySlot = SLOTS.find(slot => !store.getSlotPost(slot.id));
    if (!emptySlot) break;

    logger.info(`Transforming for all platforms: "${post.title.substring(0, 50)}"`);

    try {
      const content = await ai.transformAll(post);
      const queuedItem: QueueItem = {
        redditId: post.id,
        title: post.title,
        ...content,
      };
      store.setSlotPost(emptySlot.id, queuedItem);
      store.markUsed(post.id);
      logger.info(`Filled slot ${emptySlot.label} — image: ${content.imageUrl ? 'yes' : 'no'}`);
      filled++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Transform failed for "${post.title.substring(0, 40)}": ${message}`);
    }
  }

  logger.info(`=== Refresh done. ${filled} slots filled ===`);
}

async function fireSlot(slot: Slot): Promise<void> {
  const item = store.getSlotPost(slot.id);
  if (!item) {
    logger.warn(`${slot.label} slot empty — skipping`);
    return;
  }

  const enabledLabels = getEnabledPlatformLabels();
  logger.info(
    `Firing ${slot.label} — posting to ${enabledLabels.length ? enabledLabels.join(', ') : 'no enabled platforms'}`
  );

  const result = await publishQueuedItem(item, logger);

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
    logger.info(
      `${slot.label} posted successfully${result.activePlatforms.length ? ` to ${result.activePlatforms.join(', ')}` : ''}`
    );
  } else {
    store.setSlotPost(slot.id, result.nextItem);
    logger.warn(
      `${slot.label} retained in queue for retry — pending: ${result.pendingPlatforms.join(', ')}`
    );
  }
}

async function start(): Promise<void> {
  logger.info('Social Agent starting...');

  const missing: string[] = [];
  const enabledLabels = getEnabledPlatformLabels();

  if (!config.OPENAI_API_KEY) {
    missing.push('OPENAI_API_KEY');
  }

  if (config.ENABLE_THREADS && !config.THREADS_ACCESS_TOKEN) {
    missing.push('THREADS_ACCESS_TOKEN');
  }

  if (config.ENABLE_INSTAGRAM) {
    if (!config.META_ACCESS_TOKEN) missing.push('META_ACCESS_TOKEN');
    if (!config.INSTAGRAM_ACCOUNT_ID) missing.push('INSTAGRAM_ACCOUNT_ID');
  }

  if (config.ENABLE_FACEBOOK) {
    if (!config.META_ACCESS_TOKEN) missing.push('META_ACCESS_TOKEN');
    if (!config.FACEBOOK_GROUP_ID) missing.push('FACEBOOK_GROUP_ID');
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

  cron.schedule('30 4 * * *', () => {
    void refresh();
  }, { timezone: config.TIMEZONE });
  logger.info('Daily refresh at 4:30 AM');

  for (const slot of SLOTS) {
    cron.schedule(slot.cron!, () => {
      void fireSlot(slot);
    }, { timezone: config.TIMEZONE });
    logger.info(`Slot scheduled: ${slot.label}`);
  }

  logger.info(`Social Agent running. Dashboard → http://localhost:${config.GUI_PORT}`);
}

void start().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error('Fatal: ' + message);
  process.exit(1);
});
