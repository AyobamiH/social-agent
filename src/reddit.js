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
exports.fetchPosts = fetchPosts;
const http = __importStar(require("node:http"));
const https = __importStar(require("node:https"));
const config_1 = __importDefault(require("../config"));
async function fetchPosts(sort = 'new', limit = 50) {
    const user = config_1.default.REDDIT_USER.toLowerCase();
    const allowedSubs = config_1.default.REDDIT_ALLOWED_SUBS;
    if (!user) {
        throw new Error('REDDIT_USER is not set in .env');
    }
    if (!allowedSubs.size) {
        throw new Error('REDDIT_ALLOWED_SUBS is not set in .env');
    }
    const allPosts = [];
    for (const sub of allowedSubs) {
        try {
            const posts = await request(`https://www.reddit.com/r/${encodeURIComponent(sub)}/${sort}.json?limit=${limit}&raw_json=1`);
            allPosts.push(...posts);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`[reddit] Failed to fetch r/${sub}: ${message}`);
        }
    }
    const filtered = allPosts.filter(post => post.author.toLowerCase() === user);
    const seen = new Set();
    return filtered
        .sort((a, b) => b.created - a.created)
        .filter(post => {
        if (seen.has(post.id))
            return false;
        seen.add(post.id);
        return true;
    });
}
function request(url, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 5) {
            reject(new Error('Too many redirects'));
            return;
        }
        const lib = url.startsWith('https') ? https : http;
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
            },
        };
        lib.get(url, options, res => {
            if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
                const next = res.headers.location.startsWith('http')
                    ? res.headers.location
                    : `https://www.reddit.com${res.headers.location}`;
                res.resume();
                request(next, redirects + 1).then(resolve).catch(reject);
                return;
            }
            if (res.statusCode === 404) {
                reject(new Error('Subreddit not found (404)'));
                return;
            }
            if (res.statusCode === 403) {
                reject(new Error('Reddit blocked request (403)'));
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`Reddit HTTP ${res.statusCode}`));
                return;
            }
            let body = '';
            res.on('data', chunk => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    const children = json.data?.children || [];
                    const posts = children
                        .map(child => child.data)
                        .filter((post) => Boolean(post && !post.stickied && !post.is_video))
                        .map(post => ({
                        id: post.id || '',
                        title: post.title || '',
                        selftext: post.selftext || '',
                        url: post.url || '',
                        score: post.score || 0,
                        comments: post.num_comments || 0,
                        subreddit: post.subreddit || '',
                        author: post.author || '',
                        created: post.created_utc || 0,
                    }));
                    resolve(posts);
                }
                catch (error) {
                    reject(new Error('Failed to parse Reddit response: ' + String(error)));
                }
            });
        }).on('error', reject);
    });
}
