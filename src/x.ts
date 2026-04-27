import * as crypto from 'node:crypto';
import config from '../config';
import { requestJson } from './http-client';

interface XApiErrorDetail {
  message?: string;
  detail?: string;
}

interface XApiErrorResponse {
  errors?: XApiErrorDetail[];
  error?: string;
  detail?: string;
  title?: string;
}

interface XMeResponse extends XApiErrorResponse {
  data?: {
    id: string;
    name?: string;
    username?: string;
  };
}

interface XPublishResponse extends XApiErrorResponse {
  data?: {
    id?: string;
    text?: string;
  };
}

interface XVerifyCredentialsResponse extends XApiErrorResponse {
  id?: string | number;
  id_str?: string;
  name?: string;
  screen_name?: string;
}

interface XStatusUpdateResponse extends XApiErrorResponse {
  id?: string | number;
  id_str?: string;
  text?: string;
}

export type XAuthMode = 'oauth1-user' | 'oauth2-user' | 'unconfigured';
export type XErrorKind = 'publish-access-tier' | 'project-required' | 'auth' | 'other';

function encodeOAuthComponent(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function hasOAuth1Config(): boolean {
  return Boolean(
    config.X_API_KEY
    && config.X_API_SECRET
    && config.X_ACCESS_TOKEN
    && config.X_ACCESS_TOKEN_SECRET
  );
}

function hasOAuth2Config(): boolean {
  return Boolean(config.X_OAUTH2_ACCESS_TOKEN);
}

export function getConfiguredAuthMode(): XAuthMode {
  if (hasOAuth1Config()) return 'oauth1-user';
  if (hasOAuth2Config()) return 'oauth2-user';
  return 'unconfigured';
}

export function classifyXError(message: string): XErrorKind {
  const normalized = message.toLowerCase();

  if (
    normalized.includes('limited v1.1 endpoints')
    || normalized.includes('different access level')
    || normalized.includes('subset of x api v2 endpoints')
  ) {
    return 'publish-access-tier';
  }

  if (
    normalized.includes('attached to a project')
    || normalized.includes('associated to a project')
  ) {
    return 'project-required';
  }

  if (
    normalized.includes('forbidden for this endpoint')
    || normalized.includes('oauth 2.0 application-only')
    || normalized.includes('could not authenticate you')
    || normalized.includes('invalid or expired token')
  ) {
    return 'auth';
  }

  return 'other';
}

export function isPublishCapabilityBlockedError(message: string): boolean {
  return classifyXError(message) === 'publish-access-tier';
}

function getOAuth2AccessToken(): string {
  if (!config.X_OAUTH2_ACCESS_TOKEN) {
    throw new Error('X_OAUTH2_ACCESS_TOKEN not set');
  }
  return config.X_OAUTH2_ACCESS_TOKEN;
}

function getOAuth1Header(method: 'GET' | 'POST', path: string): string {
  const url = new URL(`https://api.x.com${path}`);
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: config.X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: config.X_ACCESS_TOKEN,
    oauth_version: '1.0',
  };

  const normalizedParams = [
    ...Array.from(url.searchParams.entries()),
    ...Object.entries(oauthParams),
  ]
    .map(([key, value]) => [encodeOAuthComponent(key), encodeOAuthComponent(value)] as const)
    .sort((left, right) => {
      if (left[0] === right[0]) {
        return left[1].localeCompare(right[1]);
      }
      return left[0].localeCompare(right[0]);
    })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  const signatureBase = [
    method,
    encodeOAuthComponent(`${url.origin}${url.pathname}`),
    encodeOAuthComponent(normalizedParams),
  ].join('&');

  const signingKey = `${encodeOAuthComponent(config.X_API_SECRET)}&${encodeOAuthComponent(config.X_ACCESS_TOKEN_SECRET)}`;
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(signatureBase)
    .digest('base64');

  const headerParams = {
    ...oauthParams,
    oauth_signature: signature,
  };

  return 'OAuth ' + Object.entries(headerParams)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([key, value]) => `${encodeOAuthComponent(key)}="${encodeOAuthComponent(value)}"`)
    .join(', ');
}

function getErrorMessage(payload: XApiErrorResponse, statusCode?: number): string {
  if (payload.errors?.length) {
    return payload.errors
      .map(error => error.detail || error.message || 'Unknown error')
      .join(' | ');
  }

  if (payload.detail) {
    return payload.detail;
  }

  if (payload.error) {
    return payload.error;
  }

  if (payload.title) {
    return payload.title;
  }

  return statusCode ? `HTTP ${statusCode}` : 'Unknown error';
}

function apiRequest<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
  const payload = body ? JSON.stringify(body) : undefined;
  const authMode = getConfiguredAuthMode();

  if (authMode === 'unconfigured') {
    throw new Error('X auth not configured');
  }

  return requestJson<T & XApiErrorResponse>(`https://api.x.com${path}`, {
    method,
    headers: {
      'Authorization': authMode === 'oauth1-user'
        ? getOAuth1Header(method, path)
        : `Bearer ${getOAuth2AccessToken()}`,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(payload ? { body: payload } : {}),
    timeoutMs: config.HTTP_TIMEOUT_MS,
  }).then(({ status, data }) => {
    if (status >= 400 || data.errors || data.error || data.detail) {
      throw new Error('X API: ' + getErrorMessage(data, status));
    }
    return data;
  });
}

export async function getAuthenticatedUser(): Promise<{ id: string; username?: string; name?: string }> {
  if (getConfiguredAuthMode() === 'oauth1-user') {
    const response = await apiRequest<XVerifyCredentialsResponse>(
      'GET',
      '/1.1/account/verify_credentials.json?skip_status=true&include_entities=false'
    );
    const id = String(response.id_str || response.id || '');
    if (!id) {
      throw new Error('X API: verify_credentials returned no user id');
    }

    return {
      id,
      username: response.screen_name,
      name: response.name,
    };
  }

  const response = await apiRequest<XMeResponse>('GET', '/2/users/me?user.fields=id,name,username');
  if (!response.data?.id) {
    throw new Error('X API: Authenticated user lookup returned no id');
  }

  return response.data;
}

export async function publish(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('X post text is empty');
  }

  if (trimmed.length > 280) {
    throw new Error('X post text exceeds 280 characters');
  }

  if (getConfiguredAuthMode() === 'oauth1-user') {
    const response = await apiRequest<XStatusUpdateResponse>(
      'POST',
      `/1.1/statuses/update.json?status=${encodeOAuthComponent(trimmed)}`
    );
    const id = String(response.id_str || response.id || '');
    if (!id) {
      throw new Error('X API: status update response returned no tweet id');
    }
    return id;
  }

  const response = await apiRequest<XPublishResponse>('POST', '/2/tweets', { text: trimmed });
  if (!response.data?.id) {
    throw new Error('X API: publish response returned no tweet id');
  }

  return response.data.id;
}
