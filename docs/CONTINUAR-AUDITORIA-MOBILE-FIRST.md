# Retomada rápida — Padronização mobile-first Triamicci

**Estado:** auditoria registrada como planejamento em PR draft. Nenhuma tela foi alterada por esta etapa.

## Ao retomar
1. Leia primeiro [o backlog completo](./mobile-first-ux-audit-backlog-2026-11-07.md) e o corpo do PR.
2. Consulte o estado atual da `main`, PRs abertos e deploy da Vercel; mudanças futuras podem invalidar achados.
3. Execute a Fase 1 do backlog em branch/PR próprio: header, drawer/iOS, botões, inputs, modais, tokens e CSS. Faça teste visual 320/375/390/430/768/1024/1440.
4. Em seguida P0 operacionais: inventário, recebimento, movimentações, preparações, escala e matriz de habilidades.
5. Teste por perfil, por unidade, estados vazio/carregando/erro/offline e fluxos do início ao fim. Não criar dados falsos de estoque em produção.
6. Anexe evidências e checklist ao PR de implementação. Não integrar nada automaticamente; pedir aceite quando necessário.

## Restrições inegociáveis
- Identidade Triamicci, compacto, mobile-first de verdade, sem detalhes escondidos inutilmente.
- Não alterar Firestore/saldos/permissões/lotes/rodadas só para harmonizar telas.
- Nunca expor UUID/IDs brutos a colaboradores.
- PR #157 (novo histórico de contagem) **já estava integrado**, requer validação visual/regressiva.
- Esta auditoria foi de **código e estilos**, NÃO um teste autenticado no PWA do iPhone. Não anunciar homologação 100%.

## Para registrar avanços
Na tabela/checklist do backlog: assinale apenas itens comprovadamente implementados e testados; no PR específico liste screenshots, widths, testes, commit e quaisquer limitações.
