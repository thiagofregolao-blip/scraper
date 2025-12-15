
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { ProductProcessor } from '@/lib/scraper/processor';
import { isValidUrl } from '@/lib/scraper/utils';

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, saveToDatabase = false, urlOnlyMode = false } = body;

    console.log('[API Scrape] Request received - URL:', url, 'Save to DB:', saveToDatabase, 'URL-only:', urlOnlyMode);

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

    console.log('[API Scrape] Job created:', job.id);

    // Start processing in background
    const processor = new ProductProcessor();

    // Don't await this - let it run in background
    // Pass saveToDatabase and urlOnlyMode flags to processor
    processor.processJob(job.id, false, saveToDatabase, urlOnlyMode).catch(console.error);

    return NextResponse.json({
      success: true,
      jobId: job.id,
      saveToDatabase: saveToDatabase
    });

  } catch (error) {
    console.error('Error starting scrape job:', error);
    return NextResponse.json(
      { success: false, error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
