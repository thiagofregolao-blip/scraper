
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function cleanupOldFiles(): Promise<void> {
  try {
    const tempDir = path.join(process.cwd(), 'temp');
    
    if (!fs.existsSync(tempDir)) {
      return;
    }

    // Find jobs older than 1 hour that are completed or failed
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oldJobs = await prisma.scrapeJob.findMany({
      where: {
        OR: [
          { status: 'completed' },
          { status: 'failed' }
        ],
        completedAt: {
          lt: oneHourAgo
        }
      }
    });

    // Delete temp folders for old jobs
    for (const job of oldJobs) {
      const jobTempDir = path.join(tempDir, job.id);
      
      if (fs.existsSync(jobTempDir)) {
        fs.rmSync(jobTempDir, { recursive: true, force: true });
        console.log(`Cleaned up temp directory for job ${job.id}`);
      }
    }

    console.log(`Cleaned up ${oldJobs.length} old job directories`);
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Run cleanup every hour
setInterval(cleanupOldFiles, 60 * 60 * 1000);
