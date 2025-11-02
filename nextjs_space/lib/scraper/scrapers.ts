
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
      await this.page.goto(categoryUrl, { 
        waitUntil: 'networkidle0', 
        timeout: 60000 
      });

      // Wait for content to load
      await new Promise(resolve => setTimeout(resolve, 2000));

      const domain = extractDomain(categoryUrl);
      
      // Generic selectors for product links
      const linkSelectors = [
        'a[href*="/producto/"]', // Spanish sites like shoppingchina.com.py
        'a[href*="/produto/"]',  // Portuguese sites
        'a[href*="/product/"]',
        'a[href*="/item/"]',
        'a[href*="/p/"]',
        '.product-item a',
        '.product-link',
        '.item-link',
        '[data-testid*="product"] a',
        '.product-card a',
        '.listing-item a'
      ];

      let productLinks: string[] = [];

      for (const selector of linkSelectors) {
        try {
          const links = await this.page.$$eval(selector, (elements) =>
            elements.map(el => (el as HTMLAnchorElement).href)
          );
          
          if (links.length > 0) {
            productLinks = links;
            break;
          }
        } catch (error) {
          // Continue to next selector
        }
      }

      // Fallback: get all links and filter by common patterns
      if (productLinks.length === 0) {
        const allLinks = await this.page.$$eval('a[href]', (elements) =>
          elements.map(el => (el as HTMLAnchorElement).href)
        );

        productLinks = allLinks.filter(link => {
          if (!isValidUrl(link)) return false;
          const linkDomain = extractDomain(link);
          if (linkDomain !== domain) return false;
          
          const path = link.toLowerCase();
          return path.includes('/producto/') || // Spanish
                 path.includes('/produto/') ||  // Portuguese
                 path.includes('/product/') ||  // English
                 path.includes('/item/') ||
                 path.includes('/p/') ||
                 path.match(/\/[^\/]*\d+[^\/]*$/); // URLs ending with numbers
        });
      }

      // Remove duplicates and limit results
      const uniqueLinks = [...new Set(productLinks)].slice(0, 100);
      console.log(`Found ${uniqueLinks.length} product links on ${categoryUrl}`);
      
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
