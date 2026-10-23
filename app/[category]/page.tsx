import { notFound } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import RingCard, { prettyCategory } from "@/components/RingCard";
import { getCategoryModels, modelSlug } from "@/lib/getModels";
import { thumbnailFor } from "@/lib/thumbnails";

export const dynamic = "force-dynamic";

export default function CategoryPage({ params }: { params: { category: string } }) {
  const category = decodeURIComponent(params.category);
  const models = getCategoryModels(category);
  if (models.length === 0) notFound();

  return (
    <div className="min-h-screen">
      <SiteHeader back={{ href: "/", label: "All styles" }} />

      <section className="px-4 pt-14 pb-10 text-center">
        <p className="eyebrow">Engagement Rings</p>
        <h1 className="display mt-3 text-[32px] sm:text-[48px]">{prettyCategory(category)}</h1>
        <p className="eyebrow mt-4">{models.length} designs · Interactive 3D</p>
      </section>

      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-3 gap-y-10 px-4 pb-24 sm:gap-x-5 sm:px-10 md:grid-cols-3 lg:grid-cols-4">
        {models.map((file, i) => {
          const slug = modelSlug(file);
          return (
            <div key={file} className="fade-up" style={{ animationDelay: `${Math.min(i, 12) * 0.04}s` }}>
              <RingCard ring={{ category, slug, thumbnail: thumbnailFor(category, slug) }} priority={i < 4} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
