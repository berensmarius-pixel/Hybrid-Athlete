// ─── Push-Dispatch für Post-Workout-Debriefs ─────────────────────────────────
//
// Best-Effort-Versand über konfigurierte Kanäle:
//   - Telegram Bot API   (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)
//   - Pushover           (PUSHOVER_TOKEN + PUSHOVER_USER_KEY)
// Kein Kanal konfiguriert oder Versandfehler = kein Fehler des Pipelines-Laufs;
// der Debrief bleibt zusätzlich im App-Feed (Dashboard) persistiert.

export interface DispatchResult {
  telegram: boolean | "skipped";
  pushover: boolean | "skipped";
}

const DISPATCH_TIMEOUT_MS = 10_000;

async function postJson(url: string, body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
  });
  return res.ok;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

async function sendTelegram(title: string, message: string): Promise<boolean | "skipped"> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token || !chatId) return "skipped";

  try {
    return await postJson(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text: `*${title}*\n\n${truncate(message, 3500)}`,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error("[pushDispatch] Telegram fehlgeschlagen:", err);
    return false;
  }
}

async function sendPushover(title: string, message: string): Promise<boolean | "skipped"> {
  const token = process.env.PUSHOVER_TOKEN?.trim();
  const user = process.env.PUSHOVER_USER_KEY?.trim();
  if (!token || !user) return "skipped";

  try {
    return await postJson("https://api.pushover.net/1/messages.json", {
      token,
      user,
      title: truncate(title, 250),
      message: truncate(message, 1000),
      priority: 0,
    });
  } catch (err) {
    console.error("[pushDispatch] Pushover fehlgeschlagen:", err);
    return false;
  }
}

/** Versendet an alle konfigurierten Kanäle parallel. */
export async function dispatchPushNotification(
  title: string,
  message: string
): Promise<DispatchResult> {
  const [telegram, pushover] = await Promise.all([
    sendTelegram(title, message),
    sendPushover(title, message),
  ]);
  return { telegram, pushover };
}
