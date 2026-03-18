"use server";

export interface ParsedEventDetails {
  title?: string;
  date?: string; // YYYY-MM-DD
  startTime?: string; // HH:MM (24h)
  endTime?: string;
  doorsOpen?: string;
  venueName?: string;
  venueAddress?: string;
  venueCity?: string;
  venueCapacity?: number;
  description?: string;
  ticketPrice?: number;
  ticketQuantity?: number;
  ticketTierName?: string;
}

// Parse natural language into structured event data using Claude API
export async function parseEventDetails(
  message: string,
  existingData: Partial<ParsedEventDetails> = {}
): Promise<{ parsed: ParsedEventDetails; reply: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  // Always try local parsing first (fast, no API needed)
  const localParsed = localParse(message, existingData);

  if (!apiKey) {
    return {
      parsed: { ...existingData, ...localParsed },
      reply: generateReply({ ...existingData, ...localParsed }),
    };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `You are an event detail parser for a nightlife platform. Extract structured event information from the user's message.

Current known details: ${JSON.stringify(existingData)}

User message: "${message}"

Return ONLY valid JSON with these fields (omit fields not mentioned):
- title (string): event name
- date (string): YYYY-MM-DD format
- startTime (string): HH:MM in 24h format
- endTime (string): HH:MM in 24h format
- doorsOpen (string): HH:MM in 24h format
- venueName (string): venue name
- venueAddress (string): street address
- venueCity (string): city name
- venueCapacity (number): venue capacity
- description (string): event description
- ticketPrice (number): price in dollars
- ticketQuantity (number): number of tickets
- ticketTierName (string): tier name like "General Admission"
- reply (string): A SHORT, casual 1-sentence response acknowledging what you understood. Sound like a cool nightlife AI assistant, not corporate.

Parse relative dates. "Next Saturday" from today (2026-03-18) would be 2026-03-21. "10pm" = "22:00". "Doors at 9" = doorsOpen "21:00".
If they say a city name, put it in venueCity. If they mention capacity like "300 cap" put it in venueCapacity.`,
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`API ${response.status}`);

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      const reply = result.reply || generateReply({ ...existingData, ...result });
      delete result.reply;

      return {
        parsed: { ...existingData, ...stripEmpty(result) },
        reply,
      };
    }
  } catch {
    // Fall through to local parsing
  }

  return {
    parsed: { ...existingData, ...localParsed },
    reply: generateReply({ ...existingData, ...localParsed }),
  };
}

function stripEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== null && value !== undefined && value !== "") {
      result[key] = value;
    }
  }
  return result;
}

// Fast local parser for common patterns (no API needed)
function localParse(message: string, existing: Partial<ParsedEventDetails>): Partial<ParsedEventDetails> {
  const result: Partial<ParsedEventDetails> = {};
  const lower = message.toLowerCase();

  // Date patterns
  const dateMatch = message.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) result.date = dateMatch[1];

  // "April 25" or "Apr 25"
  const monthDayMatch = lower.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})/);
  if (monthDayMatch) {
    const months: Record<string, string> = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
    };
    const month = months[monthDayMatch[1].slice(0, 3)];
    const day = monthDayMatch[2].padStart(2, "0");
    result.date = `2026-${month}-${day}`;
  }

  // Time patterns: "10pm", "10:30pm", "22:00"
  const timeMatches = lower.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/g);
  const times: string[] = [];
  for (const match of timeMatches) {
    let hour = parseInt(match[1]);
    const min = match[2] || "00";
    if (match[3] === "pm" && hour < 12) hour += 12;
    if (match[3] === "am" && hour === 12) hour = 0;
    times.push(`${hour.toString().padStart(2, "0")}:${min}`);
  }

  // "doors at X" pattern
  const doorsMatch = lower.match(/doors?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (doorsMatch) {
    let hour = parseInt(doorsMatch[1]);
    const min = doorsMatch[2] || "00";
    if (doorsMatch[3] === "pm" && hour < 12) hour += 12;
    if (!doorsMatch[3] && hour < 12) hour += 12; // assume PM for nightlife
    result.doorsOpen = `${hour.toString().padStart(2, "0")}:${min}`;
  }

  if (times.length >= 1 && !result.doorsOpen) result.startTime = times[0];
  if (times.length >= 2) result.endTime = times[1];
  if (times.length >= 1 && result.doorsOpen) result.startTime = times[0];

  // "at [Venue]" or "@ [Venue]"
  const venueMatch = message.match(/(?:at|@)\s+([A-Z][A-Za-z\s'&]+?)(?:\s*[,.]|\s+(?:in|on|at|\d))/);
  if (venueMatch) result.venueName = venueMatch[1].trim();

  // City: "in Toronto" or "Toronto"
  const cityMatch = message.match(/\bin\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (cityMatch) result.venueCity = cityMatch[1];

  // Capacity: "300 cap" or "capacity 300"
  const capMatch = lower.match(/(\d+)\s*cap(?:acity)?|cap(?:acity)?\s*(\d+)/);
  if (capMatch) result.venueCapacity = parseInt(capMatch[1] || capMatch[2]);

  // Price: "$20" or "20 dollars"
  const priceMatch = lower.match(/\$(\d+(?:\.\d{2})?)|(\d+)\s*(?:dollars|bucks)/);
  if (priceMatch) result.ticketPrice = parseFloat(priceMatch[1] || priceMatch[2]);

  // Quantity: "100 tickets" or "capacity 100"
  const qtyMatch = lower.match(/(\d+)\s*tickets/);
  if (qtyMatch) result.ticketQuantity = parseInt(qtyMatch[1]);

  return result;
}

function generateReply(data: Partial<ParsedEventDetails>): string {
  const parts: string[] = [];

  if (data.date) parts.push("date");
  if (data.startTime) parts.push("time");
  if (data.venueName) parts.push("venue");
  if (data.venueCity) parts.push("city");
  if (data.ticketPrice) parts.push("pricing");

  if (parts.length === 0) {
    return "Got it. What else can you tell me about this event?";
  }

  const missing: string[] = [];
  if (!data.date) missing.push("date");
  if (!data.startTime) missing.push("start time");
  if (!data.venueName) missing.push("venue");
  if (!data.venueCity) missing.push("city");

  if (missing.length === 0) {
    return "Looking good! Ready to set up tickets?";
  }

  return `Got the ${parts.join(", ")}. Still need: ${missing.join(", ")}.`;
}
