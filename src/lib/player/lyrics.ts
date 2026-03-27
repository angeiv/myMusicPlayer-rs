export type LyricsLine = {
  id: string;
  text: string;
  timestamp: number | null;
};

export type LyricsPanelState = {
  lines: LyricsLine[];
  activeIndex: number;
  hasTimedLyrics: boolean;
};

const METADATA_TAG_PATTERN = /^\[[a-zA-Z]+:.*\]$/;

function createTimeTagPattern(): RegExp {
  return /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
}

function normalizeFraction(input: string | undefined): number {
  if (!input) return 0;
  return Number(input.padEnd(3, '0').slice(0, 3)) / 1000;
}

function toSeconds(minutes: string, seconds: string, fraction?: string): number {
  return Number(minutes) * 60 + Number(seconds) + normalizeFraction(fraction);
}

export function parseLyrics(rawLyrics: string | null | undefined): LyricsLine[] {
  const lyrics = rawLyrics?.trim();
  if (!lyrics) {
    return [];
  }

  const lines: LyricsLine[] = [];
  let lineIndex = 0;

  for (const rawLine of lyrics.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine || METADATA_TAG_PATTERN.test(trimmedLine)) {
      continue;
    }

    const matches = [...trimmedLine.matchAll(createTimeTagPattern())];
    const text = trimmedLine.replace(createTimeTagPattern(), '').trim();

    if (matches.length === 0) {
      lines.push({
        id: `plain-${lineIndex}`,
        text: text || trimmedLine,
        timestamp: null,
      });
      lineIndex += 1;
      continue;
    }

    const normalizedText = text || ' ';
    for (const match of matches) {
      const [, minutes, seconds, fraction] = match;
      lines.push({
        id: `timed-${lineIndex}-${match.index ?? 0}`,
        text: normalizedText,
        timestamp: toSeconds(minutes ?? '0', seconds ?? '0', fraction),
      });
      lineIndex += 1;
    }
  }

  return lines;
}

export function getActiveLyricsIndex(lines: LyricsLine[], progressSeconds: number): number {
  let activeIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const timestamp = lines[index]?.timestamp;
    if (timestamp === null || timestamp === undefined) {
      continue;
    }
    if (progressSeconds >= timestamp) {
      activeIndex = index;
      continue;
    }
    break;
  }

  return activeIndex;
}

export function buildLyricsPanelState(
  rawLyrics: string | null | undefined,
  progressSeconds: number
): LyricsPanelState {
  const lines = parseLyrics(rawLyrics);
  const hasTimedLyrics = lines.some((line) => line.timestamp !== null);

  if (!hasTimedLyrics) {
    return {
      lines,
      activeIndex: -1,
      hasTimedLyrics: false,
    };
  }

  const timedLines = lines
    .filter((line): line is LyricsLine & { timestamp: number } => line.timestamp !== null)
    .sort((left, right) => left.timestamp - right.timestamp);
  const activeTimedIndex = getActiveLyricsIndex(timedLines, progressSeconds);
  const activeLine = activeTimedIndex >= 0 ? timedLines[activeTimedIndex] : null;

  return {
    lines: timedLines,
    activeIndex: activeLine ? activeTimedIndex : -1,
    hasTimedLyrics: true,
  };
}
