import 'dotenv/config';
import express from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { ANTHROPIC_API_KEY, APP_PASSWORD, MODEL, PORT } = process.env;

if (!ANTHROPIC_API_KEY || !APP_PASSWORD) {
  console.error(
    'Missing required config. Set ANTHROPIC_API_KEY and APP_PASSWORD in .env (see .env.example).'
  );
  process.exit(1);
}

const PERSONA = readFileSync(join(__dirname, 'persona.md'), 'utf-8');
const model = MODEL || 'claude-sonnet-5';
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

const MAX_HISTORY = 40;
const MAX_FAILED_ATTEMPTS = 10;
const LOCKOUT_MS = 15 * 60 * 1000;

// In-memory per-IP auth attempt tracker. Resets on server restart; fine for a
// single-instance personal app with no database.
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

  if (!token || token !== APP_PASSWORD) {
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
app.use(express.static(join(__dirname, 'public')));

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

  try {
    const response = await anthropic.messages.create({
      model,
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

const port = PORT || 3000;
app.listen(port, () => {
  console.log(`Ade's Assistant running on http://localhost:${port}`);
});
