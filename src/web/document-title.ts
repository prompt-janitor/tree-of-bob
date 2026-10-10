// Web document titles, one per screen. Titles name the screen only, never a Bob or anything else from the
// story, so a browser tab, history entry or bookmark cannot spoil. Used by the inline script in +html.tsx
// (first paint of every page) and by the tab layout (in-app navigation).

export const APP_TITLE = 'Tree of Bob';

/** Screen names by route path (without the web base path). Unknown paths get the plain app title. */
export const SCREEN_TITLES: Record<string, string> = {
  '/': 'Chapter',
  '/tree': 'Tree',
  '/systems': 'Systems',
  '/log': 'Log',
  '/others': 'Others',
  '/about': 'About',
  '/search': 'Search',
  '/progress': 'Reading position',
  '/key': 'Key',
  '/systems-list': 'Everyone',
  '/licenses': 'Credits & licences',
};

/** Title for a route path such as "/tree" (query, hash and trailing slash ignored). */
export function documentTitle(pathname: string): string {
  const path = pathname.split(/[?#]/)[0].replace(/\.html$/, '').replace(/\/index$/, '/').replace(/(.)\/+$/, '$1') || '/';
  const screen = SCREEN_TITLES[path];
  return screen ? `${screen} · ${APP_TITLE}` : APP_TITLE;
}
