# Pacote 2.6 — aceite visual e operacional

A entrega consolida o ritmo de espaçamentos 8/12/16/24/32 px sobre o design system existente.

## Escopo
- Navegação e cabeçalhos com separação e tamanhos consistentes no mobile.
- Painel da cozinha e quatro ações rápidas alinhados, com botão Atualizar associado ao cabeçalho.
- Estoque: título, indicadores, busca, cartões de produto e estados sem contagem.
- Recebimento, contagem e histórico: cabeçalhos, cartões e campos responsivos.
- Ficha do produto: lotes, contagens e atalhos respeitando largura do celular.
- Equipe e administração: campos, botões e grupos de ações com espaçamento comum.
- Busca global inoperante removida; botão de notificações temporariamente desabilitado.
- Sem mudanças de autenticação, estoque, Firestore, API ou fórmulas.

## Aceite recomendado
1. Em 320/375/390/430 px: sem rolagem horizontal da **página**, corte de controles, textos sobrepostos ou zoom automático no iOS.
2. Abas horizontais rolam dentro da própria barra; menu lateral acessível pelo botão.
3. Recebimento e contagem aceitam entrada de dados via formulário sem botões escondidos.
4. Produto e ficha exibem unidades e estados corretamente, sem alterar valores.
5. Testar também 768 e 1440 px; navegação via teclado e zoom 200%.
6. Passar no GitHub Actions: sintaxe, validação do catálogo, testes de regras e build Vite.

**Aprovação técnica do build não substitui avaliação visual real no Safari.** Nenhuma migração de banco faz parte deste pacote.

## Publicação única
Desenvolver exclusivamente na branch `feat/pacote-026-mobile-premium`, rodar CI no GitHub e fazer um único merge em `main`. Evitar deploy de preview.
