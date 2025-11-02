
import slugify from 'slugify';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

export function sanitizeFileName(name: string): string {
  return slugify(name, {
    replacement: '_',
    lower: true,
    strict: true,
    trim: true
  }).substring(0, 100); // Limit length
}

export async function downloadImage(imageUrl: string, filePath: string): Promise<boolean> {
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', () => resolve(true));
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(`Error downloading image ${imageUrl}:`, error);
    return false;
  }
}

export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function getFileExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    return ext || '.jpg';
  } catch {
    return '.jpg';
  }
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}
