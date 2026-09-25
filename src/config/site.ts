const base = import.meta.env.BASE_URL;

export const siteLinks = {
  home: base,
  about: `${base}about`,
  equipment: `${base}equipment`,
  projects: `${base}projects`,
  sponsors: 'https://xr.umd.edu/sponsors',
  ideate: 'https://xr.umd.edu/ideate',
} as const;
