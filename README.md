# XR Labs

The XR Club at UMD scrolling website, built with Astro, TypeScript, and Three.js. A single page moves from the home scene, with a sculptural corner accent, into project folders, an exploded glasses assembly, and a layered cloud landscape telling the clubâ€™s story. A split circular opening follows the birds before entering the full cloud landscape. The cloud story covers the club, community, history, and recognition. The cloud page turns directly into an Emotiv folder. A selection of 28 XR devices and major hardware rotates through a single carousel in off-white folders with soft silhouette shadows on a pure-white background, with each item moving through the center. Continuing past the carousel opens a narrow slit in the white page. A black cat wearing AR glasses peeks through, steps out one paw at a time, and watches the cursor as the slit closes behind it. Scrolling backward reverses the entrance and restores the equipment carousel.

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

The build produces a static site in `dist/`. No database, credentials, or environment variables are required. The club guide answers common questions from local content; funding, proposals, and sponsor links lead to the club's main website. Typography is served locally: Outfit for interface text and body copy, and the wordmark-derived Labs Display for major titles.

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

The first gallery image is eager/high priority. Later slides decode one ahead; cloud chapters and sponsor logos warm before entry. Sky artwork warms when the opening scroll starts, and direct About navigation waits for its images before capturing the reveal. Keep these preparation calls when changing hidden/lazy images: awaiting `decode()` without first promoting the image can stall a hidden slide.

Outfit is served as a losslessly compressed WOFF2 (45,100 bytes, previously 110,884), with the TTF source retained. All photo variants, quality settings, texture resolution, and renderer pixel ratios are preserved. Hidden background birds are paused; completed collage poses and invisible equipment racks skip redundant rendering. The original 3840×2160 ocean video remains unchanged and starts buffering only during the cat sequence.

The cloud reading segment uses 11.2 viewport heights (previously 14). The opening photo flight, Projects hold, folder/sky transition, and 4.6-height cloud introduction retain their original timings. `npm test` covers these boundaries, forward/reverse motion, cat contact, and community layout proportions; CI runs it alongside type checking and the production build.

First-visit verification used the production preview at 1280×720. Initial eager gallery/cloud/logo markup fell from 46 image elements (36 unique URLs, 1,989,992 selected-variant bytes) to the single 54,890-byte hero. Those figures describe eager image assets, not total page transfer or a loading-time benchmark. A fresh local origin confirmed no cloud photographs, sky layers, or ocean video had loaded at the initial homepage snapshot; later slides and scenes remained available through prewarming.

For deployment, serve `dist/` with HTTPS and Brotli or gzip for HTML/CSS/JS/SVG. Content-hashed `/_astro/` files can use long immutable caching; revalidate HTML and unversioned `/scenes/` assets when publishing updates. Load time still depends on connection speed and device capability. No service worker is used, so deployments cannot be hidden behind an old offline cache.
