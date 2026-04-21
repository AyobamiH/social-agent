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
async function publish(text) {
    const token = config_1.default.THREADS_ACCESS_TOKEN;
    if (!token) {
        throw new Error('THREADS_ACCESS_TOKEN not set');
    }
    if (!text || !text.trim()) {
        throw new Error('Threads post text is empty');
    }
    const containerId = await apiPost('/me/threads', { media_type: 'TEXT', text, access_token: token });
    await sleep(2000);
    return apiPost('/me/threads_publish', { creation_id: containerId, access_token: token });
}
function apiPost(pathname, params) {
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
                    const json = JSON.parse(data);
                    if (json.error) {
                        reject(new Error('Threads API: ' + (json.error.message || 'Unknown error')));
                        return;
                    }
                    resolve(json.id);
                }
                catch (error) {
                    reject(new Error('Threads parse error: ' + String(error)));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
