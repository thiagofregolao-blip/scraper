
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { PrismaClient } from '@prisma/client';
import { UniversalScraper, ProductInfo } from './scrapers';
import { sanitizeFileName, downloadImage, ensureDirectoryExists, getFileExtension } from './utils';
import https from 'https';
import http from 'http';

export class ProductProcessor {
  private prisma: PrismaClient;
  private scraper: UniversalScraper;

  constructor() {
    this.prisma = new PrismaClient();
    this.scraper = new UniversalScraper();
  }

  // Check image size before downloading
  private async getImageSize(url: string): Promise<number> {
    return new Promise((resolve) => {
      try {
        const protocol = url.startsWith('https') ? https : http;
        const request = protocol.request(url, { method: 'HEAD' }, (response) => {
          const size = parseInt(response.headers['content-length'] || '0', 10);
          resolve(size);
        });
        
        request.on('error', () => resolve(0));
        request.setTimeout(5000, () => {
          request.destroy();
          resolve(0);
        });
        request.end();
      } catch (error) {
        resolve(0);
      }
    });
  }

  // Generate product description using AI
  private async generateDescription(productInfo: ProductInfo): Promise<string> {
    try {
      const prompt = `Você é um especialista em criar descrições de produtos para e-commerce.

Produto: ${productInfo.name}
Preço: ${productInfo.price || 'Não informado'}
Descrição original: ${productInfo.description}

Crie uma descrição profissional e atraente em português para este produto. A descrição deve:
- Ter entre 100-200 palavras
- Destacar os principais benefícios
- Ser persuasiva e convidativa
- Incluir características técnicas quando relevante
- Usar linguagem clara e objetiva

Responda APENAS com a descrição do produto, sem títulos ou formatação adicional.`;

      const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.ABACUSAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4.1-mini',
          messages: [
            { role: 'system', content: 'Você é um especialista em copywriting para e-commerce, criando descrições atraentes em português.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 500,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      const generatedDescription = data.choices?.[0]?.message?.content?.trim();
      
      if (!generatedDescription) {
        throw new Error('No description generated');
      }

      console.log(`Generated AI description for: ${productInfo.name}`);
      return generatedDescription;
    } catch (error) {
      console.error('Error generating AI description:', error);
      // Fallback to a simple Portuguese description
      return `${productInfo.name}\n\n${productInfo.description || 'Produto de qualidade premium. Entre em contato para mais informações.'}\n\nPreço: ${productInfo.price || 'Consultar'}`;
    }
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

          // Filter and download images (only large, high-quality images)
          const imagePaths: string[] = [];
          const minImageSize = 50 * 1024; // 50KB minimum
          const maxImages = 5; // Maximum 5 images per product
          let downloadedCount = 0;

          for (const imageUrl of productInfo.images) {
            if (downloadedCount >= maxImages) {
              break;
            }

            // Check image size before downloading
            const imageSize = await this.getImageSize(imageUrl);
            
            // Only download if image is large enough (>50KB)
            if (imageSize >= minImageSize) {
              const extension = getFileExtension(imageUrl);
              const imageName = `imagem_${downloadedCount + 1}${extension}`;
              const imagePath = path.join(productDir, imageName);

              const success = await downloadImage(imageUrl, imagePath);
              if (success) {
                imagePaths.push(imageName);
                downloadedCount++;
                console.log(`Downloaded image ${downloadedCount}/${maxImages} (${Math.round(imageSize / 1024)}KB) for ${productInfo.name}`);
              }
            } else {
              console.log(`Skipped small image (${Math.round(imageSize / 1024)}KB) for ${productInfo.name}`);
            }
          }

          // Generate AI description in Portuguese
          const aiDescription = await this.generateDescription(productInfo);

          // Save AI-generated description
          const descriptionPath = path.join(productDir, 'descricao.txt');
          fs.writeFileSync(descriptionPath, aiDescription, 'utf8');

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
