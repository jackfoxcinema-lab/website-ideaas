# flore

A site for a musician with an ongoing project: the songs, and the world
they come from. Songs play from YouTube, the world is a folder of markdown
files that grows one entry at a time, and there's long-form writing
alongside both.

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

Everything you need to change lives in `config/` and `content/`. In order:

**1. `config/site.ts`** — the brand name, tagline, description and contact
email. `name` is used as the wordmark in the header, footer and hero, so
changing it changes the whole site.

**2. `config/socials.ts`** — your real handles. Delete rows you don't use.
Whichever entry is marked `primary: true` becomes the icon in the header and
the button on the home page; it ships set to YouTube.

**3. `config/tracks.ts`** — your songs, with their YouTube links. See below.

**4. `config/world.ts`** — the world's name, premise and status line. Write
the premise in your own words before anything else; it's the first thing
anyone reads on `/world`.

**5. `content/world/*.md`** — the entries. See below, and
`content/world/README.md` for the full reference.

**6. `content/writing/*.md`** — your posts.

**7. Delete the examples** once you have your own: four entries in
`content/world/`, two posts in `content/writing/`, and the four placeholder
tracks in `config/tracks.ts`.

Before you deploy, set `NEXT_PUBLIC_SITE_URL` to your real domain so the
sitemap, canonical URLs and social cards point at the right place.

---

## Posting a song

Songs live on YouTube. Hit Share on the video, paste the link, done:

```ts
{
  id: "song-one",                  // url-safe; world entries point at this
  title: "first song",
  stage: "released",               // snippet | demo | unreleased | released
  date: "2026-09-14",              // sorts newest first
  youtube: "https://youtu.be/dQw4w9WgXcQ",
  audio: "",
  note: "One line of context.",
  lyric: "a few words of the lyric",
  tags: ["guitar"],
  featured: true,                  // pins it to the home page
}
```

`youtube` takes a full link (watch URL, `youtu.be`, Short, embed URL) or a
bare video id — whatever's easiest to paste.

**Nothing loads from YouTube until someone presses play.** The card shows the
video's own still frame and swaps in the real player on click. A raw embed
would pull about a megabyte of YouTube's player and set cookies on page load
for every video on the page, whether or not anyone watches. See
`components/music/youtube-embed.tsx`.

### Songs without a video

Leave `youtube` empty and set `audio` to a file in `public/audio/` instead —
that gets the waveform player, which is the better shape for a voice memo or
a snippet. Leave both empty and the card shows a tidy "Audio coming soon",
which is how to list something that's finished but not up yet.

#### About the waveform

The bars aren't decoded from the audio; that would mean shipping the whole
file to the browser just to draw a picture. Instead each track's `id` seeds a
deterministic generator (`lib/waveform.ts`), so a track always draws the same
shape, the server and client agree on it, and there's no layout jump on load.
The bars fill with the accent colour as the track plays, and you can click or
drag anywhere on them to seek.

Only one track plays at a time — starting a second one pauses the first
(`components/music/player-provider.tsx`).

---

## The world

This is the part that's meant to keep growing. One markdown file per entry in
`content/world/`; the filename becomes the URL.

```markdown
---
title: "the glasshouse"
kind: place                # place | figure | object | event | fragment
date: "2026-09-14"         # when it entered the world
description: "One or two lines, shown in the index and in link previews."
song: "song-one"           # optional — an id from config/tracks.ts
youtube: ""                # optional — a video that belongs to this entry
image: "/world/glass.jpg"  # optional — a file in public/world
tags: ["glass", "green"]
order: 1                   # optional — hand-place it; unset sorts by date
featured: true             # optional — pins it to the home page
---

Your entry here.
```

Three things worth knowing:

- **`kind` builds the index.** `/world` groups entries into the sections
  listed in `config/world.ts`. Rename them, add your own, or use `fragment`
  for anything you can't place yet.
- **`song` wires the two halves together.** The entry's page gets a player for
  that song, and the song's card on `/songs` lists every entry that names it.
  Entries also link sideways to their neighbours, so a listener who follows
  one song can keep walking.
- **`youtube` is for video that belongs to the entry rather than to a song** —
  a sit-down video, a walkthrough, a scene. Same click-to-load player.

Drafts work the same way as posts: prefix a filename with `_` and it stays
out of the site.

Full reference: `content/world/README.md`.

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
track: "song-one"          # optional — embeds that song's player in the post
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

Layout is centred with a lot of air, on a single shared measure.

## Deploying

Push to GitHub, then import the repo on [Vercel](https://vercel.com) — it
detects Next.js with no configuration. Set `NEXT_PUBLIC_SITE_URL` in the
project's environment variables, and point your domain at it.

### Or export it as plain files

The site has no server-side features, so it can also be exported as static
HTML and dropped on any host (GitHub Pages, Netlify drop, S3, a USB stick):

```bash
STATIC_EXPORT=true npm run build   # writes ./out
```

The flag is opt-in so the default build stays a normal Next build.

The Open Graph image is generated at build time from your brand name
(`app/opengraph-image.tsx`), so there's no PNG to keep in sync.

---

## Layout

```
app/
  (site)/            pages: home, songs, world, world/[slug], writing,
                     writing/[slug], about
  globals.css        theme tokens + long-form typography
  opengraph-image.tsx
components/
  common/            nav, footer, theme toggle, icons, reveal
  music/             audio player, waveform, YouTube embed, track card
  world/             entry card
  writing/           post card
config/               ← site, socials, tracks, world, nav
content/world/        ← the world, one markdown file per entry
content/writing/      ← your posts
lib/                  markdown parsing, waveform generator, YouTube helpers
public/audio/         ← audio files, for anything not on YouTube
public/world/         ← images for world entries
```

---

Structure and conventions follow
[namanbarkiya/minimal-next-portfolio](https://github.com/namanbarkiya/minimal-next-portfolio),
reworked for music rather than a developer portfolio.
