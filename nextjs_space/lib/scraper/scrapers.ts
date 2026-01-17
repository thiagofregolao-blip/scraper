import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractDomain, isValidUrl } from './utils';
import puppeteer from 'puppeteer';

export interface ProductInfo {
  name: string;
  description: string;
  price?: string;
  images: string[];
  url: string;
}

export class UniversalScraper {
  private userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  private maxProducts: number = 10000; // Limite máximo de produtos

  async initialize(maxProducts?: number): Promise<void> {
    if (maxProducts) {
      this.maxProducts = maxProducts;
    }
    console.log(`Scraper inicializado (usando Cheerio - sem navegador, limite: ${this.maxProducts} produtos)`);
  }

  /**
   * Extrai subcategorias de uma página de categoria principal
   */
  async getSubcategories(categoryUrl: string): Promise<{ name: string; url: string }[]> {
    console.log(`[Subcategorias] Buscando subcategorias de: ${categoryUrl}`);

    try {
      const html = await this.fetchHTML(categoryUrl);
      const $ = cheerio.load(html);
      const baseUrl = new URL(categoryUrl).origin;
      const subcategories: { name: string; url: string }[] = [];
      const domain = new URL(categoryUrl).hostname;
      const currentPath = new URL(categoryUrl).pathname;

      if (domain.includes('lgimportados.com')) {
        // Extrai o nome base da categoria da URL (ex: "foto-e-filmagem" de "/categoria/foto-e-filmagem")
        const categorySlug = currentPath.split('/').filter(p => p).pop() || '';

        console.log(`[Subcategorias] Categoria base: ${categorySlug}`);

        // Busca TODOS os links que contêm a categoria atual no path
        $('a').each((_, el) => {
          const href = $(el).attr('href') || '';
          const rawName = $(el).text().trim();

          // Limpa o nome (remove números, espaços extras)
          const name = rawName.replace(/\s+/g, ' ').replace(/^\d+\s*/, '').trim();

          // Só pega links que:
          // 1. Contêm /categoria/
          // 2. Contêm o slug da categoria atual
          // 3. São mais longos que a URL atual (são subcategorias)
          // 4. Não são links de paginação
          // 5. Têm nome válido
          if (
            href.includes('/categoria/') &&
            href.includes(categorySlug) &&
            href.length > currentPath.length + 3 &&
            !href.includes('pagina') &&
            !href.includes('?') &&
            name.length > 2 &&
            name.length < 60
          ) {
            const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;

            // Evita duplicatas
            if (!subcategories.some(s => s.url === fullUrl || s.name === name)) {
              subcategories.push({ name, url: fullUrl });
              console.log(`[Subcategorias] Encontrada: "${name}" -> ${fullUrl}`);
            }
          }
        });

        // Remove a própria categoria se ela foi adicionada
        const filteredSubcats = subcategories.filter(s =>
          !s.url.endsWith(currentPath) &&
          s.url !== categoryUrl
        );

        console.log(`[Subcategorias] Total após filtro: ${filteredSubcats.length}`);
        return filteredSubcats;
      }

      console.log(`[Subcategorias] Encontradas ${subcategories.length} subcategorias`);
      return subcategories;
    } catch (error) {
      console.error(`[Subcategorias] Erro ao buscar subcategorias:`, error);
      return [];
    }
  }

  private async fetchHTML(url: string): Promise<string> {
    console.log(`Fetching: ${url}`);

    try {
      // Primeiro tenta com Axios (método rápido)
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,es;q=0.6',
        },
        timeout: 15000, // Timeout menor para Axios
      });

      const html = response.data;

      // Detecta Cloudflare protection
      if (html.includes('Just a moment') || html.includes('cf-chl-opt') || html.includes('challenge-platform')) {
        console.log('⚠️ Cloudflare detected, switching to Puppeteer...');
        return await this.fetchWithPuppeteer(url);
      }

      return html;
    } catch (error) {
      console.log(`Axios failed, trying Puppeteer...`);
      return await this.fetchWithPuppeteer(url);
    }
  }

  private getChromiumPath(): string | undefined {
    try {
      // Tenta encontrar o chromium no PATH
      const { execSync } = require('child_process');
      const path = execSync('which chromium').toString().trim();
      return path;
    } catch (e) {
      try {
        const { execSync } = require('child_process');
        const path = execSync('which chromium-browser').toString().trim();
        return path;
      } catch (e2) {
        return undefined;
      }
    }
  }

  private async fetchWithPuppeteer(url: string): Promise<string> {
    console.log(`🚀 Launching local Puppeteer for: ${url}`);
    let browser = null;

    try {
      const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || this.getChromiumPath();
      console.log(`Using executable path: ${execPath || 'bundled (not found in path)'}`);

      browser = await puppeteer.launch({
        headless: true,
        executablePath: execPath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ]
      });

      const page = await browser.newPage();

      // Configura viewport e user agent
      await page.setViewport({ width: 1366, height: 768 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      console.log('Navigating...');
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 60000
      });

      // Tenta esperar pelo conteúdo principal carregar
      try {
        await page.waitForSelector('body', { timeout: 10000 });
      } catch (e) {
        console.log('Timeout waiting for body, proceeding anyway...');
      }

      const html = await page.content();
      console.log(`✅ Puppeteer success: ${html.length} bytes`);
      return html;

    } catch (error: any) {
      console.error(`❌ Puppeteer failed: ${error.message}`);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async getProductLinks(categoryUrl: string): Promise<string[]> {
    console.log(`Extraindo links de produtos de: ${categoryUrl}`);
    const allProductLinks = new Set<string>(); // Usar Set para evitar duplicatas
    let currentUrl = categoryUrl;
    let pageNum = 1;
    const domain = new URL(categoryUrl).hostname;
    const maxPages = 500; // Máximo de páginas para evitar loops infinitos

    while (pageNum <= maxPages) {
      console.log(`Página ${pageNum}: ${currentUrl}`);

      const html = await this.fetchHTML(currentUrl);
      const $ = cheerio.load(html);

      const baseUrl = new URL(categoryUrl).origin;
      const pageProductsCount = allProductLinks.size;

      // SHOPPING CHINA específico
      if (domain.includes('shoppingchina.com.py')) {
        $('.product-item a, .product-card a, [class*="product"] > a').each((_, el) => {
          const href = $(el).attr('href');
          if (href && (href.includes('/producto/') || href.includes('/product/'))) {
            const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
            allProductLinks.add(fullUrl);
          }
        });
      }
      // LG IMPORTADOS específico
      else if (domain.includes('lgimportados.com')) {
        $('.product-card a, .product-link, [class*="product"] a').each((_, el) => {
          const href = $(el).attr('href');
          if (href && (href.includes('produto/') || href.includes('/produto/'))) {
            const fullUrl = href.startsWith('http') ? href : `${baseUrl}/${href}`;
            allProductLinks.add(fullUrl);
          }
        });
      }
      // CELLSHOP específico
      else if (domain.includes('cellshop.com')) {
        $('.product a, [class*="product-item"] a, .product-card a, .card-product a').each((_, el) => {
          const href = $(el).attr('href');
          if (href && (href.includes('/producto/') || href.includes('/product/') || href.includes('/p/'))) {
            const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
            allProductLinks.add(fullUrl);
          }
        });
      }
      // Genérico para outros sites
      else {
        $('a').each((_, el) => {
          const href = $(el).attr('href');
          if (href) {
            // Filtros estritos: apenas links que parecem produtos
            const isProductLink =
              href.includes('/producto/') ||
              href.includes('/product/') ||
              (href.includes('/p/') && /\/p\/\d+/.test(href)) ||
              (href.includes('/item/') && /\/item\/\d+/.test(href));

            // Excluir links de categorias, filtros, etc
            const isNotProduct =
              href.includes('/categoria') ||
              href.includes('/category') ||
              href.includes('/tag/') ||
              href.includes('/search') ||
              href.includes('/filter') ||
              href.includes('?') ||
              href.includes('#') ||
              href === '/' ||
              href.length < 10;

            if (isProductLink && !isNotProduct) {
              const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
              if (isValidUrl(fullUrl) && fullUrl.includes(domain)) {
                allProductLinks.add(fullUrl);
              }
            }
          }
        });
      }

      const newProducts = allProductLinks.size - pageProductsCount;
      console.log(`Encontrados ${newProducts} novos produtos na página ${pageNum} (total: ${allProductLinks.size})`);

      // Se não encontrou produtos novos, parar
      if (newProducts === 0 && pageNum > 1) {
        console.log('Sem novos produtos, parando...');
        break;
      }

      // Buscar próxima página
      let nextPageUrl: string | null = null;

      // Paginação específica por site
      if (domain.includes('shoppingchina.com.py')) {
        const nextBtn = $('a.next, a[rel="next"], .pagination-next a').first();
        nextPageUrl = nextBtn.attr('href') || null;
      } else if (domain.includes('lgimportados.com')) {
        // LG Importados tem 3 elementos de paginação separados
        // Procurar especificamente pelo link com "Próx." no texto
        let foundNext = false;
        $('.pagination a').each((_, el) => {
          const text = $(el).text().trim();
          if (text.includes('Próx') || text.includes('Next')) {
            nextPageUrl = $(el).attr('href') || null;
            foundNext = true;
            return false; // break
          }
        });

        // Fallback: procurar links com href contendo "pagina" e número maior
        if (!foundNext) {
          const currentMatch = currentUrl.match(/pagina(\d+)/);
          const currentPage = currentMatch ? parseInt(currentMatch[1]) : 1;
          const nextPage = currentPage + 1;

          $('.pagination a[href*="pagina"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href && href.includes(`pagina${nextPage}`)) {
              nextPageUrl = href;
              return false; // break
            }
          });
        }
      } else {
        // Genérico - procurar por links de próxima página
        let foundNext = false;
        $('a.next, a[rel="next"]').each((_, el) => {
          nextPageUrl = $(el).attr('href') || null;
          foundNext = true;
          return false;
        });

        if (!foundNext) {
          $('.pagination a, .paginacao a, [class*="paginat"] a').each((_, el) => {
            const text = $(el).text().trim().toLowerCase();
            if (text.includes('siguiente') || text.includes('next') || text === '>') {
              nextPageUrl = $(el).attr('href') || null;
              return false; // break
            }
          });
        }
      }

      if (nextPageUrl) {
        if (nextPageUrl.startsWith('http')) {
          // Já é URL completa
        } else if (nextPageUrl.startsWith('/')) {
          nextPageUrl = `${baseUrl}${nextPageUrl}`;
        } else {
          nextPageUrl = `${baseUrl}/${nextPageUrl}`;
        }
      }

      // Verificar se é a mesma URL ou se não tem próxima página
      if (!nextPageUrl || nextPageUrl === currentUrl) {
        console.log('Fim da paginação');
        break;
      }

      // Verificar limite de produtos
      if (allProductLinks.size >= this.maxProducts) {
        console.log(`Limite de ${this.maxProducts} produtos atingido`);
        break;
      }

      currentUrl = nextPageUrl;
      pageNum++;

      // Delay entre páginas
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    const finalLinks = Array.from(allProductLinks);
    console.log(`Total de produtos encontrados: ${finalLinks.length}`);
    return finalLinks;
  }

  async scrapeProduct(url: string): Promise<ProductInfo | null> {
    try {
      console.log(`Extraindo produto: ${url}`);
      const html = await this.fetchHTML(url);
      const $ = cheerio.load(html);

      // Nome do produto
      let name = '';
      const nameSelectors = [
        'h1',
        '[class*="product-title"]',
        '[class*="product-name"]',
        '[class*="titulo"]',
        '[itemprop="name"]',
      ];

      for (const selector of nameSelectors) {
        const text = $(selector).first().text().trim();
        if (text && text.length > 3) {
          name = text;
          break;
        }
      }

      if (!name) {
        console.log('Nome do produto não encontrado');
        return null;
      }

      // Preço
      let price = '';
      const urlDomain = new URL(url).hostname;

      // LG Importados: buscar Gs. no HTML inteiro
      if (urlDomain.includes('lgimportados.com')) {
        const bodyText = $('body').text();
        const gsMatch = bodyText.match(/Gs\.?\s*[\d.,]+/);
        if (gsMatch) {
          price = gsMatch[0];
        }
      } else {
        // Outros sites: tentar seletores tradicionais
        const priceSelectors = [
          '[class*="price"]',
          '[class*="Price"]',
          '[class*="precio"]',
          '[itemprop="price"]',
          '.valor',
          '.amount',
        ];

        for (const selector of priceSelectors) {
          const text = $(selector).first().text().trim();
          if (text && /\d/.test(text)) {
            price = text;
            break;
          }
        }

        // Se não encontrou, buscar por padrões de preço no texto
        if (!price) {
          $('*').each((_, el) => {
            const text = $(el).text().trim();
            const match = text.match(/Gs\.?\s*[\d.,]+|U?\$\s*[\d.,]+|USD\s*[\d.,]+/);
            if (match && text.length < 50) {
              price = match[0];
              return false; // break
            }
          });
        }
      }

      // Descrição
      let description = '';
      const descSelectors = [
        '[class*="description"]',
        '[class*="descripcion"]',
        '[itemprop="description"]',
        '.produto-descricao',
        '#description',
      ];

      for (const selector of descSelectors) {
        const text = $(selector).first().text().trim();
        if (text && text.length > 20) {
          description = text;
          break;
        }
      }

      // Se não encontrou descrição, usar meta description
      if (!description) {
        description = $('meta[name="description"]').attr('content') || '';
      }

      // Imagens
      const images: string[] = [];
      const baseUrl = new URL(url).origin;

      const imageSelectors = [
        '[class*="product"] img',
        '[class*="Product"] img',
        '[class*="imagen"] img',
        '[class*="gallery"] img',
        '[itemprop="image"]',
        'img[src*="product"]',
        'img[src*="producto"]',
        'img[alt*="product"]',
      ];

      imageSelectors.forEach(selector => {
        $(selector).each((_, el) => {
          const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy');
          if (src) {
            const fullUrl = src.startsWith('http') ? src : `${baseUrl}${src.startsWith('/') ? '' : '/'}${src}`;
            // Filtrar logos e ícones
            const isValidImage =
              !fullUrl.includes('logo') &&
              !fullUrl.includes('icon') &&
              !fullUrl.includes('banner') &&
              !fullUrl.includes('data:image') &&
              !images.includes(fullUrl);

            if (isValidImage) {
              images.push(fullUrl);
            }
          }
        });
      });

      console.log(`Produto extraído: ${name} (${images.length} imagens)`);

      return {
        name,
        description,
        price,
        images,
        url,
      };
    } catch (error) {
      console.error(`Erro ao extrair produto ${url}:`, error);
      return null;
    }
  }

  /**
   * Processa produtos página por página em streaming
   * Retorna um async generator que descobre e processa produtos simultaneamente
   * Agora inclui preço extraído do card de listagem
   */
  async *getProductLinksStreaming(categoryUrl: string): AsyncGenerator<{
    pageNumber: number;
    productLinks: { url: string; price: string }[];
    hasNextPage: boolean;
    totalDiscovered: number;
  }> {
    console.log(`[Streaming] Iniciando descoberta de: ${categoryUrl}`);
    const allProductLinks = new Set<string>();
    let currentUrl = categoryUrl;
    let pageNum = 1;
    const domain = new URL(categoryUrl).hostname;
    const maxPages = 500;

    while (pageNum <= maxPages) {
      console.log(`[Streaming] Página ${pageNum}: ${currentUrl}`);

      try {
        const html = await this.fetchHTML(currentUrl);
        const $ = cheerio.load(html);
        const baseUrl = new URL(categoryUrl).origin;
        const pageProductsCountBefore = allProductLinks.size;
        const currentPageProducts: { url: string; price: string }[] = [];

        // Função helper para extrair preço do elemento pai do produto
        const extractPriceFromCard = (el: any): string => {
          const $card = $(el).closest('[class*="product"], .product-card, .product-item, .card');
          const priceText = $card.find('[class*="price"], [class*="precio"], .valor, .amount').first().text().trim();

          // Tenta encontrar padrão de preço
          const priceMatch = priceText.match(/Gs\.?\s*[\d.,]+|U?\$\s*[\d.,]+|\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?/);
          return priceMatch ? priceMatch[0] : '';
        };

        // SHOPPING CHINA específico
        if (domain.includes('shoppingchina.com.py')) {
          $('.product-item a, .product-card a, [class*="product"] > a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('/producto/') || href.includes('/product/'))) {
              const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
              if (!allProductLinks.has(fullUrl)) {
                allProductLinks.add(fullUrl);
                const price = extractPriceFromCard(el);
                currentPageProducts.push({ url: fullUrl, price });
              }
            }
          });
        }
        // LG IMPORTADOS específico
        else if (domain.includes('lgimportados.com')) {
          $('.product-card, [class*="product-item"], [class*="product"]').each((_, cardEl) => {
            const $card = $(cardEl);
            const href = $card.find('a[href*="produto"]').first().attr('href');
            if (href && (href.includes('produto/') || href.includes('/produto/'))) {
              const fullUrl = href.startsWith('http') ? href : `${baseUrl}/${href}`;
              if (!allProductLinks.has(fullUrl)) {
                allProductLinks.add(fullUrl);

                // Extrair preço do card
                let price = '';
                const priceEl = $card.find('[class*="price"], [class*="precio"], .valor, .preco').first();
                const priceText = priceEl.text().trim() || $card.text();
                const priceMatch = priceText.match(/Gs\.?\s*[\d.,]+/);
                if (priceMatch) {
                  price = priceMatch[0];
                }

                currentPageProducts.push({ url: fullUrl, price });
              }
            }
          });
        }
        // CELLSHOP específico
        else if (domain.includes('cellshop.com')) {
          $('.product a, [class*="product-item"] a, .product-card a, .card-product a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('/producto/') || href.includes('/product/') || href.includes('/p/'))) {
              const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
              if (!allProductLinks.has(fullUrl)) {
                allProductLinks.add(fullUrl);
                const price = extractPriceFromCard(el);
                currentPageProducts.push({ url: fullUrl, price });
              }
            }
          });
        }
        // Genérico
        else {
          $('a').each((_, el) => {
            const href = $(el).attr('href');
            if (href) {
              const isProductLink =
                href.includes('/producto/') ||
                href.includes('/product/') ||
                (href.includes('/p/') && /\/p\/\d+/.test(href)) ||
                (href.includes('/item/') && /\/item\/\d+/.test(href));

              const isNotProduct =
                href.includes('/categoria') ||
                href.includes('/category') ||
                href.includes('/tag/') ||
                href.includes('/search') ||
                href.includes('/filter') ||
                href.includes('?') ||
                href.includes('#') ||
                href === '/' ||
                href.length < 10;

              if (isProductLink && !isNotProduct) {
                const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
                if (isValidUrl(fullUrl) && fullUrl.includes(domain) && !allProductLinks.has(fullUrl)) {
                  allProductLinks.add(fullUrl);
                  const price = extractPriceFromCard(el);
                  currentPageProducts.push({ url: fullUrl, price });
                }
              }
            }
          });
        }

        console.log(`[Streaming] Encontrados ${currentPageProducts.length} novos produtos na página ${pageNum}`);

        // Se não encontrou produtos novos, parar
        if (currentPageProducts.length === 0 && pageNum > 1) {
          console.log('[Streaming] Sem novos produtos, finalizando...');
          break;
        }

        // Buscar próxima página
        let nextPageUrl: string | null = null;

        if (domain.includes('shoppingchina.com.py')) {
          const nextBtn = $('a.next, a[rel="next"], .pagination-next a').first();
          nextPageUrl = nextBtn.attr('href') || null;
        } else if (domain.includes('lgimportados.com')) {
          let foundNext = false;
          $('.pagination a').each((_, el) => {
            const text = $(el).text().trim();
            if (text.includes('Próx') || text.includes('Next')) {
              nextPageUrl = $(el).attr('href') || null;
              foundNext = true;
              return false;
            }
          });

          if (!foundNext) {
            const currentMatch = currentUrl.match(/pagina(\d+)/);
            const currentPage = currentMatch ? parseInt(currentMatch[1]) : 1;
            const nextPage = currentPage + 1;
            nextPageUrl = currentUrl.replace(/pagina\d+/, `pagina${nextPage}`);
          }
        } else if (domain.includes('cellshop.com')) {
          const nextBtn = $('a.next-page, [class*="next"], .pagination a[rel="next"]').first();
          nextPageUrl = nextBtn.attr('href') || null;
        } else {
          const nextBtn = $('a.next, a[rel="next"], .pagination .next a, [class*="pagination"] [class*="next"] a').first();
          nextPageUrl = nextBtn.attr('href') || null;
        }

        const hasNextPage = !!nextPageUrl;

        // Retornar produtos da página atual
        yield {
          pageNumber: pageNum,
          productLinks: currentPageProducts,
          hasNextPage,
          totalDiscovered: allProductLinks.size
        };

        // Se não há próxima página, parar
        if (!hasNextPage || !nextPageUrl) {
          console.log('[Streaming] Última página alcançada');
          break;
        }

        // Preparar próxima URL
        if (nextPageUrl.startsWith('http')) {
          currentUrl = nextPageUrl;
        } else if (nextPageUrl.startsWith('/')) {
          currentUrl = `${baseUrl}${nextPageUrl}`;
        } else {
          currentUrl = `${baseUrl}/${nextPageUrl}`;
        }
        pageNum++;

        // Delay entre páginas
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`[Streaming] Erro na página ${pageNum}:`, error);
        break;
      }
    }

    console.log(`[Streaming] Descoberta concluída: ${allProductLinks.size} produtos encontrados`);
  }

  async close(): Promise<void> {
    console.log('Scraper fechado');
  }
}

export async function scrapeCategory(categoryUrl: string): Promise<ProductInfo[]> {
  const scraper = new UniversalScraper();
  await scraper.initialize();

  try {
    const productLinks = await scraper.getProductLinks(categoryUrl);
    console.log(`Extraindo ${productLinks.length} produtos...`);

    const products: ProductInfo[] = [];

    for (let i = 0; i < Math.min(productLinks.length, 200); i++) {
      const link = productLinks[i];
      console.log(`Progresso: ${i + 1}/${Math.min(productLinks.length, 200)}`);

      const product = await scraper.scrapeProduct(link);
      if (product) {
        products.push(product);
      }

      // Delay entre produtos
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return products;
  } finally {
    await scraper.close();
  }
}
// Build timestamp: 1767120129
