"use client";

import { Bot, CheckCircle2, RefreshCw, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import type { ChatMessage as ChatMessageType, ChatMessageAction } from "@/types";

interface ChatMessageProps {
  message: ChatMessageType;
  onActionClick?: (action: ChatMessageAction, message: ChatMessageType) => void;
}

function formatTime(d: Date): string {
  const dateObj = d instanceof Date ? d : new Date(d);
  return dateObj.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export default function ChatMessage({ message, onActionClick }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar — coach only */}
      {!isUser && (
        <div className="w-8 h-8 rounded-2xl bg-linear-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
          <Bot size={16} className="text-cyan-400" />
        </div>
      )}

      <div className={cn("flex flex-col gap-1.5 max-w-[88%] sm:max-w-[80%]", isUser && "items-end")}>
        <div
          className={cn(
            "px-4 sm:px-5 py-3.5 rounded-3xl text-sm leading-relaxed shadow-md",
            isUser
              ? "bg-blue-600 text-white rounded-tr-sm"
              : "bg-zinc-900 border border-zinc-800/90 text-zinc-100 rounded-tl-sm"
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
                  className="max-w-[220px] max-h-[300px] rounded-xl object-cover border border-white/10 shadow-md"
                />
              ))}
            </div>
          )}

          {isUser ? (
            <p className="whitespace-pre-wrap">{message.text}</p>
          ) : (
            <div className="space-y-2">
              <ReactMarkdown
                components={{
                  p: ({ node, ...props }) => <p className="mb-2 last:mb-0 leading-relaxed text-zinc-200" {...props} />,
                  ul: ({ node, ...props }) => <ul className="list-disc pl-4 mb-2 space-y-1 text-zinc-300" {...props} />,
                  ol: ({ node, ...props }) => <ol className="list-decimal pl-4 mb-2 space-y-1 text-zinc-300" {...props} />,
                  li: ({ node, ...props }) => <li className="leading-snug" {...props} />,
                  strong: ({ node, ...props }) => <strong className="font-bold text-cyan-300" {...props} />,
                  em: ({ node, ...props }) => <em className="italic text-zinc-300" {...props} />,
                  h1: ({ node, ...props }) => <h1 className="text-base sm:text-lg font-black mt-3 mb-2 text-white" {...props} />,
                  h2: ({ node, ...props }) => <h2 className="text-sm sm:text-base font-bold mt-3 mb-1.5 text-cyan-400" {...props} />,
                  h3: ({ node, ...props }) => <h3 className="text-xs sm:text-sm font-bold mt-2 mb-1 text-zinc-200" {...props} />,
                  hr: ({ node, ...props }) => <hr className="my-3 border-zinc-800" {...props} />,
                  table: ({ node, ...props }) => (
                    <div className="overflow-x-auto my-3 rounded-2xl border border-zinc-800 bg-zinc-950/70">
                      <table className="w-full text-xs text-left border-collapse" {...props} />
                    </div>
                  ),
                  thead: ({ node, ...props }) => <thead className="bg-zinc-900 text-zinc-200 font-bold border-b border-zinc-800" {...props} />,
                  th: ({ node, ...props }) => <th className="p-2.5 font-extrabold uppercase text-[10px] tracking-wider text-zinc-400" {...props} />,
                  tbody: ({ node, ...props }) => <tbody className="divide-y divide-zinc-800/60" {...props} />,
                  tr: ({ node, ...props }) => <tr className="hover:bg-zinc-900/40 transition-colors" {...props} />,
                  td: ({ node, ...props }) => <td className="p-2.5 text-zinc-300 leading-tight" {...props} />,
                }}
              >
                {message.text}
              </ReactMarkdown>

              {/* Interactive Action Buttons */}
              {message.actions && message.actions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-zinc-800">
                  {message.actions.map((act) => (
                    <button
                      key={act.id}
                      onClick={() => onActionClick?.(act, message)}
                      className={cn(
                        "px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95 flex items-center gap-1.5",
                        act.variant === "primary"
                          ? "bg-cyan-500 hover:bg-cyan-400 text-zinc-950 shadow-cyan-500/20"
                          : act.variant === "danger"
                          ? "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30"
                          : "bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/80"
                      )}
                    >
                      {act.variant === "primary" ? (
                        <CheckCircle2 size={13} />
                      ) : act.actionType === "recalculate_metrics" ? (
                        <RefreshCw size={13} />
                      ) : (
                        <Sparkles size={13} />
                      )}
                      <span>{act.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Message meta & clean model badge */}
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] text-zinc-500 font-medium">
            {formatTime(message.timestamp)}
          </span>
          {message.model && !isUser && (
            <span className="text-[9px] px-2 py-0.5 rounded-md bg-zinc-900 text-cyan-400/90 border border-zinc-800 font-mono">
              {message.model}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
