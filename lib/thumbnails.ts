import { existsSync } from 'fs';
import { join } from 'path';

/** Angles rendered by scripts/generate-thumbnails.mjs, in display order (main image, hover image). */
export const CAPTURE_ANGLES = ['hero', 'top'] as const;

export interface RingThumbnail {
  main: string;
  hover: string | null;
}

const FALLBACK = '/ring-placeholder.svg';

export function thumbnailFor(category: string, slug: string): RingThumbnail {
  const urlFor = (angle: string) => {
    const file = join(process.cwd(), 'public', 'thumbnails', category, `${slug}-${angle}.webp`);
    return existsSync(file)
      ? `/thumbnails/${encodeURIComponent(category)}/${encodeURIComponent(`${slug}-${angle}.webp`)}`
      : null;
  };
  return { main: urlFor('hero') ?? FALLBACK, hover: urlFor('top') };
}
