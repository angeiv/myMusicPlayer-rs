import type { PlaybackStateInfo, Track, TrackAvailability } from '../types';

type AvailabilityLike = Pick<Track, 'availability'>;

export type BlockedTrackPlayContext = 'selection' | 'track' | 'collection';
export type PlaybackSurfaceAvailabilityStatus = 'playable' | 'continuing' | 'blocked';
export type PlaybackSurfaceAvailability = {
  availability: TrackAvailability;
  badge: string;
  description: string;
  status: PlaybackSurfaceAvailabilityStatus;
};

const MISSING_TRACK_BADGE_TEXT = '文件缺失';
const MISSING_TRACK_DESCRIPTION = '文件缺失，无法播放';
const MISSING_CURRENT_TRACK_CONTINUITY_DESCRIPTION = '文件已缺失，当前播放仍可继续，结束后无法重新播放';
const MISSING_CURRENT_TRACK_REPLAY_BLOCKED_DESCRIPTION = '文件已缺失，无法重新播放';
const MISSING_COLLECTION_PLAY_MESSAGE = '当前列表中的歌曲文件缺失，无法播放';
const MISSING_TRACK_RESTORE_MESSAGE = '上次播放的歌曲文件缺失，无法恢复播放';

export function isTrackPlayable<T extends AvailabilityLike>(track: T | null | undefined): track is T {
  return track?.availability === 'available';
}

export function getPlayableTracks<T extends AvailabilityLike>(tracks: T[]): T[] {
  return tracks.filter((track): track is T => isTrackPlayable(track));
}

export function getTrackAvailabilityState(track: AvailabilityLike): TrackAvailability {
  return isTrackPlayable(track) ? 'available' : 'missing';
}

export function getTrackAvailabilityBadge(track: AvailabilityLike): string {
  return isTrackPlayable(track) ? '' : MISSING_TRACK_BADGE_TEXT;
}

export function getTrackAvailabilityDescription(track: AvailabilityLike): string {
  return isTrackPlayable(track) ? '' : MISSING_TRACK_DESCRIPTION;
}

function isPlaybackContinuing(playbackState: PlaybackStateInfo | null | undefined): boolean {
  return playbackState?.state === 'playing';
}

export function getPlaybackSurfaceAvailability(
  track: AvailabilityLike,
  options: {
    isCurrent?: boolean;
    playbackState?: PlaybackStateInfo | null;
  } = {}
): PlaybackSurfaceAvailability {
  if (isTrackPlayable(track)) {
    return {
      availability: 'available',
      badge: '',
      description: '',
      status: 'playable',
    };
  }

  if (options.isCurrent && isPlaybackContinuing(options.playbackState)) {
    return {
      availability: 'missing',
      badge: MISSING_TRACK_BADGE_TEXT,
      description: MISSING_CURRENT_TRACK_CONTINUITY_DESCRIPTION,
      status: 'continuing',
    };
  }

  return {
    availability: 'missing',
    badge: MISSING_TRACK_BADGE_TEXT,
    description: options.isCurrent
      ? MISSING_CURRENT_TRACK_REPLAY_BLOCKED_DESCRIPTION
      : MISSING_TRACK_DESCRIPTION,
    status: 'blocked',
  };
}

export function getMissingTrackPlayMessage(context: BlockedTrackPlayContext): string {
  if (context === 'selection') {
    return '所选歌曲文件缺失，无法播放';
  }

  if (context === 'collection') {
    return MISSING_COLLECTION_PLAY_MESSAGE;
  }

  return '当前歌曲文件缺失，无法播放';
}

export function getMissingTrackRestoreMessage(): string {
  return MISSING_TRACK_RESTORE_MESSAGE;
}
