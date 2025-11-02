
import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { ProductProcessor } from '@/lib/scraper/processor';
import { isValidUrl } from '@/lib/scraper/utils';

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'URL é obrigatória' },
        { status: 400 }
      );
    }

    if (!isValidUrl(url)) {
      return NextResponse.json(
        { success: false, error: 'URL inválida' },
        { status: 400 }
      );
    }

    // Create new scrape job
    const job = await prisma.scrapeJob.create({
      data: {
        url: url.trim(),
        status: 'pending'
      }
    });

    // Start processing in background
    const processor = new ProductProcessor();
    
    // Don't await this - let it run in background
    processor.processJob(job.id).catch(console.error);

    return NextResponse.json({
      success: true,
      jobId: job.id
    });

  } catch (error) {
    console.error('Error starting scrape job:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
