import Link from "next/link";
import Shelf from "./Shelf";
import RingCard, { prettyCategory, type RingSummary } from "./RingCard";

export default function SimilarRings({ rings, category }: { rings: RingSummary[]; category: string }) {
  if (rings.length === 0) return null;

  return (
    <section className="border-t px-4 py-14 sm:px-10 sm:py-20" style={{ borderColor: "var(--line)" }}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="eyebrow">Keep exploring</p>
            <h2 className="display mt-2 text-[24px] sm:text-[30px]">You may also love</h2>
          </div>
          <Link
            href={`/${encodeURIComponent(category)}`}
            className="link-underline shrink-0 text-[11px] uppercase tracking-[0.2em]"
          >
            All {prettyCategory(category)}
          </Link>
        </div>
        <Shelf label="Similar rings">
          {rings.map((ring) => (
            <RingCard key={`${ring.category}/${ring.slug}`} ring={ring} />
          ))}
        </Shelf>
      </div>
    </section>
  );
}
