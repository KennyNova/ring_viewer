import { readdirSync, statSync } from "fs";
import { join } from "path";
import { redirect } from 'next/navigation';

// Force dynamic rendering so that the random ring is re-selected on every request
export const dynamic = 'force-dynamic';

export default function RandomRingPage() {
  // Server-side implementation to get available rings
  const baseDir = join(process.cwd(), "public", "3d");
  let categories: string[] = [];
  let categorizedModels: Record<string, string[]> = {};
  
  try {
    categories = readdirSync(baseDir);
    categories.forEach((category) => {
      const categoryPath = join(baseDir, category);
      if (statSync(categoryPath).isDirectory()) {
        const files = readdirSync(categoryPath).filter((file) =>
          file.endsWith(".glb")
        );
        if (files.length > 0) {
          categorizedModels[category] = files;
        }
      }
    });
  } catch (error) {
    console.error("Error reading models directory", error);
    redirect('/');
  }
  
  // Filter out categories with no models
  categories = categories.filter(category => categorizedModels[category]?.length > 0);

  if (categories.length === 0) {
    redirect('/');
  }

  // Select a random category
  const randomCategoryIndex = Math.floor(Math.random() * categories.length);
  const randomCategory = categories[randomCategoryIndex];

  // Get models for that category
  const models = categorizedModels[randomCategory];
  
  if (!models || models.length === 0) {
    redirect('/');
  }

  // Select a random model from the category
  const randomModelIndex = Math.floor(Math.random() * models.length);
  const randomModel = models[randomModelIndex];

  // Create the model slug (remove .glb extension)
  const modelSlug = randomModel.replace('.glb', '');

  // Redirect to the selected model page
  redirect(`/${randomCategory}/${modelSlug}`);

  // Note: This return is only for TypeScript, the redirect will happen before this renders
  return null;
} 
