type FirecrawlClient = {
  scrapeUrl?: (url: string, options?: any) => Promise<any>;
  scrape?: (url: string, options?: any) => Promise<any>;
};

function extractHtmlFromResponse(response: any): string | null {
  const data = response?.data ?? response;

  const candidates = [
    data?.html,
    data?.content?.html,
    data?.rawHtml,
    data?.content,
    response?.html,
    response?.content
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c;
  }

  return null;
}

export async function fetchHtmlWithFirecrawl(
  url: string,
  options?: { formats?: Array<'html' | 'markdown'> }
): Promise<string | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;

  // Import dinâmico para evitar problemas de bundling/ESM no build do Next.
  const mod = await import('@mendable/firecrawl-js');
  const Firecrawl = (mod as any).default ?? (mod as any).Firecrawl ?? (mod as any);

  const client: FirecrawlClient = new Firecrawl({ apiKey });
  const formats = options?.formats ?? ['html'];

  let response: any;
  if (typeof client.scrapeUrl === 'function') {
    response = await client.scrapeUrl(url, { formats });
  } else if (typeof client.scrape === 'function') {
    response = await client.scrape(url, { formats });
  } else {
    throw new Error('Firecrawl SDK incompatível: método scrapeUrl/scrape não encontrado');
  }

  // Alguns retornos usam { success, data }, outros retornam direto.
  if (response?.success === false) {
    throw new Error(response?.error || 'Firecrawl: erro ao fazer scrape');
  }

  const html = extractHtmlFromResponse(response);
  if (!html) {
    // Último fallback: se só vier markdown, ainda dá para tentar parsear links via regex/cheerio depois.
    const markdown =
      (response?.data && typeof response.data?.markdown === 'string' && response.data.markdown) ||
      (typeof response?.markdown === 'string' && response.markdown) ||
      null;

    if (markdown) return markdown;
    return null;
  }

  return html;
}


