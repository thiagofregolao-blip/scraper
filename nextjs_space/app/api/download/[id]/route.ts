
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

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

    console.log(`[Download] Verificando existência do arquivo: ${job.zipPath}`);
    
    if (!fs.existsSync(job.zipPath)) {
      console.error(`[Download] Arquivo não existe no caminho: ${job.zipPath}`);
      return NextResponse.json(
        { error: 'Arquivo ZIP não encontrado' },
        { status: 404 }
      );
    }

    console.log(`[Download] Arquivo encontrado, enviando...`);

    const fileBuffer = fs.readFileSync(job.zipPath);
    
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
