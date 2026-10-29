# Auditoria de botões — Triamicci Intelligence (29/10/2026)

## Escopo
Repositório React, varredura estática dos 49 componentes JSX e 33 arquivos CSS listados na branch, com inspeção das telas operacionais e seus controles. A revisão dos JSX foi feita por grupos para identificar botões nativos, ações sem `type` e estilos compartilhados. Inspeção dos estilos base e responsivos para conflitos de geometria, alvos de toque e estados.

## Correções incorporadas no PR #124
- Base global de box-sizing, herança de fonte, foco visível, disabled, touch-action e preferência de movimento reduzido.
- Ações operacionais com altura mínima de 44px, padding, raio, quebra de texto, limites de largura e layout flexível.
- Tipografia e feedback de toque compatíveis com mobile sem sobrescrever as cores semânticas existentes.
- Botão de atualizar escala recebe `type="button"` em `SchedulePlanner.jsx` (antes sem tipo explícito).
- Tratamento distinto para controles compactos de navegação, calendários e botões apenas de ícone.

## Limitações e homologação
Esta é uma auditoria de código, não inspeção pixel a pixel em navegador. `button` pode ser renderizado por CSS contextual, componentes condicionais e estados com dados do Firebase. É preciso validar no iPhone/PWA e desktop: todas as telas, botões longos, ações de confirmação, modais, teclado, foco, carregamento, desabilitado, permissões e rotação. Não marcar como 100% visualmente aprovado antes desses testes.

## Preservação
Sem mudanças de API/Firestore, sem alteração de permissão ou lógica operacional, sem merge ou deploy de produção por este PR.
