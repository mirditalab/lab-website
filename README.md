Lab website

Rebuild the site
- Edit `index.template.html` (keep the `team:grid` and `team:details` markers in the Team section).
- Add or update team members under `team/<member>/` with a `profile.md` (front matter + HTML body) and an `avatar.jpg` or `avatar.png`.
- Generate the rendered page (requires ImageMagick to optimize avatars into `static/team/`):

```bash
node scripts/build-team.mjs
```

This writes the full rendered page to `index.html` from `index.template.html`.
