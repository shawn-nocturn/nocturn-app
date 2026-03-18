import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Clock, MapPin, Users, Ticket } from "lucide-react";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string; eventSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, eventSlug } = await params;
  const supabase = await createClient();

  const { data: collective } = await supabase
    .from("collectives")
    .select("id, name")
    .eq("slug", slug)
    .single();

  if (!collective) return { title: "Event Not Found" };

  const { data: event } = await supabase
    .from("events")
    .select("title, description, cover_image_url")
    .eq("collective_id", collective.id)
    .eq("slug", eventSlug)
    .single();

  if (!event) return { title: "Event Not Found" };

  return {
    title: `${event.title} | ${collective.name} — Nocturn`,
    description: event.description || `Event by ${collective.name}`,
    openGraph: {
      title: event.title,
      description: event.description || `Event by ${collective.name}`,
      ...(event.cover_image_url && { images: [event.cover_image_url] }),
    },
  };
}

export default async function PublicEventPage({ params }: Props) {
  const { slug, eventSlug } = await params;
  const supabase = await createClient();

  // Fetch collective
  const { data: collective } = await supabase
    .from("collectives")
    .select("id, name, slug, logo_url, instagram")
    .eq("slug", slug)
    .single();

  if (!collective) notFound();

  // Fetch event with venue
  const { data: event } = await supabase
    .from("events")
    .select("*, venues(name, address, city, capacity)")
    .eq("collective_id", collective.id)
    .eq("slug", eventSlug)
    .single();

  if (!event || event.status === "draft") notFound();

  // Fetch ticket tiers
  const { data: tiers } = await supabase
    .from("ticket_tiers")
    .select("*")
    .eq("event_id", event.id)
    .order("sort_order");

  // Fetch lineup
  const { data: artists } = await supabase
    .from("event_artists")
    .select("artist_id, set_time, artists(name, genre)")
    .eq("event_id", event.id)
    .eq("status", "confirmed")
    .order("set_time");

  const venue = event.venues as unknown as {
    name: string;
    address: string;
    city: string;
    capacity: number;
  } | null;

  const eventDate = new Date(event.date);
  const isUpcoming = eventDate >= new Date() && event.status === "published";

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative">
        {event.cover_image_url ? (
          <div
            className="h-64 bg-cover bg-center sm:h-80"
            style={{ backgroundImage: `url(${event.cover_image_url})` }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
          </div>
        ) : (
          <div className="h-48 bg-gradient-to-br from-nocturn/30 via-nocturn/10 to-nocturn-glow/10 sm:h-64">
            <div className="absolute inset-0 bg-gradient-to-t from-background to-transparent" />
          </div>
        )}
      </div>

      <div className="mx-auto max-w-2xl px-4 pb-12">
        {/* Event info */}
        <div className="-mt-12 relative space-y-4">
          {/* Collective badge */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-nocturn text-xs font-bold text-white">
              {collective.name.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-muted-foreground">
              {collective.name}
            </span>
          </div>

          <h1 className="text-3xl font-bold sm:text-4xl">{event.title}</h1>

          {/* Date & Time */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-nocturn" />
              {eventDate.toLocaleDateString("en", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-nocturn" />
              {event.doors_open && `Doors ${event.doors_open} · `}
              Start {event.start_time}
              {event.end_time && ` · End ${event.end_time}`}
            </span>
          </div>

          {/* Venue */}
          {venue && (
            <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-nocturn" />
              <div>
                <p className="font-medium text-foreground">{venue.name}</p>
                <p>
                  {venue.address}, {venue.city}
                </p>
              </div>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <p className="text-muted-foreground leading-relaxed">
              {event.description}
            </p>
          )}

          {/* Lineup */}
          {artists && artists.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Lineup
                </h2>
                <div className="space-y-2">
                  {artists.map((a: { artist_id: string; set_time: string | null; artists: unknown }) => {
                    const artist = a.artists as unknown as { name: string; genre: string | null };
                    return (
                      <div
                        key={a.artist_id}
                        className="flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium">{artist.name}</p>
                          {artist.genre && (
                            <p className="text-xs text-muted-foreground">
                              {artist.genre}
                            </p>
                          )}
                        </div>
                        {a.set_time && (
                          <span className="text-xs text-muted-foreground">
                            {a.set_time}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Ticket tiers */}
          {tiers && tiers.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Tickets
              </h2>
              {tiers.map((tier) => {
                const soldOut = tier.sold >= tier.quantity;
                return (
                  <Card
                    key={tier.id}
                    className={soldOut ? "opacity-60" : ""}
                  >
                    <CardContent className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-medium">{tier.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {soldOut
                            ? "Sold out"
                            : `${tier.quantity - tier.sold} remaining`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-nocturn">
                          ${(tier.price / 100).toFixed(2)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* CTA */}
          {isUpcoming && (
            <div className="sticky bottom-4 pt-4">
              <Button
                className="w-full bg-nocturn py-6 text-lg hover:bg-nocturn-light"
                size="lg"
              >
                <Ticket className="mr-2 h-5 w-5" />
                Get Tickets
              </Button>
            </div>
          )}

          {event.status === "cancelled" && (
            <div className="rounded-lg bg-red-500/10 p-4 text-center text-red-500">
              This event has been cancelled.
            </div>
          )}

          {event.status === "completed" && (
            <div className="rounded-lg bg-muted p-4 text-center text-muted-foreground">
              This event has ended. Thanks for coming!
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-border pt-6 text-center">
            <p className="text-xs text-muted-foreground">
              Powered by{" "}
              <span className="font-semibold text-nocturn">nocturn.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
