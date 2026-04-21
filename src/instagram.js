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
    const accountId = config_1.default.INSTAGRAM_ACCOUNT_ID;
    const token = config_1.default.META_ACCESS_TOKEN;
    const version = config_1.default.META_GRAPH_VERSION;
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
function apiPost(pathname, params) {
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
