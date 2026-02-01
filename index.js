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

/* ================= BOT ================= */
bot.start(ctx => {
  const l = lang(ctx.from.language_code);
  ctx.reply(TXT.welcome[l]);
});

bot.on('photo', async ctx => {
  const l = lang(ctx.from.language_code);
  await ctx.reply(TXT.wait[l]);

  try {
    const raw = await downloadImage(ctx);
    const img = await compress(raw);
    const name = await identify(img);

    const url = `${BASE_URL}/go?q=${encodeURIComponent(name)}`;

    await ctx.reply(
      `📦 ${name}`,
      Markup.inlineKeyboard([
        Markup.button.url(TXT.buy[l], url)
      ])
    );
  } catch (err) {
    console.error(err);
    ctx.reply(TXT.error[l]);
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
