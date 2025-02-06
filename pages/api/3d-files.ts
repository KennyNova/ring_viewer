import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const publicDir = path.join(process.cwd(), 'public', '3d');
  fs.readdir(publicDir, (err, files) => {
    if (err) {
      res.status(500).json({ error: 'Error reading 3d folder' });
      return;
    }
    const glbFiles = files.filter(file => file.endsWith('.glb'));
    const filePaths = glbFiles.map(file => `/3d/${file}`);
    res.status(200).json({ files: filePaths });
  });
} 