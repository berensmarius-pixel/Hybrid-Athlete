import type { ChatMessage } from "@/types";

function msg(
  id: string,
  role: ChatMessage["role"],
  text: string,
  offsetMinutes: number
): ChatMessage {
  const d = new Date();
  d.setMinutes(d.getMinutes() - offsetMinutes);
  return { id, role, text, timestamp: d };
}

export const MOCK_MESSAGES: ChatMessage[] = [
  msg(
    "m1",
    "coach",
    "Hallo! Ich bin dein KI Hybrid Coach. Wie kann ich dir heute helfen? Du kannst mich alles über Training, Erholung oder Ernährung fragen.",
    12
  ),
  msg(
    "m2",
    "user",
    "Wie sollte ich meine Trainingsintensität diese Woche anpassen?",
    10
  ),
  msg(
    "m3",
    "coach",
    "Basierend auf deinem aktuellen Plan empfehle ich, die Radintervalle am Dienstag bei 95–100 % FTP zu halten – nicht höher. Du hast am Montag bereits eine intensive Krafteinheit. Achte auf RPE ≤ 7 bei den Intervallen.",
    9
  ),
  msg("m4", "user", "Was esse ich am besten nach der langen Ausfahrt am Samstag?", 3),
  msg(
    "m5",
    "coach",
    "Nach langen Ausdauereinheiten (>2h) sind Kohlenhydrate + Protein entscheidend. Ziel: 1–1,2 g Kohlenhydrate/kg Körpergewicht + 20–30 g Protein innerhalb von 30–45 Minuten. Zum Beispiel: Reis mit Hähnchen und Gemüse, oder ein Protein-Shake mit Banane und Haferflocken.",
    1
  ),
];
