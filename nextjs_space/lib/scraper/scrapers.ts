
import puppeteerCore, { Browser, Page } from 'puppeteer-core';
import puppeteer from 'puppeteer';
import chromium from '@sparticuz/chromium';
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
    const commonArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ];

    try {
      // Try method 1: Use regular puppeteer (works in development and some production environments)
      this.browser = await puppeteer.launch({
        headless: true,
        args: commonArgs
      });
      console.log('Using Puppeteer with bundled Chromium');
    } catch (error1) {
      console.log('Puppeteer failed, trying @sparticuz/chromium...', error1);
      
      try {
        // Try method 2: Use @sparticuz/chromium (for serverless environments)
        const executablePath = await chromium.executablePath();
        this.browser = await puppeteerCore.launch({
          headless: true,
          args: [...chromium.args, ...commonArgs],
          executablePath
        });
        console.log('Using @sparticuz/chromium');
      } catch (error2) {
        console.log('@sparticuz/chromium failed, trying system Chrome...', error2);
        
        // Try method 3: Use system Chrome/Chromium
        const systemPaths = [
          '/usr/bin/google-chrome',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/snap/bin/chromium'
        ];
        
        let launched = false;
        for (const path of systemPaths) {
          try {
            this.browser = await puppeteerCore.launch({
              headless: true,
              args: commonArgs,
              executablePath: path
            });
            console.log(`Using system Chrome at ${path}`);
            launched = true;
            break;
          } catch (e) {
            continue;
          }
        }
        
        if (!launched) {
          throw new Error('Failed to launch browser with any method');
        }
      }
    }
    
    if (!this.browser) {
      throw new Error('Browser initialization failed');
    }
    
    this.page = await this.browser.newPage();
    
    await this.page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );

    await this.page.setViewport({ width: 1920, height: 1080 });
  }

  async getProductLinks(categoryUrl: string): Promise<string[]> {
    if (!this.page) throw new Error('Scraper not initialized');

    const allProductLinks: string[] = [];
    const maxPages = 20; // Maximum number of pages to scrape
    let currentPage = 1;

    try {
      console.log(`[Scraper] Starting pagination from: ${categoryUrl}`);
      
      // Navigate through all pages
      while (currentPage <= maxPages) {
        console.log(`\n[Scraper] === Processing page ${currentPage} ===`);
        
        // Navigate to the page (first iteration uses original URL)
        if (currentPage === 1) {
          await this.page.goto(categoryUrl, { 
            waitUntil: 'domcontentloaded', 
            timeout: 60000 
          });
        }

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
        
        console.log(`[Scraper] Extracting product links from page ${currentPage}...`);
        
        // Use more intelligent approach - find links that look like products
        const pageProductLinks = await this.page.evaluate((baseDomain: string) => {
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

        if (pageProductLinks.length === 0) {
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
          pageProductLinks.push(...fallbackLinks);
        }

        // Add products from this page to total list
        const newProducts = pageProductLinks.filter(link => !allProductLinks.includes(link));
        allProductLinks.push(...newProducts);
        console.log(`[Scraper] Found ${newProducts.length} new products on page ${currentPage} (Total: ${allProductLinks.length})`);

        // Try to find and click the "next page" button
        const hasNextPage = await this.page.evaluate(() => {
          // Common pagination selectors
          const nextSelectors = [
            'a[rel="next"]',
            'a[aria-label*="next" i]',
            'a[aria-label*="siguiente" i]',
            'a[aria-label*="próxima" i]',
            'button[aria-label*="next" i]',
            'button[aria-label*="siguiente" i]',
            'button[aria-label*="próxima" i]',
            '.pagination a:contains("›")',
            '.pagination a:contains("→")',
            '.pagination a:contains("Next")',
            '.pagination a:contains("Siguiente")',
            '.pagination a:contains("Próxima")',
            '.pager a:contains("›")',
            '.pager a:contains("→")',
            'a.next',
            'a.siguiente',
            'a.proxima',
            '.next-page',
            '[class*="next"][class*="page"]',
            '[class*="pagination"] a[class*="next"]'
          ];

          // Try to find next button/link
          for (const selector of nextSelectors) {
            try {
              const element = document.querySelector(selector) as HTMLElement;
              if (element && !element.classList.contains('disabled') && 
                  !element.hasAttribute('disabled') &&
                  element.offsetParent !== null) { // Check if visible
                return true;
              }
            } catch (e) {
              // Selector might not work in all browsers, continue
            }
          }

          // Look for pagination links with numeric text
          const paginationLinks = Array.from(document.querySelectorAll('.pagination a, .pager a, [class*="pagination"] a'));
          const currentPageNum = parseInt(
            document.querySelector('.pagination .active, .pagination .current, [class*="pagination"] .active')?.textContent || '1'
          );
          
          for (const link of paginationLinks) {
            const text = link.textContent?.trim() || '';
            const pageNum = parseInt(text);
            if (!isNaN(pageNum) && pageNum === currentPageNum + 1) {
              return true;
            }
          }

          return false;
        });

        if (!hasNextPage) {
          console.log(`[Scraper] No more pages found after page ${currentPage}`);
          break;
        }

        // Click the next page button
        console.log('[Scraper] Navigating to next page...');
        try {
          const clicked = await this.page.evaluate(() => {
            const nextSelectors = [
              'a[rel="next"]',
              'a[aria-label*="next" i]',
              'a[aria-label*="siguiente" i]',
              'a[aria-label*="próxima" i]',
              'button[aria-label*="next" i]',
              'button[aria-label*="siguiente" i]',
              'button[aria-label*="próxima" i]',
              'a.next',
              'a.siguiente',
              'a.proxima',
              '.next-page',
              '[class*="next"][class*="page"]',
              '[class*="pagination"] a[class*="next"]'
            ];

            for (const selector of nextSelectors) {
              try {
                const element = document.querySelector(selector) as HTMLElement;
                if (element && !element.classList.contains('disabled') && 
                    !element.hasAttribute('disabled') &&
                    element.offsetParent !== null) {
                  element.click();
                  return true;
                }
              } catch (e) {
                continue;
              }
            }

            // Try numeric pagination
            const paginationLinks = Array.from(document.querySelectorAll('.pagination a, .pager a, [class*="pagination"] a'));
            const currentPageNum = parseInt(
              document.querySelector('.pagination .active, .pagination .current, [class*="pagination"] .active')?.textContent || '1'
            );
            
            for (const link of paginationLinks) {
              const text = link.textContent?.trim() || '';
              const pageNum = parseInt(text);
              if (!isNaN(pageNum) && pageNum === currentPageNum + 1) {
                (link as HTMLElement).click();
                return true;
              }
            }

            return false;
          });

          if (!clicked) {
            console.log('[Scraper] Could not click next page button');
            break;
          }

          // Wait for navigation
          await this.page.waitForNavigation({ 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
          }).catch(() => {
            console.log('[Scraper] Navigation timeout, continuing...');
          });

          currentPage++;
        } catch (error) {
          console.log('[Scraper] Error navigating to next page:', error);
          break;
        }
      }

      // Remove duplicates and limit results
      const uniqueLinks = [...new Set(allProductLinks)].slice(0, 200);
      console.log(`\n[Scraper] ✅ Pagination complete!`);
      console.log(`[Scraper] Total pages processed: ${currentPage}`);
      console.log(`[Scraper] Total unique products found: ${uniqueLinks.length}`);
      
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
      return allProductLinks;
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
          // Function to check if element is in "related products" section
          const isInRelatedSection = (element: Element): boolean => {
            const parent = element.closest('div, section, aside');
            if (!parent) return false;
            
            const parentText = parent.textContent?.toLowerCase() || '';
            const parentClass = parent.className?.toLowerCase() || '';
            const parentId = parent.id?.toLowerCase() || '';
            
            const relatedKeywords = [
              'relacionado', 'related', 'similar', 'recomendado',
              'recommended', 'también', 'also', 'outros', 'other'
            ];
            
            return relatedKeywords.some(keyword => 
              parentText.includes(keyword) || 
              parentClass.includes(keyword) ||
              parentId.includes(keyword)
            );
          };
          
          // Get main product gallery/images container
          const mainGallerySelectors = [
            '.product-gallery',
            '.product-images',
            '.item-gallery',
            '[class*="gallery"]',
            '[class*="slider"]',
            '[class*="carousel"]',
            '.main-image',
            '.product-image'
          ];
          
          let mainGallery: Element | null = null;
          for (const selector of mainGallerySelectors) {
            const element = document.querySelector(selector);
            if (element && !isInRelatedSection(element)) {
              mainGallery = element;
              break;
            }
          }
          
          let images: string[] = [];
          
          // If we found a main gallery, prioritize images from there
          if (mainGallery) {
            const galleryImages = Array.from(mainGallery.querySelectorAll('img'))
              .filter(img => !isInRelatedSection(img))
              .map(img => {
                const element = img as HTMLImageElement;
                return element.src || element.dataset.src || element.dataset.original || '';
              })
              .filter(src => src && 
                !src.includes('placeholder') && 
                !src.includes('no-image') &&
                !src.includes('logo.') &&
                !src.includes('/logo') &&
                !src.includes('icon') &&
                src.includes('http'));
            
            images = galleryImages;
          }
          
          // Fallback: get all large images, excluding related products
          if (images.length === 0) {
            const allImages = Array.from(document.querySelectorAll('img'))
              .filter(img => {
                const imgElement = img as HTMLImageElement;
                // Check size - must be reasonably large
                const isLargeEnough = imgElement.width > 150 && imgElement.height > 150;
                // Not in related products section
                const notInRelated = !isInRelatedSection(imgElement);
                
                return isLargeEnough && notInRelated;
              })
              .map(img => {
                const element = img as HTMLImageElement;
                return element.src || element.dataset.src || '';
              })
              .filter(src => src && 
                !src.includes('logo') && 
                !src.includes('icon') &&
                !src.includes('placeholder') &&
                !src.includes('banner') &&
                src.includes('http')
              );
            images = allImages;
          }

          // Remove duplicates and limit to first 10 for processing
          return [...new Set(images)].slice(0, 10);
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
