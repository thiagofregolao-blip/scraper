import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID não fornecido' },
        { status: 400 }
      );
    }

    // Verificar se o job existe
    const existingJob = await prisma.scrapeJob.findUnique({
      where: { id: jobId },
    });

    if (!existingJob) {
      return NextResponse.json(
        { error: 'Job não encontrado' },
        { status: 404 }
      );
    }

    // Só pode cancelar jobs que estão "processing" ou "paused"
    if (existingJob.status !== 'processing' && existingJob.status !== 'paused') {
      return NextResponse.json(
        { error: `Não é possível cancelar job com status '${existingJob.status}'` },
        { status: 400 }
      );
    }

    // Atualizar o job para "failed" com mensagem de cancelamento
    const updatedJob = await prisma.scrapeJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        errorMessage: 'Job cancelado manualmente pelo usuário',
      },
    });

    console.log(`[Cancel] Job ${jobId} cancelado pelo usuário`);

    return NextResponse.json({
      success: true,
      message: 'Job cancelado com sucesso',
      job: updatedJob,
    });
  } catch (error) {
    console.error('[Cancel] Erro ao cancelar job:', error);
    return NextResponse.json(
      { error: 'Erro ao cancelar job' },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
