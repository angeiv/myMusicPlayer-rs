import type { AppSection, LibraryView } from '../../types';
import { navigate } from '../../stores/router';
import { getSearchRouteSyncTarget, routeToPath, type RouteMatch } from '../../routing/routes';

export type SidebarNavigateDetail = { section: AppSection; libraryView?: LibraryView };

export function deriveAppShellRouteState(route: RouteMatch): {
  activeSection: AppSection;
  activeLibraryView: LibraryView;
  activePlaylistId: string | null;
  searchTerm: string;
} {
  switch (route.name) {
    case 'home':
      return {
        activeSection: 'home',
        activeLibraryView: 'songs',
        activePlaylistId: null,
        searchTerm: '',
      };
    case 'settings':
      return {
        activeSection: 'settings',
        activeLibraryView: 'songs',
        activePlaylistId: null,
        searchTerm: '',
      };
    case 'songs':
      return {
        activeSection: 'library',
        activeLibraryView: 'songs',
        activePlaylistId: null,
        searchTerm: '',
      };
    case 'albums':
      return {
        activeSection: 'library',
        activeLibraryView: 'albums',
        activePlaylistId: null,
        searchTerm: '',
      };
    case 'albumDetail':
      return {
        activeSection: 'library',
        activeLibraryView: 'albumDetail',
        activePlaylistId: null,
        searchTerm: '',
      };
    case 'artists':
      return {
        activeSection: 'library',
        activeLibraryView: 'artists',
        activePlaylistId: null,
        searchTerm: '',
      };
    case 'artistDetail':
      return {
        activeSection: 'library',
        activeLibraryView: 'artistDetail',
        activePlaylistId: null,
        searchTerm: '',
      };
    case 'playlistDetail':
      return {
        activeSection: 'library',
        activeLibraryView: 'playlistDetail',
        activePlaylistId: route.id,
        searchTerm: '',
      };
    case 'search':
      return {
        activeSection: 'library',
        activeLibraryView: 'songs',
        activePlaylistId: null,
        searchTerm: route.query,
      };
  }
}

export function handleSidebarNavigation(detail: SidebarNavigateDetail, activePlaylistId: string | null): void {
  if (detail.section === 'home') {
    navigate(routeToPath({ name: 'home' }));
    return;
  }

  if (detail.section === 'settings') {
    navigate(routeToPath({ name: 'settings' }));
    return;
  }

  const view = detail.libraryView ?? 'songs';
  switch (view) {
    case 'songs':
      navigate(routeToPath({ name: 'songs' }));
      return;
    case 'albums':
      navigate(routeToPath({ name: 'albums' }));
      return;
    case 'artists':
      navigate(routeToPath({ name: 'artists' }));
      return;
    case 'playlistDetail':
      if (activePlaylistId) {
        navigate(routeToPath({ name: 'playlistDetail', id: activePlaylistId }));
      } else {
        navigate(routeToPath({ name: 'songs' }));
      }
      return;
    default:
      navigate(routeToPath({ name: 'songs' }));
  }
}

export function handleSelectPlaylistNavigation(id: string): void {
  navigate(routeToPath({ name: 'playlistDetail', id }));
}

export function handleOpenAlbumNavigation(id: string): void {
  navigate(routeToPath({ name: 'albumDetail', id }));
}

export function handleOpenArtistNavigation(id: string): void {
  navigate(routeToPath({ name: 'artistDetail', id }));
}

export function syncSearchToRoute(searchTerm: string, currentPath: string): void {
  const target = getSearchRouteSyncTarget(searchTerm, currentPath);
  if (!target) return;
  navigate(target, { replace: true });
}

