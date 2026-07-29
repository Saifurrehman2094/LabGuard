# Saif ur Rehman — AI Engineer Portfolio

A dark, glowing, fully responsive portfolio built with **Next.js 14 (App Router)**, **React 18**, **TypeScript**, **Tailwind CSS**, and **Framer Motion**.

## What's inside

- Animated hero with a live neural-network canvas background (nodes react to your cursor)
- Scrolling tech-stack marquee
- About section with focus areas
- Skills with animated proficiency bars, grouped by category
- Experience timeline (career + education)
- 5 flagship project cards with glowing hover states
- Achievements & certifications
- "How I work" process section
- Testimonials
- Contact section with form UI + social links
- Sticky, responsive navbar with mobile menu
- Smooth scrolling, scroll-triggered reveal animations, ambient glow orbs
- Respects `prefers-reduced-motion` and has visible keyboard focus states

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Customize with your own content

All copy lives directly in the components — there's no CMS, so editing is just editing text:

| What to change | File |
| --- | --- |
| Name, title, bio, stats | `components/Hero.tsx`, `components/About.tsx` |
| Skills & proficiency levels | `components/Skills.tsx` |
| Work history / education | `components/Experience.tsx` |
| The 5 projects | `components/Projects.tsx` |
| Certifications & awards | `components/Achievements.tsx` |
| Testimonials | `components/Testimonials.tsx` |
| Email, location, social links | `components/Contact.tsx`, `components/Footer.tsx` |
| Resume file | replace `public/resume/Saif_ur_Rehman_Resume.pdf` if you update your resume |
| Colors, fonts | `tailwind.config.ts` (colors), `app/layout.tsx` (fonts) |

## Deploy

The easiest path is [Vercel](https://vercel.com/new) (built by the Next.js team — just import the repo and it detects everything automatically). It also deploys cleanly to Netlify, Render, or any Node host.

```bash
npm run build
npm run start
```

## Notes

- The contact form is fully functional — it posts to `app/api/contact/route.ts`, which sends a real email using [Resend](https://resend.com).

### Setting up the contact form (takes ~2 minutes)

1. Sign up for a free account at [resend.com](https://resend.com) — no credit card required.
2. Go to **API Keys** in the Resend dashboard and create a new key.
3. Copy `.env.local.example` to `.env.local` and paste your key in:
   ```
   RESEND_API_KEY=re_your_api_key_here
   ```
4. Run locally with `npm run dev` and test the form — messages will land in the inbox tied to your Resend account (works out of the box with the `onboarding@resend.dev` sender, no domain setup needed).
5. **For production on Vercel**: go to your project → Settings → Environment Variables → add `RESEND_API_KEY` (and optionally `CONTACT_TO_EMAIL` if you want messages sent somewhere other than the default). Redeploy after adding it.

Once you verify your own domain in Resend (optional, free), you can change the `from` address in `app/api/contact/route.ts` from `onboarding@resend.dev` to something like `contact@yourdomain.com` so it can send to any recipient, not just your own account email.

The route also includes basic spam protection: a honeypot field and a simple per-IP rate limit (5 submissions per 10 minutes).
- Fonts (Space Grotesk, Inter, JetBrains Mono) load from Google Fonts at build time via `next/font/google`, which requires internet access during `next build`.
