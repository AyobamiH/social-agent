export type SlotId = 's1' | 's2' | 's3' | 's4';
export type PlatformKey = 'threads' | 'instagram' | 'facebook';

export interface RedditPost {
  id: string;
  title: string;
  selftext: string;
  url: string;
  score: number;
  comments: number;
  subreddit: string;
  author: string;
  created: number;
}

export interface TransformedContent {
  threads: string;
  instagram: string;
  facebook: string;
  imageUrl: string;
}

export interface PlatformIds {
  threads?: string;
  instagram?: string;
  facebook?: string;
}

export interface PublishErrors {
  threads?: string;
  instagram?: string;
  facebook?: string;
}

export interface QueueItem extends TransformedContent {
  redditId: string;
  title: string;
  ids?: PlatformIds;
  publishErrors?: PublishErrors;
  lastPublishAttemptAt?: string;
}

export interface HistoryEntry extends TransformedContent {
  slot: string;
  title: string;
  postedAt: string;
  ids?: PlatformIds;
  errors?: string[];
  engagement?: Record<string, unknown> & { polledAt?: string };
}

export interface QueueState {
  s1: QueueItem | null;
  s2: QueueItem | null;
  s3: QueueItem | null;
  s4: QueueItem | null;
}

export interface Slot {
  id: SlotId;
  label: string;
  cron?: string;
  desc?: string;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface PublishResult {
  nextItem: QueueItem;
  ids: PlatformIds;
  errors: string[];
  pendingPlatforms: PlatformKey[];
  activePlatforms: PlatformKey[];
  skippedPlatforms: PlatformKey[];
  completed: boolean;
}
