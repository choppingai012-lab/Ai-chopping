require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const sharp = require('sharp');
const OpenAI = require('openai');
const fs = require('fs');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const AFFILIATE_TAG = 'chop07c-20';
const BASE_URL = process.env.BASE_URL;
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

// ---------- language ----------
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
  wait: { ar: '⏳ جاري التحليل...', en: '⏳ Analyzing...', fr: '⏳ Analyse...' },
  buy: { ar: '🛒 شراء من أمازون', en: '🛒 Buy on Amazon', fr: '🛒 Acheter sur Amazon' }
};

// ---------- helpers ----------
async function downloadImage(ctx) {
  const photo = ctx.message.photo.pop();
  const file = await ctx.telegram.getFile(photo.file_id);
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(res.data);
}

async function compress(buf) {
  return sharp(buf).resize({ width: 1024 }).jpeg({ quality: 70 }).toBuffer();
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

// ---------- bot ----------
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
    ctx.reply(
      `📦 ${name}`,
      Markup.inlineKeyboard([
        Markup.button.url(TXT.buy[l], url)
      ])
    );
  } catch (e) {
    console.error(e);
    ctx.reply('❌ Error');
  }
});

// ---------- redirect ----------
app.get('/go', (req, res) => {
  const q = req.query.q || '';
  const link = `https://www.amazon.com/s?k=${encodeURIComponent(q)}&tag=${AFFILIATE_TAG}`;
  res.redirect(link);
});

// ---------- webhook ----------
app.post('/webhook', (req, res) => {
  bot.handleUpdate(req.body, res);
  res.send('OK');
});

app.get('/', (_, res) => res.send('OK'));

app.listen(PORT, async () => {
  await bot.telegram.setWebhook(`${BASE_URL}/webhook`);
  console.log('Bot running');
});
