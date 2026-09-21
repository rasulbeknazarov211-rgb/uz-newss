'use strict';
// AI helpers for UZ News admin panel.
// Uses Groq (free tier) via native fetch — no npm packages.
// Set GROQ_API_KEY in the environment. Get a key at https://console.groq.com

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const API_KEY = process.env.GROQ_API_KEY || '';

function isConfigured() {
  return Boolean(API_KEY && API_KEY.trim());
}

async function chat(messages, { temperature = 0.4, maxTokens = 2048, json = false } = {}) {
  if (!isConfigured()) {
    const err = new Error('GROQ_API_KEY o\'rnatilmagan. Terminalda: GROQ_API_KEY=gsk_... npm start');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }

  const body = {
    model: MODEL,
    messages,
    temperature,
    max_tokens: maxTokens
  };
  if (json) body.response_format = { type: 'json_object' };

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY.trim()}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j.error?.message || JSON.stringify(j);
    } catch {
      detail = await res.text();
    }
    const err = new Error(detail || `Groq xatosi: ${res.status}`);
    err.status = res.status === 429 ? 429 : 502;
    throw err;
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('AI javob bermadi');
  return text.trim();
}

/**
 * actions:
 *  - improve_title   { text }
 *  - summarize       { text }          → short excerpt
 *  - expand          { text }          → longer article body
 *  - translate_ru    { title, excerpt, content }
 *  - generate_full   { topic, category? } → full article JSON
 *  - rewrite         { text, style? }
 */
async function assist(action, payload = {}) {
  const system = `Sen professional o'zbek jurnalistisan. Javoblarni faqat o'zbek tilida (lotin yozuvida) ber, agar aniq so'ralmasa. Qisqa, aniq va faktlarga asoslangan yoz.`;

  switch (action) {
    case 'improve_title': {
      const text = String(payload.text || '').trim();
      if (!text) throw new Error('Matn kerak');
      const out = await chat([
        { role: 'system', content: system },
        { role: 'user', content: `Quyidagi yangilik sarlavhasini qiziqarliroq, qisqa va aniq qilib qayta yoz. Faqat yangi sarlavhani qaytar, hech narsa qo'shma:\n\n${text}` }
      ], { temperature: 0.5, maxTokens: 120 });
      return { title: out.replace(/^["«]|["»]$/g, '').trim() };
    }

    case 'summarize': {
      const text = String(payload.text || '').trim();
      if (!text) throw new Error('Matn kerak');
      const out = await chat([
        { role: 'system', content: system },
        { role: 'user', content: `Quyidagi matndan 1–3 jumlalik qisqa excerpt (qisqa matn) yoz. Faqat excerptni qaytar:\n\n${text}` }
      ], { temperature: 0.3, maxTokens: 300 });
      return { excerpt: out };
    }

    case 'expand': {
      const text = String(payload.text || '').trim();
      if (!text) throw new Error('Matn kerak');
      const out = await chat([
        { role: 'system', content: system },
        { role: 'user', content: `Quyidagi qisqa matn yoki g'oyani to'liq yangilik matniga aylantir (3–6 paragraf). Faqat matnni qaytar, sarlavha yozma:\n\n${text}` }
      ], { temperature: 0.5, maxTokens: 1500 });
      return { content: out };
    }

    case 'translate_ru': {
      const title = String(payload.title || '').trim();
      const excerpt = String(payload.excerpt || '').trim();
      const content = String(payload.content || '').trim();
      if (!title && !excerpt && !content) throw new Error('Tarjima qilish uchun matn kerak');

      const out = await chat([
        { role: 'system', content: 'Ты профессиональный переводчик. Переведи текст новости с узбекского на русский. Ответь строго JSON.' },
        {
          role: 'user',
          content: `Переведи на русский и верни JSON:
{
  "title_ru": "...",
  "excerpt_ru": "...",
  "content_ru": "..."
}

Узбекский текст:
title: ${title}
excerpt: ${excerpt}
content: ${content}`
        }
      ], { temperature: 0.2, maxTokens: 3000, json: true });

      let parsed;
      try {
        parsed = JSON.parse(out);
      } catch {
        throw new Error('AI JSON qaytara olmadi');
      }
      return {
        title_ru: String(parsed.title_ru || '').trim(),
        excerpt_ru: String(parsed.excerpt_ru || '').trim(),
        content_ru: String(parsed.content_ru || '').trim()
      };
    }

    case 'generate_full': {
      const topic = String(payload.topic || '').trim();
      if (!topic) throw new Error('Mavzu kerak');
      const category = String(payload.category || '').trim();

      const out = await chat([
        { role: 'system', content: system + ' Javobni faqat JSON formatida ber.' },
        {
          role: 'user',
          content: `Mavzu bo'yicha to'liq yangilik yoz. ${category ? `Bo'lim: ${category}.` : ''}

Qaytar JSON:
{
  "title": "sarlavha",
  "excerpt": "1-3 jumla qisqa matn",
  "content": "to'liq matn (3-6 paragraf)",
  "category": "siyosat|iqtisod|sport|texnologiya|madaniyat|dunyo|jamiyat"
}

Mavzu: ${topic}`
        }
      ], { temperature: 0.55, maxTokens: 2000, json: true });

      let parsed;
      try {
        parsed = JSON.parse(out);
      } catch {
        throw new Error('AI JSON qaytara olmadi');
      }
      return {
        title: String(parsed.title || '').trim(),
        excerpt: String(parsed.excerpt || '').trim(),
        content: String(parsed.content || '').trim(),
        category: String(parsed.category || category || 'jamiyat').trim()
      };
    }

    case 'rewrite': {
      const text = String(payload.text || '').trim();
      if (!text) throw new Error('Matn kerak');
      const style = String(payload.style || 'neutral').trim();
      const out = await chat([
        { role: 'system', content: system },
        { role: 'user', content: `Quyidagi matnni qayta yoz (${style} uslubda). Faqat yangi matnni qaytar:\n\n${text}` }
      ], { temperature: 0.5, maxTokens: 2000 });
      return { text: out };
    }

    default:
      throw new Error('Noma\'lum AI amali: ' + action);
  }
}

module.exports = { isConfigured, assist, chat, MODEL };
