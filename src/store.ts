import * as fs from 'node:fs';
import * as path from 'node:path';

import type { HistoryEntry, QueueItem, QueueState } from './types';

const DATA_DIR = path.join(__dirname, '..', 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');
const USED_FILE = path.join(DATA_DIR, 'used_ids.json');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

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
  writeJSON(USED_FILE, [...ids].slice(-500));
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
