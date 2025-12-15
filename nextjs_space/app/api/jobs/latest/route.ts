
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Clean up old stale jobs (processing for more than 24 hours)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await prisma.scrapeJob.updateMany({
      where: {
        status: 'processing',
        createdAt: {
          lt: twentyFourHoursAgo
        }
      },
      data: {
        status: 'failed',
        errorMessage: 'Job expirou após 24 horas sem conclusão'
      }
    });

    // Only return recent jobs (last 6 hours) that are processing or paused
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const job = await prisma.scrapeJob.findFirst({
      where: {
        AND: [
          {
            OR: [
              { status: 'processing' },
              { status: 'paused' }
            ]
          },
          {
            createdAt: {
              gte: sixHoursAgo
            }
          }
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
