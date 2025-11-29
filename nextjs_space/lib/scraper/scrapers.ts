import axios from 'axios';
import * as cheerio from 'cheerio';
import { extractDomain, isValidUrl } from './utils';

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

  private async fetchHTML(url: string): Promise<string> {
    console.log(`Fetching: ${url}`);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,es;q=0.6',
      },
      timeout: 30000,
    });
    return response.data;
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
      else if (domain.includes('cellshop.com.py')) {
        $('.product a, [class*="product-item"] a').each((_, el) => {
          const href = $(el).attr('href');
          if (href && (href.includes('/producto/') || href.includes('/product/'))) {
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
   */
  async *getProductLinksStreaming(categoryUrl: string): AsyncGenerator<{
    pageNumber: number;
    productLinks: string[];
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
        const currentPageProducts: string[] = [];

        // SHOPPING CHINA específico
        if (domain.includes('shoppingchina.com.py')) {
          $('.product-item a, .product-card a, [class*="product"] > a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('/producto/') || href.includes('/product/'))) {
              const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
              if (!allProductLinks.has(fullUrl)) {
                allProductLinks.add(fullUrl);
                currentPageProducts.push(fullUrl);
              }
            }
          });
        } 
        // LG IMPORTADOS específico
        else if (domain.includes('lgimportados.com')) {
          $('.product-card a, .product-link, [class*="product"] a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('produto/') || href.includes('/produto/'))) {
              const fullUrl = href.startsWith('http') ? href : `${baseUrl}/${href}`;
              if (!allProductLinks.has(fullUrl)) {
                allProductLinks.add(fullUrl);
                currentPageProducts.push(fullUrl);
              }
            }
          });
        }
        // CELLSHOP específico
        else if (domain.includes('cellshop.com.py')) {
          $('.product a, [class*="product-item"] a').each((_, el) => {
            const href = $(el).attr('href');
            if (href && (href.includes('/producto/') || href.includes('/product/'))) {
              const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href}`;
              if (!allProductLinks.has(fullUrl)) {
                allProductLinks.add(fullUrl);
                currentPageProducts.push(fullUrl);
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
                  currentPageProducts.push(fullUrl);
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
        } else if (domain.includes('cellshop.com.py')) {
          const nextBtn = $('a.next-page, [class*="next"]').first();
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
        currentUrl = nextPageUrl.startsWith('http') ? nextPageUrl : `${baseUrl}${nextPageUrl}`;
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
