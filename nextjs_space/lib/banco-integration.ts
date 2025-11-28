import fs from 'fs';
import path from 'path';

const BANCO_API_URL = process.env.BANCO_API_URL || 'https://bancodeprodutos.abacusai.app';
const BANCO_API_KEY = process.env.BANCO_API_KEY;

interface ProductImage {
  data: string; // base64 data URL
  filename: string;
  order: number;
}

interface BancoProduct {
  name: string;
  description: string;
  price?: number | null;
  category?: string;
  condition?: string;
  brand?: string;
  model?: string;
  urlOriginal?: string;
  images?: ProductImage[];
}

interface BancoResponse {
  success: boolean;
  product?: any;
  message?: string;
  error?: string;
}

interface BatchResponse {
  success: boolean;
  successCount: number;
  errorCount: number;
  message: string;
  errors?: any[];
}

/**
 * Converte uma imagem local para base64 data URL
 */
function imageToBase64(imagePath: string): string | null {
  try {
    console.log(`[Banco] 🔍 Tentando converter imagem: ${imagePath}`);
    
    if (!fs.existsSync(imagePath)) {
      console.error(`[Banco] ❌ Imagem NÃO ENCONTRADA: ${imagePath}`);
      return null;
    }

    const stats = fs.statSync(imagePath);
    console.log(`[Banco] 📊 Tamanho do arquivo: ${Math.round(stats.size / 1024)}KB`);

    const imageBuffer = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    
    let mimeType = 'image/jpeg';
    if (ext === '.png') mimeType = 'image/png';
    else if (ext === '.webp') mimeType = 'image/webp';
    else if (ext === '.gif') mimeType = 'image/gif';

    const base64 = imageBuffer.toString('base64');
    const base64Length = base64.length;
    console.log(`[Banco] ✅ Imagem convertida para base64 (${Math.round(base64Length / 1024)}KB)`);
    
    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error(`[Banco] ❌ ERRO ao converter imagem ${imagePath}:`, error);
    return null;
  }
}

/**
 * Testa a conexão com a API do Banco
 */
export async function testBancoConnection(): Promise<boolean> {
  if (!BANCO_API_KEY || BANCO_API_KEY === 'PLACEHOLDER_GERE_A_KEY_NO_BANCO') {
    console.log('[Banco] ⚠️  API Key não configurada. Configure BANCO_API_KEY no .env');
    return false;
  }

  try {
    const response = await fetch(`${BANCO_API_URL}/api/scraper/status`, {
      headers: {
        'X-API-Key': BANCO_API_KEY
      }
    });

    const data = await response.json();
    
    if (data.status === 'ok') {
      console.log('[Banco] ✅ Conexão com Banco de Produtos OK');
      return true;
    } else {
      console.log('[Banco] ❌ Resposta inesperada:', data);
      return false;
    }
  } catch (error) {
    console.error('[Banco] ❌ Erro ao testar conexão:', error);
    return false;
  }
}

/**
 * Envia um único produto para o Banco de Produtos
 */
export async function sendProductToBanco(
  productData: {
    name: string;
    description: string;
    price?: string | null;
    category?: string;
    urlOriginal?: string;
    imagePaths?: string[]; // Caminhos locais das imagens
  },
  retries: number = 3
): Promise<BancoResponse> {
  
  if (!BANCO_API_KEY || BANCO_API_KEY === 'PLACEHOLDER_GERE_A_KEY_NO_BANCO') {
    return {
      success: false,
      error: 'API Key não configurada'
    };
  }

  // Converter imagens para base64
  console.log(`[Banco] 🖼️ Processando ${productData.imagePaths?.length || 0} imagens para "${productData.name}"`);
  
  const images: ProductImage[] = [];
  if (productData.imagePaths && productData.imagePaths.length > 0) {
    for (let i = 0; i < productData.imagePaths.length; i++) {
      const imagePath = productData.imagePaths[i];
      console.log(`[Banco] Imagem ${i + 1}/${productData.imagePaths.length}: ${imagePath}`);
      
      const base64Data = imageToBase64(imagePath);
      
      if (base64Data) {
        images.push({
          data: base64Data,
          filename: path.basename(imagePath),
          order: i
        });
        console.log(`[Banco] ✅ Imagem ${i + 1} adicionada ao payload`);
      } else {
        console.log(`[Banco] ⚠️ Imagem ${i + 1} não pôde ser convertida`);
      }
    }
  } else {
    console.log(`[Banco] ⚠️ Nenhum imagePath fornecido para "${productData.name}"`);
  }

  console.log(`[Banco] 📦 Total de imagens convertidas: ${images.length}`);

  // Preparar dados do produto
  const bancoProduct: BancoProduct = {
    name: productData.name,
    description: productData.description,
    price: productData.price ? parseFloat(productData.price.replace(/[^0-9.,]/g, '').replace(',', '.')) : null,
    category: productData.category,
    urlOriginal: productData.urlOriginal,
    images: images.length > 0 ? images : undefined
  };

  console.log(`[Banco] 📋 Payload preparado:`, {
    name: bancoProduct.name,
    hasDescription: !!bancoProduct.description,
    price: bancoProduct.price,
    category: bancoProduct.category,
    imageCount: images.length
  });

  // Tentar enviar com retry
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[Banco] 📡 Enviando requisição (tentativa ${attempt}/${retries})...`);
      
      const response = await fetch(`${BANCO_API_URL}/api/scraper/product`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': BANCO_API_KEY
        },
        body: JSON.stringify(bancoProduct)
      });

      console.log(`[Banco] 📥 Status da resposta: ${response.status} ${response.statusText}`);

      const result = await response.json();
      console.log(`[Banco] 📄 Resposta da API:`, result);

      if (result.success) {
        console.log(`[Banco] ✅ Produto "${productData.name}" enviado com SUCESSO!`);
        return result;
      } else {
        console.log(`[Banco] ❌ API retornou erro (tentativa ${attempt}/${retries}):`, result.message || result.error);
        
        if (attempt === retries) {
          return result;
        }
        
        // Aguardar antes de tentar novamente
        console.log(`[Banco] ⏳ Aguardando ${1000 * attempt}ms antes de tentar novamente...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    } catch (error: any) {
      console.error(`[Banco] ❌ ERRO DE CONEXÃO (tentativa ${attempt}/${retries}):`, error.message);
      
      if (attempt === retries) {
        return {
          success: false,
          error: error.message
        };
      }
      
      // Aguardar antes de tentar novamente
      console.log(`[Banco] ⏳ Aguardando ${1000 * attempt}ms antes de tentar novamente...`);
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  return {
    success: false,
    error: 'Falha após todas as tentativas'
  };
}

/**
 * Envia vários produtos em lote para o Banco de Produtos
 */
export async function sendProductsBatchToBanco(
  products: Array<{
    name: string;
    description: string;
    price?: string | null;
    category?: string;
    urlOriginal?: string;
    imagePaths?: string[];
  }>,
  retries: number = 3
): Promise<BatchResponse> {
  
  if (!BANCO_API_KEY || BANCO_API_KEY === 'PLACEHOLDER_GERE_A_KEY_NO_BANCO') {
    return {
      success: false,
      successCount: 0,
      errorCount: products.length,
      message: 'API Key não configurada'
    };
  }

  // Converter produtos para o formato do Banco
  const bancoProducts: BancoProduct[] = [];
  
  for (const product of products) {
    const images: ProductImage[] = [];
    
    // Converter imagens para base64
    if (product.imagePaths && product.imagePaths.length > 0) {
      for (let i = 0; i < Math.min(product.imagePaths.length, 10); i++) { // Máximo 10 imagens por produto
        const imagePath = product.imagePaths[i];
        const base64Data = imageToBase64(imagePath);
        
        if (base64Data) {
          images.push({
            data: base64Data,
            filename: path.basename(imagePath),
            order: i
          });
        }
      }
    }

    bancoProducts.push({
      name: product.name,
      description: product.description,
      price: product.price ? parseFloat(product.price.replace(/[^0-9.,]/g, '').replace(',', '.')) : null,
      category: product.category,
      urlOriginal: product.urlOriginal,
      images: images.length > 0 ? images : undefined
    });
  }

  // Tentar enviar com retry
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${BANCO_API_URL}/api/scraper/products/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': BANCO_API_KEY
        },
        body: JSON.stringify({ products: bancoProducts })
      });

      const result = await response.json();

      if (result.success) {
        console.log(`[Banco] ✅ Batch enviado: ${result.successCount} sucessos, ${result.errorCount} erros`);
        return result;
      } else {
        console.log(`[Banco] ❌ Erro no batch (tentativa ${attempt}/${retries}):`, result.message);
        
        if (attempt === retries) {
          return result;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    } catch (error: any) {
      console.error(`[Banco] ❌ Erro de conexão no batch (tentativa ${attempt}/${retries}):`, error.message);
      
      if (attempt === retries) {
        return {
          success: false,
          successCount: 0,
          errorCount: products.length,
          message: error.message
        };
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }

  return {
    success: false,
    successCount: 0,
    errorCount: products.length,
    message: 'Falha após todas as tentativas'
  };
}
