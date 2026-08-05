# Vercel + Cloudflare Deployment

This repo deploys the Next.js web app from `apps/web` while keeping the Expo app out of the Vercel build.

## Vercel project settings

- Framework preset: `Next.js`
- Install command: `npm install`
- Build command: `npm run build:web`
- Development command: `npm run web`
- Root directory: repository root

The root `vercel.json` pins these commands for the project.

## Required Vercel environment variables

Set these in Vercel for Production, Preview, and Development unless a narrower scope is intentional.

```bash
SUPABASE_PROJECT_ID=tkweddqlriikqgylsuxz
SUPABASE_URL=https://tkweddqlriikqgylsuxz.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<secret>
NEXT_PUBLIC_SUPABASE_URL=https://tkweddqlriikqgylsuxz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable-or-anon-key>
GOOGLE_PLACES_API_KEY=<secret>
OPENAI_API_KEY=<secret>
OPENAI_MODEL=gpt-4.1-mini
NEXT_PUBLIC_SITE_URL=https://tour.you
NEXT_PUBLIC_VAPI_PUBLIC_KEY=<vapi-web-public-key>
NEXT_PUBLIC_VAPI_ASSISTANT_ID=<vapi-base-assistant-id>
VAPI_PRIVATE_KEY=<secret>
```

The three `VAPI` values power the AI Roleplay Training tab on `/new`. Without
`VAPI_PRIVATE_KEY`, live practice calls still run but everything post-call
fails: scorecard grading, the recording player in practice history, and the
waypoint-generation fallback.

Do not set `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_PLACES_API_KEY`, `OPENAI_API_KEY`, or `VAPI_PRIVATE_KEY` as `NEXT_PUBLIC_*` values.

## Domain

Add `tour.you` to the Vercel project domains.

If `tour.you` is managed in Cloudflare, create this DNS record in the `tour.you` zone:

```text
Type: A
Name: @
Value: 76.76.21.21
Proxy status: DNS only
TTL: Auto
```

Vercel should manage SSL after the domain is added and DNS resolves.

For a `www` hostname later, add `www.tour.you` to Vercel and create:

```text
Type: CNAME
Name: www
Value: cname.vercel-dns-0.com
Proxy status: DNS only
TTL: Auto
```
