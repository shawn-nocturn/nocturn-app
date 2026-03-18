"use client";

import { useState } from "react";
import { Sparkles, X } from "lucide-react";

export function AskNocturnButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-nocturn text-white shadow-lg animate-slide-in-right delay-1000 hover:bg-nocturn-light transition-colors animate-pulse-glow"
        aria-label="Ask Nocturn AI"
      >
        <Sparkles className="h-6 w-6" />
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-card border border-border p-6 animate-scale-in">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-nocturn/10 animate-pulse-glow">
                <Sparkles className="h-7 w-7 text-nocturn" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Nocturn AI</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Your AI assistant for nightlife ops is coming soon.
                  Ask anything — from marketing copy to settlement questions.
                </p>
              </div>
              <div className="w-full rounded-xl bg-nocturn/5 border border-nocturn/20 p-3">
                <p className="text-xs text-muted-foreground">
                  🎯 Generate event marketing<br />
                  💰 Analyze ticket sales<br />
                  📊 Settlement breakdowns<br />
                  🎧 Artist recommendations
                </p>
              </div>
              <p className="text-xs text-nocturn font-medium">Launching soon</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
