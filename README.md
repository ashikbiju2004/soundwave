# 🎵 SoundWave

A full-featured Spotify-like music platform — upload, stream, organize and sync your music across devices. Built as a pure front-end SPA deployable to Netlify in seconds.

---

## ✨ Features

| Feature | Details |
|---|---|
| **Auth Gate** | Email/password + Google OAuth sign-in, guest mode |
| **User Roles** | Admin and User roles with full RLS in Supabase |
| **Upload Music** | Drag & drop MP3, WAV, FLAC, M4A, OGG, AAC |
| **ID3 Tag Parsing** | Auto-reads title, artist, album & cover art |
| **Cloud Sync** | Songs, playlists & liked state synced via Supabase |
| **Playlists** | Create, rename, reorder, add cover art |
| **Liked Songs** | Heart any song, persistent across sessions |
| **10-Band EQ** | Web Audio API equalizer with presets |
| **Synced Lyrics** | LRClib (free) + Musixmatch, scrolling karaoke-style |
| **Visualizer** | 4 modes: Bars, Waveform, Circle, Particles |
| **YouTube Import** | Search & stream YouTube via IFrame API |
| **Admin Panel** | User management, song moderation, audit logs, settings |
| **PWA** | Installable, offline-capable, media session API |
| **Keyboard Shortcuts** | Space, Ctrl+arrows, F, L, Q, S, Esc |

---

## 🚀 Deploy to Netlify (5 minutes)

### Option A — Netlify Drop
1. Download and unzip the project
2. Go to **[app.netlify.com/drop](https://app.netlify.com/drop)**
3. Drag the `soundwave/` folder onto the page ✅

### Option B — GitHub + Netlify
1. Push to GitHub
2. Netlify → Add site → Import from Git
3. Build command: *(empty)* · Publish directory: `.`
4. Deploy ✅

---

## 🗄️ Supabase Setup (for auth + cloud sync)

### Step 1 — Create Project
1. Go to **[supabase.com](https://supabase.com)** → New project
2. Choose a region close to your users
3. Note your **Project URL** and **anon public key** from Settings → API

### Step 2 — Run Schema
1. In Supabase Dashboard → **SQL Editor**
2. Open `supabase/schema.sql` from this project
3. Paste the entire file and click **Run**
4. This creates: `profiles`, `songs`, `playlists`, `play_history`, `admin_logs`, `app_settings` tables + all RLS policies + helper functions

### Step 3 — Create Storage Buckets
In Supabase Dashboard → **Storage** → New bucket:
- Name: `audio`  · Public: **No** (private)
- Name: `covers` · Public: **Yes** (public read)

The storage RLS policies are already in `schema.sql` — they run automatically.

### Step 4 — Enable Google Auth (optional)
1. Supabase → Authentication → Providers → Google → Enable
2. Go to [console.cloud.google.com](https://console.cloud.google.com)
3. Create OAuth 2.0 credentials → Web application
4. Add your Netlify URL as authorized origin + redirect URI:
   `https://your-site.netlify.app`
5. Paste Client ID + Secret into Supabase Google provider settings

### Step 5 — Configure the App
Open `js/app.js` and replace at the top:
```js
const SUPABASE_URL  = 'https://xyzabc.supabase.co';   // your Project URL
const SUPABASE_ANON = 'eyJhbGciOi...';                 // your anon key
```

### Step 6 — Set Environment Variables in Netlify
In Netlify Dashboard → Site → Environment variables:
```
MUSIXMATCH_KEY = your_musixmatch_api_key   (optional, for lyrics)
```

### Step 7 — Create First Admin User
1. Sign up normally through the app
2. In Supabase SQL Editor run:
```sql
UPDATE public.profiles
SET role = 'admin', plan = 'admin', storage_limit = 107374182400
WHERE email = 'your@email.com';
```
3. Refresh the app → Admin Panel link appears in sidebar ✅

---

## 📺 YouTube Import Setup (optional)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Enable **YouTube Data API v3**
3. Create API key → restrict to your domain
4. Open `js/modules/youtube.js` and replace:
```js
const YOUTUBE_API_KEY = 'your_key_here';
```

---

## 🎤 Lyrics Setup (optional)

**LRClib** (synced lyrics) works out of the box — no key needed.

**Musixmatch** (richer lyrics):
1. Get free key at [developer.musixmatch.com](https://developer.musixmatch.com)
2. Add `MUSIXMATCH_KEY` in Netlify environment variables
3. The `netlify/functions/lyrics.js` serverless function handles the proxy

---

## 📁 File Structure

```
soundwave/
├── index.html                    # App shell with auth gate + all views
├── manifest.json                 # PWA manifest
├── sw.js                         # Service Worker (offline)
├── netlify.toml                  # Netlify config + headers
├── _redirects                    # SPA routing
│
├── supabase/
│   └── schema.sql                # Complete DB schema, RLS, functions
│
├── netlify/functions/
│   └── lyrics.js                 # Musixmatch proxy serverless function
│
├── css/
│   ├── main.css                  # Design tokens, layout, cards, rows
│   ├── player.css                # Player bar + queue panel
│   ├── sidebar.css               # Sidebar + library
│   ├── views.css                 # View-specific styles
│   └── modules/
│       ├── auth.css              # Auth gate + profile styles
│       ├── admin.css             # Admin panel styles
│       └── visualizer.css        # Visualizer overlay styles
│
└── js/
    ├── store.js                  # IndexedDB + localStorage + ID3 parser
    ├── audio.js                  # Audio engine (playback, events)
    ├── ui.js                     # UI helpers (player, toasts, modals, rows)
    ├── views.js                  # Home, Search, Playlist, Liked, Profile
    ├── app.js                    # Master bootstrap + auth + event wiring
    └── modules/
        ├── cloud.js              # Supabase cloud sync
        ├── equalizer.js          # 10-band Web Audio EQ
        ├── lyrics.js             # LRClib + Musixmatch synced lyrics
        ├── visualizer.js         # Canvas visualizer (4 modes)
        ├── youtube.js            # YouTube IFrame import
        └── admin.js              # Full admin panel (users, songs, logs)
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `Ctrl+→` | Next track |
| `Ctrl+←` | Previous / Restart |
| `Ctrl+↑` | Volume up |
| `Ctrl+↓` | Volume down |
| `F` or `/` | Focus search |
| `L` | Like current song |
| `Q` | Toggle queue |
| `S` | Toggle shuffle |
| `Esc` | Close panels/modals |

---

## 🎨 Customise

**Accent color** — in `css/main.css`:
```css
--accent: #1DB954;   /* green (default) */
--accent: #6c63ff;   /* purple */
--accent: #ff6b6b;   /* red */
```

**App name** — in `index.html` (logo text) + `manifest.json`

---

## 📄 License

MIT — free to use, modify and deploy.
