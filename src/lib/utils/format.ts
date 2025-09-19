export function formatDuration(seconds?: number | null): string {
  if (!seconds || Number.isNaN(seconds)) {
    return '0:00';
  }

  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = (total % 60).toString().padStart(2, '0');
  return `${minutes}:${secs}`;
}

export function formatLongDuration(seconds?: number | null): string {
  if (!seconds || Number.isNaN(seconds)) {
    return '0 min';
  }

  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours > 0) {
    return `${hours} hr ${minutes} min`;
  }

  return `${minutes} min`;
}

export function formatDate(dateIso?: string | null): string {
  if (!dateIso) return '';
  const date = new Date(dateIso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
}

export function formatTrackIndex(index: number): string {
  const display = index + 1;
  return display < 10 ? `0${display}` : `${display}`;
}
