"use client";

import { useEffect, useRef } from "react";
import ChatMessageItem from "./ChatMessage";
import type { ChatMessage, ChatMessageAction } from "@/types";

interface ChatWindowProps {
  messages: ChatMessage[];
  onActionClick?: (action: ChatMessageAction, message: ChatMessage) => void;
}

export default function ChatWindow({ messages, onActionClick }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Defensive: ältere persistierte Chats können doppelte IDs enthalten.
  const uniqueMessages = Array.from(
    new Map(messages.map((msg) => [msg.id, msg])).values()
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {uniqueMessages.map((msg) => (
        <ChatMessageItem
          key={msg.id}
          message={msg}
          onActionClick={onActionClick}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
