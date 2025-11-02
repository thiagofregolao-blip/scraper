
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const job = await prisma.scrapeJob.findUnique({
      where: { id: params.id }
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job não encontrado' },
        { status: 404 }
      );
    }

    if (job.status !== 'completed' || !job.zipPath) {
      return NextResponse.json(
        { error: 'Job não está completo ou arquivo ZIP não encontrado' },
        { status: 400 }
      );
    }

    if (!fs.existsSync(job.zipPath)) {
      return NextResponse.json(
        { error: 'Arquivo ZIP não encontrado' },
        { status: 404 }
      );
    }

    const fileBuffer = fs.readFileSync(job.zipPath);
    const fileName = `produtos_${job.id.substring(0, 8)}.zip`;

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
