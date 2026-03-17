"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import Link from "next/link";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

interface TicketTierInput {
  name: string;
  price: string;
  quantity: string;
}

export default function NewEventPage() {
  const router = useRouter();
  const supabase = createClient();

  // Step tracking
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Event details (step 1)
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState("");
  const [doorsOpen, setDoorsOpen] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // Venue (step 2)
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [venueCity, setVenueCity] = useState("");
  const [venueCapacity, setVenueCapacity] = useState("");

  // Tickets (step 3)
  const [tiers, setTiers] = useState<TicketTierInput[]>([
    { name: "General Admission", price: "20", quantity: "100" },
  ]);

  function handleTitleChange(value: string) {
    setTitle(value);
    setSlug(slugify(value));
  }

  function addTier() {
    setTiers([...tiers, { name: "", price: "", quantity: "" }]);
  }

  function removeTier(index: number) {
    setTiers(tiers.filter((_, i) => i !== index));
  }

  function updateTier(index: number, field: keyof TicketTierInput, value: string) {
    const updated = [...tiers];
    updated[index] = { ...updated[index], [field]: value };
    setTiers(updated);
  }

  async function handleCreate() {
    setError(null);
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You must be logged in.");
      setLoading(false);
      return;
    }

    // Get user's first collective
    const { data: memberships } = await supabase
      .from("collective_members")
      .select("collective_id")
      .eq("user_id", user.id)
      .limit(1);

    if (!memberships || memberships.length === 0) {
      setError("No collective found. Please create one first.");
      setLoading(false);
      return;
    }

    const collectiveId = memberships[0].collective_id;

    // Create or find venue
    let venueId: string;
    const { data: existingVenue } = await supabase
      .from("venues")
      .select("id")
      .eq("name", venueName)
      .eq("city", venueCity)
      .limit(1)
      .maybeSingle();

    if (existingVenue) {
      venueId = existingVenue.id;
    } else {
      const { data: newVenue, error: venueError } = await supabase
        .from("venues")
        .insert({
          name: venueName,
          address: venueAddress,
          city: venueCity,
          capacity: parseInt(venueCapacity) || 0,
        })
        .select("id")
        .single();

      if (venueError) {
        setError(`Venue error: ${venueError.message}`);
        setLoading(false);
        return;
      }
      venueId = newVenue.id;
    }

    // Create event
    const { data: event, error: eventError } = await supabase
      .from("events")
      .insert({
        collective_id: collectiveId,
        venue_id: venueId,
        title,
        slug,
        description: description || null,
        date,
        doors_open: doorsOpen || null,
        start_time: startTime,
        end_time: endTime || null,
        status: "draft",
        capacity: parseInt(venueCapacity) || 0,
      })
      .select("id")
      .single();

    if (eventError) {
      setError(`Event error: ${eventError.message}`);
      setLoading(false);
      return;
    }

    // Create ticket tiers
    const validTiers = tiers.filter((t) => t.name && t.price && t.quantity);
    if (validTiers.length > 0) {
      const { error: tierError } = await supabase.from("ticket_tiers").insert(
        validTiers.map((t, i) => ({
          event_id: event.id,
          name: t.name,
          price: parseFloat(t.price) * 100, // Store in cents
          quantity: parseInt(t.quantity),
          sold: 0,
          sort_order: i,
        }))
      );

      if (tierError) {
        console.error("Ticket tier error:", tierError);
        // Non-blocking — event already created
      }
    }

    router.push("/dashboard/events");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/events">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Create Event</h1>
          <p className="text-sm text-muted-foreground">Step {step} of 3</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              s <= step ? "bg-nocturn" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step 1: Event Details */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Event Details</CardTitle>
            <CardDescription>The basics — what, when, and where</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Event title</Label>
              <Input
                id="title"
                placeholder="e.g. Midnight Sessions Vol. 3"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                URL: /e/{slug || "your-event"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Input
                id="description"
                placeholder="Describe the vibe, the music, the experience..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doorsOpen">Doors open</Label>
                <Input
                  id="doorsOpen"
                  type="time"
                  value={doorsOpen}
                  onChange={(e) => setDoorsOpen(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startTime">Start time</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime">End time (optional)</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => setStep(2)}
                className="bg-nocturn hover:bg-nocturn-light"
                disabled={!title || !date || !startTime}
              >
                Next: Venue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Venue */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Venue</CardTitle>
            <CardDescription>Where is this event happening?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="venueName">Venue name</Label>
              <Input
                id="venueName"
                placeholder="e.g. The Warehouse"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venueAddress">Address</Label>
              <Input
                id="venueAddress"
                placeholder="123 Queen St W"
                value={venueAddress}
                onChange={(e) => setVenueAddress(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="venueCity">City</Label>
                <Input
                  id="venueCity"
                  placeholder="Toronto"
                  value={venueCity}
                  onChange={(e) => setVenueCity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="venueCapacity">Capacity</Label>
                <Input
                  id="venueCapacity"
                  type="number"
                  placeholder="300"
                  value={venueCapacity}
                  onChange={(e) => setVenueCapacity(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                className="bg-nocturn hover:bg-nocturn-light"
                disabled={!venueName || !venueAddress || !venueCity}
              >
                Next: Tickets
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Tickets */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Ticket Tiers</CardTitle>
            <CardDescription>Set up pricing for your event</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tiers.map((tier, i) => (
              <div key={i} className="flex items-end gap-3">
                <div className="flex-1 space-y-2">
                  <Label>Tier name</Label>
                  <Input
                    placeholder="e.g. Early Bird"
                    value={tier.name}
                    onChange={(e) => updateTier(i, "name", e.target.value)}
                  />
                </div>
                <div className="w-24 space-y-2">
                  <Label>Price ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="20"
                    value={tier.price}
                    onChange={(e) => updateTier(i, "price", e.target.value)}
                  />
                </div>
                <div className="w-24 space-y-2">
                  <Label>Qty</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="100"
                    value={tier.quantity}
                    onChange={(e) => updateTier(i, "quantity", e.target.value)}
                  />
                </div>
                {tiers.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeTier(i)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" onClick={addTier} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Add Tier
            </Button>
            <div className="flex justify-between pt-4">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                onClick={handleCreate}
                className="bg-nocturn hover:bg-nocturn-light"
                disabled={loading || tiers.every((t) => !t.name)}
              >
                {loading ? "Creating..." : "Create Event"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
