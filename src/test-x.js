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
const config_1 = __importDefault(require("../config"));
const store = __importStar(require("./store"));
const x = __importStar(require("./x"));
function previewSecret(value) {
    return value ? `${value.slice(0, 8)}...` : 'NOT SET';
}
async function main() {
    const livePost = process.argv.includes('--live-post');
    const authMode = x.getConfiguredAuthMode();
    console.log('\n-- X Credential Test ------------------------');
    console.log(`ENABLE_X: ${config_1.default.ENABLE_X ? 'true' : 'false'}`);
    console.log(`Auth mode: ${authMode}`);
    console.log(`X_API_KEY: ${previewSecret(config_1.default.X_API_KEY)}`);
    console.log(`X_ACCESS_TOKEN: ${previewSecret(config_1.default.X_ACCESS_TOKEN)}`);
    console.log(`X_OAUTH2_ACCESS_TOKEN: ${previewSecret(config_1.default.X_OAUTH2_ACCESS_TOKEN)}`);
    if (authMode === 'unconfigured') {
        console.log('\nNo supported X auth is configured. Add OAuth 1.0a user credentials or a real OAuth 2.0 user token before testing X.');
        return;
    }
    console.log('\nValidating authenticated X user...');
    const me = await x.getAuthenticatedUser();
    console.log(`OK authenticated as ${me.username ? '@' + me.username : me.name || me.id} (${me.id})`);
    if (!livePost) {
        console.log('\nDry run only. Pass --live-post to publish a test post.');
        return;
    }
    const testText = `Testing Social Agent X publishing flow at ${new Date().toISOString()}.`;
    console.log('\nPosting test update...');
    try {
        const id = await x.publish(testText);
        store.clearPlatformPublishBlocked('x');
        console.log(`OK posted https://x.com/i/web/status/${id}`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (x.isPublishCapabilityBlockedError(message)) {
            const blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            store.setPlatformPublishBlocked('x', message, blockedUntil);
            console.error('\nX publish probe result: AUTH OK / PUBLISH BLOCKED BY ACCESS LEVEL');
            console.error(`Blocked until: ${blockedUntil}`);
            console.error(`Provider response: ${message}`);
            process.exit(2);
        }
        throw error;
    }
}
void main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('X test failed:', message);
    process.exit(1);
});
