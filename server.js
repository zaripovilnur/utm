const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
  registry: path.join(DATA_DIR, 'registry.json'),
  presets: path.join(DATA_DIR, 'presets.json')
};

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

app.get('/api/registry', async (req, res) => {
  res.json(await readJsonFile(FILES.registry));
});

app.post('/api/registry', async (req, res) => {
  await writeJsonFile(FILES.registry, req.body);
  res.json({ ok: true });
});

app.get('/api/presets', async (req, res) => {
  res.json(await readJsonFile(FILES.presets));
});

app.post('/api/presets', async (req, res) => {
  await writeJsonFile(FILES.presets, req.body);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`UTM-реестр запущен на порту ${PORT}`);
});
