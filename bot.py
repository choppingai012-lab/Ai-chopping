import os
import re
import urllib.parse
from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup
)
from telegram.ext import (
    ApplicationBuilder,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    CallbackQueryHandler,
    filters
)

# ============ ENV ============
BOT_TOKEN = os.getenv("BOT_TOKEN")
AFFILIATE_TAG = os.getenv("AFFILIATE_TAG")
DEFAULT_MARKET = os.getenv("DEFAULT_MARKET", "US")

if not BOT_TOKEN or not AFFILIATE_TAG:
    raise Exception("Missing environment variables")

# ============ AMAZON ============
AMAZON_MARKETS = {
    "US": "https://www.amazon.com/s?k={query}&tag={tag}",
    "FR": "https://www.amazon.fr/s?k={query}&tag={tag}",
    "AE": "https://www.amazon.ae/s?k={query}&tag={tag}",
}

# ============ TEXTS ============
TEXTS = {
    "en": {
        "start": "🛒 Welcome!\n\n✍️ Send the product name you want to search on Amazon.",
        "choose_market": "🌍 Choose Amazon store:",
        "invalid": "❗ Please type a valid product name.",
        "language": "🌐 Choose your language:"
    },
    "fr": {
        "start": "🛒 Bienvenue !\n\n✍️ Envoyez le nom du produit à rechercher sur Amazon.",
        "choose_market": "🌍 Choisissez le magasin Amazon :",
        "invalid": "❗ Veuillez écrire un nom de produit valide.",
        "language": "🌐 Choisissez votre langue :"
    },
    "ar": {
        "start": "🛒 أهلاً بك!\n\n✍️ أرسل اسم المنتج الذي تريد البحث عنه في أمازون.",
        "choose_market": "🌍 اختر متجر أمازون:",
        "invalid": "❗ الرجاء كتابة اسم منتج صحيح.",
        "language": "🌐 اختر لغتك:"
    }
}

STOP_WORDS = {"buy", "cheap", "best", "price", "amazon"}

# ============ UTILS ============
def clean_query(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    words = [w for w in text.split() if w not in STOP_WORDS]
    return urllib.parse.quote_plus(" ".join(words))


def get_lang(context):
    return context.user_data.get("lang", "en")


def language_keyboard():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🇬🇧 English", callback_data="lang_en")],
        [InlineKeyboardButton("🇫🇷 Français", callback_data="lang_fr")],
        [InlineKeyboardButton("🇸🇦 العربية", callback_data="lang_ar")]
    ])


def amazon_keyboard(query):
    clean = clean_query(query)
    buttons = []
    for code, url in AMAZON_MARKETS.items():
        full = url.format(query=clean, tag=AFFILIATE_TAG)
        buttons.append([InlineKeyboardButton(f"🛒 Amazon {code}", url=full)])
    return InlineKeyboardMarkup(buttons)

# ============ HANDLERS ============
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        TEXTS["en"]["language"],
        reply_markup=language_keyboard()
    )


async def language_select(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    lang = query.data.split("_")[1]
    context.user_data["lang"] = lang

    await query.edit_message_text(TEXTS[lang]["start"])


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    lang = get_lang(context)
    text = update.message.text.strip()

    if len(text) < 3:
        await update.message.reply_text(TEXTS[lang]["invalid"])
        return

    keyboard = amazon_keyboard(text)

    await update.message.reply_text(
        TEXTS[lang]["choose_market"],
        reply_markup=keyboard
    )

# ============ MAIN ============
def main():
    app = ApplicationBuilder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CallbackQueryHandler(language_select, pattern="lang_"))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))

    print("✅ Bot is running...")
    app.run_polling()


if __name__ == "__main__":
    main()
