#!/bin/bash

# Script para fazer deploy no GitHub

echo "🚀 Deploy para GitHub - Product Scraper"
echo "==========================================\n"

# Verifica se está no diretório correto
if [ ! -f "package.json" ]; then
    echo "❌ Erro: Execute este script na raiz do projeto Next.js"
    exit 1
fi

# Verifica se o Git está instalado
if ! command -v git &> /dev/null; then
    echo "❌ Erro: Git não está instalado"
    exit 1
fi

# Adiciona todos os arquivos
echo "📦 Adicionando arquivos ao Git..."
git add .

# Mostra status
echo "\n📊 Status do repositório:"
git status --short

# Verifica se há mudanças
if git diff --cached --quiet; then
    echo "\n✅ Nenhuma mudança para commitar"
else
    # Pede mensagem de commit
    echo "\n💬 Digite a mensagem do commit (ou pressione Enter para usar padrão):"
    read -r commit_msg
    
    if [ -z "$commit_msg" ]; then
        commit_msg="Update: $(date '+%Y-%m-%d %H:%M:%S')"
    fi
    
    # Faz commit
    echo "\n📝 Fazendo commit..."
    git commit -m "$commit_msg"
fi

# Verifica se o remote existe
if ! git remote get-url origin &> /dev/null; then
    echo "\n🔗 Adicionando remote 'origin'..."
    git remote add origin https://github.com/thiagofregolao-blip/scraper.git
fi

# Pergunta se quer fazer push
echo "\n🚀 Fazer push para o GitHub? (s/n)"
read -r confirm

if [ "$confirm" = "s" ] || [ "$confirm" = "S" ]; then
    echo "\n📤 Fazendo push..."
    
    # Tenta push normal
    if git push -u origin master; then
        echo "\n✅ Push realizado com sucesso!"
        echo "\n🌐 Repositório: https://github.com/thiagofregolao-blip/scraper"
    else
        # Se falhar, sugere force push
        echo "\n⚠️  Push normal falhou. Tentar force push? (s/n)"
        read -r force_confirm
        
        if [ "$force_confirm" = "s" ] || [ "$force_confirm" = "S" ]; then
            git push -u origin master --force
            echo "\n✅ Force push realizado!"
            echo "\n🌐 Repositório: https://github.com/thiagofregolao-blip/scraper"
        else
            echo "\n❌ Push cancelado"
            echo "\n📖 Consulte DEPLOY_GITHUB.md para mais informações"
        fi
    fi
else
    echo "\n❌ Push cancelado pelo usuário"
    echo "\n📖 Para fazer push depois, execute:"
    echo "   git push -u origin master"
fi

echo "\n✅ Script finalizado!"
