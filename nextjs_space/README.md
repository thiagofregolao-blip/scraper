# Product Scraper - Extração de Produtos E-commerce

## 📋 Descrição

Aplicação Next.js para extrair produtos de categorias de e-commerce automaticamente, com suporte a:

- ✅ Extração automática de produtos com imagens em alta resolução
- ✅ Geração de descrições completas
- ✅ Download em ZIP organizado por categoria
- ✅ Modo URL-only (gera Excel sem baixar imagens)
- ✅ Integração com Banco de Produtos via API
- ✅ Sistema de pausa/retomada de jobs
- ✅ **Bypass automático de Cloudflare** (Puppeteer)
- ✅ Cleanup automático de jobs travados
- ✅ Descoberta streaming de produtos (página por página)

## 🚀 Tecnologias

- **Next.js 14** (App Router)
- **TypeScript**
- **Prisma** (ORM para PostgreSQL)
- **Puppeteer** (Bypass Cloudflare)
- **Cheerio** (Parsing HTML)
- **Tailwind CSS** + **shadcn/ui**
- **Axios** (HTTP requests)

## 🛠️ Instalação

```bash
# Clone o repositório
git clone https://github.com/thiagofregolao-blip/scraper.git
cd scraper

# Instale as dependências
yarn install

# Configure as variáveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais

# Execute as migrations do banco
yarn prisma generate
yarn prisma db push

# Inicie o servidor de desenvolvimento
yarn dev
```

Acesse: `http://localhost:3000`

## 📦 Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
DATABASE_URL="postgresql://usuario:senha@host:5432/database"
BANCO_API_URL="https://bancodeprodutos.abacusai.app"
BANCO_API_KEY="sua_chave_api_aqui"
```

## 🎯 Como Usar

### Modo Completo (com imagens)

1. Cole a URL da categoria do e-commerce
2. Clique em "Extrair Produtos"
3. Aguarde a extração completa
4. Baixe o ZIP com todos os produtos

### Modo URL-Only (sem imagens)

1. Cole a URL da categoria
2. Marque a opção "Extrair apenas URLs (gera Excel)"
3. Clique em "Extrair Produtos"
4. Baixe o arquivo Excel com as URLs

### Integração com Banco de Produtos

1. Configure `BANCO_API_KEY` no `.env`
2. Marque "Salvar automaticamente no Banco de Produtos"
3. Os produtos serão enviados via API durante a extração

## 🔧 Funcionalidades

### Bypass Cloudflare Automático

O scraper detecta automaticamente sites protegidos por Cloudflare e usa Puppeteer para contornar:

```typescript
// Detecta Cloudflare
if (html.includes('Just a moment') || html.includes('cf-chl-opt')) {
  console.log('⚠️ Cloudflare detected, switching to Puppeteer...');
  return await this.fetchWithPuppeteer(url);
}
```

### Sistema de Pausa/Retomada

- Pause jobs em andamento
- Retome de onde parou
- Checkpoints automáticos a cada 5 produtos

### Cleanup Automático

- Remove jobs "processing" com mais de 24 horas
- Filtra apenas jobs das últimas 6 horas no carregamento

## 📊 Estrutura do Projeto

```
├── app/
│   ├── _components/         # Componentes React
│   ├── api/                 # API Routes
│   │   ├── scrape/         # Iniciar scraping
│   │   ├── jobs/           # Status dos jobs
│   │   ├── resume/         # Retomar jobs
│   │   ├── download/       # Download de arquivos
│   │   └── cancel/         # Cancelar jobs
│   └── page.tsx            # Página principal
├── lib/
│   ├── scraper/
│   │   ├── scrapers.ts     # Lógica de scraping + Puppeteer
│   │   ├── processor.ts    # Processamento de jobs
│   │   └── utils.ts        # Utilitários
│   ├── banco-integration.ts # API Banco de Produtos
│   ├── excel-generator.ts   # Geração de Excel
│   └── types.ts            # TypeScript types
├── prisma/
│   └── schema.prisma       # Schema do banco
└── components/
    └── ui/                 # Componentes shadcn/ui
```

## 🌐 Sites Suportados

O scraper funciona com a maioria dos e-commerces, incluindo:

- **Shopping China**
- **LG Importados**
- **Cellshop** (com bypass Cloudflare)
- Sites genéricos com estrutura HTML padrão

## 🐛 Troubleshooting

### Job não inicia

- Verifique se a URL é válida
- Confirme que o site está acessível
- Veja os logs do console

### Cloudflare bloqueando

- O sistema usa Puppeteer automaticamente
- Pode levar 3-5 segundos por página

### Banco de Produtos não salva

- Verifique `BANCO_API_KEY` no `.env`
- Teste a conexão antes de iniciar

## 📝 Licença

MIT

## 👤 Autor

Thiago Fregolão

## 🔗 Links

- **Deploy**: https://clickofertasparaguai.abacusai.app
- **Banco de Produtos**: https://bancodeprodutos.abacusai.app
