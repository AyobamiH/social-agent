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
const https = __importStar(require("node:https"));
const config_1 = __importDefault(require("../config"));
function get(hostname, pathname) {
    return new Promise((resolve, reject) => {
        https.get({ hostname, path: pathname, headers: { Accept: 'application/json' } }, res => {
            let data = '';
            res.on('data', chunk => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch {
                    resolve({ raw: data });
                }
            });
        }).on('error', reject);
    });
}
async function main() {
    const token = config_1.default.META_ACCESS_TOKEN;
    const threadsToken = config_1.default.THREADS_ACCESS_TOKEN;
    const graphVersion = config_1.default.META_GRAPH_VERSION;
    console.log('\n── Meta Token Test ──────────────────────────────');
    console.log(`Token length: ${token.length} chars`);
    console.log(`Token preview: ${token.substring(0, 20)}...${token.substring(token.length - 6)}`);
    console.log(`Threads token present: ${threadsToken ? 'yes' : 'no'}`);
    console.log(`Graph versions: facebook=${graphVersion} threads=/me endpoints`);
    console.log('\n1. Identity check...');
    const me = await get('graph.facebook.com', `/${graphVersion}/me?access_token=${token}`);
    console.log(me.error ? `   ✕ ${me.error.message}` : `   ✓ ${me.name} (${me.id})`);
    console.log('\n2. Facebook Pages...');
    const pages = await get('graph.facebook.com', `/${graphVersion}/me/accounts?access_token=${token}`);
    if (pages.error) {
        console.log(`   ✕ ${pages.error.message}`);
    }
    else if (!pages.data?.length) {
        console.log('   ✕ No pages found');
    }
    else {
        pages.data.forEach(page => console.log(`   ✓ Page: ${page.name} (${page.id})`));
    }
    console.log('\n3. Page-linked Instagram accounts...');
    const linkedIgAccounts = [];
    if (pages.data?.length) {
        for (const page of pages.data) {
            const detail = await get('graph.facebook.com', `/${graphVersion}/${page.id}?fields=instagram_business_account{id,username,name}&access_token=${token}`);
            if (detail.error) {
                console.log(`   ✕ ${page.name}: ${detail.error.message}`);
                continue;
            }
            const instagram = detail.instagram_business_account;
            if (!instagram?.id) {
                console.log(`   - ${page.name}: no linked instagram_business_account`);
                continue;
            }
            linkedIgAccounts.push({
                ...instagram,
                pageId: page.id,
                pageName: page.name,
            });
            console.log(`   ✓ ${page.name} → ${instagram.username ? '@' + instagram.username : 'Instagram account'} (${instagram.id})`);
        }
    }
    console.log('\n4. Facebook Group access...');
    const groupId = config_1.default.FACEBOOK_GROUP_ID;
    if (!groupId) {
        console.log('   ✕ FACEBOOK_GROUP_ID not set in .env');
    }
    else {
        const group = await get('graph.facebook.com', `/${graphVersion}/${groupId}?fields=name,privacy&access_token=${token}`);
        if (group.error) {
            console.log(`   ✕ ${group.error.message}`);
            console.log('     The app cannot post to this group until the token can read the group object.');
        }
        else {
            console.log(`   ✓ Group: ${group.name} (${group.privacy})`);
        }
    }
    console.log('\n5. Configured Instagram account...');
    const igId = config_1.default.INSTAGRAM_ACCOUNT_ID;
    if (!igId) {
        console.log('   ✕ INSTAGRAM_ACCOUNT_ID not set in .env');
    }
    else {
        const linkedMatch = linkedIgAccounts.find(account => account.id === igId);
        if (linkedMatch) {
            console.log(`   ✓ Matches page-linked Instagram for ${linkedMatch.pageName}` +
                `${linkedMatch.username ? ` (@${linkedMatch.username})` : ''}`);
        }
        else {
            const instagram = await get('graph.facebook.com', `/${graphVersion}/${igId}?fields=id,username,name&access_token=${token}`);
            if (instagram.error) {
                console.log(`   ✕ ${instagram.error.message}`);
            }
            else {
                console.log(`   ✓ Instagram: ${instagram.username ? '@' + instagram.username : instagram.name || instagram.id} (${instagram.id})`);
            }
            if (me.id && igId === me.id) {
                console.log('     This matches your Facebook user ID, not a page-linked Instagram account ID.');
            }
            if (linkedIgAccounts.length) {
                console.log('     Suggested INSTAGRAM_ACCOUNT_ID values from your pages:');
                linkedIgAccounts.forEach(account => {
                    console.log(`       - ${account.id} (${account.pageName}${account.username ? ` → @${account.username}` : ''})`);
                });
            }
            else {
                console.log('     No linked instagram_business_account was discovered from your pages.');
            }
        }
    }
    console.log('\n6. Threads account...');
    const threadsMe = await get('graph.threads.net', `/me?fields=id,username&access_token=${threadsToken}`);
    if (threadsMe.error) {
        console.log(`   ✕ ${threadsMe.error.message}`);
    }
    else {
        console.log(`   ✓ Threads account: ${threadsMe.id}${threadsMe.username ? ` (@${threadsMe.username})` : ''}`);
        if (!config_1.default.THREADS_USER_ID) {
            console.log(`     THREADS_USER_ID is not set. Suggested value: ${threadsMe.id}`);
        }
        else if (config_1.default.THREADS_USER_ID !== threadsMe.id) {
            console.log(`     THREADS_USER_ID does not match /me. Suggested value: ${threadsMe.id}`);
        }
    }
    if (config_1.default.FACEBOOK_USER_ID && me.id && config_1.default.FACEBOOK_USER_ID !== me.id) {
        console.log(`   Note: FACEBOOK_USER_ID in .env does not match /me. Suggested value: ${me.id}`);
    }
    if (config_1.default.FACEBOOK_PAGE_ID && pages.data?.[0] && config_1.default.FACEBOOK_PAGE_ID !== pages.data[0].id) {
        console.log(`   Note: FACEBOOK_PAGE_ID in .env does not match the discovered Page ID ${pages.data[0].id}`);
    }
    console.log('\n────────────────────────────────────────────────\n');
}
void main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Test error:', message);
});
