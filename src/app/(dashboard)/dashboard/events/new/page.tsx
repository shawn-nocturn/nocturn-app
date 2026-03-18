"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "@/app/actions/events";
import { useTypewriter } from "@/lib/typewriter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Check,
  Calendar,
  MapPin,
  Ticket,
  Clock,
} from "lucide-react";
import Link from "next/link";

type Step = "intro" | "name" | "datetime" | "venue" | "tickets" | "review" | "creating" | "done";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function AiBubble({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-start gap-3 animate-fade-in-up ${className}`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-nocturn/20 animate-pulse-glow">
        <Sparkles className="h-4 w-4 text-nocturn" />
      </div>
      <div className="rounded-2xl rounded-tl-sm bg-card border border-border px-4 py-3 max-w-md">
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

function TypewriterBubble({ text, onComplete }: { text: string; onComplete?: () => void }) {
  const { displayedText, isComplete } = useTypewriter(text, 20);
  useEffect(() => { if (isComplete && onComplete) onComplete(); }, [isComplete, onComplete]);
  return (
    <AiBubble>
      <p className="text-sm leading-relaxed">
        {displayedText}
        {!isComplete && <span className="inline-block w-0.5 h-4 bg-nocturn ml-0.5 animate-pulse" />}
      </p>
    </AiBubble>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end animate-fade-in-up">
      <div className="rounded-2xl rounded-tr-sm bg-nocturn/10 border border-nocturn/20 px-4 py-3 max-w-md">
        {children}
      </div>
    </div>
  );
}

interface TicketTierInput {
  name: string;
  price: string;
  quantity: string;
}

export default function NewEventPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("intro");
  const [introDone, setIntroDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Event data
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [doorsOpen, setDoorsOpen] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [venueCity, setVenueCity] = useState("");
  const [venueCapacity, setVenueCapacity] = useState("");
  const [tiers, setTiers] = useState<TicketTierInput[]>([
    { name: "General Admission", price: "20", quantity: "100" },
  ]);

  // Auto advance from intro
  useEffect(() => {
    if (step === "intro" && introDone) {
      const timer = setTimeout(() => setStep("name"), 1200);
      return () => clearTimeout(timer);
    }
  }, [step, introDone]);

  function handleTitleChange(value: string) {
    setTitle(value);
    setSlug(slugify(value));
  }

  function updateTier(index: number, field: keyof TicketTierInput, value: string) {
    const updated = [...tiers];
    updated[index] = { ...updated[index], [field]: value };
    setTiers(updated);
  }

  async function handleCreate() {
    setStep("creating");
    setError(null);

    const validTiers = tiers
      .filter((t) => t.name && t.price && t.quantity)
      .map((t) => ({
        name: t.name,
        price: parseFloat(t.price),
        quantity: parseInt(t.quantity),
      }));

    const result = await createEvent({
      title, slug,
      description: description || null,
      date,
      doorsOpen: doorsOpen || null,
      startTime,
      endTime: endTime || null,
      venueName, venueAddress, venueCity,
      venueCapacity: parseInt(venueCapacity) || 0,
      tiers: validTiers,
    });

    if (result.error) {
      setError(result.error);
      setStep("review");
      return;
    }

    setStep("done");
    setTimeout(() => {
      router.push(`/dashboard/events/${result.eventId}`);
      router.refresh();
    }, 2000);
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/events">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <h1 className="text-lg font-bold">New Event</h1>
      </div>

      {/* Chat flow */}
      <div className="space-y-4 min-h-[500px]">

        {/* Intro */}
        {step === "intro" && (
          <TypewriterBubble
            text="Let's create your next event. I'll walk you through it step by step — just answer a few questions. 🎵"
            onComplete={() => setIntroDone(true)}
          />
        )}

        {/* Name */}
        {step === "name" && (
          <>
            <AiBubble>
              <p className="text-sm">What&apos;s the event called?</p>
            </AiBubble>
            <div className="ml-11 animate-fade-in-up delay-200 space-y-3">
              <Input
                placeholder="e.g. Midnight Sessions Vol. 3"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="text-base"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter" && title.trim()) setStep("datetime"); }}
              />
              {slug && (
                <p className="text-xs text-muted-foreground">
                  /e/<span className="text-nocturn">{slug}</span>
                </p>
              )}
              <Input
                placeholder="Describe the vibe... (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="text-sm"
              />
              <Button
                onClick={() => setStep("datetime")}
                disabled={!title.trim()}
                className="bg-nocturn hover:bg-nocturn-light"
                size="sm"
              >
                Continue <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </>
        )}

        {/* Date & Time */}
        {step === "datetime" && (
          <>
            {title && (
              <UserBubble>
                <p className="text-sm font-medium">{title}</p>
                {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
              </UserBubble>
            )}
            <AiBubble>
              <p className="text-sm">
                <Calendar className="inline h-3.5 w-3.5 mr-1 text-nocturn" />
                When is <span className="font-medium text-nocturn">{title}</span> happening?
              </p>
            </AiBubble>
            <div className="ml-11 animate-fade-in-up delay-200 space-y-3">
              <div className="grid gap-3 grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Date</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Doors</Label>
                  <Input type="time" value={doorsOpen} onChange={(e) => setDoorsOpen(e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Start time</Label>
                  <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">End time</Label>
                  <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("name")}>Back</Button>
                <Button
                  onClick={() => setStep("venue")}
                  disabled={!date || !startTime}
                  className="bg-nocturn hover:bg-nocturn-light"
                  size="sm"
                >
                  Continue <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Venue */}
        {step === "venue" && (
          <>
            <UserBubble>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-3.5 w-3.5 text-nocturn" />
                <span>{date} · {doorsOpen && `Doors ${doorsOpen} · `}{startTime}{endTime && ` - ${endTime}`}</span>
              </div>
            </UserBubble>
            <AiBubble>
              <p className="text-sm">
                <MapPin className="inline h-3.5 w-3.5 mr-1 text-nocturn" />
                Where is it going down?
              </p>
            </AiBubble>
            <div className="ml-11 animate-fade-in-up delay-200 space-y-3">
              <Input
                placeholder="Venue name"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                autoFocus
              />
              <Input
                placeholder="Address"
                value={venueAddress}
                onChange={(e) => setVenueAddress(e.target.value)}
              />
              <div className="grid gap-3 grid-cols-2">
                <Input
                  placeholder="City"
                  value={venueCity}
                  onChange={(e) => setVenueCity(e.target.value)}
                />
                <Input
                  type="number"
                  placeholder="Capacity"
                  value={venueCapacity}
                  onChange={(e) => setVenueCapacity(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("datetime")}>Back</Button>
                <Button
                  onClick={() => setStep("tickets")}
                  disabled={!venueName || !venueCity}
                  className="bg-nocturn hover:bg-nocturn-light"
                  size="sm"
                >
                  Continue <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Tickets */}
        {step === "tickets" && (
          <>
            <UserBubble>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-3.5 w-3.5 text-nocturn" />
                <span>{venueName}, {venueCity}</span>
              </div>
            </UserBubble>
            <AiBubble>
              <p className="text-sm">
                <Ticket className="inline h-3.5 w-3.5 mr-1 text-nocturn" />
                Let&apos;s set up tickets. How much and how many?
              </p>
            </AiBubble>
            <div className="ml-11 animate-fade-in-up delay-200 space-y-3">
              {tiers.map((tier, i) => (
                <div key={i} className="flex items-end gap-2 rounded-lg border p-2.5">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Tier</Label>
                    <Input
                      placeholder="e.g. Early Bird"
                      value={tier.name}
                      onChange={(e) => updateTier(i, "name", e.target.value)}
                      className="text-sm h-8"
                    />
                  </div>
                  <div className="w-20 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Price</Label>
                    <Input
                      type="number" min="0" step="0.01"
                      placeholder="$20"
                      value={tier.price}
                      onChange={(e) => updateTier(i, "price", e.target.value)}
                      className="text-sm h-8"
                    />
                  </div>
                  <div className="w-16 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Qty</Label>
                    <Input
                      type="number" min="1"
                      placeholder="100"
                      value={tier.quantity}
                      onChange={(e) => updateTier(i, "quantity", e.target.value)}
                      className="text-sm h-8"
                    />
                  </div>
                  {tiers.length > 1 && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setTiers([...tiers, { name: "", price: "", quantity: "" }])}
                className="text-xs text-nocturn hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add another tier
              </button>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("venue")}>Back</Button>
                <Button
                  onClick={() => setStep("review")}
                  disabled={tiers.every((t) => !t.name)}
                  className="bg-nocturn hover:bg-nocturn-light"
                  size="sm"
                >
                  Review <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Review */}
        {step === "review" && (
          <>
            <AiBubble>
              <p className="text-sm">Here&apos;s the summary. Ready to launch?</p>
            </AiBubble>
            <div className="ml-11 animate-scale-in space-y-3">
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <h3 className="font-bold text-lg">{title}</h3>
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-nocturn" />
                    <span>{date} · {startTime}{endTime && ` - ${endTime}`}</span>
                  </div>
                  {doorsOpen && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-nocturn" />
                      <span>Doors at {doorsOpen}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5 text-nocturn" />
                    <span>{venueName}, {venueCity}{venueCapacity && ` · ${venueCapacity} cap`}</span>
                  </div>
                </div>
                <div className="border-t pt-2 space-y-1">
                  {tiers.filter(t => t.name).map((tier, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{tier.name}</span>
                      <span className="text-nocturn font-medium">
                        {Number(tier.price) === 0 ? "Free" : `$${tier.price}`} × {tier.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500">{error}</div>
              )}

              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setStep("tickets")}>Back</Button>
                <Button
                  onClick={handleCreate}
                  className="flex-1 bg-nocturn hover:bg-nocturn-light py-5"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Launch Event
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Creating */}
        {step === "creating" && <ThinkingDots />}

        {/* Done */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-4 py-12 animate-scale-in">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10 animate-pulse-glow" style={{ animationDuration: "1.5s" }}>
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold">{title} is live!</h2>
              <p className="text-sm text-muted-foreground mt-1">Taking you to the event dashboard...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
