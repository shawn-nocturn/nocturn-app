"use server";

export async function generateOnboardingSuggestions(name: string, city: string) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return {
      bio: `${name} — curating unforgettable nights in ${city}.`,
      instagramCaption: `Something new is coming to ${city}'s nightlife. ${name} has arrived. Stay tuned. 🌙\n\n#nightlife #${city.toLowerCase().replace(/\s+/g, "")} #${name.toLowerCase().replace(/\s+/g, "")}`,
      welcomeMessage: `Welcome to Nocturn, ${name}! Let's make some noise in ${city}. 🔊`,
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
            content: `You are Nocturn, an AI assistant for nightlife event promoters. A new collective just signed up.

Collective name: "${name}"
City: ${city}

Generate the following in JSON format:
1. "bio" - A punchy 1-2 sentence bio for this nightlife collective (max 120 chars). Make it sound cool and authentic to underground nightlife culture.
2. "instagramCaption" - A launch announcement Instagram caption (2-3 lines, include 3-5 relevant hashtags for the city's nightlife scene). Use a moon emoji 🌙 somewhere.
3. "welcomeMessage" - A short hype welcome message (1 sentence) from Nocturn to the collective founder. Keep it energetic.

Return ONLY valid JSON with keys: bio, instagramCaption, welcomeMessage`,
          },
        ],
      }),
    });

    if (!response.ok) throw new Error(`API ${response.status}`);

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        bio: parsed.bio || `${name} — curating unforgettable nights in ${city}.`,
        instagramCaption: parsed.instagramCaption || `${name} has arrived. 🌙`,
        welcomeMessage: parsed.welcomeMessage || `Welcome, ${name}!`,
      };
    }
  } catch {
    // Fall through to fallback
  }

  return {
    bio: `${name} — curating unforgettable nights in ${city}.`,
    instagramCaption: `Something new is coming to ${city}'s nightlife. ${name} has arrived. Stay tuned. 🌙\n\n#nightlife #${city.toLowerCase().replace(/\s+/g, "")} #${name.toLowerCase().replace(/\s+/g, "")}`,
    welcomeMessage: `Welcome to Nocturn, ${name}! Let's make some noise in ${city}. 🔊`,
  };
}
