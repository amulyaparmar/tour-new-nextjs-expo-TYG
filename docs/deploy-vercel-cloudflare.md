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
```

Do not set `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_PLACES_API_KEY`, or `OPENAI_API_KEY` as `NEXT_PUBLIC_*` values.

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
