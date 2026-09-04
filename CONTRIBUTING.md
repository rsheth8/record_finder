# Contributing to Record Finder

## Prerequisites
- Node.js
- Discogs personal token
- Spotify app (for sign-in)

## Run
```bash
npm install
cp .env.example .env
# DISCOGS_TOKEN, SPOTIFY_CLIENT_ID/SECRET, AUTH_SECRET
npm run db:push
npm run dev
```

## Tests
```bash
npm test
npm run lint
```

Cron (`/api/cron/snapshot-prices`) only snapshots wishlists. Don't widen that without a quota plan.
