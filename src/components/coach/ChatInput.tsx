"use client";

import { SendHorizontal, Image as ImageIcon, X, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef, useState } from "react";

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  disabled?: boolean;
  images: string[];
  onAddImage: (base64: string) => void;
  onRemoveImage: (index: number) => void;
}

// ─── Web Speech API Typen (noch nicht in allen lib.dom-Varianten) ─────────────

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: { length: number; [index: number]: SpeechRecognitionResultLike };
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function ChatInput({
  value,
  onChange,
  onSend,
  disabled,
  images,
  onAddImage,
  onRemoveImage,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const isVoiceSupported = getSpeechRecognition() !== null;

  function stopListening() {
    setIsListening(false);
    try {
      recognitionRef.current?.stop();
    } catch { /* schon gestoppt */ }
    recognitionRef.current = null;
  }

  async function toggleListening() {
    if (isListening) {
      stopListening();
      return;
    }

    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setVoiceError("Spracherkennung wird von diesem Browser nicht unterstützt.");
      setTimeout(() => setVoiceError(null), 4000);
      return;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setVoiceError(
        "Spracherkennung benötigt eine sichere Verbindung (https:// oder localhost). " +
        "Aktueller Zugriff ist unsicher – öffne die App über localhost oder HTTPS."
      );
      setTimeout(() => setVoiceError(null), 8000);
      return;
    }

    // Explizit Mikrofon-Berechtigung anfordern – löst den echten Browser-Prompt
    // aus und unterscheidet sauber zwischen "verweigert" und anderen Fehlern.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      setVoiceError(
        name === "NotAllowedError"
          ? "Mikrofon-Zugriff verweigert. Erlaube das Mikrofon für diese Seite " +
            "(Schloss-Symbol in der Adressleiste) und prüfe Windows: " +
            "Einstellungen → Datenschutz → Mikrofon."
          : "Kein Mikrofon gefunden oder belegt. Prüfe, ob ein Eingabegerät ausgewählt ist."
      );
      setTimeout(() => setVoiceError(null), 8000);
      return;
    }

    setVoiceError(null);
    const recognition = new Ctor();
    recognition.lang = "de-DE";
    recognition.continuous = true;
    recognition.interimResults = true;

    // Textstand beim Start einfrieren – Diktat wird daran angehängt.
    baseTextRef.current = value.trim();

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      const base = baseTextRef.current ? `${baseTextRef.current} ` : "";
      // Letztes Ergebnis ist immer Interim/Final der aktuellen Äußerung
      onChange(`${base}${transcript.trim()}`);
      // Finales Ergebnis als neuen Basisstand sichern
      const last = event.results[event.results.length - 1];
      if (last?.isFinal) {
        baseTextRef.current = `${base}${transcript.trim()}`;
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      recognitionRef.current = null;
      const error = event.error;
      if (error === "not-allowed" || error === "service-not-allowed") {
        setVoiceError(
          "Mikrofon für diese Seite blockiert. Erlaube es über das Schloss-Symbol " +
          "in der Adressleiste und lade die Seite neu."
        );
      } else if (error === "no-speech") {
        setVoiceError("Keine Sprache erkannt. Bitte erneut sprechen.");
      } else if (error === "network") {
        setVoiceError("Spracherkennung benötigt eine Internetverbindung.");
      } else if (error !== "aborted") {
        setVoiceError(`Spracherkennung fehlgeschlagen (${error || "unbekannter Fehler"}).`);
      }
      setTimeout(() => setVoiceError(null), 6000);
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsListening(true);
    } catch {
      setVoiceError("Spracherkennung konnte nicht gestartet werden.");
      setTimeout(() => setVoiceError(null), 4000);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isListening) stopListening();
      if (value.trim() || images.length > 0) onSend();
    }
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onloadend = () => {
        onAddImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="px-4 pt-2.5 pb-20 md:pb-3 border-t border-zinc-800 bg-zinc-950 shrink-0 space-y-3">
      {/* Image Previews */}
      {images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {images.map((img, idx) => (
            <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-zinc-700 shrink-0 group">
              <img src={img} alt="preview" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => onRemoveImage(idx)}
                aria-label="Bild entfernen"
                className="absolute top-0 right-0 bg-black/70 rounded-bl-lg p-1.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
              >
                <X size={13} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hinweis bei Sprachfehlern */}
      {voiceError && (
        <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-semibold">
          {voiceError}
        </div>
      )}

      <div className={cn(
        "flex gap-2 items-end bg-zinc-800/90 rounded-2xl px-3 py-2 border transition-colors",
        isListening ? "border-rose-500/70 shadow-md shadow-rose-500/10" : "border-zinc-700/60 focus-within:border-blue-500/60"
      )}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageChange}
          accept="image/*"
          multiple
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="p-2 text-zinc-400 hover:text-zinc-200 transition-colors mb-0.5 cursor-pointer"
          title="Bild hinzufügen"
        >
          <ImageIcon size={19} />
        </button>

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isListening
              ? "Ich höre zu… (sprich einfach)"
              : "Frag deinen Hybrid Coach…"
          }
          rows={1}
          disabled={disabled}
          className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none max-h-32 py-1 leading-relaxed"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />

        {/* Spracheingabe */}
        {isVoiceSupported && (
          <button
            type="button"
            onClick={toggleListening}
            disabled={disabled}
            title={isListening ? "Diktat beenden" : "Spracheingabe starten"}
            aria-label={isListening ? "Diktat beenden" : "Spracheingabe starten"}
            className={cn(
              "relative p-2 rounded-xl transition-all mb-0.5 shrink-0 cursor-pointer active:scale-95",
              isListening
                ? "bg-rose-500 text-white hover:bg-rose-400"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/60"
            )}
          >
            <Mic size={17} />
            {isListening && (
              <>
                <span className="absolute inset-0 rounded-xl border-2 border-rose-400 animate-ping pointer-events-none" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            if (isListening) stopListening();
            onSend();
          }}
          disabled={(!value.trim() && images.length === 0) || disabled}
          className={cn(
            "p-2 rounded-xl transition-all mb-0.5 shrink-0 cursor-pointer active:scale-95",
            (value.trim() || images.length > 0) && !disabled
              ? "bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700 shadow-md shadow-blue-500/20"
              : "bg-zinc-700 text-zinc-600 cursor-not-allowed"
          )}
          aria-label="Nachricht senden"
        >
          <SendHorizontal size={17} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
