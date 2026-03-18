"use client";

import { useState, useEffect } from "react";
import { Sparkles } from "lucide-react";

const messages = [
  "Nocturn is thinking...",
  "Analyzing your data...",
  "Crunching the numbers...",
  "Almost there...",
];

export function NocturnLoading({ message }: { message?: string }) {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (message) return; // Use fixed message if provided
    const interval = setInterval(() => {
      setMsgIndex((i) => (i + 1) % messages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [message]);

  return (
    <div className="flex flex-col items-center gap-3 py-12">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nocturn/10 animate-pulse-glow">
        <Sparkles className="h-6 w-6 text-nocturn" />
      </div>
      <p className="text-sm text-muted-foreground animate-fade-in-up">
        {message || messages[msgIndex]}
      </p>
    </div>
  );
}
