import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import * as url from 'node:url';

import config from '../config';

import * as ai from './ai';
import * as logger from './logger';
import * as reddit from './reddit';
import * as store from './store';

import { publishQueuedItem } from './publish';

import type { QueueItem, Slot } from './types';

type RequestBody = Record<string, unknown>;
type RouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: RequestBody
) => void | Promise<void>;

const PORT = config.GUI_PORT;

const SLOTS: Slot[] = [
  { id: 's1', label: '5:00 AM', desc: 'Early risers' },
  { id: 's2', label: '7:00 AM', desc: 'Morning commute' },
  { id: 's3', label: '12:00 PM', desc: 'Lunch break' },
  { id: 's4', label: '3:00 PM', desc: 'Afternoon peak' },
];

function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function jsonErr(res: http.ServerResponse, message: string, status = 500): void {
  json(res, { error: message }, status);
}

function readBody(req: http.IncomingMessage): Promise<RequestBody> {
  return new Promise(resolve => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data) as RequestBody);
      } catch {
        resolve({});
      }
    });
  });
}

function getSlot(slotId: unknown): Slot | undefined {
  return SLOTS.find(slot => slot.id === slotId);
}

const routes: Record<string, RouteHandler> = {
  'GET /api/status': (_req, res) => {
    const queue = store.getQueue();
    json(res, {
      slots: SLOTS.map(slot => ({ ...slot, post: queue[slot.id] || null })),
      stats: {
        queued: SLOTS.filter(slot => queue[slot.id]).length,
        posted: store.getHistory().length,
        usedPosts: store.getUsedIds().size,
      },
      config: {
        redditUser: config.REDDIT_USER,
        allowedSubs: [...config.REDDIT_ALLOWED_SUBS],
        model: config.OPENAI_MODEL,
        timezone: config.TIMEZONE,
        platforms: {
          threads: config.ENABLE_THREADS,
          instagram: config.ENABLE_INSTAGRAM,
          facebook: config.ENABLE_FACEBOOK,
        },
      },
    });
  },

  'GET /api/queue': (_req, res) => {
    const queue = store.getQueue();
    json(res, SLOTS.map(slot => ({ slot, post: queue[slot.id] || null })));
  },

  'GET /api/history': (_req, res) => {
    json(res, store.getHistory().slice(0, 50));
  },

  'GET /api/logs': (_req, res) => {
    const logFile = path.join(__dirname, '..', 'data', 'agent.log');
    try {
      const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
      json(res, lines.slice(-150).reverse());
    } catch {
      json(res, []);
    }
  },

  'POST /api/fetch': async (_req, res) => {
    try {
      const posts = await reddit.fetchPosts(config.REDDIT_SORT, config.REDDIT_LIMIT);
      const used = store.getUsedIds();
      const fresh = posts.filter(post => !used.has(post.id));
      let filled = 0;

      for (const post of fresh) {
        const emptySlot = SLOTS.find(slot => !store.getSlotPost(slot.id));
        if (!emptySlot) break;

        const content = await ai.transformAll(post);
        const queuedItem: QueueItem = {
          redditId: post.id,
          title: post.title,
          ...content,
        };
        store.setSlotPost(emptySlot.id, queuedItem);
        store.markUsed(post.id);
        filled++;
      }

      logger.info(`[GUI] Fetch done — ${filled} slots filled`);
      json(res, { fetched: posts.length, fresh: fresh.length, filled });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      jsonErr(res, message);
    }
  },

  'POST /api/post-slot': async (_req, res, body) => {
    const slot = getSlot(body.slotId);
    if (!slot) {
      jsonErr(res, 'Invalid slot', 400);
      return;
    }

    const item = store.getSlotPost(slot.id);
    if (!item) {
      jsonErr(res, 'Slot is empty', 400);
      return;
    }

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
      logger.info(`[GUI] Posted ${slot.label}`);
    } else {
      store.setSlotPost(slot.id, result.nextItem);
      logger.warn(`[GUI] Retained ${slot.label} for retry`);
    }

    json(res, {
      success: result.completed,
      queuedForRetry: !result.completed,
      ids: result.ids,
      errors: result.errors,
      pendingPlatforms: result.pendingPlatforms,
    });
  },

  'POST /api/post-all': async (_req, res) => {
    const results: Array<Record<string, unknown>> = [];

    for (const slot of SLOTS) {
      const item = store.getSlotPost(slot.id);
      if (!item) {
        results.push({ slot: slot.label, skipped: true });
        continue;
      }

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
        });
      } else {
        store.setSlotPost(slot.id, result.nextItem);
      }

      results.push({
        slot: slot.label,
        ids: result.ids,
        errors: result.errors,
        queuedForRetry: !result.completed,
        pendingPlatforms: result.pendingPlatforms,
      });
    }

    json(res, { results });
  },

  'PUT /api/slot': (_req, res, body) => {
    const slot = getSlot(body.slotId);
    if (!slot) {
      jsonErr(res, 'slotId required', 400);
      return;
    }

    const existing = store.getSlotPost(slot.id);
    const updates = (typeof body.updates === 'object' && body.updates)
      ? body.updates as Partial<QueueItem>
      : {};

    store.setSlotPost(slot.id, { ...(existing || {}), ...updates } as QueueItem);
    json(res, { success: true });
  },

  'DELETE /api/slot': (_req, res, body) => {
    const slot = getSlot(body.slotId);
    if (!slot) {
      jsonErr(res, 'slotId required', 400);
      return;
    }

    store.clearSlotPost(slot.id);
    json(res, { success: true });
  },
};

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || '/', true);
  const pathname = parsed.pathname || '/';
  const method = req.method || 'GET';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const key = `${method} ${pathname}`;
  const route = routes[key];

  if (route) {
    const body = ['POST', 'PUT', 'DELETE'].includes(method) ? await readBody(req) : {};
    await route(req, res, body);
    return;
  }

  if (pathname === '/' || pathname === '/index.html') {
    try {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html')));
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => logger.info(`Social Agent dashboard → http://localhost:${PORT}`));

export default server;
