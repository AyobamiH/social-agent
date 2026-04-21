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
exports.publish = publish;
const https = __importStar(require("node:https"));
const config_1 = __importDefault(require("../config"));
async function publish(caption, imageUrl) {
    const version = config_1.default.META_GRAPH_VERSION;
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
async function resolveInstagramAccountId() {
    if (config_1.default.INSTAGRAM_ACCOUNT_ID) {
        return config_1.default.INSTAGRAM_ACCOUNT_ID;
    }
    const pageId = config_1.default.FACEBOOK_PAGE_ID;
    const token = config_1.default.META_ACCESS_TOKEN;
    const version = config_1.default.META_GRAPH_VERSION;
    if (!pageId || !token) {
        throw new Error('INSTAGRAM_ACCOUNT_ID not set and cannot be auto-discovered without FACEBOOK_PAGE_ID + META_ACCESS_TOKEN');
    }
    const page = await apiGet(`/${version}/${pageId}?fields=instagram_business_account{id}&access_token=${encodeURIComponent(token)}`);
    if (page.error) {
        throw new Error('Instagram API: ' + (page.error.message || 'Failed to inspect Page for instagram_business_account'));
    }
    const accountId = page.instagram_business_account?.id;
    if (!accountId) {
        throw new Error('Instagram API: No instagram_business_account is linked to FACEBOOK_PAGE_ID yet');
    }
    return accountId;
}
async function resolveInstagramAccessToken() {
    if (config_1.default.FACEBOOK_PAGE_ACCESS_TOKEN) {
        return config_1.default.FACEBOOK_PAGE_ACCESS_TOKEN;
    }
    const pageId = config_1.default.FACEBOOK_PAGE_ID;
    const token = config_1.default.META_ACCESS_TOKEN;
    const version = config_1.default.META_GRAPH_VERSION;
    if (!pageId || !token) {
        throw new Error('FACEBOOK_PAGE_ACCESS_TOKEN not set and cannot be auto-discovered without FACEBOOK_PAGE_ID + META_ACCESS_TOKEN');
    }
    const page = await apiGet(`/${version}/${pageId}?fields=access_token&access_token=${encodeURIComponent(token)}`);
    if (page.error) {
        throw new Error('Instagram API: ' + (page.error.message || 'Failed to inspect Page for access_token'));
    }
    if (!page.access_token) {
        throw new Error('Instagram API: Could not retrieve a Facebook Page access token for Instagram publishing');
    }
    return page.access_token;
}
function apiGet(pathname) {
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
                    resolve(JSON.parse(data));
                }
                catch (error) {
                    reject(new Error('Instagram parse error: ' + String(error)));
                }
            });
        }).on('error', reject);
    });
}
function apiPost(pathname, params, token) {
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
                    const json = JSON.parse(data);
                    if (json.error) {
                        reject(new Error('Instagram API: ' + (json.error.message || 'Unknown error')));
                        return;
                    }
                    resolve(json.id);
                }
                catch (error) {
                    reject(new Error('Instagram parse error: ' + String(error)));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
