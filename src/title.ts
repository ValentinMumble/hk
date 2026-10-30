/** "3:07" from milliseconds. */
export const formatTime = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** A trailing segment is a version note only when it reads like one; otherwise it is part of the title. */
const VERSION_NOTE =
  /\b(remaster(ed)?|live|edit|version|mix|remix|mono|stereo|demo|acoustic|instrumental|radio|single|bonus|deluxe|anniversary|re-?record(ed|ing)?|feat\.?|featuring|from|session|take|alternate|extended|original|sped up|slowed|cover|karaoke|explicit|clean|\d{4})\b/i;

/**
 * Split "Song (feat. X) - 2011 Remaster" into the title and its version notes, shown smaller. Only trailing
 * groups that look like version notes are taken: "Hot - Blooded", "Song (Part II)" and "(Don't Fear) The Reaper"
 * keep their text.
 */
export const splitTitle = (name: string): {title: string; extras: string[]} => {
  let title = name.trim();
  const extras: string[] = [];

  for (;;) {
    const match = title.match(/^(.+?)\s+(?:\(([^()]*)\)|\[([^\]]*)\])$/) ?? title.match(/^(.+)\s+-\s+(.+)$/);
    const extra = match ? (match[2] ?? match[3]).trim() : '';

    if (!match || !VERSION_NOTE.test(extra)) break;

    extras.unshift(extra);
    title = match[1].trim();
  }

  return {title, extras};
};
