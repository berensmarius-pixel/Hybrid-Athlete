"use client";

import { SendHorizontal, Image as ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef } from "react";

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  onSend: () => void;
  disabled?: boolean;
  images: string[];
  onAddImage: (base64: string) => void;
  onRemoveImage: (index: number) => void;
}

export default function ChatInput({ value, onChange, onSend, disabled, images, onAddImage, onRemoveImage }: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
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
    <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-950 shrink-0 space-y-3">
      {/* Image Previews */}
      {images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {images.map((img, idx) => (
            <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-zinc-700 shrink-0 group">
              <img src={img} alt="preview" className="w-full h-full object-cover" />
              <button
                onClick={() => onRemoveImage(idx)}
                className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X size={12} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end bg-zinc-800 rounded-2xl px-3 py-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImageChange}
          accept="image/*"
          multiple
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="p-2 text-zinc-400 hover:text-zinc-200 transition-colors mb-0.5"
          title="Bild hinzufügen"
        >
          <ImageIcon size={19} />
        </button>

        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Frag deinen Hybrid Coach…"
          rows={1}
          disabled={disabled}
          className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-600 resize-none focus:outline-none max-h-32 py-1 leading-relaxed"
          style={{ fieldSizing: "content" } as React.CSSProperties}
        />
        <button
          onClick={onSend}
          disabled={(!value.trim() && images.length === 0) || disabled}
          className={cn(
            "p-2 rounded-xl transition-all mb-0.5 shrink-0",
            (value.trim() || images.length > 0) && !disabled
              ? "bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700"
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
