
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { ProductProcessor } from '@/lib/scraper/processor';

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max

const prisma = new PrismaClient();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const params = await context.params;
    const { id } = params;

    console.log(`[Resume] Retomando job: ${id}`);

    // Check if job exists and can be resumed
    const job = await prisma.scrapeJob.findUnique({
      where: { id }
    });

    if (!job) {
      return NextResponse.json(
        { error: 'Job não encontrado' },
        { status: 404 }
      );
    }

    if (!job.canResume) {
      return NextResponse.json(
        { error: 'Este job não pode ser retomado' },
        { status: 400 }
      );
    }

    if (job.status !== 'paused' && job.status !== 'failed') {
      return NextResponse.json(
        { error: `Job está com status '${job.status}', não pode ser retomado` },
        { status: 400 }
      );
    }

    // Start resume process in background
    const processor = new ProductProcessor();
    processor.processJob(id, true).catch(error => {
      console.error(`[Resume] Erro ao retomar job ${id}:`, error);
    });

    return NextResponse.json({
      message: 'Job retomado com sucesso',
      jobId: id,
      resumedFrom: job.processedProducts
    });

  } catch (error) {
    console.error('[Resume] Erro:', error);
    return NextResponse.json(
      { error: 'Erro ao retomar job' },
      { status: 500 }
    );
  }
}
