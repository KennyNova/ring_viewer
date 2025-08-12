import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { category, model, imageData } = req.body;

    if (!category || !model || !imageData) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    // Ensure the model name doesn't have the extension
    const modelName = model.replace(/\.(glb|3dm)$/, '');

    // Create the directory path if it doesn't exist
    const imagesDir = path.join(process.cwd(), 'public', 'images', category);
    await mkdir(imagesDir, { recursive: true });

    // Save the image (convert base64 to file)
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Save as PNG
    const filePath = path.join(imagesDir, `${modelName}.png`);
    fs.writeFileSync(filePath, buffer);

    // Return success message
    res.status(200).json({ 
      success: true, 
      message: 'Thumbnail saved successfully',
      path: `/images/${category}/${modelName}.png`
    });
  } catch (error) {
    console.error('Error saving thumbnail:', error);
    res.status(500).json({ error: 'Error saving thumbnail' });
  }
} 