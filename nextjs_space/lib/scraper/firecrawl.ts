type FirecrawlFormat = 'html' | 'markdown';

type FirecrawlScrapeResponse = {
  success?: boolean;
  error?: string;
  data?: {
    html?: string;
    markdown?: string;
    content?: { html?: string };
    rawHtml?: string;
    [key: string]: any;
  };
  [key: string]: any;
};

function extractHtmlFromResponse(response: FirecrawlScrapeResponse): string | null {
  const data: any = response?.data ?? response;
  const candidates = [
    data?.html,
    data?.content?.html,
    data?.rawHtml,
    typeof data?.content === 'string' ? data.content : null
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c;
  }

  return null;
}

function extractMarkdownFromResponse(response: FirecrawlScrapeResponse): string | null {
  const data: any = response?.data ?? response;
  const candidates = [data?.markdown, response?.markdown];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) return c;
  }

  return null;
}

export async function fetchHtmlWithFirecrawl(
  url: string,
  options?: {
    formats?: FirecrawlFormat[];
    onlyMainContent?: boolean;
    waitForMs?: number;
  }
): Promise<string | null> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return null;

  const endpoint = process.env.FIRECRAWL_API_URL || 'https://api.firecrawl.dev/v2/scrape';
  const formats: FirecrawlFormat[] = options?.formats ?? ['html'];

  const payload: Record<string, any> = {
    url,
    formats
  };

  if (typeof options?.onlyMainContent === 'boolean') {
    payload.onlyMainContent = options.onlyMainContent;
  }
  if (typeof options?.waitForMs === 'number') {
    payload.waitFor = options.waitForMs;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
    // Node 20+
    signal: AbortSignal.timeout(120_000)
  });

  const text = await res.text();
  let json: FirecrawlScrapeResponse | null = null;
  try {
    json = JSON.parse(text) as FirecrawlScrapeResponse;
  } catch {
    // ignore
  }

  if (!res.ok) {
    const message = json?.error || text.slice(0, 400) || `HTTP ${res.status}`;
    throw new Error(`Firecrawl HTTP ${res.status}: ${message}`);
  }

  if (json?.success === false) {
    throw new Error(json.error || 'Firecrawl: erro ao fazer scrape');
  }

  if (json) {
    const html = extractHtmlFromResponse(json);
    if (html) return html;

    const markdown = extractMarkdownFromResponse(json);
    if (markdown) return markdown;
  }

  return null;
}

