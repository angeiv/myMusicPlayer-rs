import type { Track } from '../../types';

export type SongsSortKey =
  | 'title'
  | 'album_title'
  | 'artist_name'
  | 'duration'
  | 'date_added';

export type SongsSortDirection = 'asc' | 'desc';

function compareTracks(left: Track, right: Track, key: SongsSortKey): number {
  switch (key) {
    case 'duration':
      return left.duration - right.duration;
    case 'date_added':
      return new Date(left.date_added).getTime() - new Date(right.date_added).getTime();
    case 'album_title':
      return (left.album_title ?? '').localeCompare(right.album_title ?? '', undefined, {
        sensitivity: 'base',
      });
    case 'artist_name':
      return (left.artist_name ?? '').localeCompare(right.artist_name ?? '', undefined, {
        sensitivity: 'base',
      });
    default:
      return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' });
  }
}

export function getVisibleTracks(
  tracks: Track[],
  searchTerm: string,
  sort: { key: SongsSortKey; direction: SongsSortDirection },
): Track[] {
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const direction = sort.direction === 'asc' ? 1 : -1;

  return tracks
    .filter((track) => {
      if (!normalizedSearchTerm) {
        return true;
      }

      return [track.title, track.artist_name ?? '', track.album_title ?? ''].some((value) =>
        value.toLowerCase().includes(normalizedSearchTerm),
      );
    })
    .map((track, index) => ({ track, index }))
    .sort((left, right) => {
      const compared = compareTracks(left.track, right.track, sort.key);

      if (compared !== 0) {
        return compared * direction;
      }

      return left.index - right.index;
    })
    .map(({ track }) => track);
}
