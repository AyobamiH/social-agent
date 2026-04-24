"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEnabledPlatformLabels = getEnabledPlatformLabels;
exports.getRuntimeReadiness = getRuntimeReadiness;
exports.getAutomationGate = getAutomationGate;
const config_1 = __importDefault(require("../config"));
const control_plane_1 = require("./control-plane");
function getEnabledPlatformLabels() {
    const labels = [];
    if (config_1.default.ENABLE_THREADS)
        labels.push('Threads');
    if (config_1.default.ENABLE_X)
        labels.push('X');
    if (config_1.default.ENABLE_INSTAGRAM)
        labels.push('Instagram');
    if (config_1.default.ENABLE_LINKEDIN)
        labels.push('LinkedIn');
    if (config_1.default.ENABLE_FACEBOOK)
        labels.push('Facebook');
    return labels;
}
function getRuntimeReadiness() {
    const missing = [];
    const enabledPlatforms = getEnabledPlatformLabels();
    const hasXOAuth1 = Boolean(config_1.default.X_API_KEY
        && config_1.default.X_API_SECRET
        && config_1.default.X_ACCESS_TOKEN
        && config_1.default.X_ACCESS_TOKEN_SECRET);
    const hasXOAuth2 = Boolean(config_1.default.X_OAUTH2_ACCESS_TOKEN);
    if (!config_1.default.OPENAI_API_KEY) {
        missing.push('OPENAI_API_KEY');
    }
    if (!config_1.default.REDDIT_USER) {
        missing.push('REDDIT_USER');
    }
    if (!config_1.default.REDDIT_ALLOWED_SUBS.size) {
        missing.push('REDDIT_ALLOWED_SUBS');
    }
    if (!enabledPlatforms.length) {
        missing.push('At least one enabled platform');
    }
    if (config_1.default.ENABLE_THREADS && !config_1.default.THREADS_ACCESS_TOKEN) {
        missing.push('THREADS_ACCESS_TOKEN');
    }
    if (config_1.default.ENABLE_X && !hasXOAuth1 && !hasXOAuth2) {
        missing.push('X_OAUTH2_ACCESS_TOKEN or X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_TOKEN_SECRET');
    }
    if (config_1.default.ENABLE_INSTAGRAM) {
        if (!config_1.default.FACEBOOK_PAGE_ACCESS_TOKEN && !config_1.default.META_ACCESS_TOKEN) {
            missing.push('FACEBOOK_PAGE_ACCESS_TOKEN or META_ACCESS_TOKEN');
        }
        if (!config_1.default.INSTAGRAM_ACCOUNT_ID && !config_1.default.FACEBOOK_PAGE_ID) {
            missing.push('INSTAGRAM_ACCOUNT_ID or FACEBOOK_PAGE_ID');
        }
    }
    if (config_1.default.ENABLE_LINKEDIN) {
        if (!config_1.default.LINKEDIN_TOKEN)
            missing.push('LINKEDIN_TOKEN');
        if (!config_1.default.LINKEDIN_PERSON_URN)
            missing.push('LINKEDIN_PERSON_URN');
    }
    if (config_1.default.ENABLE_FACEBOOK) {
        if (!config_1.default.META_ACCESS_TOKEN)
            missing.push('META_ACCESS_TOKEN');
        if (!config_1.default.FACEBOOK_GROUP_ID)
            missing.push('FACEBOOK_GROUP_ID');
    }
    return {
        ready: missing.length === 0,
        missing,
        enabledPlatforms,
    };
}
function getAutomationGate() {
    const readiness = getRuntimeReadiness();
    const billing = (0, control_plane_1.getBillingState)();
    const ownerReady = (0, control_plane_1.hasUsers)();
    const reasons = [];
    if (!ownerReady) {
        reasons.push('Owner account has not been bootstrapped');
    }
    if (!billing.accessActive) {
        reasons.push(billing.lockedReason
            || `Billing status ${billing.status} does not allow automation`);
    }
    if (!readiness.ready) {
        reasons.push(`Runtime is missing: ${readiness.missing.join(', ')}`);
    }
    if (!(0, control_plane_1.canAccessAutomation)() && billing.accessActive) {
        reasons.push('Automation access is disabled');
    }
    return {
        allowed: ownerReady && billing.accessActive && readiness.ready,
        reasons,
        readiness,
        billing,
        hasOwner: ownerReady,
    };
}
