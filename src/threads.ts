import * as https from 'node:https';

import config from '../config';

interface GraphSuccess {
  id: string;
}

interface GraphErrorResponse {
  error?: {
    message?: string;
  };
  id?: string;
}

export async function publish(text: string): Promise<string> {
  const token = config.THREADS_ACCESS_TOKEN;

  if (!token) {
    throw new Error('THREADS_ACCESS_TOKEN not set');
  }

  if (!text || !text.trim()) {
    throw new Error('Threads post text is empty');
  }

  const containerId = await apiPost(
    '/me/threads',
    { media_type: 'TEXT', text, access_token: token }
  );

  await sleep(2000);

  return apiPost(
    '/me/threads_publish',
    { creation_id: containerId, access_token: token }
  );
}

function apiPost(pathname: string, params: Record<string, string>): Promise<string> {
  const query = new URLSearchParams(params).toString();
  const pathWithQuery = `${pathname}?${query}`;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.threads.net',
      path: pathWithQuery,
      method: 'POST',
    }, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data) as GraphErrorResponse;
          if (json.error) {
            reject(new Error('Threads API: ' + (json.error.message || 'Unknown error')));
            return;
          }
          resolve((json as GraphSuccess).id);
        } catch (error) {
          reject(new Error('Threads parse error: ' + String(error)));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
