export type RouteMatch =
  | { name: 'home' }
  | { name: 'songs' }
  | { name: 'albums' }
  | { name: 'albumDetail'; id: string }
  | { name: 'artists' }
  | { name: 'artistDetail'; id: string }
  | { name: 'playlistDetail'; id: string }
  | { name: 'settings' }
  | { name: 'search'; query: string };

function decodeSegment(segment: string): string {
  if (segment === '') return '';

  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function encodeSegment(segment: string): string {
  if (segment === '') return '';

  try {
    return encodeURIComponent(decodeURIComponent(segment));
  } catch {
    return encodeURIComponent(segment);
  }
}

export function normalizeRoutePath(path: string): string {
  if (!path) {
    return '/';
  }

  const prefixed = path.startsWith('/') ? path : `/${path}`;
  const collapsed = prefixed.replace(/\/{2,}/g, '/');
  const withoutTrailing = collapsed !== '/' ? collapsed.replace(/\/+$/, '') : '/';
  return withoutTrailing || '/';
}

export function matchRoute(path: string): RouteMatch {
  const normalized = normalizeRoutePath(path);
  if (normalized === '/') {
    return { name: 'home' };
  }

  const [head, ...rest] = normalized.slice(1).split('/');

  switch (head) {
    case 'songs':
      return rest.length === 0 ? { name: 'songs' } : { name: 'home' };
    case 'albums':
      if (rest.length === 0) return { name: 'albums' };
      if (rest.length === 1) return { name: 'albumDetail', id: decodeSegment(rest[0] ?? '') };
      return { name: 'home' };
    case 'artists':
      if (rest.length === 0) return { name: 'artists' };
      if (rest.length === 1) return { name: 'artistDetail', id: decodeSegment(rest[0] ?? '') };
      return { name: 'home' };
    case 'playlists':
      if (rest.length === 1) return { name: 'playlistDetail', id: decodeSegment(rest[0] ?? '') };
      return { name: 'home' };
    case 'settings':
      return rest.length === 0 ? { name: 'settings' } : { name: 'home' };
    case 'search': {
      if (rest.length === 0) return { name: 'search', query: '' };
      const query = rest.map((segment) => decodeSegment(segment)).join('/');
      return { name: 'search', query };
    }
    default:
      return { name: 'home' };
  }
}

export function routeToPath(route: RouteMatch): string {
  switch (route.name) {
    case 'home':
      return '/';
    case 'songs':
      return '/songs';
    case 'albums':
      return '/albums';
    case 'albumDetail':
      return `/albums/${encodeSegment(route.id)}`;
    case 'artists':
      return '/artists';
    case 'artistDetail':
      return `/artists/${encodeSegment(route.id)}`;
    case 'playlistDetail':
      return `/playlists/${encodeSegment(route.id)}`;
    case 'settings':
      return '/settings';
    case 'search': {
      const query = route.query.trim();
      if (!query) return '/search';
      const encodedQuery = query
        .split('/')
        .map((segment) => encodeSegment(segment))
        .join('/');
      return `/search/${encodedQuery}`;
    }
  }
}

export function searchTermToPath(searchTerm: string): string {
  const normalized = searchTerm.trim();
  if (!normalized) return '/';
  return routeToPath({ name: 'search', query: normalized });
}

export function getSearchRouteSyncTarget(searchTerm: string, currentPath: string): string | null {
  const desired = normalizeRoutePath(searchTermToPath(searchTerm));
  const current = normalizeRoutePath(currentPath);
  return desired === current ? null : desired;
}

