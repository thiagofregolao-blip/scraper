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

  /**
   * Verifica se é um site mapy.com.py e extrai o slug da categoria da URL
   */
  private isMapySite(url: string): boolean {
    return new URL(url).hostname.includes('mapy.com.py');
  }

  private getMapyCategorySlug(url: string): string {
    // Ex: /categoria-produto/bebidas/ -> bebidas
    const match = url.match(/\/categoria-produto\/([^/]+)/);
    return match ? match[1] : '';
  }

  /**
   * Busca o ID da categoria no WooCommerce Store API do Mapy
   */
  private async getMapyCategoryId(baseUrl: string, slug: string): Promise<number | null> {
    try {
      const apiUrl = `${baseUrl}/wp-json/wc/store/v1/products/categories?per_page=100`;
      const response = await axios.get(apiUrl, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 15000,
      });
      const categories = response.data;
      const cat = categories.find((c: any) => c.slug === slug);
      if (cat) {
        console.log(`[Mapy] Categoria "${slug}" encontrada com ID: ${cat.id} (${cat.count} produtos)`);
        return cat.id;
      }
      console.log(`[Mapy] Categoria "${slug}" não encontrada na API`);
      return null;
    } catch (error) {
      console.error(`[Mapy] Erro ao buscar categorias:`, error);
      return null;
    }
  }

  /**
   * Busca produtos via WooCommerce Store API do Mapy (muito mais confiável que scraping HTML)
   */
  private async fetchMapyProductsFromAPI(
    baseUrl: string,
    categoryId: number,
    page: number = 1,
    perPage: number = 20
  ): Promise<{ products: { url: string; price: string; name: string; images: string[] }[]; hasMore: boolean }> {
    const apiUrl = `${baseUrl}/wp-json/wc/store/v1/products?category=${categoryId}&per_page=${perPage}&page=${page}`;
    console.log(`[Mapy API] Página ${page}: ${apiUrl}`);

    try {
      const response = await axios.get(apiUrl, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 15000,
      });

      const items = response.data;
      if (!Array.isArray(items) || items.length === 0) {
        return { products: [], hasMore: false };
      }

      const products = items.map((item: any) => {
        const prices = item.prices || {};
        const priceRaw = prices.price || prices.sale_price || prices.regular_price || '';
        // WC Store API retorna preço em centavos (ex: "299200000" para Gs. 2.992.000)
        const priceNum = parseInt(priceRaw, 10);
        const priceFormatted = priceNum > 0
          ? `Gs. ${Math.round(priceNum / 100).toLocaleString('es-PY')}`
          : '';

        const images = (item.images || []).map((img: any) => img.src).filter(Boolean);

        return {
          url: item.permalink || `${baseUrl}/produto/${item.slug}/`,
          price: priceFormatted,
          name: item.name || '',
          images,
        };
      });

      console.log(`[Mapy API] ${products.length} produtos encontrados na página ${page}`);
      return { products, hasMore: items.length >= perPage };
    } catch (error: any) {
      console.error(`[Mapy API] Erro na página ${page}: ${error.message}`);
      return { products: [], hasMore: false };
    }
  }

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

      if (domain.includes('mapy.com.py')) {
        // Mapy: buscar subcategorias via WooCommerce Store API
        try {
          const slug = this.getMapyCategorySlug(categoryUrl);
          const categoryId = await this.getMapyCategoryId(baseUrl, slug);
          if (categoryId) {
            const apiUrl = `${baseUrl}/wp-json/wc/store/v1/products/categories?parent=${categoryId}&per_page=100`;
            const response = await axios.get(apiUrl, {
              headers: { 'User-Agent': this.userAgent },
              timeout: 15000,
            });
            const cats = response.data;
            if (Array.isArray(cats)) {
              for (const cat of cats) {
                if (cat.slug && cat.name) {
                  subcategories.push({
                    name: cat.name,
                    url: `${baseUrl}/categoria-produto/${cat.slug}/`,
                  });
                  console.log(`[Mapy Subcategorias] Encontrada: "${cat.name}" -> ${baseUrl}/categoria-produto/${cat.slug}/`);
                }
              }
            }
          }
        } catch (error) {
          console.error(`[Mapy Subcategorias] Erro:`, error);
        }
        console.log(`[Subcategorias] Encontradas ${subcategories.length} subcategorias`);
        return subcategories;
      } else if (domain.includes('lgimportados.com')) {
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
      // Primeiro tenta com Axios (método rápido local)
      const response = await axios.get(url, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,es;q=0.6',
        },
        timeout: 15000,
      });

      const html = response.data;

      // Detecta Cloudflare protection
      if (html.includes('Just a moment') || html.includes('cf-chl-opt') || html.includes('challenge-platform')) {
        console.log('⚠️ Cloudflare detected (local), switching to Scrape.do...');
        return await this.fetchWithScrapeDo(url, false);
      }

      return html;
    } catch (error) {
      console.log(`Axios local failed, trying Scrape.do...`);
      return await this.fetchWithScrapeDo(url, true);
    }
  }

  private async fetchWithScrapeDo(url: string, useRender: boolean = false): Promise<string> {
    const SCRAPE_DO_TOKEN = process.env.SCRAPE_DO_TOKEN || 'b36342f58b4448f58e8a81f14a3841f2968c9d9a36a';
    const encodedUrl = encodeURIComponent(url);
    const renderParam = useRender ? '&render=true' : '';
    const apiUrl = `https://api.scrape.do?token=${SCRAPE_DO_TOKEN}&url=${encodedUrl}${renderParam}`;

    console.log(`🚀 Scrape.do requesting: ${url} (Render: ${useRender})`);

    try {
      const response = await axios.get(apiUrl, {
        timeout: useRender ? 120000 : 60000, // Timeout generous for Scrape.do
      });
      console.log(`✅ Scrape.do success!`);
      return response.data;
    } catch (error: any) {
      console.error(`❌ Scrape.do failed: ${error.message}`);
      // Se falhar no modo fast, tenta render (apenas uma vez)
      if (!useRender) {
        console.log('Retrying with render mode...');
        return this.fetchWithScrapeDo(url, true);
      }
      throw error;
    }
  }

  async getProductLinks(categoryUrl: string): Promise<string[]> {
    console.log(`Extraindo links de produtos de: ${categoryUrl}`);

    // MAPY.COM.PY - usar WooCommerce Store API (produtos são renderizados via JS)
    if (this.isMapySite(categoryUrl)) {
      const baseUrl = new URL(categoryUrl).origin;
      const slug = this.getMapyCategorySlug(categoryUrl);
      console.log(`[Mapy] Detectado site Mapy - usando API WooCommerce (categoria: ${slug})`);

      const categoryId = await this.getMapyCategoryId(baseUrl, slug);
      if (!categoryId) {
        console.log('[Mapy] Não foi possível encontrar a categoria, tentando scraping genérico...');
      } else {
        const allLinks: string[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore && allLinks.length < this.maxProducts) {
          const result = await this.fetchMapyProductsFromAPI(baseUrl, categoryId, page);
          allLinks.push(...result.products.map(p => p.url));
          hasMore = result.hasMore;
          page++;
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(`[Mapy] Total de produtos encontrados via API: ${allLinks.length}`);
        return allLinks;
      }
    }

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

      // MAPY.COM.PY - usar WooCommerce Store API para buscar produto pelo slug
      if (this.isMapySite(url)) {
        return await this.scrapeMapyProduct(url);
      }

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

    // MAPY.COM.PY - usar WooCommerce Store API
    if (this.isMapySite(categoryUrl)) {
      const baseUrl = new URL(categoryUrl).origin;
      const slug = this.getMapyCategorySlug(categoryUrl);
      console.log(`[Mapy Streaming] Detectado site Mapy - usando API WooCommerce (categoria: ${slug})`);

      const categoryId = await this.getMapyCategoryId(baseUrl, slug);
      if (categoryId) {
        let page = 1;
        let totalDiscovered = 0;
        let hasMore = true;

        while (hasMore && totalDiscovered < this.maxProducts) {
          const result = await this.fetchMapyProductsFromAPI(baseUrl, categoryId, page);

          if (result.products.length === 0) break;

          totalDiscovered += result.products.length;
          hasMore = result.hasMore;

          yield {
            pageNumber: page,
            productLinks: result.products.map(p => ({ url: p.url, price: p.price })),
            hasNextPage: hasMore,
            totalDiscovered,
          };

          page++;
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log(`[Mapy Streaming] Descoberta concluída: ${totalDiscovered} produtos encontrados`);
        return;
      }
    }

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
                href.includes('/produto/') ||
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

  /**
   * Extrai dados do produto Mapy via WooCommerce Store API usando o slug
   */
  private async scrapeMapyProduct(url: string): Promise<ProductInfo | null> {
    try {
      const baseUrl = new URL(url).origin;
      // Extrair slug da URL: /produto/nome-do-produto/ -> nome-do-produto
      const slugMatch = url.match(/\/produto\/([^/]+)/);
      if (!slugMatch) {
        console.log(`[Mapy] Não conseguiu extrair slug de: ${url}`);
        return null;
      }
      const slug = slugMatch[1];

      const apiUrl = `${baseUrl}/wp-json/wc/store/v1/products?slug=${slug}`;
      console.log(`[Mapy] Buscando produto via API: ${slug}`);

      const response = await axios.get(apiUrl, {
        headers: { 'User-Agent': this.userAgent },
        timeout: 15000,
      });

      const items = response.data;
      if (!Array.isArray(items) || items.length === 0) {
        console.log(`[Mapy] Produto não encontrado na API: ${slug}`);
        return null;
      }

      const item = items[0];
      const prices = item.prices || {};
      const priceRaw = prices.price || prices.sale_price || prices.regular_price || '';
      const priceNum = parseInt(priceRaw, 10);
      const priceFormatted = priceNum > 0
        ? `Gs. ${Math.round(priceNum / 100).toLocaleString('es-PY')}`
        : '';

      const images = (item.images || []).map((img: any) => img.src).filter(Boolean);

      // Limpar descrição HTML
      const descHtml = item.description || item.short_description || '';
      const descText = descHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

      console.log(`[Mapy] Produto extraído: ${item.name} (${images.length} imagens)`);

      return {
        name: item.name || '',
        description: descText,
        price: priceFormatted,
        images,
        url,
      };
    } catch (error: any) {
      console.error(`[Mapy] Erro ao buscar produto: ${error.message}`);
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
// Build timestamp: 1767120129
