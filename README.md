This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Environment Variables

Copy `.env.example` to `.env.local` and fill in the values. All variables listed there are required for a full deployment except `ACCESS_PASSWORD`.

## Cron / Turn Timer

The turn-timer cron job runs at `/api/cron/turntimer`. It checks all active games, advances any expired turns, and sends push notifications.

**Why an external cron service?**  
Vercel Hobby plan limits cron jobs to once per day. Since the shortest supported turn timer is 12 hours, a daily Vercel cron (`0 0 * * *` in `vercel.json`) acts only as a backstop. For reliable sub-day enforcement use a free external scheduler such as [cron-job.org](https://cron-job.org).

**Setting up cron-job.org:**

1. Create a free account at [cron-job.org](https://cron-job.org).
2. Add a new cron job with:
   - **URL:** `https://async-games.vercel.app/api/cron/turntimer`
   - **Schedule:** every 15 minutes (or whatever granularity you need)
   - **Request method:** GET
   - **Header:** `Authorization: Bearer <CRON_SECRET>`  
     (use the same value set as `CRON_SECRET` in your Vercel environment variables)
3. Save and enable the job.

The endpoint returns `{ processed, expired, warned }` — cron-job.org will show this in the execution log.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.
