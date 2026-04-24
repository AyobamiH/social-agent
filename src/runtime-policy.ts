import config from '../config';

import { canAccessAutomation, getBillingState, hasUsers } from './control-plane';

export interface RuntimeReadiness {
  ready: boolean;
  missing: string[];
  enabledPlatforms: string[];
}

export interface AutomationGate {
  allowed: boolean;
  reasons: string[];
  readiness: RuntimeReadiness;
  billing: ReturnType<typeof getBillingState>;
  hasOwner: boolean;
}

export function getEnabledPlatformLabels(): string[] {
  const labels: string[] = [];
  if (config.ENABLE_THREADS) labels.push('Threads');
  if (config.ENABLE_X) labels.push('X');
  if (config.ENABLE_INSTAGRAM) labels.push('Instagram');
  if (config.ENABLE_LINKEDIN) labels.push('LinkedIn');
  if (config.ENABLE_FACEBOOK) labels.push('Facebook');
  return labels;
}

export function getRuntimeReadiness(): RuntimeReadiness {
  const missing: string[] = [];
  const enabledPlatforms = getEnabledPlatformLabels();
  const hasXOAuth1 = Boolean(
    config.X_API_KEY
    && config.X_API_SECRET
    && config.X_ACCESS_TOKEN
    && config.X_ACCESS_TOKEN_SECRET
  );
  const hasXOAuth2 = Boolean(config.X_OAUTH2_ACCESS_TOKEN);

  if (!config.OPENAI_API_KEY) {
    missing.push('OPENAI_API_KEY');
  }

  if (!config.REDDIT_USER) {
    missing.push('REDDIT_USER');
  }

  if (!config.REDDIT_ALLOWED_SUBS.size) {
    missing.push('REDDIT_ALLOWED_SUBS');
  }

  if (!enabledPlatforms.length) {
    missing.push('At least one enabled platform');
  }

  if (config.ENABLE_THREADS && !config.THREADS_ACCESS_TOKEN) {
    missing.push('THREADS_ACCESS_TOKEN');
  }

  if (config.ENABLE_X && !hasXOAuth1 && !hasXOAuth2) {
    missing.push('X_OAUTH2_ACCESS_TOKEN or X_API_KEY/X_API_SECRET/X_ACCESS_TOKEN/X_ACCESS_TOKEN_SECRET');
  }

  if (config.ENABLE_INSTAGRAM) {
    if (!config.FACEBOOK_PAGE_ACCESS_TOKEN && !config.META_ACCESS_TOKEN) {
      missing.push('FACEBOOK_PAGE_ACCESS_TOKEN or META_ACCESS_TOKEN');
    }
    if (!config.INSTAGRAM_ACCOUNT_ID && !config.FACEBOOK_PAGE_ID) {
      missing.push('INSTAGRAM_ACCOUNT_ID or FACEBOOK_PAGE_ID');
    }
  }

  if (config.ENABLE_LINKEDIN) {
    if (!config.LINKEDIN_TOKEN) missing.push('LINKEDIN_TOKEN');
    if (!config.LINKEDIN_PERSON_URN) missing.push('LINKEDIN_PERSON_URN');
  }

  if (config.ENABLE_FACEBOOK) {
    if (!config.META_ACCESS_TOKEN) missing.push('META_ACCESS_TOKEN');
    if (!config.FACEBOOK_GROUP_ID) missing.push('FACEBOOK_GROUP_ID');
  }

  return {
    ready: missing.length === 0,
    missing,
    enabledPlatforms,
  };
}

export function getAutomationGate(): AutomationGate {
  const readiness = getRuntimeReadiness();
  const billing = getBillingState();
  const ownerReady = hasUsers();
  const reasons: string[] = [];

  if (!ownerReady) {
    reasons.push('Owner account has not been bootstrapped');
  }

  if (!billing.accessActive) {
    reasons.push(
      billing.lockedReason
        || `Billing status ${billing.status} does not allow automation`
    );
  }

  if (!readiness.ready) {
    reasons.push(`Runtime is missing: ${readiness.missing.join(', ')}`);
  }

  if (!canAccessAutomation() && billing.accessActive) {
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
