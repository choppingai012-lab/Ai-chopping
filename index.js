require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const sharp = require('sharp');
const OpenAI = require('openai');

const app = express();
app.use(express.json());

/* ================= ENV ================= */
const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const BASE_URL = process.env.BASE_URL || '';
const AFFILIATE_TAG = 'chop07c-20';
const DEV_SHOW_STACK = process.env.DEV_SHOW_STACK === '1' || process.env.DEV_SHOW_STACK === 'true';

/* ================= SAFETY ================= */
if (!TELEGRAM_TOKEN) {
  console.error('❌ TELEGRAM_TOKEN missing');
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY missing');
  process.exit(1);
}

/* ================= INIT ================= */
const bot = new Telegraf(TELEGRAM_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/* ================= LANGUAGE ================= */
function lang(code) {
  if (!code) return 'en';
  if (code.startsWith('ar')) return 'ar';
  if (code.startsWith('fr')) return 'fr';
  return 'en';
}

const TXT = {
  welcome: {
    ar: '👋 مرحباً\n📸 أرسل صورة منتج وسأعطيك اسمه مع زر شراء من أمازون',
    en: '👋 Welcome\n📸 Send a product image to identify it',
    fr: '👋 Bienvenue\n📸 Envoyez une image du produit'
  },
  wait: {
    ar: '⏳ جاري التحليل...',
    en: '⏳ Analyzing...',
    fr: '⏳ Analyse...'
  },
  buy: {
    ar: '🛒 شراء من أمازون',
    en: '🛒 Buy on Amazon',
    fr: '🛒 Acheter sur Amazon'
  },
  error: {
    ar: '❌ حدث خطأ',
    en: '❌ Error occurred',
    fr: '❌ Erreur'
  }
};

/* ================= HELPERS ================= */
async function downloadImage(ctx) {
  const photo = ctx.message.photo.at(-1);
  const file = await ctx.telegram.getFile(photo.file_id);
  const url = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${file.file_path}`;
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(res.data);
}

async function compress(buf) {
  return sharp(buf)
    .resize({ width: 1024 })
    .jpeg({ quality: 70 })
    .toBuffer();
}

async function identify(buffer) {
  const b64 = buffer.toString('base64');
  // NOTE: This uses the chat completions call shape used earlier in the project.
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'What product is in this image? Reply with short product name only.' },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } }
      ]
    }],
    max_tokens: 50
  });
  return res.choices[0].message.content.trim();
}

/* ================= ERROR REPORTING HELPER ================= */
function shortString(str, max = 500) {
  if (!str) return '';
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}

async function handleProcessingError(ctx, err) {
  // Log detailed error to server logs for debugging
  console.error('--- Processing error (full) ---');
  console.error(err && err.stack ? err.stack : err);
  console.error('--------------------------------');

  // Build a concise message for the user
  let parts = [];

  if (err && err.message) parts.push(err.message);

  // If axios / HTTP error, include status
  if (err && err.response && err.response.status) {
    parts.push(`status: ${err.response.status}`);
  }

  // If there's a body/content, include a short excerpt
  if (err && err.response && err.response.data) {
    try {
      const body = typeof err.response.data === 'string'
        ? err.response.data
        : JSON.stringify(err.response.data);
      parts.push(`response: ${shortString(body, 400)}`);
    } catch (e) {
      // ignore
    }
  }

  // If the error has a code (e.g., ENOTFOUND, ECONNRESET), include it
  if (err && err.code) {
    parts.push(`code: ${err.code}`);
  }

  const userLang = ctx && ctx.from ? lang(ctx.from.language_code) : 'en';
  const header = userLang === 'ar' ? '❌ حدث خطأ:' : (userLang === 'fr' ? '❌ Erreur :' : '❌ Error:');

  // Compose a safe reply (no super-long secrets)
  const shortMsg = parts.length ? shortString(parts.join(' | '), 400) : (userLang === 'ar' ? 'حدث خطأ غير معروف' : (userLang === 'fr' ? 'Erreur inconnue' : 'Unknown error'));

  // If dev mode, include a little more info
  let reply = `${header} ${shortMsg}`;

  // Avoid leaking long sensitive text unless explicitly allowed by DEV_SHOW_STACK
  if (DEV_SHOW_STACK && err && err.stack) {
    reply += `\n\nStack:\n${shortString(err.stack, 1500)}`;
  } else {
    reply += `\n\n(ملاحظة: لمزيد من التفاصيل راجع سجلات الخادم - server logs)`;
  }

  try {
    await ctx.reply(reply);
  } catch (e) {
    // If replying fails (rare), at least log it
    console.error('Failed to send error message to user:', e && e.stack ? e.stack : e);
  }
}

/* ================= BOT ================= */
bot.start(ctx => {
  const l = lang(ctx.from.language_code);
  ctx.reply(TXT.welcome[l]);
});

bot.on('photo', async ctx => {
  const l = lang(ctx.from.language_code);
  await ctx.reply(TXT.wait[l]);

  try {
    // 1) download
    let raw;
    try {
      raw = await downloadImage(ctx);
    } catch (err) {
      // likely Telegram file download problem
      return await handleProcessingError(ctx, new Error(`Failed to download image from Telegram: ${err.message || err.code || 'unknown'}`));
    }

    // 2) compress
    let img;
    try {
      img = await compress(raw);
    } catch (err) {
      return await handleProcessingError(ctx, new Error(`Failed to process image (sharp): ${err.message || err.code || 'unknown'}`));
    }

    // 3) identify
    let name;
    try {
      name = await identify(img);
      if (!name || !name.trim()) {
        throw new Error('Model returned empty name');
      }
    } catch (err) {
      // if OpenAI returned an HTTP error, attach more detail
      if (err && err.response) {
        // Construct a helpful error object
        const httpErr = new Error('OpenAI API error');
        httpErr.response = {
          status: err.response.status,
          data: err.response.data
        };
        return await handleProcessingError(ctx, httpErr);
      } else {
        return await handleProcessingError(ctx, err);
      }
    }

    // 4) reply with button
    const url = `${BASE_URL}/go?q=${encodeURIComponent(name)}`;

    await ctx.reply(
      `📦 ${name}`,
      Markup.inlineKeyboard([
        Markup.button.url(TXT.buy[l], url)
      ])
    );
  } catch (err) {
    // final catch: unexpected
    await handleProcessingError(ctx, err);
  }
});

/* ================= ROUTES ================= */
app.get('/', (_, res) => res.send('OK'));

app.get('/go', (req, res) => {
  const q = req.query.q || '';
  const link = `https://www.amazon.com/s?k=${encodeURIComponent(q)}&tag=${AFFILIATE_TAG}`;
  res.redirect(link);
});

/* ================= START ================= */
app.listen(PORT, () => {
  console.log('🚀 Server running on port', PORT);
});

/* ================= SAFE WEBHOOK ================= */
try {
  if (BASE_URL && BASE_URL.startsWith('https://')) {
    bot.telegram.setWebhook(`${BASE_URL}/webhook`)
      .then(() => console.log('🔗 Webhook set successfully'))
      .catch(err => console.error('❌ Webhook error:', err.message));
  } else {
    console.log('⚠️ BASE_URL invalid or empty, skipping webhook setup');
  }
} catch (err) {
  console.error('❌ Unexpected error in webhook setup:', err.message);
}

app.post('/webhook', (req, res) => {
  bot.handleUpdate(req.body);
  res.send('OK');
});
