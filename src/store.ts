import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  AngleRecord,
  HistoryEntry,
  MemoryStats,
  QueueItem,
  QueueState,
  SlotId,
  SourceExtraction,
  SourceRecord,
} from './types';

const DATA_DIR = path.join(__dirname, '..', 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');
const USED_FILE = path.join(DATA_DIR, 'used_ids.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const SOURCES_FILE = path.join(DATA_DIR, 'sources.json');
const ANGLES_FILE = path.join(DATA_DIR, 'angles.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const EMPTY_QUEUE: QueueState = { s1: null, s2: null, s3: null, s4: null };

function readJSON<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(file: string, data: unknown): void {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

function nowIso(): string {
  return new Date().toISOString();
}

function sortAngles(a: AngleRecord, b: AngleRecord): number {
  return (
    b.sourceCreated - a.sourceCreated ||
    b.strength - a.strength ||
    a.id.localeCompare(b.id)
  );
}

function uniqStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function getQueue(): QueueState {
  return readJSON(QUEUE_FILE, EMPTY_QUEUE);
}

export function getSlotPost(slotId: keyof QueueState): QueueItem | null {
  return getQueue()[slotId] || null;
}

export function setSlotPost(slotId: keyof QueueState, item: QueueItem): void {
  const queue = getQueue();
  queue[slotId] = item;
  writeJSON(QUEUE_FILE, queue);
}

export function clearSlotPost(slotId: keyof QueueState): void {
  const queue = getQueue();
  queue[slotId] = null;
  writeJSON(QUEUE_FILE, queue);
}

export function getUsedIds(): Set<string> {
  return new Set(readJSON(USED_FILE, [] as string[]));
}

export function markUsed(id: string): void {
  const ids = getUsedIds();
  ids.add(id);
  writeJSON(USED_FILE, [...ids].slice(-1000));
}

export function logHistory(entry: HistoryEntry): void {
  const history = readJSON(HISTORY_FILE, [] as HistoryEntry[]);
  history.unshift(entry);
  writeJSON(HISTORY_FILE, history.slice(0, 200));
}

export function getHistory(): HistoryEntry[] {
  return readJSON(HISTORY_FILE, [] as HistoryEntry[]);
}

export function getPostsPendingPoll(): HistoryEntry[] {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const twoDays = 48 * 60 * 60 * 1000;

  return readJSON(HISTORY_FILE, [] as HistoryEntry[]).filter(entry => {
    if (!entry.postedAt || entry.engagement?.polledAt) {
      return false;
    }

    const age = now - new Date(entry.postedAt).getTime();
    return age >= oneDay && age <= twoDays;
  });
}

export function updateEngagement(postedAt: string, engagement: Record<string, unknown>): void {
  const history = readJSON(HISTORY_FILE, [] as HistoryEntry[]);
  const index = history.findIndex(entry => entry.postedAt === postedAt);

  if (index >= 0) {
    history[index].engagement = {
      ...engagement,
      polledAt: new Date().toISOString(),
    };
    writeJSON(HISTORY_FILE, history);
  }
}

export function getSources(): SourceRecord[] {
  return readJSON(SOURCES_FILE, [] as SourceRecord[]);
}

export function getSource(redditId: string): SourceRecord | undefined {
  return getSources().find(source => source.redditId === redditId);
}

export function getAngles(): AngleRecord[] {
  return readJSON(ANGLES_FILE, [] as AngleRecord[]);
}

export function getAngle(angleId: string): AngleRecord | undefined {
  return getAngles().find(angle => angle.id === angleId);
}

export function getAnglesForSource(redditId: string): AngleRecord[] {
  return getAngles()
    .filter(angle => angle.redditId === redditId)
    .sort(sortAngles);
}

export function getReadyAngles(limit?: number, excludeRedditIds?: Set<string>): AngleRecord[] {
  const excluded = excludeRedditIds || new Set<string>();
  const ready = getAngles()
    .filter(angle => angle.status === 'ready' && !excluded.has(angle.redditId))
    .sort(sortAngles);

  return typeof limit === 'number' ? ready.slice(0, limit) : ready;
}

export function getNextReadyAngleForSource(
  redditId: string,
  expectedHash?: string
): AngleRecord | undefined {
  return getAnglesForSource(redditId)
    .filter(angle => angle.status === 'ready')
    .find(angle => !expectedHash || angle.sourceHash === expectedHash);
}

export function sourceHasActiveAngles(redditId: string): boolean {
  return getAnglesForSource(redditId).some(angle => angle.status === 'ready' || angle.status === 'queued');
}

export function isSourceExhausted(redditId: string, contentHash: string): boolean {
  const source = getSource(redditId);
  if (source) {
    if (source.contentHash !== contentHash) return false;
    return source.status === 'exhausted';
  }

  return getUsedIds().has(redditId);
}

export function bankSourceExtraction(
  post: {
    id: string;
    title: string;
    selftext: string;
    url: string;
    subreddit: string;
    author: string;
    created: number;
  },
  contentHash: string,
  extraction: SourceExtraction
): { source: SourceRecord; readyAngles: AngleRecord[] } {
  const now = nowIso();
  const sources = getSources();
  const angles = getAngles();
  const sourceIndex = sources.findIndex(source => source.redditId === post.id);
  const existingSource = sourceIndex >= 0 ? sources[sourceIndex] : undefined;
  const matchingAngles = angles
    .filter(angle => angle.redditId === post.id && angle.sourceHash === contentHash)
    .sort(sortAngles);

  if (matchingAngles.length) {
    const mergedSource: SourceRecord = {
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
    } else {
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
    status: 'ready' as const,
    createdAt: now,
  }));

  angles.push(...newAngles);
  writeJSON(ANGLES_FILE, angles);

  const nextSource: SourceRecord = {
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
  } else {
    sources.push(nextSource);
  }
  writeJSON(SOURCES_FILE, sources);

  if (!newAngles.length) {
    markUsed(post.id);
  }

  return { source: nextSource, readyAngles: newAngles };
}

export function markAngleQueued(angleId: string, slotId: SlotId): AngleRecord | undefined {
  const now = nowIso();
  const angles = getAngles();
  const index = angles.findIndex(angle => angle.id === angleId);
  if (index < 0) return undefined;

  const nextAngle: AngleRecord = {
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

export function releaseQueuedAngle(angleId: string): AngleRecord | undefined {
  const angles = getAngles();
  const index = angles.findIndex(angle => angle.id === angleId);
  if (index < 0) return undefined;

  const current = angles[index];
  if (current.status !== 'queued') return current;

  const nextAngle: AngleRecord = {
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

export function discardAngle(angleId: string, reason?: string): AngleRecord | undefined {
  const now = nowIso();
  const angles = getAngles();
  const index = angles.findIndex(angle => angle.id === angleId);
  if (index < 0) return undefined;

  const nextAngle: AngleRecord = {
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

export function markAnglePublished(angleId: string): AngleRecord | undefined {
  const now = nowIso();
  const angles = getAngles();
  const index = angles.findIndex(angle => angle.id === angleId);
  if (index < 0) return undefined;

  const nextAngle: AngleRecord = {
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

export function reconcileSourceStatus(redditId: string): SourceRecord | undefined {
  const sources = getSources();
  const sourceIndex = sources.findIndex(source => source.redditId === redditId);
  if (sourceIndex < 0) return undefined;

  const now = nowIso();
  const source = sources[sourceIndex];
  const active = getAnglesForSource(redditId).some(angle => angle.status === 'ready' || angle.status === 'queued');

  const nextSource: SourceRecord = {
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

export function getMemoryStats(): MemoryStats {
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
