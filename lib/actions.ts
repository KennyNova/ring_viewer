'use server';

import { readdirSync, statSync } from 'fs';
import { join } from 'path';

export async function getCategories() {
  let categorizedModels: Record<string, string[]> = {};
  try {
    const baseDir = join(process.cwd(), "public", "3d");
    const categories = readdirSync(baseDir);
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
  }
  return categorizedModels;
}

export async function getCategoryModels(category: string) {
  let models: string[] = [];
  try {
    const categoryPath = join(process.cwd(), "public", "3d", category);
    if (statSync(categoryPath).isDirectory()) {
      models = readdirSync(categoryPath).filter((file) => file.endsWith(".glb"));
    }
  } catch (error) {
    console.error("Error reading models for category", category, error);
  }
  return models;
}

export async function checkImageExists(category: string, modelSlug: string) {
  try {
    const fullPath = join(process.cwd(), 'public', 'images', category, `${modelSlug}.png`);
    return statSync(fullPath).isFile();
  } catch {
    return false;
  }
}

export async function checkGifExists(category: string, modelSlug: string) {
  try {
    const fullPath = join(process.cwd(), 'public', 'gifs', category, `${modelSlug}.gif`);
    return statSync(fullPath).isFile();
  } catch {
    return false;
  }
} 