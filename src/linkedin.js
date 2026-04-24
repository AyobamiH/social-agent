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
function publish(text) {
    if (!config_1.default.LINKEDIN_TOKEN || !config_1.default.LINKEDIN_PERSON_URN) {
        throw new Error('LINKEDIN_TOKEN or LINKEDIN_PERSON_URN not set');
    }
    if (!text || !text.trim()) {
        throw new Error('LinkedIn post text is empty');
    }
    const payload = JSON.stringify({
        author: config_1.default.LINKEDIN_PERSON_URN,
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
                'Authorization': `Bearer ${config_1.default.LINKEDIN_TOKEN}`,
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
                        const json = JSON.parse(data);
                        resolve(json.id || 'posted');
                    }
                    catch {
                        resolve('posted');
                    }
                    return;
                }
                try {
                    const json = JSON.parse(data);
                    reject(new Error('LinkedIn API: ' + (json.message || `HTTP ${res.statusCode}`)));
                }
                catch {
                    reject(new Error(`LinkedIn API: HTTP ${res.statusCode} ${data}`.trim()));
                }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}
