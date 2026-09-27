# Asset credits

- **Character:** Stickman by KOMIRA.studio, licensed under CC BY 4.0. The original attribution and source link are in [stickman-CREDITS.txt](public/models/stickman-CREDITS.txt).
- **Social icons:** Bootstrap Icons (MIT), GitHub Primer Octicons (MIT), and Simple Icons (CC0). License notices are retained in [bootstrap-icons-LICENSE.txt](public/brand/bootstrap-icons-LICENSE.txt) and [brand-icons-LICENSE.txt](public/brand/brand-icons-LICENSE.txt).
- **Corner artwork:** Full-resolution folded foreground and painted water-wave masks from the supplied Windows 11 Clean preset (Workshop 3102259274), which links to Windows 11 Animated & Customizable (Workshop 2531810451). The browser adapts the source wave shader, recolors the foreground, and omits the clock and other wallpaper layers. Rebuild assets with `scripts/prepare-home-folds.mjs` and the original source archive.
- **Design title:** Original animated monochrome SVG folds, adapted from the ideas title treatment. The earlier supplied In The Sky reference (Workshop 2335369259) remains archived in `public/scenes/design-sky/`; it is no longer loaded by the title.
- **Gallery:** XR Club photographs supplied for this website.
- **Glasses:** Supplied `AriaRender2.webp` artwork, with runtime masks defining the animated parts.
- **Contour reference:** Supplied Topographic DARK MODE preset (Workshop 3035743755); the animated web contour field is drawn procedurally.
- **Background artwork:** Supplied Wallpaper Engine material: Smooth Waves (Workshop 2566787975), orange clean by alexandr (Workshop 3685183632), and the cloud landscape (Workshop 3335707095). The homepage wave geometry follows the supplied Angled Waves preset.
- **Archived purple ripple scene (no longer loaded):** Original Three.js terrain and scroll-driven shaders inspired by the supplied Sonic Topography reference (Workshop 3747222633). No source bundle or media from that preset is loaded.
- **Cat:** Original full-resolution cat layers and parallax settings from the supplied Minimal Noir 4k wallpaper, uploaded by Drioyard (Workshop 3736099508). The supplied description does not identify the original cat artist. Only the cat layers are used; the website adds matching SVG paws, a tail, AR glasses, and a scroll-driven paper rift. Source layer positions and camera settings are retained in `public/scenes/cat/source.json`; rebuild with `scripts/prepare-cat.mjs`.
- **Cat pulling motion:** Weight-loading rhythm adapted from [CMU Graphics Lab Motion Capture Database, subject 81, trial 07](https://mocap.cs.cmu.edu/search.php?subjectnumber=81), pulling a heavy object at 120 fps. Only a smoothed, normalized root-height curve from frames 91–361 is used; the cat’s 2D arm constraints, grip, foot poses, and follow-through are original. Rebuild the small curve with `node scripts/prepare-cat-pull.mjs path/to/81_07.amc`. The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217.
- **Ocean reveal:** Original supplied Blender Ocean 4k video (Workshop 2902403306), retained at 3840�2160 without re-encoding.
- **Equipment:** Original product artwork supplied by XR Club, including lossless sources from the club’s equipment inventory. Higher-resolution [Meta Quest 3](https://www.meta.com/quest/quest-3/) and [Unitree Go2](https://shop.unitree.com/products/unitree-go2) cutouts come from their manufacturers’ product pages.
- **Typography:** Outfit and the title-only Labs Display face are served locally under the [SIL Open Font License](src/assets/fonts/Outfit-LICENSE.txt). Labs Display takes l, a, b, and s directly from the club’s drawn wordmark and extends that construction to the title alphabet. Outfit supplies fallback glyphs and punctuation. The original source and license are retained; rebuild the title face with [build-typeface.py](scripts/build-typeface.py).

- **Recognition marks:** Official Reality Hack at MIT, NASA, and Amazon logos; sources and ownership are recorded in [recognition sources](public/brand/recognition/SOURCES.md).

- **SUITS background:** Full-resolution Earth-view image extracted from the user-supplied Looking Out scene (Workshop 3699765486). The supplied project credits NASA. The website uses the image only.

Third-party assets retain their respective ownership and license terms.

The history section uses the club’s supplied history and [UMD’s account of Brendan Iribe’s 2014 gift](https://terp.umd.edu/record-31m-gift-to-jump-start-computer-science-building).

The SUITS opening and sign-in screen uses the original 3840 × 2160 ARTEMIS II JPEG from supplied Wallpaper Engine folder 2983810940. The dashboard uses the original, unmodified 2560 × 1440 cloudytakeoff PNG from In The Sky (Workshop 2335369259). The source files are served directly without cropping, mirroring, recompression, or generative edits. The browser fits them to the viewport. The older edited astronaut and title-cropped sky assets are no longer used by SUITS.

Team faces use [DiceBear Bottts Neutral](https://www.dicebear.com/styles/bottts-neutral/), based on Bottts by Pablo Stanley (free for personal and commercial use), through the DiceBear 10.x HTTP API. The SUITS helmet and suit-color treatment is original CSS. Only random avatar seeds are sent to DiceBear; names and email addresses are not included.

Workspace navigation and information hierarchy were informed by [Linear’s interface design](https://linear.app/changelog/2026-03-12-ui-refresh), with original translucent panels and space artwork for this site.

The SUITS animated sky recreates the source scene’s shine, rays and floating particles in a browser canvas over the unchanged source painting. Its animation pauses in hidden tabs and respects reduced-motion preferences.

The Google sign-in screen uses the original 3840 × 2160 Earth-window texture from Workshop scene 3699765486, copied without image processing. The opening-workspace screen uses the original streaked-astronaut JPEG.

The animated dashboard also uses the four original lens-flare textures packaged in the supplied In The Sky scene (Workshop 2335369259, texture paths credited there to Workshop 2188505192). These were decoded from their texture containers. The underlying sky image remains unmodified.
