import 'server-only';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const MODEL_EXTENSIONS = ['.glb', '.obj'];
const baseDir = () => join(process.cwd(), 'public', '3d');

const isModelFile = (file: string) => MODEL_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext));

/** URL-safe identifier for a model file: its name without the extension. */
export function modelSlug(file: string) {
  return file.replace(/\.(glb|obj)$/i, '');
}

export function getCategories() {
  const categorizedModels: Record<string, string[]> = {};
  try {
    for (const category of readdirSync(baseDir())) {
      const categoryPath = join(baseDir(), category);
      if (!statSync(categoryPath).isDirectory()) continue;
      const files = readdirSync(categoryPath).filter(isModelFile);
      if (files.length > 0) categorizedModels[category] = files;
    }
  } catch (error) {
    console.error("Error reading models directory", error);
  }
  return categorizedModels;
}

export function getCategoryModels(category: string) {
  try {
    const categoryPath = join(baseDir(), category);
    if (statSync(categoryPath).isDirectory()) {
      return readdirSync(categoryPath).filter(isModelFile);
    }
  } catch (error) {
    console.error("Error reading models for category", category, error);
  }
  return [];
}

/** Resolves a slug back to the public URL of its model file, or null if missing. */
export function findModelUrl(category: string, slug: string) {
  const file = getCategoryModels(category).find((f) => modelSlug(f) === slug);
  return file ? `/3d/${encodeURIComponent(category)}/${encodeURIComponent(file)}` : null;
}

/**
 * Rings to suggest under a ring page: the rest of its own collection first (starting just
 * after the current ring so neighbours vary), then the other collections interleaved.
 */
export function getSimilarRings(category: string, slug: string, limit = 10) {
  const all = getCategories();
  const own = (all[category] ?? []).map(modelSlug);
  const index = own.indexOf(slug);
  const sameCollection = [...own.slice(index + 1), ...own.slice(0, Math.max(index, 0))]
    .filter((s) => s !== slug)
    .map((s) => ({ category, slug: s }));

  const others = Object.entries(all)
    .filter(([c]) => c !== category)
    .map(([c, files]) => files.map((f) => ({ category: c, slug: modelSlug(f) })));
  const interleaved: { category: string; slug: string }[] = [];
  for (let i = 0; others.some((list) => i < list.length); i++) {
    for (const list of others) if (list[i]) interleaved.push(list[i]);
  }

  return [...sameCollection, ...interleaved].slice(0, limit);
}
