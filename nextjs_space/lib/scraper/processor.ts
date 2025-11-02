
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { PrismaClient } from '@prisma/client';
import { UniversalScraper, ProductInfo } from './scrapers';
import { sanitizeFileName, downloadImage, ensureDirectoryExists, getFileExtension } from './utils';

export class ProductProcessor {
  private prisma: PrismaClient;
  private scraper: UniversalScraper;

  constructor() {
    this.prisma = new PrismaClient();
    this.scraper = new UniversalScraper();
  }

  async processJob(jobId: string): Promise<void> {
    try {
      // Get job details
      const job = await this.prisma.scrapeJob.findUnique({
        where: { id: jobId }
      });

      if (!job) {
        throw new Error('Job not found');
      }

      // Update job status to processing
      await this.prisma.scrapeJob.update({
        where: { id: jobId },
        data: { 
          status: 'processing',
          currentProduct: 'Inicializando scraper...'
        }
      });

      // Initialize scraper
      await this.scraper.initialize();

      // Update status
      await this.prisma.scrapeJob.update({
        where: { id: jobId },
        data: { currentProduct: 'Buscando produtos na categoria...' }
      });

      // Get product links
      const productLinks = await this.scraper.getProductLinks(job.url);
      
      if (productLinks.length === 0) {
        throw new Error('Nenhum produto encontrado na categoria');
      }

      // Update total products
      await this.prisma.scrapeJob.update({
        where: { id: jobId },
        data: { 
          totalProducts: productLinks.length,
          currentProduct: `Encontrados ${productLinks.length} produtos. Iniciando extração...`
        }
      });

      // Create temp directory for this job
      const tempDir = path.join(process.cwd(), 'temp', jobId);
      ensureDirectoryExists(tempDir);

      let processedCount = 0;

      // Process each product
      for (const [index, productUrl] of productLinks.entries()) {
        try {
          await this.prisma.scrapeJob.update({
            where: { id: jobId },
            data: { 
              currentProduct: `Processando produto ${index + 1} de ${productLinks.length}...`
            }
          });

          // Scrape product info
          const productInfo = await this.scraper.scrapeProduct(productUrl);
          
          if (!productInfo) {
            continue;
          }

          // Create product record
          const folderName = sanitizeFileName(productInfo.name);
          const productRecord = await this.prisma.product.create({
            data: {
              jobId: jobId,
              name: productInfo.name,
              description: productInfo.description,
              price: productInfo.price,
              originalUrl: productInfo.url,
              folderName: folderName,
              status: 'processing'
            }
          });

          // Create product folder
          const productDir = path.join(tempDir, folderName);
          ensureDirectoryExists(productDir);

          // Download images
          const imagePaths: string[] = [];
          for (const [imgIndex, imageUrl] of productInfo.images.entries()) {
            const extension = getFileExtension(imageUrl);
            const imageName = `imagem_${imgIndex + 1}${extension}`;
            const imagePath = path.join(productDir, imageName);

            const success = await downloadImage(imageUrl, imagePath);
            if (success) {
              imagePaths.push(imageName);
            }
          }

          // Save description
          const descriptionPath = path.join(productDir, 'descricao.txt');
          fs.writeFileSync(descriptionPath, productInfo.description, 'utf8');

          // Save info
          const infoContent = [
            `Nome: ${productInfo.name}`,
            `Preço: ${productInfo.price || 'Não disponível'}`,
            `URL Original: ${productInfo.url}`,
            `Imagens Baixadas: ${imagePaths.length}`,
            `Data de Extração: ${new Date().toLocaleString('pt-BR')}`
          ].join('\n');

          const infoPath = path.join(productDir, 'info.txt');
          fs.writeFileSync(infoPath, infoContent, 'utf8');

          // Update product as completed
          await this.prisma.product.update({
            where: { id: productRecord.id },
            data: {
              imagePaths: imagePaths,
              status: 'completed',
              completedAt: new Date()
            }
          });

          processedCount++;

          // Update job progress
          await this.prisma.scrapeJob.update({
            where: { id: jobId },
            data: { 
              processedProducts: processedCount,
              progress: Math.round((processedCount / productLinks.length) * 100)
            }
          });

        } catch (error) {
          console.error(`Error processing product ${productUrl}:`, error);
          // Continue with next product
        }
      }

      // Create ZIP file
      await this.prisma.scrapeJob.update({
        where: { id: jobId },
        data: { currentProduct: 'Gerando arquivo ZIP...' }
      });

      const zipPath = path.join(tempDir, 'produtos.zip');
      await this.createZip(tempDir, zipPath);

      // Update job as completed
      await this.prisma.scrapeJob.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          zipPath: zipPath,
          completedAt: new Date(),
          currentProduct: undefined
        }
      });

    } catch (error) {
      console.error(`Error processing job ${jobId}:`, error);
      
      // Update job as failed
      await this.prisma.scrapeJob.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : 'Erro desconhecido',
          completedAt: new Date()
        }
      });
    } finally {
      await this.scraper.close();
    }
  }

  private async createZip(sourceDir: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', reject);

      archive.pipe(output);
      
      // Add all directories except the zip file itself
      const items = fs.readdirSync(sourceDir);
      for (const item of items) {
        const itemPath = path.join(sourceDir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          archive.directory(itemPath, item);
        }
      }

      archive.finalize();
    });
  }

  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
