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

  async initialize(): Promise<void> {
    console.log('Scraper inicializado (usando Cheerio - sem navegador)');
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
    const allProductLinks: string[] = [];
    let currentUrl = categoryUrl;
    let pageNum = 1;

    while (pageNum <= 10) {
      console.log(`Página ${pageNum}: ${currentUrl}`);
      
      const html = await this.fetchHTML(currentUrl);
      const $ = cheerio.load(html);

      // Extrair links de produtos
      const productLinks: string[] = [];
      const baseUrl = new URL(categoryUrl).origin;

      // Seletores comuns para produtos
      const selectors = [
        'a[href*="/product"]',
        'a[href*="/producto"]',
        'a[href*="/p/"]',
        'a[href*="/item"]',
        '.product a',
        '.produto a',
        '[class*="product"] a',
        '[class*="item"] a',
      ];

      selectors.forEach(selector => {
        $(selector).each((_, el) => {
          const href = $(el).attr('href');
          if (href) {
            const fullUrl = href.startsWith('http') ? href : `${baseUrl}${href.startsWith('/') ? '' : '/'}${href}`;
            if (isValidUrl(fullUrl) && !productLinks.includes(fullUrl)) {
              productLinks.push(fullUrl);
            }
          }
        });
      });

      console.log(`Encontrados ${productLinks.length} produtos na página ${pageNum}`);
      allProductLinks.push(...productLinks);

      // Buscar próxima página
      let nextPageUrl: string | null = null;

      // Tentar vários seletores de paginação
      const paginationSelectors = [
        'a.next',
        'a[rel="next"]',
        'a:contains("Siguiente")',
        'a:contains("Próxima")',
        'a:contains("Next")',
        '.pagination a:last',
        '[class*="next"] a',
        '[class*="siguiente"] a',
      ];

      for (const selector of paginationSelectors) {
        const nextLink = $(selector).attr('href');
        if (nextLink) {
          nextPageUrl = nextLink.startsWith('http') ? nextLink : `${baseUrl}${nextLink.startsWith('/') ? '' : '/'}${nextLink}`;
          break;
        }
      }

      if (!nextPageUrl || nextPageUrl === currentUrl) {
        console.log('Não há mais páginas');
        break;
      }

      currentUrl = nextPageUrl;
      pageNum++;

      // Delay entre páginas
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Total de produtos encontrados: ${allProductLinks.length}`);
    return allProductLinks;
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
      const priceSelectors = [
        '[class*="price"]',
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
        '[class*="product-image"] img',
        '[class*="product-gallery"] img',
        '[class*="imagen"] img',
        '[itemprop="image"]',
        '.gallery img',
        '.fotos img',
      ];

      imageSelectors.forEach(selector => {
        $(selector).each((_, el) => {
          const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-lazy');
          if (src) {
            const fullUrl = src.startsWith('http') ? src : `${baseUrl}${src.startsWith('/') ? '' : '/'}${src}`;
            if (!images.includes(fullUrl) && !fullUrl.includes('data:image')) {
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
