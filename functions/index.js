const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const express = require('express');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const Anthropic = require('@anthropic-ai/sdk');

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const APP_PASSWORD = defineSecret('APP_PASSWORD');

const PERSONA = readFileSync(join(__dirname, 'persona.md'), 'utf-8');
const MODEL = process.env.MODEL || 'claude-sonnet-5';

const MAX_HISTORY = 40;
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

// In-memory per-instance auth attempt tracker. Cloud Functions can run
// multiple instances concurrently, so this is a best-effort limiter, not a
// hard guarantee - fine for a personal single-user app.
const attempts = new Map();

function getAttempt(ip) {
  return attempts.get(ip) || { count: 0, lockedUntil: 0 };
}

function requireAuth(req, res, next) {
  const ip = req.ip;
  const record = getAttempt(ip);
  const now = Date.now();

  if (record.lockedUntil > now) {
    const retryAfterSec = Math.ceil((record.lockedUntil - now) / 1000);
    res.set('Retry-After', String(retryAfterSec));
    return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
  }

  const authHeader = req.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || token !== APP_PASSWORD.value()) {
    record.count += 1;
    if (record.count >= MAX_FAILED_ATTEMPTS) {
      record.lockedUntil = now + LOCKOUT_MS;
      record.count = 0;
    }
    attempts.set(ip, record);
    return res.status(401).json({ error: 'Invalid password.' });
  }

  attempts.delete(ip);
  next();
}

const app = express();
app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/auth', requireAuth, (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/chat', requireAuth, async (req, res) => {
  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const trimmed = messages.slice(-MAX_HISTORY);
  const systemPrompt = `${PERSONA}\n\nCurrent date/time: ${new Date().toString()}`;
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: trimmed,
    });

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    res.json({ reply: text });
  } catch (err) {
    console.error('Anthropic API error:', err.message);
    res.status(502).json({ error: err.message || 'Failed to reach Claude API' });
  }
});

exports.api = onRequest({ secrets: [ANTHROPIC_API_KEY, APP_PASSWORD] }, app);
