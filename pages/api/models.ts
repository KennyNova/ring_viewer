import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const modelsDir = path.join(process.cwd(), 'public', '3d');
    const files = fs.readdirSync(modelsDir).filter(file => file.endsWith('.glb'));
    res.status(200).json({ files });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not fetch models' });
  }
} 