const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
  registry: path.join(DATA_DIR, 'registry.json'),
  presets: path.join(DATA_DIR, 'presets.json')
};

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_SESSION_COOKIE = 'utm_admin_session';
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 часов
const adminSessions = new Map(); // token -> expiresAt
// По умолчанию включено — сервер должен быть за HTTPS. Для локальной разработки
// по обычному http:// задайте COOKIE_SECURE=false в .env.
const COOKIE_SECURE = process.env.COOKIE_SECURE !== 'false';
const ADMIN_COOKIE_ATTRS = `HttpOnly; Path=/; SameSite=Strict${COOKIE_SECURE ? '; Secure' : ''}`;

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // максимум 5 попыток за окно с одного IP
  message: { error: 'Слишком много попыток входа. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false
});

async function ensureDataFile(file) {
  try {
    await fs.access(file);
  } catch (e) {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(file, '[]', 'utf8');
  }
}

async function readJsonFile(file) {
  await ensureDataFile(file);
  const raw = await fs.readFile(file, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

async function writeJsonFile(file, data) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    cookies[key] = decodeURIComponent(val);
  });
  return cookies;
}

function isValidAdminSession(req) {
  const token = parseCookies(req)[ADMIN_SESSION_COOKIE];
  if (!token) return false;
  const expiresAt = adminSessions.get(token);
  if (!expiresAt || expiresAt < Date.now()) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

function requireAdmin(req, res, next) {
  if (!isValidAdminSession(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

function timingSafeEqualStr(input, expected) {
  // timingSafeEqual требует буферы одинаковой длины и бросает исключение иначе,
  // поэтому нельзя просто сравнить input с expected при разной длине. Вместо
  // этого всегда сравниваем буфер эталонной длины (truncated/padded ввод) —
  // время работы crypto.timingSafeEqual не зависит от длины исходного ввода.
  const expectedBuf = Buffer.from(String(expected), 'utf8');
  const inputBuf = Buffer.from(String(input), 'utf8');
  const paddedInput = Buffer.alloc(expectedBuf.length);
  inputBuf.copy(paddedInput, 0, 0, Math.min(inputBuf.length, expectedBuf.length));
  const contentMatches = crypto.timingSafeEqual(paddedInput, expectedBuf);
  return inputBuf.length === expectedBuf.length && contentMatches;
}

app.get('/api/registry', async (req, res) => {
  res.json(await readJsonFile(FILES.registry));
});

app.post('/api/registry', async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Expected a JSON array' });
  }
  await writeJsonFile(FILES.registry, req.body);
  res.json({ ok: true });
});

app.get('/api/presets', async (req, res) => {
  res.json(await readJsonFile(FILES.presets));
});

app.post('/api/presets', async (req, res) => {
  if (!Array.isArray(req.body)) {
    return res.status(400).json({ error: 'Expected a JSON array' });
  }
  await writeJsonFile(FILES.presets, req.body);
  res.json({ ok: true });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: isValidAdminSession(req) });
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
  if (!ADMIN_PASSWORD) {
    return res.status(503).json({ error: 'ADMIN_PASSWORD не настроен на сервере' });
  }
  const password = req.body && req.body.password;
  if (typeof password !== 'string' || !timingSafeEqualStr(password, ADMIN_PASSWORD)) {
    return res.status(401).json({ error: 'Неверный пароль' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  res.setHeader('Set-Cookie', `${ADMIN_SESSION_COOKIE}=${token}; ${ADMIN_COOKIE_ATTRS}; Max-Age=${ADMIN_SESSION_TTL_MS / 1000}`);
  res.json({ ok: true });
});

app.post('/api/admin/logout', (req, res) => {
  const token = parseCookies(req)[ADMIN_SESSION_COOKIE];
  if (token) adminSessions.delete(token);
  res.setHeader('Set-Cookie', `${ADMIN_SESSION_COOKIE}=; ${ADMIN_COOKIE_ATTRS}; Max-Age=0`);
  res.json({ ok: true });
});

app.delete('/api/admin/registry/:id', requireAdmin, async (req, res) => {
  const registry = await readJsonFile(FILES.registry);
  const next = registry.filter(r => r.id !== req.params.id);
  if (next.length === registry.length) {
    return res.status(404).json({ error: 'Метка не найдена' });
  }
  await writeJsonFile(FILES.registry, next);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`UTM-реестр запущен на порту ${PORT}`);
});
