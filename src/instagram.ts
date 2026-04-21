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

export async function publish(caption: string, imageUrl: string): Promise<string> {
  const accountId = config.INSTAGRAM_ACCOUNT_ID;
  const token = config.META_ACCESS_TOKEN;
  const version = config.META_GRAPH_VERSION;

  if (!accountId || !token) {
    throw new Error('INSTAGRAM_ACCOUNT_ID or META_ACCESS_TOKEN not set');
  }

  if (!imageUrl) {
    throw new Error('imageUrl is required for Instagram posts');
  }

  const containerId = await apiPost(`/${version}/${accountId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: token,
  });

  await sleep(3000);

  return apiPost(`/${version}/${accountId}/media_publish`, {
    creation_id: containerId,
    access_token: token,
  });
}

function apiPost(pathname: string, params: Record<string, string>): Promise<string> {
  const body = JSON.stringify(params);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      path: pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data) as GraphErrorResponse;
          if (json.error) {
            reject(new Error('Instagram API: ' + (json.error.message || 'Unknown error')));
            return;
          }
          resolve((json as GraphSuccess).id);
        } catch (error) {
          reject(new Error('Instagram parse error: ' + String(error)));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
