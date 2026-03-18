"use server";

import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

interface CreateEventInput {
  title: string;
  slug: string;
  description: string | null;
  date: string;
  doorsOpen: string | null;
  startTime: string;
  endTime: string | null;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venueCapacity: number;
  tiers: { name: string; price: number; quantity: number }[];
}

export async function createEvent(input: CreateEventInput) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be logged in." };
  }

  const admin = createAdminClient();

  // Get user's first collective
  const { data: memberships } = await admin
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user.id)
    .limit(1);

  if (!memberships || memberships.length === 0) {
    return { error: "No collective found. Please create one first." };
  }

  const collectiveId = memberships[0].collective_id;

  // Create or find venue
  let venueId: string;
  const { data: existingVenue } = await admin
    .from("venues")
    .select("id")
    .eq("name", input.venueName)
    .eq("city", input.venueCity)
    .limit(1)
    .maybeSingle();

  if (existingVenue) {
    venueId = existingVenue.id;
  } else {
    const { data: newVenue, error: venueError } = await admin
      .from("venues")
      .insert({
        name: input.venueName,
        slug: slugify(input.venueName),
        address: input.venueAddress,
        city: input.venueCity,
        capacity: input.venueCapacity,
      })
      .select("id")
      .single();

    if (venueError) {
      return { error: `Venue error: ${venueError.message}` };
    }
    venueId = newVenue.id;
  }

  // Build timestamps from date + time inputs
  const startsAt = new Date(`${input.date}T${input.startTime}:00`).toISOString();
  const endsAt = input.endTime
    ? new Date(`${input.date}T${input.endTime}:00`).toISOString()
    : null;
  const doorsAt = input.doorsOpen
    ? new Date(`${input.date}T${input.doorsOpen}:00`).toISOString()
    : null;

  // Create event
  const { data: event, error: eventError } = await admin
    .from("events")
    .insert({
      collective_id: collectiveId,
      venue_id: venueId,
      title: input.title,
      slug: input.slug,
      description: input.description,
      starts_at: startsAt,
      ends_at: endsAt,
      doors_at: doorsAt,
      status: "draft",
    })
    .select("id")
    .single();

  if (eventError) {
    return { error: `Event error: ${eventError.message}` };
  }

  // Create ticket tiers
  if (input.tiers.length > 0) {
    const { error: tierError } = await admin.from("ticket_tiers").insert(
      input.tiers.map((t, i) => ({
        event_id: event.id,
        name: t.name,
        price: t.price,
        capacity: t.quantity,
        sort_order: i,
      }))
    );

    if (tierError) {
      console.error("Ticket tier error:", tierError);
    }
  }

  return { error: null, eventId: event.id };
}
