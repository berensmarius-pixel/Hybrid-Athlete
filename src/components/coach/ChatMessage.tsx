"use client";

import { Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import type { ChatMessage as ChatMessageType } from "@/types";

interface ChatMessageProps {
  message: ChatMessageType;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2.5", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar — coach only */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5">
          <Bot size={15} className="text-blue-400" />
        </div>
      )}

      <div className={cn("flex flex-col gap-1 max-w-[80%]", isUser && "items-end")}>
        <div
          className={cn(
            "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
            isUser
              ? "bg-blue-600 text-white rounded-tr-sm"
              : "bg-zinc-800 text-zinc-100 rounded-tl-sm"
          )}
        >
          {/* Images Grid */}
          {message.images && message.images.length > 0 && (
            <div className={cn("flex flex-wrap gap-2 mb-3", isUser ? "justify-end" : "justify-start")}>
              {message.images.map((img, idx) => (
                <img 
                  key={idx} 
                  src={img} 
                  alt="attachment" 
                  className="max-w-[200px] max-h-[300px] rounded-lg object-cover border border-white/10" 
                />
              ))}
            </div>
          )}

          {isUser ? (
            message.text
          ) : (
            <ReactMarkdown
              components={{
                p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
                ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                li: ({ node, ...props }) => <li {...props} />,
                strong: ({ node, ...props }) => <strong className="font-bold text-blue-300" {...props} />,
                em: ({ node, ...props }) => <em className="italic text-zinc-300" {...props} />,
                h1: ({ node, ...props }) => <h1 className="text-lg font-bold mt-4 mb-2 text-white" {...props} />,
                h2: ({ node, ...props }) => <h2 className="text-base font-bold mt-3 mb-2 text-blue-400" {...props} />,
                h3: ({ node, ...props }) => <h3 className="font-bold mt-2 mb-1 text-white" {...props} />,
                hr: ({ node, ...props }) => <hr className="my-3 border-zinc-700" {...props} />
              }}
            >
              {message.text}
            </ReactMarkdown>
          )}
        </div>
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] text-zinc-600">
            {formatTime(message.timestamp)}
          </span>
          {message.model && !isUser && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 font-mono">
              {message.model}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
