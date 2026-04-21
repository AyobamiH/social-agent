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

interface PageDetailsResponse extends GraphErrorResponse {
  access_token?: string;
  instagram_business_account?: {
    id?: string;
  };
}

export async function publish(caption: string, imageUrl: string): Promise<string> {
  const version = config.META_GRAPH_VERSION;

  const accountId = await resolveInstagramAccountId();
  const token = await resolveInstagramAccessToken();

  if (!imageUrl) {
    throw new Error('imageUrl is required for Instagram posts');
  }

  const containerId = await apiPost(`/${version}/${accountId}/media`, {
    caption,
    image_url: imageUrl,
  }, token);

  await sleep(3000);

  return apiPost(`/${version}/${accountId}/media_publish`, {
    creation_id: containerId,
  }, token);
}

async function resolveInstagramAccountId(): Promise<string> {
  if (config.INSTAGRAM_ACCOUNT_ID) {
    return config.INSTAGRAM_ACCOUNT_ID;
  }

  const pageId = config.FACEBOOK_PAGE_ID;
  const token = config.META_ACCESS_TOKEN;
  const version = config.META_GRAPH_VERSION;

  if (!pageId || !token) {
    throw new Error('INSTAGRAM_ACCOUNT_ID not set and cannot be auto-discovered without FACEBOOK_PAGE_ID + META_ACCESS_TOKEN');
  }

  const page = await apiGet<PageDetailsResponse>(
    `/${version}/${pageId}?fields=instagram_business_account{id}&access_token=${encodeURIComponent(token)}`
  );

  if (page.error) {
    throw new Error('Instagram API: ' + (page.error.message || 'Failed to inspect Page for instagram_business_account'));
  }

  const accountId = page.instagram_business_account?.id;
  if (!accountId) {
    throw new Error('Instagram API: No instagram_business_account is linked to FACEBOOK_PAGE_ID yet');
  }

  return accountId;
}

async function resolveInstagramAccessToken(): Promise<string> {
  if (config.FACEBOOK_PAGE_ACCESS_TOKEN) {
    return config.FACEBOOK_PAGE_ACCESS_TOKEN;
  }

  const pageId = config.FACEBOOK_PAGE_ID;
  const token = config.META_ACCESS_TOKEN;
  const version = config.META_GRAPH_VERSION;

  if (!pageId || !token) {
    throw new Error('FACEBOOK_PAGE_ACCESS_TOKEN not set and cannot be auto-discovered without FACEBOOK_PAGE_ID + META_ACCESS_TOKEN');
  }

  const page = await apiGet<PageDetailsResponse>(
    `/${version}/${pageId}?fields=access_token&access_token=${encodeURIComponent(token)}`
  );

  if (page.error) {
    throw new Error('Instagram API: ' + (page.error.message || 'Failed to inspect Page for access_token'));
  }

  if (!page.access_token) {
    throw new Error('Instagram API: Could not retrieve a Facebook Page access token for Instagram publishing');
  }

  return page.access_token;
}

function apiGet<T extends GraphErrorResponse>(pathname: string): Promise<T> {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'graph.facebook.com',
      path: pathname,
      headers: {
        Accept: 'application/json',
      },
    }, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data) as T);
        } catch (error) {
          reject(new Error('Instagram parse error: ' + String(error)));
        }
      });
    }).on('error', reject);
  });
}

function apiPost(pathname: string, params: Record<string, string>, token: string): Promise<string> {
  const body = JSON.stringify(params);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'graph.facebook.com',
      path: pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
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
