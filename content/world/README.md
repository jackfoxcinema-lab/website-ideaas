# The world

One markdown file per entry. The filename becomes the URL:
`content/world/the-glasshouse.md` → `/world/the-glasshouse`.

This folder is the project. Add to it whenever a song turns up something new —
a room, a person, an object, a thing that happened. Nothing has to be finished
and nothing has to be consistent with what's already here; when a new song
contradicts an old entry, rewrite the old entry.

## Frontmatter

```yaml
---
title: "the glasshouse"
kind: place                # place | figure | object | event | fragment
date: "2026-09-14"         # when it entered the world — used for sorting
description: "One or two lines, shown in the index and in link previews."
song: "song-one"           # optional — an id from config/tracks.ts
youtube: ""                # optional — a video that belongs to this entry
image: "/world/glass.jpg"  # optional — a file in public/world
tags: ["glass", "green"]   # optional
order: 1                   # optional — hand-place it; unset sorts by date
featured: true             # optional — pins it to the home page
---
```

Below the frontmatter, write normal markdown. A `>` blockquote renders in the
display serif, which is what to use for lyrics.

## The kinds

`kind` decides which section of `/world` the entry lands in. The five that
ship are places, figures, objects, events and fragments — rename them or add
your own in `config/world.ts`. Use **fragment** for anything you can't place
yet; that's what it's there for, and an entry can always be moved later.

## Tying an entry to a song

Set `song:` to a track's `id` from `config/tracks.ts`. That does two things:

- the entry's page gets a player for that song, so you can hear the thing
  you're reading about;
- the song's card on `/songs` lists every entry that names it.

Entries that share a song also show up under "Nearby" on each other's pages,
so a listener who follows one song can keep walking.

## Video

`youtube:` takes a full YouTube link or a bare video id. Use it for anything
that belongs to the entry rather than to a song — a sit-down video, a
walkthrough, a scene. Nothing loads from YouTube until someone clicks play.

## Drafts

Prefix a filename with `_` (`_the-orchard.md`) and it stays out of the site
until you rename it.

## Before you launch

Delete these four example entries once you have your own:
`the-glasshouse.md`, `the-keeper.md`, `the-brass-key.md`, `the-long-winter.md`.
The premise at the top of `/world` lives in `config/world.ts` — write that in
your own words first, it's the thing people read before anything else.
