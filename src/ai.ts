import * as https from 'node:https';

import config from '../config';

import type { RedditPost, TransformedContent } from './types';

interface OpenAIErrorResponse {
  error?: {
    message?: string;
  };
}

interface ChatCompletionResponse extends OpenAIErrorResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface ImageGenerationResponse extends OpenAIErrorResponse {
  data?: Array<{
    url?: string;
  }>;
}

const PLATFORM_PROMPTS = {
  threads: `Write a Threads post (max 500 characters).
- Hook in the first line — make people stop scrolling
- Conversational, direct, like texting a smart friend
- No fluff, no corporate speak
- End with a punchy question or bold statement
- 2-3 hashtags max at the end
- Do NOT exceed 480 characters`,

  instagram: `Write an Instagram caption (max 150 words).
- First line is the hook — everything before "more" must grab attention
- Storytelling tone, personal and relatable
- Use line breaks between every 1-2 sentences for readability
- 10-15 relevant hashtags at the very end on a new line
- End the caption (before hashtags) with a question to drive comments
- Do NOT mention Reddit or any forum as the source`,

  facebook: `Write a Facebook Group post (max 300 words).
- Conversational and community-focused tone
- Start with a relatable situation or observation
- Share the insight or lesson in a clear, friendly way
- Invite group members to share their own experience
- End with a direct question to spark discussion
- 3-5 hashtags at the end
- Do NOT mention Reddit or any forum as the source`,
} as const;

async function buildImagePrompt(post: RedditPost): Promise<string> {
  const source = [post.title, post.selftext]
    .filter(Boolean)
    .join('\n\n')
    .substring(0, 800);

  const body = JSON.stringify({
    model: config.OPENAI_MODEL || 'gpt-4o',
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
${source}
"""

Write ONE paragraph describing a vivid, photorealistic scene that visually represents the core idea.
Be specific about: lighting, environment, mood, colours, perspective.
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
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data) as ChatCompletionResponse;
          if (json.error) {
            reject(new Error('OpenAI: ' + (json.error.message || 'Unknown error')));
            return;
          }
          resolve(json.choices?.[0]?.message?.content?.trim() || post.title);
        } catch (error) {
          reject(new Error('Prompt gen error: ' + String(error)));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function chatComplete(systemPrompt: string, userPrompt: string, maxTokens = 500): Promise<string> {
  const body = JSON.stringify({
    model: config.OPENAI_MODEL || 'gpt-4o',
    max_tokens: maxTokens,
    temperature: 0.8,
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
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data) as ChatCompletionResponse;
          if (json.error) {
            reject(new Error('OpenAI: ' + (json.error.message || 'Unknown error')));
            return;
          }
          resolve(json.choices?.[0]?.message?.content?.trim() || '');
        } catch (error) {
          reject(new Error('OpenAI parse error: ' + String(error)));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function generateImage(post: RedditPost): Promise<string> {
  const imagePrompt = await buildImagePrompt(post);

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
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const json = JSON.parse(data) as ImageGenerationResponse;
          if (json.error) {
            reject(new Error('DALL-E: ' + (json.error.message || 'Unknown error')));
            return;
          }
          resolve(json.data?.[0]?.url || '');
        } catch (error) {
          reject(new Error('DALL-E parse error: ' + String(error)));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

export async function transformAll(post: RedditPost): Promise<TransformedContent> {
  const source = [post.title, post.selftext]
    .filter(Boolean)
    .join('\n\n')
    .substring(0, 1500);

  const system = `You are a social media content strategist who repurposes ideas into
platform-native content. You write in first person as a digital entrepreneur.
Never mention Reddit, subreddits, or forums as the source.
${config.CUSTOM_PROMPT ? 'Additional style: ' + config.CUSTOM_PROMPT : ''}`;

  const userBase = `Original content:\n"""\n${source}\n"""`;

  const [threads, instagram, facebook] = await Promise.all([
    chatComplete(system, `${userBase}\n\n${PLATFORM_PROMPTS.threads}`, 200),
    chatComplete(system, `${userBase}\n\n${PLATFORM_PROMPTS.instagram}`, 400),
    chatComplete(system, `${userBase}\n\n${PLATFORM_PROMPTS.facebook}`, 500),
  ]);

  const imageUrl = await generateImage(post);

  return { threads, instagram, facebook, imageUrl };
}
