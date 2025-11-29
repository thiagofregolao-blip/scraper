
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';
import { PrismaClient } from '@prisma/client';
import { UniversalScraper, ProductInfo } from './scrapers';
import { sanitizeFileName, downloadImage, ensureDirectoryExists, getFileExtension } from './utils';
import { sendProductToBanco, sendProductsBatchToBanco, testBancoConnection } from '../banco-integration';
import { generateExcel } from '../excel-generator';
import https from 'https';

// Get the downloads directory path that works in both dev and production
function getDownloadsDir(): string {
  // Use downloads directory at project root - works in both dev and production
  const downloadsDir = path.join(process.cwd(), 'downloads');
  ensureDirectoryExists(downloadsDir);
  console.log(`[Downloads] Using directory: ${downloadsDir}`);
  return downloadsDir;
}
import http from 'http';

export class ProductProcessor {
  private prisma: PrismaClient;
  private scraper: UniversalScraper;

  constructor() {
    this.prisma = new PrismaClient();
    this.scraper = new UniversalScraper();
  }

  // Extract category name from URL
  private extractCategoryName(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      
      // Try to extract category from URL patterns
      // Examples: /categoria/-celulares, /category/electronics, etc.
      const categoryMatch = pathname.match(/\/categor[iy]a?\/[-_]?([^\/]+)/i);
      if (categoryMatch && categoryMatch[1]) {
        // Remove special characters and clean up
        return categoryMatch[1]
          .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
          .replace(/[^a-z0-9_-]/gi, '_') // Replace special chars with underscore
          .toLowerCase();
      }
      
      // Fallback: use last segment of path
      const segments = pathname.split('/').filter(s => s.length > 0);
      if (segments.length > 0) {
        return segments[segments.length - 1]
          .replace(/[^a-z0-9_-]/gi, '_')
          .toLowerCase();
      }
      
      return 'produtos';
    } catch (error) {
      return 'produtos';
    }
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

  async processJob(jobId: string, isResume: boolean = false, saveToDatabase: boolean = false, urlOnlyMode: boolean = false): Promise<void> {
    try {
      // Test database connection if needed
      if (saveToDatabase) {
        console.log(`[${jobId}] 🔗 Testando conexão com Banco de Produtos...`);
        const canConnect = await testBancoConnection();
        if (!canConnect) {
          console.log(`[${jobId}] ⚠️ Não foi possível conectar ao Banco. Produtos serão salvos apenas localmente.`);
          saveToDatabase = false; // Disable saving to database if connection fails
        } else {
          console.log(`[${jobId}] ✅ Conexão com Banco OK. Produtos serão enviados automaticamente.`);
        }
      }

      // Get job details
      const job = await this.prisma.scrapeJob.findUnique({
        where: { id: jobId },
        include: { products: true }
      });

      if (!job) {
        throw new Error('Job not found');
      }

      // Extract category name from URL
      const categoryName = this.extractCategoryName(job.url);

      // Determine starting point
      let startIndex = 0;
      let existingProducts: string[] = [];
      
      if (isResume && job.canResume) {
        startIndex = job.lastProductIndex;
        existingProducts = job.products.map(p => p.originalUrl);
        console.log(`[${jobId}] Retomando do produto ${startIndex + 1}`);
        
        await this.prisma.scrapeJob.update({
          where: { id: jobId },
          data: { 
            status: 'processing',
            currentProduct: `Retomando do produto ${startIndex + 1}...`
          }
        });
      } else {
        // Update job status to processing and save category name
        await this.prisma.scrapeJob.update({
          where: { id: jobId },
          data: { 
            status: 'processing',
            categoryName: categoryName,
            currentProduct: 'Inicializando scraper...',
            canResume: true // Habilita retomada desde o início
          }
        });
      }

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
          currentProduct: `Encontrados ${productLinks.length} produtos. Iniciando extração...`,
          urlOnlyMode: urlOnlyMode
        }
      });

      // URL-only mode: generate Excel and finish
      if (urlOnlyMode) {
        console.log(`[${jobId}] Modo URL-only ativado. Gerando Excel...`);
        
        const downloadsDir = getDownloadsDir();
        const excelFileName = `${categoryName}_urls_${jobId.substring(0, 8)}.xlsx`;
        const excelPath = path.join(downloadsDir, excelFileName);
        
        const productsData = productLinks.map((url, index) => ({
          '#': index + 1,
          'URL do Produto': url,
          'Categoria': categoryName || 'Sem categoria'
        }));
        
        generateExcel(productsData, excelPath, categoryName || 'Produtos');
        
        await this.prisma.scrapeJob.update({
          where: { id: jobId },
          data: {
            status: 'completed',
            processedProducts: productLinks.length,
            progress: 100,
            excelPath: excelPath,
            completedAt: new Date(),
            currentProduct: `Excel gerado com ${productLinks.length} URLs`
          }
        });
        
        await this.scraper.close();
        console.log(`[${jobId}] Excel gerado com sucesso: ${excelPath}`);
        return;
      }

      // Create temp directory for this job
      const tempDir = path.join(process.cwd(), 'temp', jobId);
      ensureDirectoryExists(tempDir);

      let processedCount = isResume ? job.processedProducts : 0;

      // Process each product
      for (const [index, productUrl] of productLinks.entries()) {
        try {
          // Skip products before startIndex when resuming
          if (index < startIndex) {
            continue;
          }

          // Skip already processed products
          if (existingProducts.includes(productUrl)) {
            console.log(`[${jobId}] Produto ${index + 1} já processado, pulando...`);
            continue;
          }

          // Save checkpoint every 50 products
          if (index % 50 === 0 && index > 0) {
            console.log(`[${jobId}] Checkpoint: ${index}/${productLinks.length} produtos processados`);
            await this.prisma.scrapeJob.update({
              where: { id: jobId },
              data: {
                lastProductIndex: index,
                canResume: true
              }
            });
          }

          await this.prisma.scrapeJob.update({
            where: { id: jobId },
            data: { 
              currentProduct: `Processando produto ${index + 1} de ${productLinks.length}...`
            }
          });

          // Scrape product info with timeout protection
          const productInfo = await Promise.race([
            this.scraper.scrapeProduct(productUrl),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 60000)) // 60s timeout per product
          ]);
          
          if (!productInfo) {
            console.log(`[${jobId}] Produto ${index + 1} ignorado (timeout ou sem dados)`);
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

          // Filter and download images (only reasonable quality images)
          const imagePaths: string[] = [];
          const minImageSize = 10 * 1024; // 10KB minimum (blocks thumbnails/icons but allows normal product images)
          const maxImages = 8; // Maximum 8 images per product
          let downloadedCount = 0;

          for (const imageUrl of productInfo.images) {
            if (downloadedCount >= maxImages) {
              break;
            }

            // Check image size before downloading
            const imageSize = await this.getImageSize(imageUrl);
            
            // Only download if image is reasonable size (>10KB) or if we don't know the size
            if (imageSize === 0 || imageSize >= minImageSize) {
              const extension = getFileExtension(imageUrl);
              const imageName = `imagem_${downloadedCount + 1}${extension}`;
              const imagePath = path.join(productDir, imageName);

              const success = await downloadImage(imageUrl, imagePath);
              if (success) {
                imagePaths.push(imageName);
                downloadedCount++;
                console.log(`Downloaded image ${downloadedCount}/${maxImages} (${imageSize > 0 ? Math.round(imageSize / 1024) + 'KB' : 'unknown size'}) for ${productInfo.name}`);
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

          // Send product to Banco de Produtos if enabled
          if (saveToDatabase) {
            try {
              // Build full image paths with absolute paths
              const fullImagePaths = imagePaths.map(img => {
                const fullPath = path.join(productDir, img);
                console.log(`[Banco] Verificando imagem: ${fullPath}`);
                console.log(`[Banco] Arquivo existe: ${fs.existsSync(fullPath)}`);
                return fullPath;
              });
              
              console.log(`[${jobId}] 📤 Enviando produto "${productInfo.name}" ao Banco com ${fullImagePaths.length} imagens`);
              
              const bancoResult = await sendProductToBanco({
                name: productInfo.name,
                description: aiDescription, // Use AI-generated description
                price: productInfo.price,
                category: categoryName,
                urlOriginal: productInfo.url,
                imagePaths: fullImagePaths
              });

              if (bancoResult.success) {
                console.log(`[${jobId}] ✅ Produto "${productInfo.name}" enviado ao Banco com sucesso`);
              } else {
                console.log(`[${jobId}] ⚠️ Falha ao enviar "${productInfo.name}" ao Banco: ${bancoResult.error || bancoResult.message}`);
              }
            } catch (bancoError) {
              console.error(`[${jobId}] ❌ Erro ao enviar produto ao Banco:`, bancoError);
              // Continue processing even if Banco save fails
            }
          }

          processedCount++;

          // Update job progress
          await this.prisma.scrapeJob.update({
            where: { id: jobId },
            data: { 
              processedProducts: processedCount,
              progress: Math.round((processedCount / productLinks.length) * 100)
            }
          });

          // Small delay between products to avoid overwhelming the system
          if (index % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100)); // 100ms pause every 10 products
          }

        } catch (error) {
          console.error(`[${jobId}] Erro ao processar produto ${index + 1} (${productUrl}):`, error);
          // Continue with next product instead of stopping entire job
        }
      }

      console.log(`[${jobId}] Processamento concluído: ${processedCount}/${productLinks.length} produtos extraídos com sucesso`);

      // Create ZIP file in permanent downloads directory
      await this.prisma.scrapeJob.update({
        where: { id: jobId },
        data: { currentProduct: 'Gerando arquivo ZIP...' }
      });

      // Get the downloads directory (works in both dev and production)
      const downloadsDir = getDownloadsDir();

      // Use category name for ZIP filename
      const zipCategoryName = this.extractCategoryName(job.url) || jobId;
      const zipFileName = `${zipCategoryName}_${jobId.substring(0, 8)}.zip`;
      const zipPath = path.join(downloadsDir, zipFileName);

      await this.createZip(tempDir, zipPath);

      // Verify ZIP was created
      if (!fs.existsSync(zipPath)) {
        throw new Error(`ZIP file não foi criado: ${zipPath}`);
      }

      const zipStats = fs.statSync(zipPath);
      console.log(`[${jobId}] ZIP criado com sucesso: ${zipPath} (${Math.round(zipStats.size / 1024)}KB)`);

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
      console.error(`[${jobId}] Erro ao processar job:`, error);
      
      // Check if we have any progress to allow resume
      const currentJob = await this.prisma.scrapeJob.findUnique({
        where: { id: jobId }
      });
      
      const hasProgress = currentJob && currentJob.processedProducts > 0;
      
      // Update job as paused if we have progress, failed otherwise
      const updateData: any = {
        status: hasProgress ? 'paused' : 'failed',
        errorMessage: error instanceof Error ? error.message : 'Erro desconhecido',
        canResume: hasProgress
      };
      
      if (!hasProgress) {
        updateData.completedAt = new Date();
      }
      
      await this.prisma.scrapeJob.update({
        where: { id: jobId },
        data: updateData
      });
      
      if (hasProgress) {
        console.log(`[${jobId}] Job pausado. ${currentJob.processedProducts} produtos salvos. Use 'Retomar' para continuar.`);
      }
    } finally {
      try {
        await this.scraper.close();
      } catch (closeError) {
        console.error(`[${jobId}] Erro ao fechar scraper:`, closeError);
      }
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