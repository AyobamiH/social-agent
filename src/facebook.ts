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

export function publish(message: string): Promise<string> {
  const groupId = config.FACEBOOK_GROUP_ID;
  const token = config.META_ACCESS_TOKEN;
  const version = config.META_GRAPH_VERSION;

  if (!groupId || !token) {
    throw new Error('FACEBOOK_GROUP_ID or META_ACCESS_TOKEN not set');
  }

  const body = JSON.stringify({ message, access_token: token });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      path: `/${version}/${groupId}/feed`,
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
            reject(new Error('Facebook API: ' + (json.error.message || 'Unknown error')));
            return;
          }
          resolve((json as GraphSuccess).id);
        } catch (error) {
          reject(new Error('Facebook parse error: ' + String(error)));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
