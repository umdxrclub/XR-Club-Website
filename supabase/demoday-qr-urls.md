# Demo Day QR codes

Print one QR per booth. Each QR encodes its booth's URL.
The order in `src/lib/demoday.ts` and `supabase/demoday.sql` is what the game enforces.
Players register on the website first, then the info booth's QR is the first scan.

| # | Station | URL to encode |
|---|---|---|
| 1  | XR Club Info Booth | https://xr.umd.edu/demoday/scan?s=q7c2a3 |
| 2  | IMDM | https://xr.umd.edu/demoday/scan?s=r9d4e5 |
| 3  | App Dev | https://xr.umd.edu/demoday/scan?s=a1f3c9 |
| 4  | Drone Club | https://xr.umd.edu/demoday/scan?s=b2e7d4 |
| 5  | UMD Athletics | https://xr.umd.edu/demoday/scan?s=c4a8f1 |
| 6  | Great Teachers | https://xr.umd.edu/demoday/scan?s=d6b2a9 |
| 7  | TestuGo | https://xr.umd.edu/demoday/scan?s=e8c5b3 |
| 8  | Augmented Worlds | https://xr.umd.edu/demoday/scan?s=f1d7e6 |
| 9  | Tron | https://xr.umd.edu/demoday/scan?s=g3a4c8 |
| 10 | Double Point | https://xr.umd.edu/demoday/scan?s=h5f2b7 |
| 11 | Sisu VR | https://xr.umd.edu/demoday/scan?s=i7e9d2 |
| 12 | Tanit XR | https://xr.umd.edu/demoday/scan?s=j2b6c1 |
| 13 | Paraverse | https://xr.umd.edu/demoday/scan?s=k4d8a5 |
| 14 | vuseXR | https://xr.umd.edu/demoday/scan?s=l6c3f9 |
| 15 | Virnect | https://xr.umd.edu/demoday/scan?s=m8a7b4 |
| 16 | Niantic | https://xr.umd.edu/demoday/scan?s=n1f5e2 |
| 17 | Immersive Installation | https://xr.umd.edu/demoday/scan?s=o3b9d7 |
| 18 | Rosetta Engine | https://xr.umd.edu/demoday/scan?s=p5e1c6 |

## Reveal model

The progress reveal is a Three.js wireframe Testudo, with 18 parts shown in
silhouette-first order (shell rim, carapace, plastron rim, plastron, spine,
three scute arcs, four legs, tail, neck, head, snout, then each eye).
Edit `src/lib/demoday-reveal.ts` to retune part proportions.
