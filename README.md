# flore

A personal brand site for a musician: song snippets with a real player,
long-form writing, and links out to Instagram and the rest.

Built with Next.js (App Router), TypeScript and Tailwind. Every page is
statically generated, so it deploys free on Vercel, Netlify or Cloudflare
Pages and costs nothing to run.

---

## Getting it running

```bash
npm install
npm run dev          # http://localhost:3000
```

Other commands:

```bash
npm run build        # production build
npm run start        # serve the production build
```

---

## The five-minute setup

Everything you need to change lives in `config/`. In order:

**1. `config/site.ts`** — the brand name, tagline, hero caption, description
and contact email. `name` is used as the wordmark in the header, footer and hero, so
changing it changes the whole site.

**2. `config/socials.ts`** — your real handles. Delete rows you don't use.
Whichever entry is marked `primary: true` becomes the icon in the header and
the button on the home page, so put Instagram there.

**3. `config/tracks.ts`** — your snippets. See below.

**4. `content/writing/*.md`** — your posts. See below.

**5. Delete the two example posts** (`content/writing/kitchen-window.md`,
`content/writing/starting-over.md`) and the three example tracks once you
have your own.

Before you deploy, set `NEXT_PUBLIC_SITE_URL` to your real domain so the
sitemap, canonical URLs and social cards point at the right place.

---

## Posting a snippet

1. Drop the audio file into `public/audio/` — mp3 or m4a, ideally under 5 MB.
2. Add an entry to `config/tracks.ts`:

```ts
{
  id: "kitchen-window",                    // url-safe, also seeds the waveform
  title: "kitchen window",
  stage: "snippet",                        // snippet | demo | unreleased | released
  date: "2026-09-14",                      // sorts newest first
  audio: "/audio/kitchen-window.mp3",
  note: "Recorded in one take on a phone at 2am.",
  lyric: "and the light came through the kitchen window",
  tags: ["voice memo", "guitar"],
  featured: true,                          // pins it to the home page
}
```

Leave `audio: ""` and the card shows a tidy "Audio coming soon" instead of a
player — useful for listing something before the file is ready.

### About the waveform

The bars aren't decoded from the audio; that would mean shipping the whole
file to the browser just to draw a picture. Instead each track's `id` seeds a
deterministic generator (`lib/waveform.ts`), so a track always draws the same
shape, the server and client agree on it, and there's no layout jump on load.
The bars fill with the accent colour as the track plays, and you can click or
drag anywhere on them to seek.

Only one snippet plays at a time — starting a second one pauses the first
(`components/music/player-provider.tsx`).

---

## Writing a post

One markdown file per post in `content/writing/`. The filename becomes the
URL: `content/writing/my-post.md` → `/writing/my-post`.

```markdown
---
title: "The fridge stays in"
date: "2026-09-14"
description: "One or two lines, shown in the list and in link previews."
tags: ["process", "demos"]
track: "kitchen-window"    # optional — embeds that snippet's player in the post
featured: true             # optional — pins it to the home page
---

Your post here.
```

Two conveniences:

- **Drafts.** Prefix a filename with `_` (`_half-written.md`) and it won't be
  published.
- **Lyrics.** End a line with a backslash for a hard line break, or wrap a
  block in `<div class="lyrics">…</div>` to keep every newline:

```markdown
> and the light came through the kitchen window\
> like it had somewhere to be
```

---

## Instagram

The home page has an Instagram section. By default it shows a follow
call-to-action. To show a grid of actual posts instead, save the images into
`public/instagram/` and list them in `config/instagram.ts`.

This is manual on purpose: Instagram's Graph API needs a Business or Creator
account plus a long-lived token that has to be refreshed every 60 days, which
is a lot of moving parts for a handful of tiles. If you'd rather automate it
later, fetch `/me/media` in a route handler and swap the array in
`config/instagram.ts` for that call — `components/common/instagram-strip.tsx`
takes the same shape either way.

---

## Design

Warm paper and a garden. Cream ground, deep forest green ink, sage for blocks
and panels, and one marigold accent for the thing that should shout — the
played part of a waveform, a link, a focus ring.

Light by default, with a forest-dark theme behind the toggle in the header.
Both are a handful of CSS custom properties at the top of `app/globals.css`:

```css
--cream:    44 34% 93%;   /* page */
--ink:     150 31% 18%;   /* text */
--sage:     92 15% 56%;   /* blocks */
--marigold: 37 74% 52%;   /* accent */
```

Change those four and the whole site follows, flower included.

**Type** is one geometric family, Outfit, at different weights — the wordmark
is just the heaviest cut of the body text, which is what keeps it feeling of a
piece. Metadata, nav and captions are JetBrains Mono, uppercase and widely
letter-spaced (the `.label` class); the `.caption` class is the lowercase,
extra-tracked voice used under the flower.

**Grain.** A full-viewport SVG turbulence layer sits over everything
(`components/common/grain.tsx`), which is what stops the flat colour looking
digital. It's generated, not an image, so there's no asset to ship and it
stays crisp at any density. Strength and blend mode are theme variables,
because noise that reads as paper on cream reads as dust on forest.

**The flower** (`components/common/flower.tsx`) is drawn in code, not an
image. Three petal shapes — a round one, one with a straight scissor edge, one
lopsided — are placed at hand-picked angles and scales so it stays slightly
uneven rather than symmetrical. The petals deliberately reach past the square
so it crops them flat. `<Flower />` is the block; `<FlowerMark />` is the small
silhouette in the header and footer.

One thing worth knowing if you edit it: a CSS transform *replaces* an SVG
`transform` attribute rather than composing with it. That's why the sway
animation lives on its own nested group — put both on one element and the
flower collapses to a single petal at the viewBox origin.

Layout is centred with a lot of air, on a single shared measure.

## Deploying

Push to GitHub, then import the repo on [Vercel](https://vercel.com) — it
detects Next.js with no configuration. Set `NEXT_PUBLIC_SITE_URL` in the
project's environment variables, and point your domain at it.

The Open Graph image is generated at build time from your brand name
(`app/opengraph-image.tsx`), so there's no PNG to keep in sync.

---

## Layout

```
app/
  (site)/            pages: home, snippets, writing, writing/[slug], about
  globals.css        theme tokens + long-form typography
  opengraph-image.tsx
components/
  common/            nav, footer, theme toggle, icons, reveal
  music/             audio player, waveform, track card
  writing/           post card
config/               ← everything you edit
content/writing/      ← your posts
lib/                  markdown parsing, waveform generator, helpers
public/audio/         ← your audio files
```

---

Structure and conventions follow
[namanbarkiya/minimal-next-portfolio](https://github.com/namanbarkiya/minimal-next-portfolio),
reworked for music rather than a developer portfolio.
