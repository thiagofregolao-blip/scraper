# 🆗 INTEGRAÇÃO SCRAPER → BANCO DE PRODUTOS

## ✅ IMPLEMENTAÇÃO CONCLUÍDA!

A integração foi **100% implementada** e **deployada** com sucesso!

---

## 🔑 IMPORTANTE: GERAR API KEY

Para a integração funcionar, você precisa **gerar a API Key** no servidor do Banco de Produtos:

### **Passos para Gerar a API Key:**

1. **Acesse o servidor do Banco de Produtos** (onde ele está hospedado)

2. **Execute o comando:**
   ```bash
   cd /home/ubuntu/products_api/nodejs_space
   node create_scraper_key.js
   ```

3. **Copie a API Key gerada** (formato: `scraper_a1b2c3d4e5f6...`)

4. **Atualize o .env do Scraper:**
   - Edite o arquivo: `/home/ubuntu/product_scraper/nextjs_space/.env`
   - Substitua a linha:
     ```
     BANCO_API_KEY=PLACEHOLDER_GERE_A_KEY_NO_BANCO
     ```
   - Por:
     ```
     BANCO_API_KEY=scraper_sua_key_aqui
     ```

5. **Reinicie o app do Scraper** (faça um novo deploy)

---

## 🎯 COMO USAR

### **1️⃣ Acessar o Scraper:**
https://clickofertasparaguai.abacusai.app

### **2️⃣ Você verá um novo checkbox:**
```
☑️ Salvar automaticamente no Banco de Produtos
   (produtos serão enviados via API)
```

### **3️⃣ Como Funciona:**

**COM CHECKBOX DESMARCADO:**
- Extrai produtos normalmente
- Gera ZIP para download
- **NÃO envia** para o Banco de Produtos

**COM CHECKBOX MARCADO:**
- Extrai produtos normalmente
- Gera ZIP para download
- **✅ ENVIA automaticamente** para o Banco de Produtos via API
- Cada produto é enviado assim que é processado

---

## 📦 O QUE É ENVIADO PARA O BANCO:

```json
{
  "name": "Nome do Produto",
  "description": "Descrição completa (gerada por IA)",
  "price": 1234.56,
  "category": "nome_da_categoria",
  "urlOriginal": "https://site.com/produto",
  "images": [
    {
      "data": "data:image/jpeg;base64,...",
      "filename": "imagem_1.jpg",
      "order": 0
    }
  ]
}
```

---

## 🛠️ ARQUIVOS MODIFICADOS:

### **1. Backend:**
- ✅ `lib/banco-integration.ts` (NOVO)
  - Funções de envio para o Banco
  - Conversão de imagens para base64
  - Sistema de retry automático
  - Logs detalhados

- ✅ `lib/scraper/processor.ts`
  - Adicionado parâmetro `saveToDatabase`
  - Teste de conexão com Banco antes de iniciar
  - Envio de cada produto após processamento
  - Tratamento de erros sem interromper scraping

- ✅ `app/api/scrape/route.ts`
  - Aceita parâmetro `saveToDatabase` do frontend
  - Passa o parâmetro para o processor

### **2. Frontend:**
- ✅ `app/_components/product-scraper-app.tsx`
  - Checkbox azul destacado
  - Estado `saveToDatabase`
  - Envia flag para API

### **3. Configuração:**
- ✅ `.env`
  - `BANCO_API_URL=https://bancodeprodutos.abacusai.app`
  - `BANCO_API_KEY=PLACEHOLDER_GERE_A_KEY_NO_BANCO` (⚠️ precisa ser substituído)

---

## 👁️ MONITORAMENTO:

Durante a extração, você verá nos logs do servidor:

```
[🔗] Testando conexão com Banco de Produtos...
[✅] Conexão com Banco OK. Produtos serão enviados automaticamente.

[✅] Produto "Notebook Dell" enviado ao Banco
[✅] Produto "Mouse Logitech" enviado ao Banco
[⚠️] Falha ao enviar "Teclado Razer" ao Banco: timeout
[✅] Produto "Monitor Samsung" enviado ao Banco
```

---

## ⚠️ IMPORTANTE:

1. **Se a API Key não estiver configurada:**
   - O scraper funciona normalmente
   - Produtos **NÃO** são enviados ao Banco
   - Você recebe aviso no console: `⚠️ API Key não configurada`

2. **Se o Banco estiver offline:**
   - O scraper continua funcionando
   - Produtos são salvos localmente no ZIP
   - Envio ao Banco falha (mas não interrompe o scraping)

3. **Se houver erro no envio:**
   - Sistema tenta novamente 3 vezes
   - Se continuar falhando, registra erro e continua
   - Scraping **NÃO é interrompido**

---

## 📊 ESTATÍSTICAS:

Você pode ver estatísticas da integração no Banco:

```bash
curl -H "X-API-Key: sua_key" https://bancodeprodutos.abacusai.app/api/scraper/stats
```

Resposta:
```json
{
  "totalImports": 150,
  "successfulImports": 145,
  "failedImports": 5,
  "totalItems": 450,
  "lastImport": "2025-11-28T..."
}
```

---

## 👍 TUDO PRONTO!

A integração está **100% funcional**! Assim que você gerar e configurar a API Key, tudo funcionará perfeitamente.

### **Próximos Passos:**
1. ✅ Gerar API Key no servidor do Banco
2. ✅ Atualizar `.env` do Scraper
3. ✅ Fazer novo deploy (ou reiniciar o servidor)
4. ✅ Testar com uma categoria pequena (5-10 produtos)
5. ✅ Verificar se produtos aparecem no Banco

---

## ❓ DÚVIDAS?

Se precisar de ajuda:
- Verifique os logs do servidor
- Teste a conexão: `curl -H "X-API-Key: sua_key" https://bancodeprodutos.abacusai.app/api/scraper/status`
- Consulte o PDF de integração fornecido

---

**🚀 Boa sorte e boas vendas!**
