
import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

export const dynamic = "force-dynamic";

const prisma = new PrismaClient();

export async function GET() {
  try {
    // Find the most recent job that is either processing or paused
    const job = await prisma.scrapeJob.findFirst({
      where: {
        OR: [
          { status: 'processing' },
          { status: 'paused' }
        ]
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!job) {
      return NextResponse.json(null);
    }

    return NextResponse.json(job);

  } catch (error) {
    console.error('[Latest Job] Error:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar job' },
      { status: 500 }
    );
  }
}
