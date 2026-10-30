# Pacote 03 — Produção inteligente (em desenvolvimento)

## Decisões operacionais
- O peso recebido em kg é conferência de entrega; as peças são o controle operacional das carnes pré-porcionadas, sem conversão automática.
- Bife de alcatra e cubos de alcatra são produtos distintos e já chegam cortados.
- Filé de frango 120 g é peça pré-porcionada, não transformação interna.
- Peito de frango é ingrediente prioritário para strogonoff de frango, com filé 120 g como possível substituto autorizado.
- Cubos de alcatra são ingrediente principal para strogonoff de carne; bife só se autorizado.
- Uma receita só fica ativa quando suas quantidades e substituições forem cadastradas e verificadas por gerente/admin. **O sistema não cria fichas com quantidades inventadas.**

## Desenvolvimento atual
- API `/api/production/manage` com listagem por unidade, fichas técnicas versionadas e finalização auditada.
- Baixa atômica do estoque no giro, com verificação por produto, lotes e FEFO quando exigido.
- Operação idempotente por `requestId`: repetir a mesma produção não desconta novamente.
- Substituição permitida somente se cadastrada na linha da ficha técnica.
- UI mobile-first em Produção, opção de criar ficha técnica para manager/admin e confirmar produção para equipe autorizada.
- Estoque legado não é alterado. Sem conversão automática de kg para peças.

## Ainda a revisar antes do único deploy
- Corrigir/autenticar produtos com unidades equivocadas por unidade usando a ferramenta administrativa do Pacote 02 e nova contagem; nunca zerar nem converter automaticamente.
- Revisão real das receitas e dos substitutos pelo responsável do restaurante; nenhum rendimento ou gramagem deve ser presumido.
- Cobertura automatizada das invariantes de produção e teste completo no Firebase após publicação.
- Integração dos indicadores de produção ao painel, responsáveis legíveis e histórico com paginação.
- Confirmar UX no iPhone para criação/finalização e bloqueios de estoque.
- Revisão de concorrência, integridade e permissões antes do merge.

## Publicação
Uma única branch `feat/pacote-03-producao-inteligente`, CI no GitHub Actions, um squash merge na `main`, sem previews adicionais planejados. Não publicar funcionalidade incompleta.
