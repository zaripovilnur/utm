// Конфигурация PM2. Переменные окружения (в т.ч. ADMIN_PASSWORD) задаются
// в файле .env рядом с этим файлом — он не коммитится в git (см. .env.example).
const fs = require('fs');
const path = require('path');

function loadDotEnv(file) {
  const result = {};
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return result; // .env может отсутствовать — это нормально
  }
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  });
  return result;
}

const dotEnv = loadDotEnv(path.join(__dirname, '.env'));

module.exports = {
  apps: [
    {
      name: 'utm-registry',
      script: 'server.js',
      env: {
        PORT: process.env.PORT || dotEnv.PORT || 3000,
        ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || dotEnv.ADMIN_PASSWORD || ''
      }
    }
  ]
};
