import Link from "next/link";
import type { RingThumbnail } from "@/lib/thumbnails";

export interface RingSummary {
  category: string;
  slug: string;
  thumbnail: RingThumbnail;
}

export const prettyCategory = (category: string) => category.replace(/([a-z])([A-Z])/g, "$1 $2");
export const ringTitle = (slug: string) => (/^\d/.test(slug) ? `Style ${slug}` : slug);
export const ringHref = (category: string, slug: string) =>
  `/${encodeURIComponent(category)}/${encodeURIComponent(slug)}`;

export default function RingCard({ ring, priority }: { ring: RingSummary; priority?: boolean }) {
  const { category, slug, thumbnail } = ring;
  const alt = `Masina ${prettyCategory(category)} engagement ring ${slug}`;

  return (
    <Link href={ringHref(category, slug)} className="ring-card group block">
      <div className="ring-card__media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbnail.main} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" />
        {thumbnail.hover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail.hover} alt="" aria-hidden loading="lazy" decoding="async" className="ring-card__alt" />
        )}
        <span className="ring-card__cta">View in 3D</span>
      </div>
      <p className="eyebrow mt-4">{prettyCategory(category)}</p>
      <h3 className="mt-1 text-[14px] uppercase tracking-[0.16em]">{ringTitle(slug)}</h3>
    </Link>
  );
}
