# XR Labs

The XR Club at UMD scrolling website, built with Astro, TypeScript, and Three.js. A single page moves from the home scene, with a sculptural corner accent, into project folders, an exploded glasses assembly, and a layered cloud landscape telling the club’s story. A split circular opening follows the birds before entering the full cloud landscape. The cloud story covers the club, community, history, and recognition. The cloud page turns directly into an Emotiv folder. A selection of 28 XR devices and major hardware rotates through a single carousel in off-white folders with soft silhouette shadows on a pure-white background, with each item moving through the center. Continuing past the carousel opens a narrow slit in the white page. A black cat wearing AR glasses peeks through, steps out one paw at a time, and watches the cursor as the slit closes behind it. Scrolling backward reverses the entrance and restores the equipment carousel.

## Development

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

```sh
npm run check
npm test
npm run build
npm run preview
```

The build produces a static site in `dist/`. The public landing pages work without a database. The restored SUITS, account, admin, and Demo Day tools connect to the existing Supabase backend using the public settings described below. The club guide answers common questions from local content; funding, proposals, and sponsor links lead to the club's main website. Typography is served locally: Outfit for interface text and body copy, and the wordmark-derived Labs Display for major titles.

## Structure

```text
src/
  assets/home/       Gallery photographs
  components/        Header, footer, and shared button shape
  config/            Club links
  data/              Project content, club story, and glasses part masks
  features/
    home/            Gallery, corner artwork, headings, and wave background
    projects/        Project cabinet, glasses assembly, scroll timing
    sky/             Orange transition, cloud descent, and club story
    equipment/       Page flip, equipment carousel, and cat entrance
    assistant/       Local guide and chat placement
  layouts/           Page shell and metadata
  lib/               Shared geometry, navigation, and pointer interactions
  pages/             Homepage entry point
  styles/            Global resets and shared styles
public/
  brand/             Logo and social icons
  equipment/         Product images used by the equipment carousel
  models/            Runtime character model
  scenes/            Wave, glasses, and cloud artwork
```

Components, styles, and motion controllers live together within each feature. `projectStory.ts` coordinates the scroll sequence; `projectStoryMotion.ts` holds its geometry and timing helpers. `skyJourney.ts` continues the sequence into the sky. `skyTimeline.ts` separates the folder flip, liquid reveal, and zoom; `skyStoryMotion.ts` defines the bird-focused opening and continuous reading sequence. `equipmentMotion.ts` defines the full-page turn, shared folder contour, and circular carousel layout. Equipment images load in a small window around the visible cards. `equipmentCatMotion.ts` defines the slit and staggered steps; `equipmentCat.ts` uses the original parallax depths and camera response from the supplied cat for cursor tracking. The full-resolution head, eyes, pupils, whiskers, and body remain separate lossless image planes; code-drawn paws, tail, and AR frames share their transforms. SVG clipping reveals the cat through the page. Pointer rendering stops when it settles or the scene is hidden. Reduced motion shows a still cat with a gentle fade. Rebuild the five source layers with `node scripts/prepare-cat.mjs "path/to/scene.pkg"` using the supplied Minimal Noir archive (Workshop 3736099508). `ariaAssemblyWorker.ts` prepares the glasses layers without blocking the page.

Edit project details in `src/data/projects.json`, club story text in `src/data/clubStory.ts`, equipment in `src/data/equipment.ts`, and club links in `src/config/site.ts`. Preserve the part masks when replacing the glasses image. Browser controllers mount on `astro:page-load` and dispose on `astro:before-swap`.

Before shipping motion changes, check forward and reverse scrolling, project navigation, the photo viewer, chat dragging, narrow screens, and reduced motion. Continuous integration checks types and builds the site on pushes and pull requests.

Third-party artwork and icon credits are listed in [CREDITS.md](CREDITS.md).

## Loading and scroll performance

The homepage stays hidden only until its opening frame is complete: fonts, the first gallery photo, the header logo, and, for `/about`, `/projects`, and `/equipment`, that address's scene, so the home scene never flashes first. The still wave SVG matches the shader's first frame, so the WebGL waves take over after the page settles; with reduced motion the page waits for WebGL, whose static frame shows the full spectrum. Later slides load one at a time in slideshow order once the page settles; cloud chapters and sponsor logos warm before entry. Sky artwork warms when the opening scroll starts, and direct About navigation waits for its images before the reveal. three.js, the orange sky texture, and the glasses layers load after the page settles, and the Supabase client after it appears; the Supabase client loads immediately when a sign-in link returns with tokens. Astro fires the first `astro:page-load` on the window `load` event, so every eagerly loaded image, preload, and static import delays the reveal: keep later-scene assets out of eager markup, preloads, and the static import graph. Arriving from another page on the site keeps that page on screen until the homepage's opening frame is ready (`data-home-arrival` in `PageTransitions.astro` and `suitsPageTransition.js`), then plays the usual cross-fade or the NASA SUITS liquid reveal. Full-page arrivals hold only in Chromium, because a WebKit build crashed while rendering the homepage inside a cross-document view transition. A first visit or reload instead shows `HomeIntro` as soon as the browser can paint: a sheet of folder paper filling the screen with the XR Labs logo large in the middle. When the opening frame is ready, the page paints once under the paper (`data-home-painting`), so the morph starts on an idle frame. The paper then shrinks into a folder on the first photo's frame, uncovering the page around it with no fade, and flips over, while the logo glides into the header's logo, taking its colours on the way (the header's own logo is hidden until it lands); the photo rides on its back (a copy of the slide already on the page, while the page's own photo is hidden), so the flip lands on identical pixels before the overlay leaves. The flip swaps faces by opacity exactly edge-on as well as by `backface-visibility`. Section addresses and early scrolling shrink the paper to a small folder in the middle and let it go; reduced motion fades it. Scrolling into the project story mid-morph hands the photo straight back to the story. Work that could stall the flip (WebGL, three.js, the glasses layers, slideshow autoplay and slide warming) waits for `homeSettled()` or `xr:home-settled`, which follow the intro, or the reveal when there is none. Keep these preparation calls when changing hidden/lazy images: awaiting `decode()` without first promoting the image can stall a hidden slide.

Outfit is served as a losslessly compressed WOFF2 (45,100 bytes, previously 110,884), with the TTF source retained. All photo variants, quality settings, texture resolution, and renderer pixel ratios are preserved. Hidden background birds are paused; completed collage poses and invisible equipment racks skip redundant rendering. The original 3840�2160 ocean video remains unchanged and starts buffering only during the cat sequence.

The cloud reading segment uses 11.2 viewport heights (previously 14). The opening photo flight, Projects hold, folder/sky transition, and 4.6-height cloud introduction retain their original timings. `npm test` covers these boundaries, forward/reverse motion, cat contact, and community layout proportions; CI runs it alongside type checking and the production build.

First-visit verification used the production preview at 1280�720. Initial eager gallery/cloud/logo markup fell from 46 image elements (36 unique URLs, 1,989,992 selected-variant bytes) to the single 54,890-byte hero. Those figures describe eager image assets, not total page transfer or a loading-time benchmark. A fresh local origin confirmed no cloud photographs, sky layers, or ocean video had loaded at the initial homepage snapshot; later slides and scenes remained available through prewarming.

For deployment, serve `dist/` with HTTPS and Brotli or gzip for HTML/CSS/JS/SVG. Content-hashed `/_astro/` files can use long immutable caching; revalidate HTML and unversioned `/scenes/` assets when publishing updates. Load time still depends on connection speed and device capability. No service worker is used, so deployments cannot be hidden behind an old offline cache.

## Restored applications and backend

The former site's application routes are included in this project:

- `/suits/team/`: Google sign-in for UMD accounts, overview, proposal PDFs with role highlights, tasks, meetings and RSVPs, documents, Drive sync, Discord integration, roster, and profile/role management. Section links such as `/suits/team/tasks/` remain valid.
- `/suits/workspace/applications/`: application reviews inside the SUITS workspace, including applicant search and filters, interview availability, resumes, private reviewer notes, status changes, and CSV export. Only the verified `kcyle@terpmail.umd.edu` account can access reviews or resumes. `/suits/dashboard/` and `/suits-dashboard/` remain compatible entry points through SUITS sign-in; there is no shared reviewer password.
- `/login/`, `/signup/`, `/forgot-password/`, `/reset-password/`, `/verify-email/`, and `/dashboard/`: the existing account and club administration tools.
- `/demoday/`, `/demoday/play/`, `/demoday/scan/`, `/demoday/finish/`, `/demoday/leaderboard/`, and `/demoday/vote/`: the existing event tools.
- `/ideate/` retains the old site's Coming Soon page. The SUITS application form and former `/apply/` alias remain removed; existing database records remain in the original Supabase project.

Copy `.env.example` to `.env.local` and supply `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` from the **existing** Supabase project. These are browser-safe public values; authentication and row-level policies enforce access. Never place service-role keys or Drive/Discord credentials in a `PUBLIC_` variable. Set the same public values in the deployment build environment; Astro embeds them at build time. The UMD deployment uses the original Google popup and `PUBLIC_GOOGLE_CLIENT_ID` from the former site; its ID token is exchanged through the same Supabase client. Local preview origins use Supabase OAuth redirects so they do not trigger Google origin_mismatch. Google may display the Supabase project hostname during that redirect; this is the existing authentication service. To use the branded popup on another origin, first register that exact JavaScript origin in the existing Google OAuth client, then add the registered hostname to the popup origin check.

The original Google Identity Services popup is in `src/scripts/suits/index.ts`: Google's credential is exchanged with `signInWithIdToken` in the existing Supabase project. The old site's `public/googlee42adcc76ae3d047.html` domain-verification file is preserved at the same public path. This verification file does not change the hostname displayed by the fallback redirect. The build workflow reads the same three repository secret names as the old site's deployment: `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, and `PUBLIC_GOOGLE_CLIENT_ID`. A separate GitHub repository must have those existing public settings supplied; referencing the names does not copy repository secrets or change Google Cloud settings.

Keep the existing Supabase database, storage buckets, Google provider configuration, and deployed Edge Functions. The root `supabase-schema.sql`, `supabase/demoday.sql`, and `supabase/migrations/` preserve the original schema history; they are not a reset script for an existing database. `supabase/functions/` contains the original server-side integrations and uses secrets configured in Supabase. The website restoration does not recreate tables, migrate production data, or deploy those functions.

Confirm that the deployed origin and development callback addresses are allowed in Supabase Auth. The fallback Google sign-in uses a full-page redirect through the existing Supabase callback, returning through `/auth/callback/`, which waits for the original Supabase client to persist the session, clears the callback address, then returns to the requested team section or login route; password recovery returns to `/reset-password`. For this local preview, allow the exact URL `http://127.0.0.1:4342/auth/callback/` in Supabase Auth → URL Configuration → Redirect URLs. Keep the production Site URL and existing entries. Add `http://localhost:4342/auth/callback/` only if using that host. A return to the production homepage requires checking the saved redirect settings and starting a fresh login from the preview, rather than reusing an older Google tab. The old Google popup required each preview origin to be separately registered with Google, causing `origin_mismatch` on unregistered local addresses. The redirect flow uses the already configured Supabase callback instead. The Supabase client, project, token storage key, session persistence, and refresh behavior are unchanged, so existing sessions on `https://xr.umd.edu` remain compatible. Localhost has its own browser session because it is a different origin.

Before publishing, verify Google login with a UMD account and exercise one task, meeting RSVP, and document upload in an appropriate test environment. Check both member and manager permissions. The application shell uses full-page navigation and initializes the original controllers once on each load; the public scrolling homepage retains its existing navigation system.

If Google Drive is not configured in a fresh environment, enable the Drive and Docs APIs for the existing Google project, create a service account, and store its JSON as the server-side `SUITS_GOOGLE_SERVICE_ACCOUNT` Supabase secret. A team lead can then share a Drive folder with the service account and paste its link in Documents. Share it as an **Editor** and leave "Editors can change permissions and share" on (Share → gear icon); the scheduled `cron` job then shares the folder with every approved member, so Drive links open without an access request. Existing deployments retain their current integration configuration.

## SUITS calendar workspace

Sign-in remains at `/suits/team/`; authenticated members enter the full-window `/suits/workspace/` with a separate astronaut background and no public website header. Calendar offers day, week, month, and schedule views; all-team and subteam events; private one-to-one check-ins; weekly scheduling; RSVP; Google Calendar export; and Discord channel selection. Managers create, edit, and cancel meetings.

The additive calendar migration and existing Discord bot extension are in `supabase/`. Follow `supabase/CALENDAR-SETUP.md` to activate them in the existing project. The calendar migration and bot upgrade were activated in the existing project on September 26, 2026; the preserved 30-second scheduler returned a healthy calendar response. Development preview `/suits/preview/` uses labeled sample data only and is excluded from production. `npm test` includes isolated database permission and reminder-delivery tests that never send real messages.

## Owner-only application review rollout

The application integration and access restriction require a backend update; local tests do not change production permissions.

1. Deploy the updated `suits-review` function, including `_shared/suits-review.ts`, to the existing project with `--no-verify-jwt`. The handler verifies every bearer token with Supabase Auth and checks the confirmed owner email before any read or write. It uses the caller's session and public key, never the service role. This step disables the old password endpoint.
2. Apply only `supabase/migrations/20260927020000_suits_application_owner.sql`. It restricts application and resume reads, edits, and deletion to that verified account, including direct API requests. Existing board/admin roles do not grant access. It preserves application records and existing submission policies; unrelated storage buckets retain their permissions.
3. Publish the updated frontend. Verify the owner sees Applications in the SUITS navigation and another member cannot open reviews, including by direct URL. The old `SUITS_DASHBOARD_PASSWORD` secret is no longer used and can be removed from the server.

`npm test` checks the actual review handler and database policies against anonymous, board, forged-email, unconfirmed-email, and stale-email requests. Development preview `/suits/preview/?view=applications` uses only in-memory sample applications; add `&member=1` to check the denied member view. No test reads real applications or changes real applicant decisions.
