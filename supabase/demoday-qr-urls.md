# Demo Day QR codes

Print one QR per booth. Each QR encodes its booth's URL.
The order in `src/lib/demoday.ts` and `supabase/demoday.sql` is what the game enforces.
The info booth has no QR; that is where players register.

| # | Station | URL to encode |
|---|---|---|
| 1  | App Dev | https://xr.umd.edu/demoday/scan?s=a1f3c9 |
| 2  | Drone Club | https://xr.umd.edu/demoday/scan?s=b2e7d4 |
| 3  | UMD Athletics | https://xr.umd.edu/demoday/scan?s=c4a8f1 |
| 4  | Great Teachers | https://xr.umd.edu/demoday/scan?s=d6b2a9 |
| 5  | TestuGo | https://xr.umd.edu/demoday/scan?s=e8c5b3 |
| 6  | Augmented Worlds | https://xr.umd.edu/demoday/scan?s=f1d7e6 |
| 7  | Tron | https://xr.umd.edu/demoday/scan?s=g3a4c8 |
| 8  | Double Point | https://xr.umd.edu/demoday/scan?s=h5f2b7 |
| 9  | Sisu VR | https://xr.umd.edu/demoday/scan?s=i7e9d2 |
| 10 | Tanit XR | https://xr.umd.edu/demoday/scan?s=j2b6c1 |
| 11 | Paraverse | https://xr.umd.edu/demoday/scan?s=k4d8a5 |
| 12 | vuseXR | https://xr.umd.edu/demoday/scan?s=l6c3f9 |
| 13 | Virnect | https://xr.umd.edu/demoday/scan?s=m8a7b4 |
| 14 | Niantic | https://xr.umd.edu/demoday/scan?s=n1f5e2 |
| 15 | Immersive Installation | https://xr.umd.edu/demoday/scan?s=o3b9d7 |
| 16 | Rosetta Engine | https://xr.umd.edu/demoday/scan?s=p5e1c6 |

## Reveal image

Drop a single 1024 x 1024 image at `public/demoday-reveal.jpg` (or any path) and replace the
linear gradient in `src/pages/demoday/play.astro` and `finish.astro`:

```css
.dd-fragments { --dd-frag-img: url('/demoday-reveal.jpg'); }
```

The page slices it into a 4 x 4 grid automatically; one tile is revealed per scan.
