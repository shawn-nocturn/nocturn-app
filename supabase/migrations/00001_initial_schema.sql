-- ============================================================================
-- NOCTURN DATABASE SCHEMA
-- "The Agentic Work OS for Nightlife"
-- PostgreSQL / Supabase
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. EXTENSIONS & ENUMS
-- ----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Role a user holds within a collective
CREATE TYPE collective_role AS ENUM (
  'admin',
  'promoter',
  'talent_buyer',
  'door_staff',
  'member'
);

-- Status of an artist booking on an event
CREATE TYPE booking_status AS ENUM (
  'pending',
  'confirmed',
  'declined',
  'cancelled'
);

-- Status of an event
CREATE TYPE event_status AS ENUM (
  'draft',
  'published',
  'cancelled',
  'completed'
);

-- Status of a ticket
CREATE TYPE ticket_status AS ENUM (
  'reserved',
  'paid',
  'checked_in',
  'refunded',
  'cancelled'
);

-- Role a collective plays on a co-hosted event
CREATE TYPE event_collective_role AS ENUM (
  'primary',
  'co_host',
  'sponsor'
);

-- Settlement status
CREATE TYPE settlement_status AS ENUM (
  'draft',
  'pending_approval',
  'approved',
  'paid_out',
  'disputed'
);

-- Payout status
CREATE TYPE payout_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

-- Transaction types (append-only ledger)
CREATE TYPE transaction_type AS ENUM (
  'ticket_sale',
  'refund',
  'payout',
  'adjustment',
  'platform_fee',
  'stripe_fee'
);

-- Email campaign status
CREATE TYPE campaign_status AS ENUM (
  'draft',
  'scheduled',
  'sending',
  'sent',
  'cancelled'
);

-- Audit action
CREATE TYPE audit_action AS ENUM (
  'INSERT',
  'UPDATE',
  'DELETE'
);


-- ----------------------------------------------------------------------------
-- 1. USERS
-- ----------------------------------------------------------------------------
-- Central identity table. Extends Supabase auth.users.
-- A user can be a promoter, DJ, door staff, fan, or all of the above.

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Links to Supabase auth.users.id (set on signup trigger)
  auth_id       UUID UNIQUE,
  email         TEXT UNIQUE NOT NULL,
  phone         TEXT,
  full_name     TEXT NOT NULL,
  display_name  TEXT,
  avatar_url    TEXT,
  bio           TEXT,
  -- Stripe Connect account for receiving payouts
  stripe_account_id  TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users (email);
CREATE INDEX idx_users_auth_id ON users (auth_id);
CREATE INDEX idx_users_deleted_at ON users (deleted_at) WHERE deleted_at IS NULL;

-- RLS: Users can read their own row. Collective admins can read members of
-- their collective. Public profile fields (display_name, avatar_url, bio)
-- are readable by anyone.


-- ----------------------------------------------------------------------------
-- 2. COLLECTIVES
-- ----------------------------------------------------------------------------
-- A group that organizes events. The primary multi-tenancy boundary.

CREATE TABLE collectives (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  description   TEXT,
  logo_url      TEXT,
  website       TEXT,
  instagram     TEXT,
  -- Stripe Connect account for the collective treasury
  stripe_account_id  TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_collectives_slug ON collectives (slug);
CREATE INDEX idx_collectives_deleted_at ON collectives (deleted_at) WHERE deleted_at IS NULL;

-- RLS: Public read for name/slug/logo. Write restricted to admins of the collective.


-- ----------------------------------------------------------------------------
-- 3. COLLECTIVE_MEMBERS (join: users M:N collectives)
-- ----------------------------------------------------------------------------

CREATE TABLE collective_members (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collective_id   UUID NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role            collective_role NOT NULL DEFAULT 'member',
  invited_by      UUID REFERENCES users(id),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT uq_collective_member UNIQUE (collective_id, user_id)
);

CREATE INDEX idx_collective_members_collective ON collective_members (collective_id);
CREATE INDEX idx_collective_members_user ON collective_members (user_id);

-- RLS: Members can see other members of their collective.
-- Only admins can INSERT/UPDATE/DELETE memberships.


-- ----------------------------------------------------------------------------
-- 4. VENUES
-- ----------------------------------------------------------------------------

CREATE TABLE venues (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  address       TEXT,
  city          TEXT,
  state         TEXT,
  country       TEXT DEFAULT 'US',
  postal_code   TEXT,
  latitude      NUMERIC(10, 7),
  longitude     NUMERIC(10, 7),
  capacity      INTEGER,
  -- Contact info for the venue
  contact_name  TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website       TEXT,
  instagram     TEXT,
  -- Venue can have its own Stripe account for settlements
  stripe_account_id TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_venues_slug ON venues (slug);
CREATE INDEX idx_venues_city ON venues (city);
CREATE INDEX idx_venues_deleted_at ON venues (deleted_at) WHERE deleted_at IS NULL;

-- RLS: Public read. Write restricted to collective admins who have
-- a relationship with the venue (via events).


-- ----------------------------------------------------------------------------
-- 5. ARTISTS
-- ----------------------------------------------------------------------------
-- Separate from users because not every artist is a platform user,
-- but an artist CAN be linked to a user account.

CREATE TABLE artists (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Optional link to a platform user
  user_id       UUID REFERENCES users(id),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  bio           TEXT,
  photo_url     TEXT,
  genre         TEXT[],
  instagram     TEXT,
  soundcloud    TEXT,
  spotify       TEXT,
  booking_email TEXT,
  -- Default fee for quick booking
  default_fee   NUMERIC(10, 2),
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_artists_slug ON artists (slug);
CREATE INDEX idx_artists_user_id ON artists (user_id);
CREATE INDEX idx_artists_genre ON artists USING GIN (genre);
CREATE INDEX idx_artists_deleted_at ON artists (deleted_at) WHERE deleted_at IS NULL;

-- RLS: Public read. Write by the linked user or collective talent_buyers.


-- ----------------------------------------------------------------------------
-- 6. EVENTS
-- ----------------------------------------------------------------------------

CREATE TABLE events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Primary organizing collective
  collective_id   UUID NOT NULL REFERENCES collectives(id),
  venue_id        UUID REFERENCES venues(id),
  title           TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  flyer_url       TEXT,
  status          event_status NOT NULL DEFAULT 'draft',
  -- Dates
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ,
  doors_at        TIMESTAMPTZ,
  -- Ticketing config
  ticket_price    NUMERIC(10, 2),
  ticket_capacity INTEGER,
  is_free         BOOLEAN DEFAULT FALSE,
  -- Age restriction
  min_age         INTEGER DEFAULT 21,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,

  CONSTRAINT uq_event_slug_collective UNIQUE (collective_id, slug)
);

CREATE INDEX idx_events_collective ON events (collective_id);
CREATE INDEX idx_events_venue ON events (venue_id);
CREATE INDEX idx_events_starts_at ON events (starts_at);
CREATE INDEX idx_events_status ON events (status);
CREATE INDEX idx_events_deleted_at ON events (deleted_at) WHERE deleted_at IS NULL;

-- RLS: Published events are publicly readable.
-- Draft/cancelled only visible to collective members.
-- Write restricted to collective admins/promoters.


-- ----------------------------------------------------------------------------
-- 7. EVENT_COLLECTIVES (join: events M:N collectives for co-hosting)
-- ----------------------------------------------------------------------------

CREATE TABLE event_collectives (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id          UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  collective_id     UUID NOT NULL REFERENCES collectives(id) ON DELETE CASCADE,
  role              event_collective_role NOT NULL DEFAULT 'co_host',
  revenue_share_pct NUMERIC(5, 2) DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_event_collective UNIQUE (event_id, collective_id)
);

CREATE INDEX idx_event_collectives_event ON event_collectives (event_id);
CREATE INDEX idx_event_collectives_collective ON event_collectives (collective_id);

-- Note: The primary collective is stored on events.collective_id.
-- This table is for additional co-hosts/sponsors only.
-- RLS: Readable by members of either collective. Writable by admins of primary collective.


-- ----------------------------------------------------------------------------
-- 8. EVENT_ARTISTS (join: events M:N artists)
-- ----------------------------------------------------------------------------

CREATE TABLE event_artists (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  artist_id     UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  -- Booking details
  fee           NUMERIC(10, 2),
  fee_currency  TEXT DEFAULT 'USD',
  set_time      TIMESTAMPTZ,
  set_duration  INTEGER, -- minutes
  status        booking_status NOT NULL DEFAULT 'pending',
  -- Who booked them
  booked_by     UUID REFERENCES users(id),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_event_artist UNIQUE (event_id, artist_id)
);

CREATE INDEX idx_event_artists_event ON event_artists (event_id);
CREATE INDEX idx_event_artists_artist ON event_artists (artist_id);
CREATE INDEX idx_event_artists_status ON event_artists (status);

-- RLS: Readable by collective members. Fee visible only to admins/talent_buyers.
-- Writable by talent_buyers and admins.


-- ----------------------------------------------------------------------------
-- 9. TICKET TIERS
-- ----------------------------------------------------------------------------
-- Allows multiple ticket types per event (early bird, VIP, general, etc.)

CREATE TABLE ticket_tiers (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,          -- 'Early Bird', 'General', 'VIP'
  price         NUMERIC(10, 2) NOT NULL,
  capacity      INTEGER,
  sort_order    INTEGER DEFAULT 0,
  sales_start   TIMESTAMPTZ,
  sales_end     TIMESTAMPTZ,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_tiers_event ON ticket_tiers (event_id);


-- ----------------------------------------------------------------------------
-- 10. PROMO_CODES (for referral attribution)
-- ----------------------------------------------------------------------------

CREATE TABLE promo_codes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id        UUID REFERENCES events(id) ON DELETE CASCADE,
  -- NULL event_id = valid across all events for this collective
  collective_id   UUID NOT NULL REFERENCES collectives(id),
  code            TEXT NOT NULL,
  -- The promoter this code belongs to
  promoter_id     UUID NOT NULL REFERENCES users(id),
  discount_type   TEXT CHECK (discount_type IN ('percentage', 'fixed', 'none')),
  discount_value  NUMERIC(10, 2) DEFAULT 0,
  max_uses        INTEGER,
  uses_count      INTEGER DEFAULT 0,
  valid_from      TIMESTAMPTZ DEFAULT now(),
  valid_until     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_promo_code UNIQUE (code, collective_id)
);

CREATE INDEX idx_promo_codes_event ON promo_codes (event_id);
CREATE INDEX idx_promo_codes_promoter ON promo_codes (promoter_id);
CREATE INDEX idx_promo_codes_code ON promo_codes (code);

-- RLS: Readable by collective members. Writable by admins/promoters.


-- ----------------------------------------------------------------------------
-- 11. TICKETS
-- ----------------------------------------------------------------------------

CREATE TABLE tickets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id        UUID NOT NULL REFERENCES events(id),
  ticket_tier_id  UUID REFERENCES ticket_tiers(id),
  -- The attendee (must be a user)
  user_id         UUID NOT NULL REFERENCES users(id),
  status          ticket_status NOT NULL DEFAULT 'reserved',
  -- Price paid (snapshot at purchase time)
  price_paid      NUMERIC(10, 2) NOT NULL,
  currency        TEXT DEFAULT 'USD',
  -- Referral attribution
  promo_code_id   UUID REFERENCES promo_codes(id),
  referred_by     UUID REFERENCES users(id), -- the promoter
  -- Stripe payment reference
  stripe_payment_intent_id TEXT,
  -- Check-in tracking
  checked_in_at   TIMESTAMPTZ,
  checked_in_by   UUID REFERENCES users(id), -- door_staff user
  -- QR code / ticket token for scanning
  ticket_token    TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tickets_event ON tickets (event_id);
CREATE INDEX idx_tickets_user ON tickets (user_id);
CREATE INDEX idx_tickets_status ON tickets (status);
CREATE INDEX idx_tickets_referred_by ON tickets (referred_by);
CREATE INDEX idx_tickets_promo_code ON tickets (promo_code_id);
CREATE INDEX idx_tickets_token ON tickets (ticket_token);
CREATE INDEX idx_tickets_event_status ON tickets (event_id, status);

-- RLS: A user can see their own tickets.
-- Collective admins/promoters/door_staff can see tickets for their events.
-- door_staff can UPDATE status to 'checked_in'.


-- ----------------------------------------------------------------------------
-- 12. ATTENDEE_PROFILES (CRM enrichment, 1:1 with users)
-- ----------------------------------------------------------------------------

CREATE TABLE attendee_profiles (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID UNIQUE NOT NULL REFERENCES users(id),
  -- Computed / cached aggregates (updated by triggers or cron)
  total_events        INTEGER DEFAULT 0,
  total_spend         NUMERIC(10, 2) DEFAULT 0,
  first_event_at      TIMESTAMPTZ,
  last_event_at       TIMESTAMPTZ,
  favorite_venue_id   UUID REFERENCES venues(id),
  favorite_genre      TEXT,
  vip_status          BOOLEAN DEFAULT FALSE,
  -- Tags for segmentation
  tags                TEXT[] DEFAULT '{}',
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attendee_profiles_user ON attendee_profiles (user_id);
CREATE INDEX idx_attendee_profiles_tags ON attendee_profiles USING GIN (tags);
CREATE INDEX idx_attendee_profiles_vip ON attendee_profiles (vip_status) WHERE vip_status = TRUE;

-- RLS: Readable by collective admins/promoters (for CRM).
-- The user themselves can read their own profile.


-- ----------------------------------------------------------------------------
-- 13. SETTLEMENTS (1:1 with events — post-event P&L)
-- ----------------------------------------------------------------------------

CREATE TABLE settlements (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id          UUID UNIQUE NOT NULL REFERENCES events(id),
  collective_id     UUID NOT NULL REFERENCES collectives(id),
  status            settlement_status NOT NULL DEFAULT 'draft',
  -- Revenue
  gross_revenue     NUMERIC(10, 2) DEFAULT 0,
  refunds_total     NUMERIC(10, 2) DEFAULT 0,
  net_revenue       NUMERIC(10, 2) GENERATED ALWAYS AS (gross_revenue - refunds_total) STORED,
  -- Costs
  artist_fees_total NUMERIC(10, 2) DEFAULT 0,
  venue_fee         NUMERIC(10, 2) DEFAULT 0,
  platform_fee      NUMERIC(10, 2) DEFAULT 0,
  stripe_fees       NUMERIC(10, 2) DEFAULT 0,
  other_costs       NUMERIC(10, 2) DEFAULT 0,
  total_costs       NUMERIC(10, 2) GENERATED ALWAYS AS (
    artist_fees_total + venue_fee + platform_fee + stripe_fees + other_costs
  ) STORED,
  -- Profit
  net_profit        NUMERIC(10, 2) GENERATED ALWAYS AS (
    (gross_revenue - refunds_total) - (artist_fees_total + venue_fee + platform_fee + stripe_fees + other_costs)
  ) STORED,
  -- Approval
  approved_by       UUID REFERENCES users(id),
  approved_at       TIMESTAMPTZ,
  notes             TEXT,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_settlements_event ON settlements (event_id);
CREATE INDEX idx_settlements_collective ON settlements (collective_id);
CREATE INDEX idx_settlements_status ON settlements (status);

-- RLS: Readable by collective admins. Writable only by admins.
-- NEVER soft-deleted. Status transitions only.


-- ----------------------------------------------------------------------------
-- 14. SPLIT_ITEMS (1:N from settlements — who gets what)
-- ----------------------------------------------------------------------------

CREATE TABLE split_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  settlement_id   UUID NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  -- Recipient: one of these will be set
  user_id         UUID REFERENCES users(id),
  collective_id   UUID REFERENCES collectives(id),
  venue_id        UUID REFERENCES venues(id),
  -- What they get
  label           TEXT NOT NULL,       -- 'DJ Fee', 'Venue Rental', 'Promoter Cut'
  type            TEXT NOT NULL,       -- 'artist_fee', 'venue_fee', 'promoter_share', 'collective_share'
  amount          NUMERIC(10, 2) NOT NULL,
  percentage      NUMERIC(5, 2),       -- of net revenue, for display
  -- Payout reference
  payout_id       UUID,                -- FK added after payouts table
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_split_recipient CHECK (
    (user_id IS NOT NULL)::int +
    (collective_id IS NOT NULL)::int +
    (venue_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX idx_split_items_settlement ON split_items (settlement_id);
CREATE INDEX idx_split_items_user ON split_items (user_id);

-- RLS: Same as settlements — collective admins only.


-- ----------------------------------------------------------------------------
-- 15. TRANSACTIONS (append-only ledger)
-- ----------------------------------------------------------------------------

CREATE TABLE transactions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id          UUID REFERENCES events(id),
  collective_id     UUID NOT NULL REFERENCES collectives(id),
  type              transaction_type NOT NULL,
  amount            NUMERIC(10, 2) NOT NULL,
  currency          TEXT DEFAULT 'USD',
  -- References
  ticket_id         UUID REFERENCES tickets(id),
  settlement_id     UUID REFERENCES settlements(id),
  -- Stripe references
  stripe_payment_intent_id  TEXT,
  stripe_transfer_id        TEXT,
  stripe_refund_id          TEXT,
  description       TEXT,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NO updated_at — transactions are IMMUTABLE
  -- NO deleted_at — transactions are NEVER deleted
);

CREATE INDEX idx_transactions_event ON transactions (event_id);
CREATE INDEX idx_transactions_collective ON transactions (collective_id);
CREATE INDEX idx_transactions_type ON transactions (type);
CREATE INDEX idx_transactions_created_at ON transactions (created_at);
CREATE INDEX idx_transactions_ticket ON transactions (ticket_id);

-- RLS: Readable by collective admins. NEVER writable via API — only via
-- server-side functions / triggers. No UPDATE or DELETE policies.


-- ----------------------------------------------------------------------------
-- 16. PAYOUTS (actual Stripe transfers)
-- ----------------------------------------------------------------------------

CREATE TABLE payouts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  settlement_id     UUID NOT NULL REFERENCES settlements(id),
  collective_id     UUID NOT NULL REFERENCES collectives(id),
  -- Recipient
  recipient_user_id UUID REFERENCES users(id),
  recipient_venue_id UUID REFERENCES venues(id),
  -- Amount
  amount            NUMERIC(10, 2) NOT NULL,
  currency          TEXT DEFAULT 'USD',
  status            payout_status NOT NULL DEFAULT 'pending',
  -- Stripe reference
  stripe_transfer_id TEXT,
  stripe_payout_id   TEXT,
  -- Timing
  initiated_at      TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  failed_at         TIMESTAMPTZ,
  failure_reason    TEXT,
  metadata          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NO deleted_at — payouts are NEVER deleted
);

CREATE INDEX idx_payouts_settlement ON payouts (settlement_id);
CREATE INDEX idx_payouts_collective ON payouts (collective_id);
CREATE INDEX idx_payouts_status ON payouts (status);
CREATE INDEX idx_payouts_recipient_user ON payouts (recipient_user_id);

-- Now add the FK from split_items to payouts
ALTER TABLE split_items
  ADD CONSTRAINT fk_split_items_payout
  FOREIGN KEY (payout_id) REFERENCES payouts(id);

-- RLS: Readable by collective admins and the recipient user. Writable only server-side.


-- ----------------------------------------------------------------------------
-- 17. SEGMENTS (CRM audience segments)
-- ----------------------------------------------------------------------------

CREATE TABLE segments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collective_id   UUID NOT NULL REFERENCES collectives(id),
  name            TEXT NOT NULL,        -- 'VIPs', 'Repeat Attendees', 'Lapsed'
  description     TEXT,
  -- Dynamic segment: a filter definition, evaluated at query time
  filter_rules    JSONB,               -- e.g., {"min_events": 3, "last_active_days": 90}
  -- Static segment: manually curated
  is_dynamic      BOOLEAN DEFAULT TRUE,
  member_count    INTEGER DEFAULT 0,    -- cached count
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_segments_collective ON segments (collective_id);

-- RLS: Readable/writable by collective admins/promoters.


-- ----------------------------------------------------------------------------
-- 18. SEGMENT_MEMBERS (join: segments M:N attendee_profiles)
-- ----------------------------------------------------------------------------
-- Used for static segments or as a cache for dynamic segments.

CREATE TABLE segment_members (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  segment_id          UUID NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  attendee_profile_id UUID NOT NULL REFERENCES attendee_profiles(id) ON DELETE CASCADE,
  added_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_segment_member UNIQUE (segment_id, attendee_profile_id)
);

CREATE INDEX idx_segment_members_segment ON segment_members (segment_id);
CREATE INDEX idx_segment_members_profile ON segment_members (attendee_profile_id);


-- ----------------------------------------------------------------------------
-- 19. EMAIL_CAMPAIGNS
-- ----------------------------------------------------------------------------

CREATE TABLE email_campaigns (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collective_id   UUID NOT NULL REFERENCES collectives(id),
  event_id        UUID REFERENCES events(id),   -- optional: campaign tied to an event
  name            TEXT NOT NULL,
  subject         TEXT NOT NULL,
  body_html       TEXT,
  body_text       TEXT,
  status          campaign_status NOT NULL DEFAULT 'draft',
  -- Targeting
  send_to_all     BOOLEAN DEFAULT FALSE,
  -- Scheduling
  scheduled_at    TIMESTAMPTZ,
  sent_at         TIMESTAMPTZ,
  -- Stats (updated by webhooks)
  recipients      INTEGER DEFAULT 0,
  opens           INTEGER DEFAULT 0,
  clicks          INTEGER DEFAULT 0,
  created_by      UUID REFERENCES users(id),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_email_campaigns_collective ON email_campaigns (collective_id);
CREATE INDEX idx_email_campaigns_status ON email_campaigns (status);


-- ----------------------------------------------------------------------------
-- 20. CAMPAIGN_SEGMENTS (join: email_campaigns M:N segments)
-- ----------------------------------------------------------------------------

CREATE TABLE campaign_segments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id     UUID NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  segment_id      UUID NOT NULL REFERENCES segments(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_campaign_segment UNIQUE (campaign_id, segment_id)
);

CREATE INDEX idx_campaign_segments_campaign ON campaign_segments (campaign_id);
CREATE INDEX idx_campaign_segments_segment ON campaign_segments (segment_id);


-- ----------------------------------------------------------------------------
-- 21. AUDIT_LOGS (append-only, immutable)
-- ----------------------------------------------------------------------------

CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- What changed
  table_name      TEXT NOT NULL,
  record_id       UUID NOT NULL,
  action          audit_action NOT NULL,
  -- Who did it
  user_id         UUID REFERENCES users(id),
  collective_id   UUID,
  -- Change payload
  old_data        JSONB,
  new_data        JSONB,
  -- Context
  ip_address      INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NO updated_at, NO deleted_at — this table is IMMUTABLE
);

CREATE INDEX idx_audit_logs_table_record ON audit_logs (table_name, record_id);
CREATE INDEX idx_audit_logs_user ON audit_logs (user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at);
CREATE INDEX idx_audit_logs_collective ON audit_logs (collective_id);

-- IMPORTANT: Revoke UPDATE and DELETE on this table from all roles.
-- Only INSERT is allowed.
-- REVOKE UPDATE, DELETE ON audit_logs FROM authenticated;
-- REVOKE UPDATE, DELETE ON audit_logs FROM service_role;


-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Auto-update updated_at timestamp
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE column_name = 'updated_at'
      AND table_schema = 'public'
      AND table_name NOT IN ('transactions', 'audit_logs')
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      t
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------------------
-- Audit trigger for financial tables
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_financial_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, user_id)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP::audit_action,
    CASE WHEN TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN to_jsonb(NEW) END,
    -- Try to get the current user from Supabase JWT
    (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit triggers to financial tables
CREATE TRIGGER trg_audit_transactions
  AFTER INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION audit_financial_change();

CREATE TRIGGER trg_audit_settlements
  AFTER INSERT OR UPDATE ON settlements
  FOR EACH ROW EXECUTE FUNCTION audit_financial_change();

CREATE TRIGGER trg_audit_payouts
  AFTER INSERT OR UPDATE ON payouts
  FOR EACH ROW EXECUTE FUNCTION audit_financial_change();

CREATE TRIGGER trg_audit_split_items
  AFTER INSERT OR UPDATE OR DELETE ON split_items
  FOR EACH ROW EXECUTE FUNCTION audit_financial_change();

CREATE TRIGGER trg_audit_tickets
  AFTER INSERT OR UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION audit_financial_change();


-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END;
$$ LANGUAGE plpgsql;


-- ----------------------------------------------------------------------------
-- Helper function: get collectives for current user
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_user_collectives()
RETURNS SETOF UUID AS $$
  SELECT collective_id
  FROM collective_members
  WHERE user_id = auth.uid()
    AND deleted_at IS NULL;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if user has a specific role in a collective
CREATE OR REPLACE FUNCTION has_collective_role(p_collective_id UUID, p_roles collective_role[])
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM collective_members
    WHERE collective_id = p_collective_id
      AND user_id = auth.uid()
      AND role = ANY(p_roles)
      AND deleted_at IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;


-- ----------------------------------------------------------------------------
-- USERS policies
-- ----------------------------------------------------------------------------

CREATE POLICY users_select_own ON users
  FOR SELECT USING (auth_id = auth.uid());

CREATE POLICY users_select_collective_members ON users
  FOR SELECT USING (
    id IN (
      SELECT cm.user_id FROM collective_members cm
      WHERE cm.collective_id IN (SELECT get_user_collectives())
        AND cm.deleted_at IS NULL
    )
  );

CREATE POLICY users_update_own ON users
  FOR UPDATE USING (auth_id = auth.uid());


-- ----------------------------------------------------------------------------
-- COLLECTIVES policies
-- ----------------------------------------------------------------------------

-- Anyone can read published collective info
CREATE POLICY collectives_select_public ON collectives
  FOR SELECT USING (deleted_at IS NULL);

CREATE POLICY collectives_update_admin ON collectives
  FOR UPDATE USING (has_collective_role(id, ARRAY['admin']::collective_role[]));


-- ----------------------------------------------------------------------------
-- COLLECTIVE_MEMBERS policies
-- ----------------------------------------------------------------------------

CREATE POLICY cm_select ON collective_members
  FOR SELECT USING (
    collective_id IN (SELECT get_user_collectives())
    AND deleted_at IS NULL
  );

CREATE POLICY cm_insert_admin ON collective_members
  FOR INSERT WITH CHECK (
    has_collective_role(collective_id, ARRAY['admin']::collective_role[])
  );

CREATE POLICY cm_update_admin ON collective_members
  FOR UPDATE USING (
    has_collective_role(collective_id, ARRAY['admin']::collective_role[])
  );

CREATE POLICY cm_delete_admin ON collective_members
  FOR DELETE USING (
    has_collective_role(collective_id, ARRAY['admin']::collective_role[])
  );


-- ----------------------------------------------------------------------------
-- EVENTS policies
-- ----------------------------------------------------------------------------

-- Published events are public
CREATE POLICY events_select_public ON events
  FOR SELECT USING (status = 'published' AND deleted_at IS NULL);

-- Collective members can see all events (incl. drafts)
CREATE POLICY events_select_members ON events
  FOR SELECT USING (
    collective_id IN (SELECT get_user_collectives())
    AND deleted_at IS NULL
  );

CREATE POLICY events_insert ON events
  FOR INSERT WITH CHECK (
    has_collective_role(collective_id, ARRAY['admin', 'promoter']::collective_role[])
  );

CREATE POLICY events_update ON events
  FOR UPDATE USING (
    has_collective_role(collective_id, ARRAY['admin', 'promoter']::collective_role[])
  );


-- ----------------------------------------------------------------------------
-- TICKETS policies
-- ----------------------------------------------------------------------------

-- Users can see their own tickets
CREATE POLICY tickets_select_own ON tickets
  FOR SELECT USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Collective members can see tickets for their events
CREATE POLICY tickets_select_collective ON tickets
  FOR SELECT USING (
    event_id IN (
      SELECT id FROM events
      WHERE collective_id IN (SELECT get_user_collectives())
    )
  );

-- Door staff can update ticket status (check-in)
CREATE POLICY tickets_update_checkin ON tickets
  FOR UPDATE USING (
    event_id IN (
      SELECT e.id FROM events e
      WHERE has_collective_role(e.collective_id, ARRAY['admin', 'door_staff']::collective_role[])
    )
  );


-- ----------------------------------------------------------------------------
-- SETTLEMENTS policies
-- ----------------------------------------------------------------------------

CREATE POLICY settlements_select ON settlements
  FOR SELECT USING (
    has_collective_role(collective_id, ARRAY['admin']::collective_role[])
  );

CREATE POLICY settlements_insert ON settlements
  FOR INSERT WITH CHECK (
    has_collective_role(collective_id, ARRAY['admin']::collective_role[])
  );

CREATE POLICY settlements_update ON settlements
  FOR UPDATE USING (
    has_collective_role(collective_id, ARRAY['admin']::collective_role[])
  );


-- ----------------------------------------------------------------------------
-- TRANSACTIONS policies (read-only for admins)
-- ----------------------------------------------------------------------------

CREATE POLICY transactions_select ON transactions
  FOR SELECT USING (
    has_collective_role(collective_id, ARRAY['admin']::collective_role[])
  );

-- No INSERT/UPDATE/DELETE policies for authenticated users.
-- Transactions are created only by server-side service_role functions.


-- ----------------------------------------------------------------------------
-- VENUES policies
-- ----------------------------------------------------------------------------

CREATE POLICY venues_select_public ON venues
  FOR SELECT USING (deleted_at IS NULL);


-- ----------------------------------------------------------------------------
-- ARTISTS policies
-- ----------------------------------------------------------------------------

CREATE POLICY artists_select_public ON artists
  FOR SELECT USING (deleted_at IS NULL);

CREATE POLICY artists_update_own ON artists
  FOR UPDATE USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));


-- ============================================================================
-- USEFUL VIEWS
-- ============================================================================

-- Event dashboard summary
CREATE OR REPLACE VIEW event_dashboard AS
SELECT
  e.id AS event_id,
  e.title,
  e.starts_at,
  e.status,
  e.collective_id,
  v.name AS venue_name,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('paid', 'checked_in')) AS tickets_sold,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'checked_in') AS checked_in,
  COALESCE(SUM(t.price_paid) FILTER (WHERE t.status IN ('paid', 'checked_in')), 0) AS gross_revenue,
  COUNT(DISTINCT ea.artist_id) FILTER (WHERE ea.status = 'confirmed') AS confirmed_artists,
  COALESCE(SUM(ea.fee) FILTER (WHERE ea.status = 'confirmed'), 0) AS total_artist_fees
FROM events e
LEFT JOIN venues v ON v.id = e.venue_id
LEFT JOIN tickets t ON t.event_id = e.id
LEFT JOIN event_artists ea ON ea.event_id = e.id
WHERE e.deleted_at IS NULL
GROUP BY e.id, e.title, e.starts_at, e.status, e.collective_id, v.name;


-- Promoter performance (referral attribution)
CREATE OR REPLACE VIEW promoter_performance AS
SELECT
  pc.promoter_id,
  u.full_name AS promoter_name,
  pc.collective_id,
  pc.event_id,
  e.title AS event_title,
  pc.code,
  COUNT(t.id) AS tickets_sold,
  COALESCE(SUM(t.price_paid), 0) AS revenue_generated
FROM promo_codes pc
JOIN users u ON u.id = pc.promoter_id
LEFT JOIN tickets t ON t.promo_code_id = pc.id AND t.status IN ('paid', 'checked_in')
LEFT JOIN events e ON e.id = pc.event_id
GROUP BY pc.promoter_id, u.full_name, pc.collective_id, pc.event_id, e.title, pc.code;
