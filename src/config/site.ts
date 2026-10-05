const base = import.meta.env.BASE_URL;

export const siteLinks = {
  home: base,
  suits: `${base}suits/team/`,
  about: `${base}about`,
  equipment: `${base}equipment`,
  projects: `${base}projects`,
  sponsors: 'https://xr.umd.edu/sponsors',
  ideate: `${base}ideate/`,
} as const;
