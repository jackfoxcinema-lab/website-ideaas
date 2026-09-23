# Audio

Drop snippet files here, then point at them from `config/tracks.ts`:

```ts
{ id: "kitchen-window", audio: "/audio/kitchen-window.mp3", ... }
```

Notes:

- **Format:** mp3 or m4a. Both play everywhere; wav works but is large.
- **Size:** keep each file under ~5 MB. These are snippets — 128 kbps mono is
  plenty for a voice memo.
- **Naming:** match the track `id` so they're easy to pair up.
- A track with `audio: ""` renders as "Audio coming soon" instead of a player,
  so you can list something before the file is ready.
