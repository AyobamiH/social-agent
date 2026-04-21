import * as facebook from './facebook';
import * as instagram from './instagram';
import * as threads from './threads';
import config from '../config';

import type {
  Logger,
  PlatformKey,
  PublishErrors,
  PublishResult,
  QueueItem,
} from './types';

interface PlatformStep {
  key: PlatformKey;
  label: string;
  run: (item: QueueItem) => Promise<string>;
}

interface PlatformAvailability {
  enabled: boolean;
  reason?: string;
}

const PLATFORM_STEPS: PlatformStep[] = [
  { key: 'threads', label: 'Threads', run: item => threads.publish(item.threads) },
  { key: 'instagram', label: 'Instagram', run: item => instagram.publish(item.instagram, item.imageUrl) },
  { key: 'facebook', label: 'Facebook', run: item => facebook.publish(item.facebook) },
];

function getPlatformAvailability(step: PlatformStep, item: QueueItem): PlatformAvailability {
  switch (step.key) {
    case 'threads':
      if (!config.ENABLE_THREADS) return { enabled: false, reason: 'disabled via ENABLE_THREADS=false' };
      if (!config.THREADS_ACCESS_TOKEN) return { enabled: false, reason: 'THREADS_ACCESS_TOKEN not set' };
      if (!item.threads?.trim()) return { enabled: false, reason: 'Threads post text is empty' };
      return { enabled: true };

    case 'instagram':
      if (!config.ENABLE_INSTAGRAM) return { enabled: false, reason: 'disabled via ENABLE_INSTAGRAM=false' };
      if (!config.META_ACCESS_TOKEN) return { enabled: false, reason: 'META_ACCESS_TOKEN not set' };
      if (!config.INSTAGRAM_ACCOUNT_ID) return { enabled: false, reason: 'INSTAGRAM_ACCOUNT_ID not set' };
      if (!item.instagram?.trim()) return { enabled: false, reason: 'Instagram caption is empty' };
      if (!item.imageUrl?.trim()) return { enabled: false, reason: 'imageUrl is empty' };
      return { enabled: true };

    case 'facebook':
      if (!config.ENABLE_FACEBOOK) return { enabled: false, reason: 'disabled via ENABLE_FACEBOOK=false' };
      if (!config.META_ACCESS_TOKEN) return { enabled: false, reason: 'META_ACCESS_TOKEN not set' };
      if (!config.FACEBOOK_GROUP_ID) return { enabled: false, reason: 'FACEBOOK_GROUP_ID not set' };
      if (!item.facebook?.trim()) return { enabled: false, reason: 'Facebook post text is empty' };
      return { enabled: true };
  }
}

export async function publishQueuedItem(item: QueueItem, logger?: Logger): Promise<PublishResult> {
  const nextItem: QueueItem = {
    ...item,
    ids: { ...(item.ids || {}) },
  };

  const errors: string[] = [];
  const publishErrors: PublishErrors = {};
  const activePlatforms: PlatformKey[] = [];
  const skippedPlatforms: PlatformKey[] = [];

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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      publishErrors[step.key] = message;
      errors.push(`${step.label}: ${message}`);
      logger?.error(`[${step.label}] Failed: ${message}`);
    }
  }

  if (Object.keys(publishErrors).length) {
    nextItem.publishErrors = publishErrors;
  } else {
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

export { PLATFORM_STEPS };
