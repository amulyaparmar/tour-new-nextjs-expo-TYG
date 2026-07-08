# Community Onboarding And Claims Plan

## Goal

Create a trustworthy onboarding flow where a user can find a property/community, request access, and prove they are allowed to manage that community before the app grants admin-level access.

The current app already has the right core model:

- `companies` own `communities`.
- `company_memberships` grant a user a company role.
- `membership_communities` scopes that role to one or more communities.
- `registration_requests` exists for verified signup.
- `communities.gmb_id` can connect a community to a Google Business Profile place id, but most existing rows do not have one yet.

The missing layer is explicit claim state and business ownership verification.

## Current State Observed

Approximate live DB shape at review time:

- `companies`: 256
- `communities`: 635
- `portal_enabled` communities: 631
- communities with `gmb_id`: 4
- `registration_requests`: 0
- active memberships exist through `company_memberships` and `membership_communities`

The current signup flow starts with Google business search/place id, but email verification can still result in an active admin workspace. That verifies the person owns the email address, not the property/business.

## Recommended Product Flow

1. User searches for a property using Google Business Profile / Places.
2. App stores the Google place id as an external identity, not the main community id.
3. App matches the selected place to an existing community using:
   - exact `gmb_id`
   - normalized community name / alias
   - address and phone when available
   - optional PMS identity such as Entrata property id
4. App chooses one of three paths:
   - Existing verified team: request to join the team.
   - Existing unclaimed legacy community: request to claim it.
   - No match: create a pending community shell.
5. User completes one verification method.
6. Only after verification:
   - create or activate `company_memberships`
   - insert `membership_communities`
   - mark the claim verified
   - enable the workspace in app

## Verification Methods

Use a tiered verification model so the product can ship quickly but become more automated over time.

### Tier 1: Strong Verification

Google Business Profile OAuth:

- User connects Google.
- App lists Business Profile accounts/locations available to that Google user.
- App verifies the selected location matches the Google place id or canonical business metadata.
- If matched, approve the claim automatically.

This is strongest, but Google Business Profile API access is gated and requires approval.

### Tier 2: Operational Verification

PMS / Entrata verification:

- User connects Entrata.
- App confirms the selected property exists in the PMS account.
- If `entrata_property_id` matches or is selected during setup, approve or route for lightweight review.

Existing admin approval:

- If the community already has active admins/managers, create a join request.
- Existing admin approves the request.
- New user gets a scoped membership for that community.

### Tier 3: Lightweight Verification

Domain / website verification:

- Compare user email domain to Google business website domain.
- Or ask user to add a DNS TXT token / website file / meta tag.

Business phone OTP:

- Send a short code to the public phone listed on the Google profile.
- Useful for small operators, but weaker because phone routing may be shared.

Manual review:

- Staff reviews property, website, email, LinkedIn, PMS screenshots, or lease-management proof.
- This should be the fallback for edge cases.

## Proposed DB Additions

### `business_identities`

Links external systems to internal communities.

```sql
create table public.business_identities (
  id uuid primary key default gen_random_uuid(),
  community_id text not null references public.communities(id) on delete cascade,
  provider text not null,
  external_id text not null,
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  confidence numeric,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, external_id)
);
```

Examples:

- `provider = 'google_business_profile'`
- `external_id = place_id`
- `provider = 'entrata'`
- `external_id = entrata_property_id`

### `community_claims`

Tracks create, claim, and join workflows.

```sql
create table public.community_claims (
  id uuid primary key default gen_random_uuid(),
  community_id text references public.communities(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  requested_by_user_id uuid references auth.users(id) on delete cascade,
  requested_email text not null,
  requested_full_name text not null,
  mode text not null check (mode in ('join', 'claim', 'create')),
  gmb_place_id text,
  business_name text not null,
  formatted_address text,
  phone text,
  website text,
  google_maps_url text,
  status text not null default 'pending'
    check (status in ('pending', 'needs_review', 'verified', 'rejected', 'expired')),
  verification_method text,
  verified_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### `community_verification_challenges`

Tracks phone, domain, OAuth, and manual-review challenges.

```sql
create table public.community_verification_challenges (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.community_claims(id) on delete cascade,
  method text not null check (method in ('google_oauth', 'domain_dns', 'website_file', 'phone_otp', 'admin_approval', 'manual')),
  status text not null default 'pending'
    check (status in ('pending', 'passed', 'failed', 'expired')),
  token_hash text,
  target text,
  attempts integer not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
```

## Access Rules

Pending claims should not create fully active admin access.

Recommended behavior:

- `create` mode creates a pending company/community shell and pending claim.
- `claim` mode links to the existing community but does not grant active admin access yet.
- `join` mode creates a pending membership or join request until an admin approves.
- App can show a limited onboarding workspace while pending.
- Full app access requires an active membership and `membership_communities` row.

## UX States

### Search

User searches:

> "The Mayfair"

Results show:

- business name
- address
- phone
- website
- existing team indicator

### Claim

If a possible match exists:

> This community already exists in Tour.

Actions:

- Request to join
- Claim as admin
- Not my community

### Verification

Show one clear checklist:

- Connect Google Business Profile
- Verify company domain
- Verify public phone
- Connect Entrata
- Request manual review

### Pending

Show:

> We are verifying access to The Mayfair.

Include selected method, expiry, next step, and support escalation.

### Approved

Show:

> Community verified.

Then route to dashboard and set the community cookie/session.

## Implementation Plan

1. Add claim and verification tables.
2. Refactor signup completion so create/claim does not activate admin membership until claim verification passes.
3. Add claim APIs:
   - `POST /api/admin/onboarding/discover`
   - `POST /api/admin/onboarding/claims`
   - `GET /api/admin/onboarding/claims/:id`
   - `POST /api/admin/onboarding/claims/:id/challenges`
   - `POST /api/admin/onboarding/claims/:id/verify`
4. Add admin approval APIs for existing community admins.
5. Add limited pending workspace UI.
6. Backfill `business_identities` for existing `communities.gmb_id`.
7. Add matching job for legacy communities without `gmb_id`.
8. Add Google Business Profile OAuth verification when API access is ready.

## MVP Recommendation

Ship this order:

1. GMB search and selected business metadata.
2. Claim table and pending claim UX.
3. Existing-admin approval for joins.
4. Manual-review approval for creates/claims.
5. Entrata verification.
6. Domain/phone verification.
7. Google Business Profile OAuth verification.

This gives the app a safe onboarding path immediately while leaving room for stronger automated verification later.
