
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Download, 
  Link2, 
  ShoppingCart, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Package,
  Clock,
  TrendingUp
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ScrapeJob, StartScrapeResponse, ScrapingProgress } from "@/lib/types";

export default function ProductScraperApp() {
  const [url, setUrl] = useState("");
  const [currentJob, setCurrentJob] = useState<ScrapeJob | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Poll for job updates when processing
  useEffect(() => {
    const status = currentJob?.status;
    if (!currentJob || status === 'completed' || status === 'failed' || (status as any) === 'paused') {
      return;
    }

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${currentJob.id}`);
        
        if (!response.ok) {
          console.error("Job status fetch failed:", response.status, response.statusText);
          return;
        }
        
        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          console.error("Response is not JSON:", await response.text());
          return;
        }
        
        const updatedJob = await response.json();
        setCurrentJob(updatedJob);
        
        if (updatedJob?.status === 'completed') {
          toast({
            title: "Extração Concluída!",
            description: `${updatedJob?.processedProducts} produtos extraídos com sucesso.`,
          });
        } else if (updatedJob?.status === 'failed') {
          toast({
            title: "Erro na Extração",
            description: updatedJob?.errorMessage || "Erro desconhecido",
            variant: "destructive",
          });
        }
      } catch (err) {
        console.error("Error polling job status:", err);
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [currentJob, toast]);

  const handleStartScrape = async () => {
    console.log('[Frontend] handleStartScrape called, URL:', url);
    
    if (!url?.trim()) {
      console.log('[Frontend] URL is empty');
      toast({
        title: "URL Requerida",
        description: "Por favor, insira a URL da categoria para extrair.",
        variant: "destructive",
      });
      return;
    }

    console.log('[Frontend] Starting scrape for URL:', url.trim());
    setIsProcessing(true);
    setError(null);
    setCurrentJob(null);

    try {
      console.log('[Frontend] Sending POST request to /api/scrape');
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });

      console.log('[Frontend] Response status:', response.status);
      
      if (!response.ok) {
        const text = await response.text();
        console.error('[Frontend] Response error:', text);
        throw new Error(`Erro na requisição: ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error('[Frontend] Response is not JSON:', text);
        throw new Error("Resposta inválida do servidor");
      }
      
      const result: StartScrapeResponse = await response.json();
      console.log('[Frontend] Response data:', result);

      if (!result?.success || !result?.jobId) {
        throw new Error(result?.error || "Falha ao iniciar extração");
      }

      toast({
        title: "Extração Iniciada",
        description: "Iniciando a extração de produtos...",
      });

      console.log('[Frontend] Fetching initial job status for:', result.jobId);
      // Fetch initial job status
      const jobResponse = await fetch(`/api/jobs/${result.jobId}`);
      if (jobResponse?.ok) {
        const contentType = jobResponse.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const job = await jobResponse.json();
          setCurrentJob(job);
        }
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
      console.error('[Frontend] Error:', errorMessage);
      setError(errorMessage);
      toast({
        title: "Erro",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!currentJob?.id) return;

    try {
      window.open(`/api/download/${currentJob.id}`, '_blank');
      toast({
        title: "Download Iniciado",
        description: "O arquivo ZIP será baixado em breve.",
      });
    } catch (err) {
      toast({
        title: "Erro no Download",
        description: "Não foi possível baixar o arquivo.",
        variant: "destructive",
      });
    }
  };

  const handleResume = async () => {
    if (!currentJob?.id) return;

    try {
      const response = await fetch(`/api/resume/${currentJob.id}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Erro ao retomar');
      }

      toast({
        title: "Retomando Extração",
        description: `Continuando do produto ${currentJob.processedProducts + 1}...`,
      });

      // Update job status to trigger polling
      setCurrentJob({
        ...currentJob,
        status: 'processing' as any
      });
    } catch (err) {
      toast({
        title: "Erro ao Retomar",
        description: err instanceof Error ? err.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'processing':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4" />;
      case 'paused':
        return <Clock className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'processing':
        return 'bg-blue-500';
      case 'completed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      case 'paused':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* URL Input Section */}
      <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            URL da Categoria
          </CardTitle>
          <CardDescription>
            Insira a URL da categoria de e-commerce para extrair todos os produtos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              placeholder="https://exemplo.com/categoria/celulares"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1"
              disabled={isProcessing || currentJob?.status === 'processing'}
            />
            <Button 
              onClick={handleStartScrape}
              disabled={isProcessing || currentJob?.status === 'processing'}
              className="px-6"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Iniciando...
                </>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Extrair Produtos
                </>
              )}
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Progress Section */}
      {currentJob && (
        <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStatusIcon(currentJob.status)}
                Status da Extração
              </div>
              <Badge variant="outline" className={`${getStatusColor(currentJob.status)} text-white`}>
                {currentJob.status === 'pending' && 'Pendente'}
                {currentJob.status === 'processing' && 'Processando'}
                {currentJob.status === 'completed' && 'Concluído'}
                {currentJob.status === 'failed' && 'Falhou'}
                {(currentJob.status as any) === 'paused' && 'Pausado'}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Progresso</span>
                <span>{currentJob.processedProducts} de {currentJob.totalProducts} produtos</span>
              </div>
              <Progress 
                value={currentJob.totalProducts > 0 ? (currentJob.processedProducts / currentJob.totalProducts) * 100 : 0} 
                className="w-full"
              />
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                <Package className="w-8 h-8 text-blue-600" />
                <div>
                  <p className="text-sm text-gray-600">Total de Produtos</p>
                  <p className="text-2xl font-bold text-blue-600">{currentJob.totalProducts}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                <CheckCircle className="w-8 h-8 text-green-600" />
                <div>
                  <p className="text-sm text-gray-600">Processados</p>
                  <p className="text-2xl font-bold text-green-600">{currentJob.processedProducts}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg">
                <TrendingUp className="w-8 h-8 text-purple-600" />
                <div>
                  <p className="text-sm text-gray-600">Progresso</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {currentJob.totalProducts > 0 ? Math.round((currentJob.processedProducts / currentJob.totalProducts) * 100) : 0}%
                  </p>
                </div>
              </div>
            </div>

            {/* Current Product */}
            {currentJob.currentProduct && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-1">Processando Agora:</p>
                <p className="font-medium text-blue-800">{currentJob.currentProduct}</p>
              </div>
            )}

            {/* Download Button */}
            {/* Resume Button */}
            {(currentJob.status as any) === 'paused' && (
              <div className="pt-4 border-t">
                <Alert className="mb-4 bg-yellow-50 border-yellow-200">
                  <Clock className="h-4 w-4 text-yellow-600" />
                  <AlertDescription className="text-yellow-800">
                    Extração pausada. {currentJob.processedProducts} produtos foram salvos. 
                    Você pode retomar de onde parou.
                  </AlertDescription>
                </Alert>
                <Button onClick={handleResume} className="w-full bg-yellow-600 hover:bg-yellow-700" size="lg">
                  <Loader2 className="w-5 h-5 mr-2" />
                  Retomar Extração
                </Button>
              </div>
            )}

            {/* Download Button */}
            {currentJob.status === 'completed' && (
              <div className="pt-4 border-t">
                <Button onClick={handleDownload} className="w-full" size="lg">
                  <Download className="w-5 h-5 mr-2" />
                  Baixar ZIP com Todos os Produtos
                </Button>
              </div>
            )}

            {/* Error Message */}
            {(currentJob.status === 'failed' || (currentJob.status as any) === 'paused') && currentJob.errorMessage && (
              <Alert variant={(currentJob.status as any) === 'paused' ? 'default' : 'destructive'} className={(currentJob.status as any) === 'paused' ? 'bg-yellow-50 border-yellow-200' : ''}>
                <AlertCircle className={`h-4 w-4 ${(currentJob.status as any) === 'paused' ? 'text-yellow-600' : ''}`} />
                <AlertDescription className={(currentJob.status as any) === 'paused' ? 'text-yellow-800' : ''}>
                  {currentJob.errorMessage}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle>Como Usar</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-gray-600">
            <p>• Insira a URL de uma categoria de e-commerce (ex: página de celulares)</p>
            <p>• O sistema identificará todos os produtos na categoria</p>
            <p>• Para cada produto será criada uma pasta com:</p>
            <div className="ml-4 space-y-1">
              <p>- Todas as imagens em alta resolução</p>
              <p>- Descrição original do produto (descricao.txt)</p>
              <p>- Informações básicas (info.txt)</p>
            </div>
            <p>• Ao finalizar, baixe o ZIP com todas as pastas organizadas</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
