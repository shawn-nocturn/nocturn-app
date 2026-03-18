"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "@/app/actions/events";
import { parseEventDetails, type ParsedEventDetails } from "@/app/actions/ai-parse-event";
import { useTypewriter } from "@/lib/typewriter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  ArrowLeft,
  Send,
  Check,
  Calendar,
  MapPin,
  Clock,
  Ticket,
  Loader2,
} from "lucide-react";
import Link from "next/link";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

interface Message {
  role: "ai" | "user";
  content: string;
  type?: "text" | "summary";
}

function AiBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nocturn/20 animate-pulse-glow">
        <Sparkles className="h-4 w-4 text-nocturn" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-3 max-w-[85%]">
        {children}
      </div>
    </div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end animate-fade-in-up">
      <div className="rounded-2xl rounded-tr-sm bg-nocturn/10 border border-nocturn/20 px-4 py-3 max-w-[85%]">
        {children}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nocturn/20 animate-pulse-glow">
        <Sparkles className="h-4 w-4 text-nocturn" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-card border border-border px-5 py-4">
        <div className="flex gap-1.5">
          <div className="thinking-dot" />
          <div className="thinking-dot" />
          <div className="thinking-dot" />
        </div>
      </div>
    </div>
  );
}

function EventSummaryCard({ data }: { data: ParsedEventDetails }) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 animate-scale-in">
      <h3 className="font-bold text-lg">{data.title || "Untitled Event"}</h3>
      {data.description && <p className="text-sm text-muted-foreground">{data.description}</p>}
      <div className="grid gap-2 text-sm">
        {data.date && (
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 text-nocturn" />
            <span>{data.date}{data.startTime && ` · ${data.startTime}`}{data.endTime && ` - ${data.endTime}`}</span>
          </div>
        )}
        {data.doorsOpen && (
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-nocturn" />
            <span>Doors at {data.doorsOpen}</span>
          </div>
        )}
        {(data.venueName || data.venueCity) && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-nocturn" />
            <span>{[data.venueName, data.venueCity].filter(Boolean).join(", ")}{data.venueCapacity ? ` · ${data.venueCapacity} cap` : ""}</span>
          </div>
        )}
        {data.ticketPrice !== undefined && (
          <div className="flex items-center gap-2">
            <Ticket className="h-3.5 w-3.5 text-nocturn" />
            <span>{data.ticketTierName || "General Admission"} · ${data.ticketPrice}{data.ticketQuantity ? ` × ${data.ticketQuantity}` : ""}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function getMissingFields(data: ParsedEventDetails): string[] {
  const missing: string[] = [];
  if (!data.title) missing.push("event name");
  if (!data.date) missing.push("date");
  if (!data.startTime) missing.push("start time");
  if (!data.venueName) missing.push("venue");
  if (!data.venueCity) missing.push("city");
  return missing;
}

export default function NewEventPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [eventData, setEventData] = useState<ParsedEventDetails>({});
  const [thinking, setThinking] = useState(false);
  const [phase, setPhase] = useState<"chat" | "review" | "creating" | "done">("chat");
  const [error, setError] = useState<string | null>(null);
  const [introShown, setIntroShown] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  // Show intro message
  useEffect(() => {
    if (!introShown) {
      setIntroShown(true);
      setMessages([{
        role: "ai",
        content: "Tell me about your event — name, date, venue, whatever you've got. I'll figure out the rest. 🎵",
      }]);
      setTimeout(() => inputRef.current?.focus(), 500);
    }
  }, [introShown]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || thinking) return;

    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setThinking(true);

    // If no title yet, use the first message to extract/infer a title
    const currentData = { ...eventData };
    if (!currentData.title && !userMsg.match(/\d/)) {
      // If message looks like just a name (no numbers), treat it as title
      currentData.title = userMsg;
    }

    const result = await parseEventDetails(userMsg, currentData);
    setEventData(result.parsed);
    setThinking(false);

    // Check what's still needed
    const missing = getMissingFields(result.parsed);

    if (missing.length === 0) {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: result.reply + " Here's what I've got:" },
      ]);
      setPhase("review");
    } else {
      setMessages((prev) => [
        ...prev,
        { role: "ai", content: result.reply },
      ]);
    }

    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function handleCreate() {
    setPhase("creating");
    setError(null);

    const d = eventData;
    const validTiers = d.ticketPrice !== undefined
      ? [{ name: d.ticketTierName || "General Admission", price: d.ticketPrice, quantity: d.ticketQuantity || 100 }]
      : [];

    const result = await createEvent({
      title: d.title || "Untitled Event",
      slug: slugify(d.title || "untitled-event"),
      description: d.description || null,
      date: d.date || new Date().toISOString().split("T")[0],
      doorsOpen: d.doorsOpen || null,
      startTime: d.startTime || "22:00",
      endTime: d.endTime || null,
      venueName: d.venueName || "TBA",
      venueAddress: d.venueAddress || "",
      venueCity: d.venueCity || "",
      venueCapacity: d.venueCapacity || 0,
      tiers: validTiers,
    });

    if (result.error) {
      setError(result.error);
      setPhase("review");
      return;
    }

    setPhase("done");
    setTimeout(() => {
      router.push(`/dashboard/events/${result.eventId}`);
      router.refresh();
    }, 2000);
  }

  return (
    <div className="mx-auto max-w-lg flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4">
        <Link href="/dashboard/events">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="text-lg font-bold">New Event</h1>
        <div className="ml-auto flex items-center gap-1.5 rounded-full bg-nocturn/10 px-3 py-1">
          <Sparkles className="h-3 w-3 text-nocturn" />
          <span className="text-xs font-medium text-nocturn">AI</span>
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((msg, i) => (
          msg.role === "ai" ? (
            <AiBubble key={i}>
              <p className="text-sm leading-relaxed">{msg.content}</p>
            </AiBubble>
          ) : (
            <UserBubble key={i}>
              <p className="text-sm">{msg.content}</p>
            </UserBubble>
          )
        ))}

        {thinking && <ThinkingDots />}

        {/* Review card */}
        {phase === "review" && (
          <div className="space-y-3">
            <AiBubble>
              <p className="text-sm">Here&apos;s what I&apos;ve got — ready to launch?</p>
            </AiBubble>
            <div className="ml-11">
              <EventSummaryCard data={eventData} />
              {error && (
                <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500 mt-3">{error}</div>
              )}
              <div className="flex gap-2 mt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setPhase("chat");
                    setMessages((prev) => [...prev, {
                      role: "ai",
                      content: "No problem — what do you want to change?",
                    }]);
                  }}
                >
                  Change something
                </Button>
                <Button
                  onClick={handleCreate}
                  className="flex-1 bg-nocturn hover:bg-nocturn-light"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Launch Event
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Creating */}
        {phase === "creating" && <ThinkingDots />}

        {/* Done */}
        {phase === "done" && (
          <div className="flex flex-col items-center gap-4 py-12 animate-scale-in">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 animate-pulse-glow" style={{ animationDuration: "1.5s" }}>
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold">{eventData.title} is live!</h2>
              <p className="text-sm text-muted-foreground mt-1">Taking you to the event dashboard...</p>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input bar */}
      {(phase === "chat") && (
        <form onSubmit={handleSend} className="flex gap-2 border-t pt-3 pb-2">
          <Input
            ref={inputRef}
            placeholder='e.g. "April 25, 10pm at The Warehouse, Toronto"'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 text-sm"
            disabled={thinking}
          />
          <Button
            type="submit"
            size="icon"
            className="bg-nocturn hover:bg-nocturn-light shrink-0"
            disabled={!input.trim() || thinking}
          >
            {thinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      )}
    </div>
  );
}
