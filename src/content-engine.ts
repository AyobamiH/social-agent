import { createHash } from 'node:crypto';

import config from '../config';

import * as ai from './ai';
import * as reddit from './reddit';
import * as store from './store';

import type {
  AngleCandidate,
  AngleRecord,
  FillQueueStats,
  HistoryEntry,
  Logger,
  PublishResult,
  QueueItem,
  RedditPost,
  Slot,
  SourceRecord,
} from './types';

function computeContentHash(post: Pick<RedditPost, 'title' | 'selftext' | 'url'>): string {
  return createHash('sha256')
    .update([post.title, post.selftext, post.url].join('\n||\n'))
    .digest('hex')
    .slice(0, 16);
}

function getNextOpenSlot(slots: Slot[]): Slot | undefined {
  return slots.find(slot => !store.getSlotPost(slot.id));
}

function getReservedSourceIds(): Set<string> {
  return new Set(
    Object.values(store.getQueue())
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map(item => item.redditId)
  );
}

function toAngleCandidate(angle: AngleRecord): AngleCandidate {
  return {
    label: angle.label,
    thesis: angle.thesis,
    hook: angle.hook,
    supportingPoints: angle.supportingPoints,
    practicalConsequence: angle.practicalConsequence,
    specificExample: angle.specificExample,
    audienceFit: angle.audienceFit,
    strength: angle.strength,
  };
}

function buildQueueItem(
  source: SourceRecord,
  angle: AngleRecord,
  draft: Awaited<ReturnType<typeof ai.draftAngleContent>>
): QueueItem {
  return {
    redditId: source.redditId,
    title: source.title,
    sourceHash: source.contentHash,
    angleId: angle.id,
    angleLabel: angle.label,
    angleThesis: angle.thesis,
    draftMeta: draft.draftMeta,
    draftedPlatforms: draft.draftedPlatforms,
    imagePrompt: draft.imagePrompt,
    linkedin: draft.linkedin,
    threads: draft.threads,
    instagram: draft.instagram,
    facebook: draft.facebook,
    imageUrl: draft.imageUrl,
  };
}

async function queueAngleIntoSlot(
  slot: Slot,
  source: SourceRecord,
  angle: AngleRecord,
  logger: Logger
): Promise<QueueItem> {
  if (!source.summary) {
    throw new Error(`Source ${source.redditId} is missing a stored summary`);
  }

  logger.info(
    `Drafting ${slot.label} from ${source.redditId} using angle "${angle.label}: ${angle.thesis.substring(0, 60)}"`
  );

  const draft = await ai.draftAngleContent(source, source.summary, toAngleCandidate(angle));
  store.markAngleQueued(angle.id, slot.id);

  const item = buildQueueItem(source, angle, draft);
  store.setSlotPost(slot.id, item);
  return item;
}

export async function fillEmptySlots(slots: Slot[], logger: Logger): Promise<FillQueueStats> {
  const stats: FillQueueStats = {
    fetched: 0,
    filled: 0,
    reusedAngles: 0,
    extractedSources: 0,
    exhaustedSources: 0,
    skippedExhausted: 0,
    skippedReserved: 0,
  };

  const reservedSourceIds = getReservedSourceIds();

  while (true) {
    const slot = getNextOpenSlot(slots);
    if (!slot) break;

    const readyAngle = store.getReadyAngles(1, reservedSourceIds)[0];
    if (!readyAngle) break;

    const source = store.getSource(readyAngle.redditId);
    if (!source?.summary) {
      store.discardAngle(readyAngle.id, 'Missing stored source summary');
      logger.warn(`Discarded angle ${readyAngle.id} because its source summary is missing`);
      continue;
    }

    try {
      await queueAngleIntoSlot(slot, source, readyAngle, logger);
      reservedSourceIds.add(source.redditId);
      stats.reusedAngles++;
      stats.filled++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to draft queued angle ${readyAngle.id}: ${message}`);
      break;
    }
  }

  if (!getNextOpenSlot(slots)) {
    return stats;
  }

  const posts = await reddit.fetchPosts(config.REDDIT_SORT, config.REDDIT_LIMIT);
  stats.fetched = posts.length;

  for (const post of posts) {
    const slot = getNextOpenSlot(slots);
    if (!slot) break;

    if (reservedSourceIds.has(post.id)) {
      stats.skippedReserved++;
      continue;
    }

    const contentHash = computeContentHash(post);
    if (store.isSourceExhausted(post.id, contentHash)) {
      stats.skippedExhausted++;
      continue;
    }

    const existingReadyAngle = store.getNextReadyAngleForSource(post.id, contentHash);
    const existingSource = store.getSource(post.id);

    if (existingReadyAngle && existingSource?.summary) {
      try {
        await queueAngleIntoSlot(slot, existingSource, existingReadyAngle, logger);
        reservedSourceIds.add(post.id);
        stats.reusedAngles++;
        stats.filled++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to draft stored angle for ${post.id}: ${message}`);
      }
      continue;
    }

    if (existingSource && existingSource.contentHash === contentHash && store.sourceHasActiveAngles(post.id)) {
      continue;
    }

    logger.info(`Banking fresh angles from "${post.title.substring(0, 60)}"`);

    try {
      const extraction = await ai.extractSourceBank(post);
      stats.extractedSources++;
      const banked = store.bankSourceExtraction(post, contentHash, extraction);

      if (!banked.readyAngles.length) {
        stats.exhaustedSources++;
        logger.warn(`No reusable angles found for ${post.id}; marked exhausted`);
        continue;
      }

      await queueAngleIntoSlot(slot, banked.source, banked.readyAngles[0], logger);
      reservedSourceIds.add(post.id);
      stats.filled++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to bank source ${post.id}: ${message}`);
    }
  }

  return stats;
}

function buildHistoryEntry(slot: Slot, item: QueueItem, result: PublishResult): HistoryEntry {
  return {
    slot: slot.label,
    title: item.title,
    postedAt: new Date().toISOString(),
    redditId: item.redditId,
    sourceHash: item.sourceHash,
    angleId: item.angleId,
    angleLabel: item.angleLabel,
    angleThesis: item.angleThesis,
    draftMeta: item.draftMeta,
    draftedPlatforms: item.draftedPlatforms,
    imagePrompt: item.imagePrompt,
    linkedin: item.linkedin,
    threads: item.threads,
    instagram: item.instagram,
    facebook: item.facebook,
    imageUrl: item.imageUrl,
    ids: result.ids,
    errors: result.errors,
  };
}

export function finalizePublishResult(slot: Slot, item: QueueItem, result: PublishResult): void {
  if (result.completed) {
    if (item.angleId) {
      store.markAnglePublished(item.angleId);
    }
    store.clearSlotPost(slot.id);
    store.logHistory(buildHistoryEntry(slot, item, result));
    return;
  }

  store.setSlotPost(slot.id, result.nextItem);
}

export function releaseSlot(slotId: Slot['id']): QueueItem | null {
  const item = store.getSlotPost(slotId);
  if (!item) return null;

  if (item.angleId) {
    store.releaseQueuedAngle(item.angleId);
  }

  store.clearSlotPost(slotId);
  return item;
}
