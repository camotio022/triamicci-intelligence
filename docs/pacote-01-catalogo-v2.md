# Pacote 01 — Catálogo Inteligente v2 (proposta)

Status: **implementado para revisão, NÃO homologado / NÃO migrado**.

## Objetivo
Revisar os produtos do catálogo central antes de implementar recebimento e contagem diária.
A aba **Estoque** exibe uma seção de revisão **somente para administradores**, baseada no arquivo JSON de proposta, sem executar escrita.

## Mudanças confirmadas pela operação
- Filé de frango 120 g: item recebido já porcionado, contagem individual na reserva e giro.
- Bifes de alcatra e cubos de alcatra: recebidos já cortados do fornecedor e contados individualmente.
- Na conferência, peso em kg e contagem operacional em unidades são dados distintos; **não converter kg em unidades automaticamente**.
- Strogonoff de frango: peito inteiro preferencial; filé 120 g apenas como alternativa quando o peito não estiver disponível em quantidade suficiente.
- Strogonoff de carne: cubos de alcatra preferenciais; bifes como alternativa.
- O produto efetivamente utilizado na produção será confirmado por operador em implementação futura; não há baixa automática.

## Arquivos do pacote
- `data/triamicci-product-catalog-v2.proposal.json`: 22 itens e 2 regras de preferência de produção, preservando o catálogo antigo.
- `scripts/validate-product-catalog-v2.mjs`: validação estática sem conexão ao Firebase.
- `src/CatalogV2Review.jsx`: revisão visual somente leitura.
- `src/Inventory.jsx`: integração da revisão para administradores.

## Limites de segurança
- Não alterar `productCatalog` existente no Firestore, nem `units/{unitId}/products`.
- Sem mudanças de saldos, lotes, inventários, status de aprovação ou movimentações.
- Não usar o arquivo de proposta como seed sobre dados existentes.
- Antes da migração: auditoria de nomes e IDs, compatibilidade com produtos existentes, duplicados por nome, unidades diferentes e estratégia de rollback.
- O arquivo v2 apresenta *campos propostos*, e o formulário operacional usa o catálogo v1 até a homologação.

## Pendências para homologação
- Confirmar unidade de conferência comercial dos cubos de alcatra e bifes (kg definido provisoriamente).
- Revisar pesos, porções e embalagens de produtos ainda genéricos.
- Determinar se a contagem de peito inteiro é feita em pacotes ou peso.
- Validar categorização dos produtos e o status de preparação/armazenamento.
- Definir migração aditiva com versionamento e sem alteração destrutiva.
- Testar a interface com autenticação real de administrador em ambiente isolado.

## Validação local
```bash
npm install --no-audit --no-fund
node scripts/validate-product-catalog-v2.mjs
npm run build
```

## Publicação
Executar revisão e testes fora da produção, publicar em um único lote após homologação e confirmar que a Vercel permite implantações. Não usar esta branch para registro de recebimento real.
