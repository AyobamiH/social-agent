"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getConfiguredAuthMode = getConfiguredAuthMode;
exports.classifyXError = classifyXError;
exports.isPublishCapabilityBlockedError = isPublishCapabilityBlockedError;
exports.getAuthenticatedUser = getAuthenticatedUser;
exports.publish = publish;
const crypto = __importStar(require("node:crypto"));
const https = __importStar(require("node:https"));
const config_1 = __importDefault(require("../config"));
function encodeOAuthComponent(value) {
    return encodeURIComponent(value)
        .replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
function hasOAuth1Config() {
    return Boolean(config_1.default.X_API_KEY
        && config_1.default.X_API_SECRET
        && config_1.default.X_ACCESS_TOKEN
        && config_1.default.X_ACCESS_TOKEN_SECRET);
}
function hasOAuth2Config() {
    return Boolean(config_1.default.X_OAUTH2_ACCESS_TOKEN);
}
function getConfiguredAuthMode() {
    if (hasOAuth1Config())
        return 'oauth1-user';
    if (hasOAuth2Config())
        return 'oauth2-user';
    return 'unconfigured';
}
function classifyXError(message) {
    const normalized = message.toLowerCase();
    if (normalized.includes('limited v1.1 endpoints')
        || normalized.includes('different access level')
        || normalized.includes('subset of x api v2 endpoints')) {
        return 'publish-access-tier';
    }
    if (normalized.includes('attached to a project')
        || normalized.includes('associated to a project')) {
        return 'project-required';
    }
    if (normalized.includes('forbidden for this endpoint')
        || normalized.includes('oauth 2.0 application-only')
        || normalized.includes('could not authenticate you')
        || normalized.includes('invalid or expired token')) {
        return 'auth';
    }
    return 'other';
}
function isPublishCapabilityBlockedError(message) {
    return classifyXError(message) === 'publish-access-tier';
}
function getOAuth2AccessToken() {
    if (!config_1.default.X_OAUTH2_ACCESS_TOKEN) {
        throw new Error('X_OAUTH2_ACCESS_TOKEN not set');
    }
    return config_1.default.X_OAUTH2_ACCESS_TOKEN;
}
function getOAuth1Header(method, path) {
    const url = new URL(`https://api.x.com${path}`);
    const oauthParams = {
        oauth_consumer_key: config_1.default.X_API_KEY,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: config_1.default.X_ACCESS_TOKEN,
        oauth_version: '1.0',
    };
    const normalizedParams = [
        ...Array.from(url.searchParams.entries()),
        ...Object.entries(oauthParams),
    ]
        .map(([key, value]) => [encodeOAuthComponent(key), encodeOAuthComponent(value)])
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
    const signingKey = `${encodeOAuthComponent(config_1.default.X_API_SECRET)}&${encodeOAuthComponent(config_1.default.X_ACCESS_TOKEN_SECRET)}`;
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
function getErrorMessage(payload, statusCode) {
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
function apiRequest(method, path, body) {
    const payload = body ? JSON.stringify(body) : undefined;
    const authMode = getConfiguredAuthMode();
    if (authMode === 'unconfigured') {
        throw new Error('X auth not configured');
    }
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.x.com',
            path,
            method,
            headers: {
                'Authorization': authMode === 'oauth1-user'
                    ? getOAuth1Header(method, path)
                    : `Bearer ${getOAuth2AccessToken()}`,
                ...(payload ? { 'Content-Type': 'application/json' } : {}),
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
            },
        }, res => {
            let data = '';
            res.on('data', chunk => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const json = (data ? JSON.parse(data) : {});
                    if ((res.statusCode || 500) >= 400 || json.errors || json.error || json.detail) {
                        reject(new Error('X API: ' + getErrorMessage(json, res.statusCode)));
                        return;
                    }
                    resolve(json);
                }
                catch (error) {
                    reject(new Error('X parse error: ' + String(error)));
                }
            });
        });
        req.on('error', reject);
        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}
async function getAuthenticatedUser() {
    if (getConfiguredAuthMode() === 'oauth1-user') {
        const response = await apiRequest('GET', '/1.1/account/verify_credentials.json?skip_status=true&include_entities=false');
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
    const response = await apiRequest('GET', '/2/users/me?user.fields=id,name,username');
    if (!response.data?.id) {
        throw new Error('X API: Authenticated user lookup returned no id');
    }
    return response.data;
}
async function publish(text) {
    const trimmed = text.trim();
    if (!trimmed) {
        throw new Error('X post text is empty');
    }
    if (trimmed.length > 280) {
        throw new Error('X post text exceeds 280 characters');
    }
    if (getConfiguredAuthMode() === 'oauth1-user') {
        const response = await apiRequest('POST', `/1.1/statuses/update.json?status=${encodeOAuthComponent(trimmed)}`);
        const id = String(response.id_str || response.id || '');
        if (!id) {
            throw new Error('X API: status update response returned no tweet id');
        }
        return id;
    }
    const response = await apiRequest('POST', '/2/tweets', { text: trimmed });
    if (!response.data?.id) {
        throw new Error('X API: publish response returned no tweet id');
    }
    return response.data.id;
}
