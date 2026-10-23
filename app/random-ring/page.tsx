import { redirect } from 'next/navigation';
import { getCategories, modelSlug } from '@/lib/getModels';

// Force dynamic rendering so that the random ring is re-selected on every request
export const dynamic = 'force-dynamic';

const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

export default function RandomRingPage() {
  const categories = Object.entries(getCategories());
  if (categories.length === 0) redirect('/');

  const [category, files] = pick(categories);
  redirect(`/${encodeURIComponent(category)}/${encodeURIComponent(modelSlug(pick(files)))}`);
}
