# 🚀 Deploy para GitHub

## Opção 1: Push Direto (Recomendado)

### Pré-requisitos
- Conta GitHub
- Repositório criado: https://github.com/thiagofregolao-blip/scraper
- Git instalado

### Passos

1. **Configure suas credenciais do GitHub** (se ainda não fez):

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu-email@exemplo.com"
```

2. **Faça push para o repositório**:

```bash
cd /home/ubuntu/product_scraper/nextjs_space

# Se o repositório no GitHub estiver vazio
git push -u origin master

# OU, se já tiver conteúdo, force o push
git push -u origin master --force
```

### Autenticação

O GitHub pode pedir suas credenciais:

- **Username**: Seu usuário do GitHub
- **Password**: Use um **Personal Access Token** (não sua senha)

#### Como criar um Personal Access Token:

1. Acesse: https://github.com/settings/tokens
2. Clique em "Generate new token" → "Generate new token (classic)"
3. Dê um nome (ex: "Scraper Deploy")
4. Selecione o escopo: `repo` (acesso completo aos repositórios)
5. Clique em "Generate token"
6. **COPIE O TOKEN** (só aparece uma vez!)
7. Use esse token como senha quando o Git pedir

---

## Opção 2: Via GitHub Desktop

1. Baixe o GitHub Desktop: https://desktop.github.com/
2. Faça login com sua conta GitHub
3. File → Add Local Repository
4. Selecione a pasta: `/home/ubuntu/product_scraper/nextjs_space`
5. Clique em "Publish repository"
6. Escolha o repositório: `thiagofregolao-blip/scraper`
7. Clique em "Push origin"

---

## Opção 3: Upload Manual (Mais Simples)

1. Acesse: https://github.com/thiagofregolao-blip/scraper
2. Clique em "Add file" → "Upload files"
3. Arraste toda a pasta do projeto (exceto `node_modules`, `.next`, etc)
4. Commit as mudanças

---

## Verificar Push

Após o push, acesse:
https://github.com/thiagofregolao-blip/scraper

Você deverá ver:
- ✅ README.md
- ✅ package.json
- ✅ Estrutura do projeto
- ✅ Últimos commits

---

## Troubleshooting

### Erro: "Permission denied"

✅ **Solução**: Use um Personal Access Token ao invés da senha

### Erro: "Repository not found"

✅ **Solução**: Verifique se o repositório foi criado no GitHub

### Erro: "Updates were rejected"

✅ **Solução**: Force o push:
```bash
git push -u origin master --force
```

---

## Próximos Passos

Após o push:

1. Configure GitHub Actions para CI/CD (opcional)
2. Adicione badges ao README
3. Configure issues e pull requests
4. Adicione colaboradores se necessário

---

## Links Úteis

- Repositório: https://github.com/thiagofregolao-blip/scraper
- Deploy: https://clickofertasparaguai.abacusai.app
- Tokens: https://github.com/settings/tokens
