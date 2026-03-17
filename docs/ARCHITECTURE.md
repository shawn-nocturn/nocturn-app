# Nocturn Architecture — Stress-Tested Stack

## Final Recommended Stack

| Layer | Choice | Justification |
|---|---|---|
| **Framework** | Next.js (App Router) | Best AI-assisted dev velocity. Largest ecosystem. |
| **Styling** | Tailwind CSS + shadcn/ui | Claude generates excellent Tailwind. shadcn is source-owned. |
| **Database** | PostgreSQL via Supabase | RLS for multi-tenancy. Realtime for live features. |
| **Auth** | Supabase Auth (Phase 1-2), evaluate Clerk (Phase 3) | Free for MVP. Clerk's org model better at scale. |
| **Backend Logic** | Next.js Server Actions + Route Handlers (sync). Supabase DB Functions (triggers). Trigger.dev (async). | Clear separation of concerns. |
| **AI/Agents** | Direct Claude API with tool use (Phase 1-3). Evaluate LangGraph at Phase 4. | Simpler, more debuggable, fewer dependencies. |
| **Background Jobs** | Trigger.dev | Managed queue + worker. Handles agents, scheduled tasks, payments. |
| **Payments** | Stripe Connect Express | Stripe handles KYC, compliance, payouts. Upgrade to Custom later. |
| **Hosting** | Vercel (Phase 1-2), plan migration to SST/Coolify (Phase 3+) | Zero-config for speed. Migrate when costs exceed $200/mo. |
| **Mobile** | PWA (Phase 1-3), Capacitor or React Native (Phase 4) | Operators use desktop. Consumer mobile is Phase 3-4. |
| **Email** | Resend + React Email | Best DX for transactional email. |
| **File Storage** | Supabase Storage | Integrated with auth/RLS. Avoid Vercel Blob lock-in. |
| **Caching** | Upstash Redis | Serverless Redis. Avoid Vercel KV lock-in. |
| **Monitoring** | Sentry (errors) + Axiom (logs) | Generous free tiers. One-click Vercel integration. |

## Key Changes from Original Roadmap

1. **Dropped LangGraph** — Direct Claude API tool use until Phase 4. Simpler, fewer deps.
2. **Added Trigger.dev** — Background jobs for agents, payment processing, scheduled tasks.
3. **Avoid Vercel-specific services** — Use Supabase Storage and Upstash Redis instead.
4. **Stripe Connect Express first** — Upgrade to Custom when white-labeling needed.

## Build Right from Day 1 (Hard to Change Later)

- Multi-tenancy (RLS policies, `collective_id` on every table)
- Payment split data model
- Auth and role model (owner, manager, staff, artist, consumer)
- Webhook handling (idempotent, logged, retried)
- Database migrations (Supabase CLI, version-controlled)
- URL structure (`/[collective-slug]/events/[event-id]`)

## Fine to Refactor Later

- UI design and component structure
- Agent prompts and tool definitions
- Email templates
- Analytics dashboards
- Caching strategy
- Mobile approach (PWA → Capacitor → React Native)

## Scalability Watchlist

1. **Database query performance** — Index aggressively, partition by date at scale
2. **Supabase Realtime connections** — 500 on Pro, 10K on Team. Be surgical.
3. **Vercel costs** — Have migration plan ready by Phase 3
4. **Stripe Connect at 500+ accounts** — Robust webhook logging, idempotent processing

## Payment Split Architecture

```
Ticket Sale ($100)
├── Platform Fee (Nocturn): 5% → $5
├── Stripe Processing: ~2.9% + $0.30 → $3.20
└── Net to Collective: $91.80
    ├── Venue: 30% → $27.54
    ├── Promoter: 40% → $36.72
    └── Artists (3): 10% each → $9.18 each
```

- Collect full amount to platform account
- Store split config in database
- Process payouts asynchronously via Trigger.dev
- Use Stripe Transfer API on configurable schedule
