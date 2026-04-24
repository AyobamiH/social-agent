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
exports.getActiveDraftPlatforms = getActiveDraftPlatforms;
exports.extractSourceBank = extractSourceBank;
exports.draftPlatforms = draftPlatforms;
exports.draftAngleContent = draftAngleContent;
const https = __importStar(require("node:https"));
const BANNED_PHRASES_json_1 = __importDefault(require("../content-os/BANNED_PHRASES.json"));
const config_1 = __importDefault(require("../config"));
const store = __importStar(require("./store"));
const MIN_SCORE = 4;
const PLATFORM_ORDER = ['linkedin', 'threads', 'x', 'instagram', 'facebook'];
const PLATFORM_LABELS = {
    linkedin: 'LinkedIn',
    threads: 'Threads',
    x: 'X',
    instagram: 'Instagram',
    facebook: 'Facebook',
};
const UNIVERSAL_SYSTEM_PROMPT = `You are converting source content into native posts for LinkedIn, Threads, X, Instagram, and Facebook.

Do not rewrite line by line.

Extract one sharp point and rebuild it as a native post.

Preserve:
- the real claim
- the real consequence
- one concrete example if useful

Do not preserve:
- the original structure
- Reddit framing
- documentation pacing
- generic CTA language

Rules for every platform:
- keep one core point only
- sound like someone who has actually built, debugged, deployed, maintained, or untangled the problem
- include one real consequence, tradeoff, or failure mode
- remove fluff, corporate phrasing, and broad motivational framing
- if the post sounds generic, make it more specific
- if the post sounds like documentation, compress it into one sharp distinction
- if the post has more than one idea, cut it down to one

Do not use phrases like:
${BANNED_PHRASES_json_1.default.join('\n')}

Before finalizing, cut anything that sounds generic, abstract, overly polished, or transferable to any industry.
Keep only what feels observed, specific, and earned.
${config_1.default.CUSTOM_PROMPT ? `\nAdditional style: ${config_1.default.CUSTOM_PROMPT}` : ''}`;
const EXTRACTION_SYSTEM_PROMPT = `You turn one source into a reusable content bank.

Return JSON only.

Produce:
- one source summary
- two to five distinct, non-overlapping angles that could each become a separate future post

Each angle must be atomic enough to stand alone later.
Do not output paraphrases of the same idea.
Prefer angles with a concrete professional consequence.
If the source is weak, you may return fewer angles, but never pad with generic filler.`;
const PLATFORM_RULES = {
    linkedin: {
        maxTokens: 360,
        rules: `Platform: LinkedIn
- Goal: one practical professional lesson
- Tone: grounded, professional, specific, calm authority
- Structure: concrete observation, deeper issue, practical consequence, quiet ending
- Length: 120-220 words
- Open with a concrete observation, not a grand claim
- Avoid abstract thought-leadership voice, hype, and broad motivational framing
- Hashtags are optional; only use them if they add value and keep them minimal`,
    },
    threads: {
        maxTokens: 260,
        rules: `Platform: Threads
- Goal: one sharp conversational observation
- Tone: lightly conversational, sharp, human, compressed
- Structure: observation, correction, why it matters
- Length: 40-120 words and under 480 characters if possible
- No article-like exposition
- No heavy CTA
- No hashtags unless they are genuinely necessary, and keep them minimal
- First sentence must work on its own`,
    },
    x: {
        maxTokens: 220,
        rules: `Platform: X
- Goal: one sharp operational observation
- Tone: conversational, punchy, specific, human
- Structure: hook, insight, consequence
- Target length: under 270 characters
- Hard limit: 280 characters maximum
- Keep it to one core point only
- Do not mention Reddit, forums, or source provenance
- Hashtags are optional; use 0-2 only if they genuinely add value
- The first clause should make people stop scrolling`,
    },
    instagram: {
        maxTokens: 320,
        rules: `Platform: Instagram
- Goal: one save-worthy idea
- Tone: clear, memorable, visually legible
- Structure: hook, problem, deeper truth, why it matters, short landing line
- Caption must make sense even without slides
- Use short sentences and line breaks for readability
- Focus on one emotionally clear insight
- Avoid consultant language and long taxonomy explanations
- Keep hashtags minimal and relevant only if they add value`,
    },
    facebook: {
        maxTokens: 360,
        rules: `Platform: Facebook Group
- Goal: one practical lesson for a community audience
- Tone: grounded, readable, lightly conversational
- Structure: concrete observation, deeper issue, practical consequence, quiet ending
- Keep the lesson clear and useful
- Avoid hype, heavy CTA language, and consultant phrasing
- Keep one core idea only`,
    },
};
function getEnabledDraftPlatforms() {
    return PLATFORM_ORDER.filter(platform => {
        switch (platform) {
            case 'linkedin':
                return config_1.default.ENABLE_LINKEDIN;
            case 'threads':
                return config_1.default.ENABLE_THREADS;
            case 'x':
                return config_1.default.ENABLE_X;
            case 'instagram':
                return config_1.default.ENABLE_INSTAGRAM;
            case 'facebook':
                return config_1.default.ENABLE_FACEBOOK;
        }
    });
}
function chatComplete(systemPrompt, userPrompt, maxTokens = 500, temperature = 0.8) {
    const body = JSON.stringify({
        model: config_1.default.OPENAI_MODEL || 'gpt-4o',
        max_tokens: maxTokens,
        temperature,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
        ],
    });
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config_1.default.OPENAI_API_KEY}`,
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
                        reject(new Error('OpenAI: ' + (json.error.message || 'Unknown error')));
                        return;
                    }
                    resolve(json.choices?.[0]?.message?.content?.trim() || '');
                }
                catch (error) {
                    reject(new Error('OpenAI parse error: ' + String(error)));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
function extractJson(raw) {
    try {
        return JSON.parse(raw);
    }
    catch {
        const firstBrace = raw.indexOf('{');
        const lastBrace = raw.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
        }
        throw new Error('Failed to parse JSON from model response');
    }
}
function clampScore(value) {
    if (!Number.isFinite(value))
        return 1;
    return Math.max(1, Math.min(5, Math.round(value)));
}
function dedupeStrings(values) {
    return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}
function findBannedPhrases(text) {
    const lower = text.toLowerCase();
    return BANNED_PHRASES_json_1.default.filter(phrase => lower.includes(phrase.toLowerCase()));
}
function normalizeSourceSummary(value, post) {
    return {
        source_type: value.source_type || 'reddit_post',
        topic: value.topic || post.title.substring(0, 80),
        core_claim: value.core_claim || post.title,
        surface_problem: value.surface_problem || 'People focus on the visible surface issue.',
        deeper_problem: value.deeper_problem || 'The deeper issue is hidden in the workflow, control, or system design.',
        practical_consequence: value.practical_consequence || 'That makes the system harder to trust, debug, or scale.',
        specific_example: value.specific_example || post.selftext.substring(0, 180),
        best_line: value.best_line || '',
        audience_fit: value.audience_fit || 'builders',
        tone_source: value.tone_source || 'practical',
        cta_goal: value.cta_goal || 'none',
    };
}
function normalizeAngleCandidate(value, summary) {
    return {
        label: (value.label || 'lesson').trim() || 'lesson',
        thesis: (value.thesis || summary.core_claim).trim() || summary.core_claim,
        hook: (value.hook || summary.best_line || summary.core_claim).trim() || summary.core_claim,
        supportingPoints: dedupeStrings(value.supportingPoints || []).slice(0, 3),
        practicalConsequence: (value.practicalConsequence || summary.practical_consequence).trim()
            || summary.practical_consequence,
        specificExample: (value.specificExample || summary.specific_example || '').trim(),
        audienceFit: (value.audienceFit || summary.audience_fit || 'builders').trim() || 'builders',
        strength: clampScore(value.strength),
    };
}
function normalizeSourceExtraction(value, post) {
    const summary = normalizeSourceSummary(value.summary || {}, post);
    const rawAngles = (value.angles || []).map(angle => normalizeAngleCandidate(angle, summary));
    const dedupedAngles = rawAngles.filter((angle, index, angles) => {
        const key = `${angle.label.toLowerCase()}|${angle.thesis.toLowerCase()}`;
        return angles.findIndex(candidate => (`${candidate.label.toLowerCase()}|${candidate.thesis.toLowerCase()}` === key)) === index;
    });
    const angles = dedupedAngles.length
        ? dedupedAngles.slice(0, 5)
        : [normalizeAngleCandidate({}, summary)];
    return { summary, angles };
}
function normalizeDraftResponse(defaultAngle, learningNotes, value) {
    return {
        angle: value.angle || defaultAngle,
        post: (value.post || '').trim(),
        scores: {
            specificity: clampScore(value.scores?.specificity),
            human_tone: clampScore(value.scores?.human_tone),
            platform_fit: clampScore(value.scores?.platform_fit),
            clarity: clampScore(value.scores?.clarity),
            practical_consequence: clampScore(value.scores?.practical_consequence),
            non_genericity: clampScore(value.scores?.non_genericity),
        },
        bannedPhrasesFound: dedupeStrings([
            ...(value.banned_phrases_found || []),
            ...findBannedPhrases(value.post || ''),
        ]),
        learningNotes,
    };
}
function getScoreIssues(scores) {
    const issues = [];
    if (scores.specificity < MIN_SCORE)
        issues.push(`specificity below ${MIN_SCORE}`);
    if (scores.human_tone < MIN_SCORE)
        issues.push(`human tone below ${MIN_SCORE}`);
    if (scores.platform_fit < MIN_SCORE)
        issues.push(`platform fit below ${MIN_SCORE}`);
    return issues;
}
function needsRevision(platform, draft) {
    const issues = getScoreIssues(draft.scores);
    if (!draft.post) {
        issues.push('empty draft');
    }
    if (draft.bannedPhrasesFound.length) {
        issues.push(`banned phrases found: ${draft.bannedPhrasesFound.join(', ')}`);
    }
    if (platform === 'threads' && draft.post.length > 500) {
        issues.push('Threads draft exceeds 500 characters');
    }
    if (platform === 'x' && draft.post.length > 270) {
        issues.push('X draft exceeds 270 characters');
    }
    return issues;
}
function formatSourceSummary(summary) {
    return [
        `topic: ${summary.topic}`,
        `core_claim: ${summary.core_claim}`,
        `surface_problem: ${summary.surface_problem}`,
        `deeper_problem: ${summary.deeper_problem}`,
        `practical_consequence: ${summary.practical_consequence}`,
        `specific_example: ${summary.specific_example || 'none'}`,
        `best_line: ${summary.best_line || 'none'}`,
        `audience_fit: ${summary.audience_fit}`,
        `tone_source: ${summary.tone_source}`,
        `cta_goal: ${summary.cta_goal}`,
    ].join('\n');
}
function formatAngle(angle) {
    return [
        `label: ${angle.label}`,
        `thesis: ${angle.thesis}`,
        `hook: ${angle.hook}`,
        `practical_consequence: ${angle.practicalConsequence}`,
        `specific_example: ${angle.specificExample || 'none'}`,
        `audience_fit: ${angle.audienceFit}`,
        `supporting_points: ${angle.supportingPoints.length ? angle.supportingPoints.join(' | ') : 'none'}`,
    ].join('\n');
}
function chatCompleteJson(systemPrompt, userPrompt, maxTokens = 500, temperature = 0.6) {
    return chatComplete(systemPrompt, userPrompt, maxTokens, temperature)
        .then(raw => extractJson(raw));
}
function getPlatformText(entry, platform) {
    switch (platform) {
        case 'linkedin':
            return entry.linkedin || '';
        case 'threads':
            return entry.threads || '';
        case 'x':
            return entry.x || '';
        case 'instagram':
            return entry.instagram || '';
        case 'facebook':
            return entry.facebook || '';
    }
}
function capPlatformPost(platform, text) {
    if (platform !== 'x' || text.length <= 280) {
        return text;
    }
    return text.slice(0, 277).trimEnd() + '...';
}
function getOpening(text, words = 10) {
    return text
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .slice(0, words)
        .join(' ');
}
function getEngagementScore(engagement) {
    if (!engagement)
        return 0;
    let total = 0;
    for (const [key, value] of Object.entries(engagement)) {
        if (key === 'polledAt' || typeof value !== 'number' || !Number.isFinite(value)) {
            continue;
        }
        if (/comment|reply/i.test(key)) {
            total += value * 2;
        }
        else if (/share|repost/i.test(key)) {
            total += value * 2.5;
        }
        else if (/save|bookmark/i.test(key)) {
            total += value * 2;
        }
        else if (/click/i.test(key)) {
            total += value * 1.5;
        }
        else if (/like|reaction|heart/i.test(key)) {
            total += value;
        }
        else if (/impression|view|reach/i.test(key)) {
            total += value / 200;
        }
        else {
            total += value / 2;
        }
    }
    return Math.min(total, 20);
}
function getDraftQualityScore(meta) {
    if (!meta)
        return 0;
    const values = [
        meta.scores.specificity,
        meta.scores.human_tone,
        meta.scores.platform_fit,
        meta.scores.clarity,
        meta.scores.practical_consequence,
        meta.scores.non_genericity,
    ];
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function getPlatformPerformanceScore(entry, platform) {
    let score = getDraftQualityScore(entry.draftMeta?.[platform]);
    if (entry.ids?.[platform]) {
        score += 2;
    }
    const platformName = PLATFORM_LABELS[platform].toLowerCase();
    if (entry.errors?.some(error => error.toLowerCase().startsWith(platformName))) {
        score -= 2;
    }
    score += getEngagementScore(entry.engagement) / 4;
    return score;
}
function buildLearningNotes(platform, angle) {
    const history = store.getHistory()
        .filter(entry => getPlatformText(entry, platform).trim());
    const queueItems = Object.values(store.getQueue())
        .filter((item) => Boolean(item))
        .filter(item => getPlatformText(item, platform).trim());
    const winners = [...history]
        .sort((a, b) => getPlatformPerformanceScore(b, platform) - getPlatformPerformanceScore(a, platform))
        .filter(entry => getPlatformPerformanceScore(entry, platform) > 0)
        .slice(0, 2);
    const weak = [...history]
        .sort((a, b) => getPlatformPerformanceScore(a, platform) - getPlatformPerformanceScore(b, platform))
        .filter(entry => getPlatformPerformanceScore(entry, platform) < 3)
        .slice(0, 2);
    const recentOpenings = dedupeStrings([
        ...queueItems.map(item => getOpening(getPlatformText(item, platform), 8)),
        ...history.slice(0, 3).map(entry => getOpening(getPlatformText(entry, platform), 8)),
    ]).slice(0, 3);
    const recentAngleLabels = history
        .slice(0, 6)
        .map(entry => entry.angleLabel?.trim().toLowerCase())
        .filter((label) => Boolean(label));
    const notes = [];
    if (winners.length) {
        notes.push(`Recent ${PLATFORM_LABELS[platform]} winners started like: ${winners.map(entry => `"${getOpening(getPlatformText(entry, platform), 9)}"`).join(', ')}.`);
    }
    if (recentOpenings.length) {
        notes.push(`Avoid reusing these recent openings too closely: ${recentOpenings.map(opening => `"${opening}"`).join(', ')}.`);
    }
    if (recentAngleLabels.filter(label => label === angle.label.toLowerCase()).length >= 2) {
        notes.push(`This angle label has been used a lot recently, so vary the framing and hook.`);
    }
    if (weak.length) {
        notes.push(`Avoid drifting toward weaker recent starts like ${weak.map(entry => `"${getOpening(getPlatformText(entry, platform), 8)}"`).join(', ')}.`);
    }
    return notes.slice(0, 3);
}
async function buildImagePrompt(source, summary, angle) {
    const promptContext = [
        `Topic: ${summary.topic}`,
        `Core claim: ${summary.core_claim}`,
        `Angle thesis: ${angle.thesis}`,
        `Angle hook: ${angle.hook}`,
        `Practical consequence: ${angle.practicalConsequence}`,
        angle.specificExample ? `Specific example: ${angle.specificExample}` : '',
        `Original title: ${source.title}`,
    ]
        .filter(Boolean)
        .join('\n');
    const body = JSON.stringify({
        model: config_1.default.OPENAI_MODEL || 'gpt-4o',
        max_tokens: 150,
        temperature: 0.7,
        messages: [{
                role: 'system',
                content: `You write DALL-E image prompts for Instagram posts.
You produce vivid, specific, photorealistic scene descriptions.
Never include text, words, logos, or letters in the image.
Never use generic concepts like "shield", "lock", "lightbulb" or "network diagram".
Always describe a real scene with real people, objects, environments or metaphors.`,
            }, {
                role: 'user',
                content: `Based on this content, write a specific DALL-E 3 image prompt for an Instagram post.

Content:
"""
${promptContext}
"""

Write ONE paragraph describing a vivid, photorealistic scene that visually represents the angle.
Be specific about lighting, environment, mood, colours, and perspective.
No text or words in the image. No generic tech icons.
Return ONLY the image prompt, nothing else.`,
            }],
    });
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config_1.default.OPENAI_API_KEY}`,
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
                        reject(new Error('OpenAI: ' + (json.error.message || 'Unknown error')));
                        return;
                    }
                    resolve(json.choices?.[0]?.message?.content?.trim() || source.title);
                }
                catch (error) {
                    reject(new Error('Prompt gen error: ' + String(error)));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
async function generateImage(source, summary, angle) {
    const imagePrompt = await buildImagePrompt(source, summary, angle);
    const body = JSON.stringify({
        model: 'dall-e-3',
        prompt: imagePrompt,
        n: 1,
        size: '1024x1024',
        quality: 'standard',
        style: 'natural',
    });
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.openai.com',
            path: '/v1/images/generations',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config_1.default.OPENAI_API_KEY}`,
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
                        reject(new Error('DALL-E: ' + (json.error.message || 'Unknown error')));
                        return;
                    }
                    resolve({
                        imagePrompt,
                        imageUrl: json.data?.[0]?.url || '',
                    });
                }
                catch (error) {
                    reject(new Error('DALL-E parse error: ' + String(error)));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}
async function draftForPlatform(platform, source, summary, angle) {
    const sourceText = [source.title, source.selftext].filter(Boolean).join('\n\n').substring(0, 900);
    const rule = PLATFORM_RULES[platform];
    const learningNotes = buildLearningNotes(platform, angle);
    const userPrompt = `Source summary:
${formatSourceSummary(summary)}

Selected angle:
${formatAngle(angle)}

Original source:
"""
${sourceText}
"""

${rule.rules}

Write from this exact angle only.
Do not blend in other unused angles from the same source.
Keep the post faithful to the selected angle's practical consequence.

${learningNotes.length ? `Memory signals:\n- ${learningNotes.join('\n- ')}\n` : ''}
Return JSON only in this shape:
{
  "angle": "",
  "post": "",
  "scores": {
    "specificity": 0,
    "human_tone": 0,
    "platform_fit": 0,
    "clarity": 0,
    "practical_consequence": 0,
    "non_genericity": 0
  },
  "banned_phrases_found": []
}`;
    let draft = normalizeDraftResponse(angle.label, learningNotes, await chatCompleteJson(UNIVERSAL_SYSTEM_PROMPT, userPrompt, rule.maxTokens, 0.7));
    const issues = needsRevision(platform, draft);
    if (issues.length) {
        const revisionPrompt = `Revise this ${PLATFORM_LABELS[platform]} draft.

Problems to fix:
- ${issues.join('\n- ')}

Selected angle:
${formatAngle(angle)}

Source summary:
${formatSourceSummary(summary)}

Current draft:
"""
${draft.post}
"""

${learningNotes.length ? `Memory signals:\n- ${learningNotes.join('\n- ')}\n` : ''}
Return JSON only in the same shape:
{
  "angle": "",
  "post": "",
  "scores": {
    "specificity": 0,
    "human_tone": 0,
    "platform_fit": 0,
    "clarity": 0,
    "practical_consequence": 0,
    "non_genericity": 0
  },
  "banned_phrases_found": []
}`;
        draft = normalizeDraftResponse(angle.label, learningNotes, await chatCompleteJson(UNIVERSAL_SYSTEM_PROMPT, revisionPrompt, rule.maxTokens, 0.6));
    }
    return {
        ...draft,
        post: capPlatformPost(platform, draft.post),
    };
}
function getActiveDraftPlatforms() {
    return getEnabledDraftPlatforms();
}
async function extractSourceBank(post) {
    const source = [post.title, post.selftext].filter(Boolean).join('\n\n').substring(0, 2400);
    const userPrompt = `Return JSON only using this schema:
{
  "summary": {
    "source_type": "reddit_post",
    "topic": "",
    "core_claim": "",
    "surface_problem": "",
    "deeper_problem": "",
    "practical_consequence": "",
    "specific_example": "",
    "best_line": "",
    "audience_fit": "",
    "tone_source": "",
    "cta_goal": ""
  },
  "angles": [
    {
      "label": "",
      "thesis": "",
      "hook": "",
      "supportingPoints": [],
      "practicalConsequence": "",
      "specificExample": "",
      "audienceFit": "",
      "strength": 0
    }
  ]
}

Source content:
"""
${source}
"""`;
    const parsed = await chatCompleteJson(EXTRACTION_SYSTEM_PROMPT, userPrompt, 900, 0.4);
    return normalizeSourceExtraction(parsed, post);
}
async function draftPlatforms(source, summary, angle, platforms) {
    const activePlatforms = [...new Set(platforms)];
    const transformed = {
        linkedin: '',
        threads: '',
        x: '',
        instagram: '',
        facebook: '',
        imageUrl: '',
        draftMeta: {},
        draftedPlatforms: activePlatforms,
    };
    const draftEntries = await Promise.all(activePlatforms.map(platform => draftForPlatform(platform, source, summary, angle)
        .then(draft => ({ platform, draft }))));
    for (const { platform, draft } of draftEntries) {
        switch (platform) {
            case 'linkedin':
                transformed.linkedin = draft.post;
                break;
            case 'threads':
                transformed.threads = draft.post;
                break;
            case 'x':
                transformed.x = draft.post;
                break;
            case 'instagram':
                transformed.instagram = draft.post;
                break;
            case 'facebook':
                transformed.facebook = draft.post;
                break;
        }
        transformed.draftMeta[platform] = {
            angle: draft.angle,
            scores: draft.scores,
            bannedPhrasesFound: draft.bannedPhrasesFound,
            learningNotes: draft.learningNotes,
        };
    }
    if (activePlatforms.includes('instagram')) {
        const image = await generateImage(source, summary, angle);
        transformed.imageUrl = image.imageUrl;
        transformed.imagePrompt = image.imagePrompt;
    }
    return transformed;
}
async function draftAngleContent(source, summary, angle) {
    return draftPlatforms(source, summary, angle, getEnabledDraftPlatforms());
}
