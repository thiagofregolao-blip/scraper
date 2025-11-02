
import puppeteer, { Browser, Page } from 'puppeteer';
import { extractDomain, isValidUrl } from './utils';

export interface ProductInfo {
  name: string;
  description: string;
  price?: string;
  images: string[];
  url: string;
}

export class UniversalScraper {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async initialize(): Promise<void> {
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    this.page = await this.browser.newPage();
    
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );

    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  async getProductLinks(categoryUrl: string): Promise<string[]> {
    if (!this.page) throw new Error('Scraper not initialized');

    try {
      console.log(`[Scraper] Navigating to category: ${categoryUrl}`);
      
      await this.page.goto(categoryUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 60000 
      });

      console.log('[Scraper] Page loaded, waiting for dynamic content...');
      // Wait for dynamic content and scroll to trigger lazy loading
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Scroll to load lazy images
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 2);
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      const domain = extractDomain(categoryUrl);
      
      console.log('[Scraper] Extracting product links from page...');
      
      // Use more intelligent approach - find links that look like products
      const productLinks = await this.page.evaluate((baseDomain: string) => {
        const links = new Set<string>();
        
        // Function to check if an element or its children contain an image
        const hasImage = (element: Element): boolean => {
          return element.querySelector('img') !== null;
        };
        
        // Function to check if an element or its children contain price indicators
        const hasPrice = (element: Element): boolean => {
          const text = element.textContent || '';
          const pricePatterns = [
            /\$\s*\d+/,           // $100
            /\d+\s*Gs/i,          // Guaraní (Paraguay)
            /R\$\s*\d+/,          // Real (Brazil)
            /€\s*\d+/,            // Euro
            /£\s*\d+/,            // Pound
            /precio/i,            // Spanish
            /preço/i,             // Portuguese
            /price/i              // English
          ];
          return pricePatterns.some(pattern => pattern.test(text));
        };
        
        // Get all links on the page
        const allLinks = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
        
        console.log(`Found ${allLinks.length} total links`);
        
        for (const link of allLinks) {
          const href = link.href;
          
          // Skip external links, anchors, and navigation
          if (!href || 
              href === window.location.href ||
              href.includes('#') ||
              href.includes('javascript:') ||
              href.includes('mailto:') ||
              href.includes('tel:')) {
            continue;
          }
          
          // Check if same domain
          try {
            const linkUrl = new URL(href);
            const pageUrl = new URL(window.location.href);
            if (linkUrl.hostname !== pageUrl.hostname) {
              continue;
            }
          } catch (e) {
            continue;
          }
          
          // Skip common non-product pages
          const lowerHref = href.toLowerCase();
          const skipPatterns = [
            '/categoria', '/category', '/cart', '/carrito', '/checkout',
            '/login', '/register', '/account', '/conta', '/mi-cuenta',
            '/about', '/sobre', '/contact', '/contato', '/contacto',
            '/terms', '/privacy', '/politica', '/ayuda', '/help',
            '/search', '/busca', '/buscar'
          ];
          
          if (skipPatterns.some(pattern => lowerHref.includes(pattern))) {
            continue;
          }
          
          // Check if the link or its parent container has product-like characteristics
          const linkParent = link.closest('div, li, article, section');
          const containerToCheck = linkParent || link;
          
          // Product links usually have:
          // 1. An image
          // 2. Text content (product name)
          // 3. Often a price
          const hasImg = hasImage(containerToCheck);
          const hasText = (link.textContent?.trim().length || 0) > 5;
          const mayHavePrice = hasPrice(containerToCheck);
          
          // Look for URL patterns that suggest it's a product
          const productPatterns = [
            '/producto/', '/produtos/', '/product/', '/item/', '/p/',
            '/articulo/', '/artigo/'
          ];
          const hasProductPattern = productPatterns.some(pattern => lowerHref.includes(pattern));
          
          // Look for numeric IDs in URL
          const hasNumericId = /\/\d+/.test(href) || /[-_]\d+[^\/]*$/.test(href.split('?')[0]);
          
          // Include link if it matches product criteria
          if (hasProductPattern || 
              (hasImg && hasText && hasNumericId) ||
              (hasImg && mayHavePrice)) {
            links.add(href.split('?')[0]); // Remove query parameters
          }
        }
        
        console.log(`Extracted ${links.size} potential product links`);
        return Array.from(links);
      }, domain);

      if (productLinks.length === 0) {
        console.log('[Scraper] No product links found with intelligent detection');
        console.log('[Scraper] Trying fallback: all links with images...');
        
        // Last resort fallback
        const fallbackLinks = await this.page.evaluate(() => {
          const links = new Set<string>();
          const allLinks = Array.from(document.querySelectorAll('a[href]')) as HTMLAnchorElement[];
          
          for (const link of allLinks) {
            const href = link.href;
            const img = link.querySelector('img');
            
            if (img && href && !href.includes('#') && !href.includes('javascript:')) {
              try {
                const linkUrl = new URL(href);
                const pageUrl = new URL(window.location.href);
                if (linkUrl.hostname === pageUrl.hostname) {
                  links.add(href.split('?')[0]);
                }
              } catch (e) {
                // Skip invalid URLs
              }
            }
          }
          
          return Array.from(links);
        });
        
        console.log(`[Scraper] Fallback found ${fallbackLinks.length} links with images`);
        productLinks.push(...fallbackLinks);
      }

      // Remove duplicates and limit results
      const uniqueLinks = [...new Set(productLinks)].slice(0, 100);
      console.log(`[Scraper] Final result: ${uniqueLinks.length} unique product links`);
      
      // Log first few links for debugging
      if (uniqueLinks.length > 0) {
        console.log('[Scraper] Sample links:');
        uniqueLinks.slice(0, 5).forEach((link, i) => {
          console.log(`  ${i + 1}. ${link}`);
        });
      }
      
      return uniqueLinks;
    } catch (error) {
      console.error(`Error getting product links from ${categoryUrl}:`, error);
      return [];
    }
  }

  async scrapeProduct(productUrl: string): Promise<ProductInfo | null> {
    if (!this.page) throw new Error('Scraper not initialized');

    try {
      await this.page.goto(productUrl, { 
        waitUntil: 'networkidle0', 
        timeout: 60000 
      });

      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Extract product information
      const productInfo = await this.page.evaluate(() => {
        // Generic selectors for product information
        const getTextContent = (selectors: string[]): string => {
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element?.textContent?.trim()) {
              return element.textContent.trim();
            }
          }
          return '';
        };

        const getDescription = (): string => {
          // Try to find description heading first
          const descriptionHeadings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
            .find(h => h.textContent?.toLowerCase().includes('descrip'));
          
          if (descriptionHeadings) {
            // Get text content after description heading
            let nextElement = descriptionHeadings.nextElementSibling;
            let description = '';
            
            while (nextElement && description.length < 500) {
              const text = nextElement.textContent?.trim() || '';
              if (text.length > 20) {
                description += text + '\n\n';
              }
              nextElement = nextElement.nextElementSibling;
            }
            
            if (description.trim()) return description.trim();
          }
          
          // Fallback to common selectors
          const desc = getTextContent([
            '.product-description',
            '.item-description', 
            '.description',
            '.descripcion',
            '.product-details',
            '[data-testid*="description"]',
            '.product-content',
            '.item-details'
          ]);
          
          // If still no description, try to get all paragraph text
          if (!desc) {
            const paragraphs = Array.from(document.querySelectorAll('p'))
              .map(p => p.textContent?.trim() || '')
              .filter(text => text.length > 50)
              .join('\n\n');
            
            if (paragraphs) return paragraphs.substring(0, 1000);
          }
          
          return desc || 'Descrição não disponível';
        };

        const getImageUrls = (): string[] => {
          // First try to get high-resolution product images
          const productImagesSelectors = [
            'img[src*="producto"]',
            'img[src*="product"]',
            'img[src*="item"]',
            'img[alt*="product"]',
            'img[alt*="producto"]',
            '.product-image img',
            '.product-gallery img',
            '.item-image img',
            '.zoom-image',
            '[data-testid*="image"] img',
            '.product-photos img',
            '.gallery img',
            'img[src*="active_storage"]', // For Rails Active Storage
            'img[src*="cdn"]'
          ];

          let images: string[] = [];
          
          for (const selector of productImagesSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
              images = Array.from(elements)
                .map(img => {
                  const element = img as HTMLImageElement;
                  return element.src || element.dataset.src || element.dataset.original || '';
                })
                .filter(src => src && 
                  !src.includes('placeholder') && 
                  !src.includes('no-image') &&
                  !src.includes('logo.') &&
                  !src.includes('/logo') &&
                  !src.includes('icon'));
              
              if (images.length > 0) break;
            }
          }

          // Fallback: get all large images
          if (images.length === 0) {
            const allImages = Array.from(document.querySelectorAll('img'))
              .filter(img => {
                const imgElement = img as HTMLImageElement;
                return imgElement.width > 100 && imgElement.height > 100;
              })
              .map(img => img.src)
              .filter(src => src && 
                !src.includes('logo') && 
                !src.includes('icon') &&
                !src.includes('placeholder') &&
                !src.includes('banner') &&
                src.includes('http')
              );
            images = allImages.slice(0, 10); // Limit to 10 images
          }

          return [...new Set(images)]; // Remove duplicates
        };

        // Get product name
        const name = getTextContent([
          'h1.product-title',
          'h1.item-title', 
          '.product-name h1',
          '.product-title',
          'h1[data-testid*="title"]',
          'h1',
          '.title h1',
          '.product h1'
        ]);

        // Get product description
        const description = getDescription();

        // Get price
        const price = getTextContent([
          '.price',
          '.precio',
          '.product-price',
          '.item-price',
          '[data-testid*="price"]',
          '.value',
          '.cost'
        ]);

        return {
          name: name || document.title || 'Produto sem nome',
          description: description,
          price: price || '',
          images: getImageUrls(),
          url: window.location.href
        };
      });

      console.log(`Scraped product: ${productInfo.name} (${productInfo.images.length} images)`);
      return productInfo;
    } catch (error) {
      console.error(`Error scraping product ${productUrl}:`, error);
      return null;
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
