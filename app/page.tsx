import Link from "next/link";
import SiteHeader, { MASINA } from "@/components/SiteHeader";
import RandomRingButton from "@/components/RandomRingButton";
import { getCategories, modelSlug } from "@/lib/getModels";
import { thumbnailFor } from "@/lib/thumbnails";

export const dynamic = "force-dynamic";

const prettyCategory = (category: string) => category.replace(/([a-z])([A-Z])/g, "$1 $2");

export default function Home() {
  const categories = Object.entries(getCategories());

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />

      <section className="px-4 py-16 sm:py-24 text-center" style={{ background: "var(--sand-light)" }}>
        <p className="eyebrow fade-up">Masina Diamonds · Atlanta</p>
        <h1 className="display fade-up mt-4 text-[34px] sm:text-[56px]" style={{ animationDelay: "0.1s" }}>
          The Collection
          <br />
          in Three Dimensions
        </h1>
        <p
          className="fade-up mx-auto mt-6 max-w-xl text-[15px] leading-relaxed"
          style={{ color: "var(--ink-soft)", animationDelay: "0.2s" }}
        >
          Turn every ring in your hand before you see it in ours. Rotate, zoom and try each design in yellow,
          rose and white gold or platinum.
        </p>
        <div className="fade-up mt-10 flex flex-wrap justify-center gap-3" style={{ animationDelay: "0.3s" }}>
          <a href="#collections" className="btn">
            Explore Rings
          </a>
          <RandomRingButton />
        </div>
      </section>

      <section id="collections" className="mx-auto w-full max-w-6xl px-4 py-16 sm:py-20">
        <h2 className="display text-center text-[26px] sm:text-[32px]">Shop by Style</h2>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {categories.map(([category, files], i) => {
            // Cover with the first GLB; the raw OBJ exports have no separate stones
            const cover = files.find((f) => f.toLowerCase().endsWith(".glb")) ?? files[0];
            const thumbnail = thumbnailFor(category, modelSlug(cover));
            return (
              <Link
                key={category}
                href={`/${encodeURIComponent(category)}`}
                className="ring-card fade-up block"
                style={{ animationDelay: `${0.05 * i}s` }}
              >
                <div className="ring-card__media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbnail.main} alt={`${prettyCategory(category)} engagement rings`} />
                  {thumbnail.hover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnail.hover} alt="" aria-hidden className="ring-card__alt" />
                  )}
                </div>
                <div className="mt-4 flex items-baseline justify-between gap-2">
                  <h3 className="display text-[16px] sm:text-[20px]">{prettyCategory(category)}</h3>
                  <span className="eyebrow shrink-0">{files.length}</span>
                </div>
                <span className="link-underline mt-2 inline-block text-[11px] uppercase tracking-[0.22em]">
                  Shop the collection
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-auto px-4 py-14 text-center" style={{ background: "var(--ink)", color: "var(--paper)" }}>
        <h2 className="display text-[22px] sm:text-[28px]">Design something entirely yours</h2>
        <p className="mx-auto mt-4 max-w-lg text-[14px] leading-relaxed" style={{ color: "#bdbdbd" }}>
          Every Masina ring is made to order. Sit down with our designers in Atlanta, or start in the Custom Ring
          Builder.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href={MASINA.builder} className="btn" style={{ background: "var(--paper)", color: "var(--ink)" }}>
            Custom Ring Builder
          </a>
          <a href={MASINA.appointment} className="btn btn--outline" style={{ color: "var(--paper)", borderColor: "var(--paper)" }}>
            Book Appointment
          </a>
        </div>
      </section>
    </div>
  );
}
