'use strict';
// .env faylini o'qiydi (agar mavjud bo'lsa). Serverda (Render/Railway) o'zgaruvchilar panelda beriladi.
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', '.env');
try {
  if (fs.existsSync(file) && typeof process.loadEnvFile === 'function') process.loadEnvFile(file);
} catch (e) {
  console.error('  .env o\'qilmadi:', e.message);
}
