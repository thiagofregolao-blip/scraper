
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

// Get the downloads directory path that works in both dev and production
function getDownloadsDir(): string {
  const possiblePaths = [
    path.join(process.cwd(), 'public', 'downloads'),           // Development
    path.join(process.cwd(), '..', 'public', 'downloads'),      // Production standalone
    path.join(__dirname, '..', '..', '..', '..', 'public', 'downloads'),    // Relative to compiled file
  ];
  
  for (const dir of possiblePaths) {
    if (fs.existsSync(dir)) {
      console.log(`[Download] Found downloads directory: ${dir}`);
      return dir;
    }
  }
  
  // Fallback
  return possiblePaths[0];
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    
    console.log(`[Download] Requisição para job: ${params.id}`);
    
    const job = await prisma.scrapeJob.findUnique({
      where: { id: params.id }
    });

    if (!job) {
      console.error(`[Download] Job não encontrado: ${params.id}`);
      return NextResponse.json(
        { error: 'Job não encontrado' },
        { status: 404 }
      );
    }

    console.log(`[Download] Job encontrado - Status: ${job.status}, ZipPath: ${job.zipPath}`);

    if (job.status !== 'completed' || !job.zipPath) {
      console.error(`[Download] Job não está completo ou sem ZIP - Status: ${job.status}`);
      return NextResponse.json(
        { error: 'Job não está completo ou arquivo ZIP não encontrado' },
        { status: 400 }
      );
    }

    // Try to find the ZIP file in multiple locations
    let zipPath = job.zipPath;
    let fileBuffer: Buffer | null = null;
    
    // Extract filename from the stored path
    const storedFileName = path.basename(zipPath);
    const downloadsDir = getDownloadsDir();
    const expectedPath = path.join(downloadsDir, storedFileName);
    
    console.log(`[Download] Stored path: ${zipPath}`);
    console.log(`[Download] Expected path: ${expectedPath}`);
    
    // Try the expected path first
    if (fs.existsSync(expectedPath)) {
      console.log(`[Download] Found at expected path`);
      fileBuffer = fs.readFileSync(expectedPath);
    } 
    // Try the stored path
    else if (fs.existsSync(zipPath)) {
      console.log(`[Download] Found at stored path`);
      fileBuffer = fs.readFileSync(zipPath);
    }
    // Look for any file matching the pattern in downloads directory
    else {
      const jobIdPrefix = params.id.substring(0, 8);
      const files = fs.readdirSync(downloadsDir);
      const matchingFile = files.find(f => f.includes(jobIdPrefix) && f.endsWith('.zip'));
      
      if (matchingFile) {
        const matchedPath = path.join(downloadsDir, matchingFile);
        console.log(`[Download] Found matching file: ${matchedPath}`);
        fileBuffer = fs.readFileSync(matchedPath);
      }
    }
    
    if (!fileBuffer) {
      console.error(`[Download] Arquivo não encontrado em nenhum local`);
      return NextResponse.json(
        { error: 'Arquivo ZIP não encontrado' },
        { status: 404 }
      );
    }

    console.log(`[Download] Arquivo encontrado, enviando... (${fileBuffer.length} bytes)`);
    
    // Use category name if available, otherwise use job ID
    const categoryName = job.categoryName || 'produtos';
    const fileName = `${categoryName}.zip`;

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Error downloading file:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
