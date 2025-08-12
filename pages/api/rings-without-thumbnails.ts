import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { existsSync } from 'fs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const ringsWithoutThumbnails: Array<{ category: string; model: string }> = [];
    
    // Get all categories
    const baseDir = path.join(process.cwd(), 'public', '3d');
    const categories = fs.readdirSync(baseDir).filter(
      category => fs.statSync(path.join(baseDir, category)).isDirectory()
    );

    // Check each category for models without thumbnails
    for (const category of categories) {
      const categoryDir = path.join(baseDir, category);
      const models = fs.readdirSync(categoryDir).filter(file => file.endsWith('.glb'));
      
      for (const model of models) {
        const modelName = model.replace('.glb', '');
        const thumbnailPath = path.join(process.cwd(), 'public', 'images', category, `${modelName}.png`);
        
        // If thumbnail doesn't exist, add to list
        if (!existsSync(thumbnailPath)) {
          ringsWithoutThumbnails.push({ category, model: modelName });
        }
      }
    }

    res.status(200).json({ ringsWithoutThumbnails });
  } catch (error) {
    console.error('Error checking thumbnails:', error);
    res.status(500).json({ error: 'Error checking thumbnails' });
  }
} 