import * as https from 'node:https';

import config from '../config';

interface LinkedInPublishSuccess {
  id?: string;
}

interface LinkedInPublishError {
  message?: string;
}

interface LinkedInPublishResponse extends LinkedInPublishSuccess {
  message?: string;
}

export function publish(text: string): Promise<string> {
  if (!config.LINKEDIN_TOKEN || !config.LINKEDIN_PERSON_URN) {
    throw new Error('LINKEDIN_TOKEN or LINKEDIN_PERSON_URN not set');
  }

  if (!text || !text.trim()) {
    throw new Error('LinkedIn post text is empty');
  }

  const payload = JSON.stringify({
    author: config.LINKEDIN_PERSON_URN,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.linkedin.com',
      path: '/v2/ugcPosts',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.LINKEDIN_TOKEN}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 201) {
          try {
            const json = JSON.parse(data) as LinkedInPublishSuccess;
            resolve(json.id || 'posted');
          } catch {
            resolve('posted');
          }
          return;
        }

        try {
          const json = JSON.parse(data) as LinkedInPublishError;
          reject(new Error('LinkedIn API: ' + (json.message || `HTTP ${res.statusCode}`)));
        } catch {
          reject(new Error(`LinkedIn API: HTTP ${res.statusCode} ${data}`.trim()));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
