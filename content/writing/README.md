# Writing

One markdown file per post. The filename becomes the URL:
`content/writing/my-post.md` → `/writing/my-post`.

Frontmatter:

```yaml
---
title: "Post title"
date: "2026-09-14"        # YYYY-MM-DD, used for sorting
description: "One or two lines shown in the list and in link previews."
tags: ["process", "demos"] # optional
track: "song-one"          # optional — id from config/tracks.ts, embeds a player
featured: true             # optional — pins it to the home page
---
```

Below the frontmatter, write normal markdown. A `>` blockquote renders in the
display serif, which is what to use for lyrics.
