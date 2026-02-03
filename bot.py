import re
import urllib.parse
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    ApplicationBuilder,
    MessageHandler,
    CommandHandler,
    ContextTypes,
    filters
)

# ================= CONFIG =================
BOT_TOKEN = "PUT_YOUR_TELEGRAM_BOT_TOKEN_HERE"
AFFILIATE_TAG = "yourtag-20"   # مثال: mybot-20

AMAZON_MARKETS = {
    "🇺🇸 Amazon US": "https://www.amazon.com/s?k={query}&tag={tag}",
    "🇦🇪 Amazon AE": "https://www.amazon.ae/s?k={query}&tag={tag}",
    "🇸🇦 Amazon SA": "https://www.amazon.sa/s?k={query}&tag={tag}",
}

STOP_WORDS = {
    "buy", "cheap", "best", "price", "amazon", "online", "shop"
}
# =========================================


def clean_query(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    words = [w for w in text.split() if w not in STOP_WORDS]
    cleaned = " ".join(words)
    return urllib.parse.quote_plus(cleaned)


def build_keyboard(query: str) -> InlineKeyboardMarkup:
    cleaned = clean_query(query)
    buttons = []

    for name, url in AMAZON_MARKETS.items():
        full_url = url.format(query=cleaned, tag=AFFILIATE_TAG)
        buttons.append([InlineKeyboardButton(name, url=full_url)])

    return InlineKeyboardMarkup(buttons)


# ============== HANDLERS ==================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "🛒 *أهلاً بك!*\n\n"
        "✍️ أرسل *اسم المنتج* الذي تريد شراءه من أمازون.\n"
        "📌 مثال:\n"
        "`wireless earbuds`\n"
        "`iphone 13 case`\n\n"
        "🚀 سأعطيك رابط الشراء مباشرة.",
        parse_mode="Markdown"
    )


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.message.text.strip()

    if len(query) < 3:
        await update.message.reply_text("❗ اكتب اسم منتج أوضح.")
        return

    keyboard = build_keyboard(query)

    await update.message.reply_text(
        "🔎 *اختر متجر أمازون المناسب لك:*",
        reply_markup=keyboard,
        parse_mode="Markdown"
    )
# =========================================


def main():
    app = ApplicationBuilder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))

    print("✅ Bot is running...")
    app.run_polling()


if __name__ == "__main__":
    main()
