
export interface ScrapeJob {
  id: string;
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  totalProducts: number;
  processedProducts: number;
  currentProduct?: string;
  zipPath?: string;
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface Product {
  id: string;
  jobId: string;
  name: string;
  description?: string;
  price?: string;
  originalUrl: string;
  imagePaths: string[];
  folderName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  createdAt: string;
  completedAt?: string;
}

export interface ScrapingProgress {
  jobId: string;
  status: string;
  progress: number;
  totalProducts: number;
  processedProducts: number;
  currentProduct?: string;
}

export interface StartScrapeRequest {
  url: string;
}

export interface StartScrapeResponse {
  success: boolean;
  jobId?: string;
  error?: string;
}
