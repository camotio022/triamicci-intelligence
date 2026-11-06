# Gestão operacional por unidade

Gerente e subgerente usam a mesma autorização de gestão (`isManagement`) nas operações da própria unidade. O servidor obtém a unidade do vínculo autenticado e revalida vínculo ativo, papel e unidade nas transações.

Correções desta revisão:

- Aprovar e publicar escalas, com revisão por outra pessoa da gestão.
- Configurar mínimos de cobertura e tabela operacional de dobras.
- Configurar, classificar e aprovar políticas de etiquetas e validade, preservando revisão independente e os limites de validade.
- Corrigir unidades operacionais, mantendo exigência de recontagem e sem converter saldos antigos.
- Subgerente configurar apresentações e revisar conciliações de embalagens.
- Gestão aplicar conciliação de embalagens somente quando a função já estiver habilitada por configuração; não foi habilitada nesta revisão.
- Conciliar lotes preservando a soma da contagem física e a rastreabilidade.
- Subgerente editar fichas profissionais de auxiliares e cozinheiros da própria unidade.
- Publicar conteúdo de preparação no mural após revisão independente.
- Mostrar na interface os controles correspondentes às permissões do servidor.

Continuam restritos ao administrador: catálogo central compartilhado, migrações globais e administração de acessos protegidos. As proteções contra autopromoção, alteração do próprio acesso e acesso entre unidades permanecem. As permissões de cozinheiro e auxiliar não foram ampliadas nesta revisão; adicionar preparação à lista do dia continua pendente para auxiliar.

## Validação

- `npm run test:rules`: 210 testes aprovados.
- `npm run build`: aprovado.
- Firebase Auth/Firestore isolados: `unit-management-emulator`, `release-roles-emulator` e `catalog-56-emulator` aprovados.
- A regressão exerce operações reais nos handlers: gravação de configuração, conciliação idempotente, conflitos de saldo, aprovação independente, publicação de escala, bloqueio de equipe, vínculo inativo e isolamento entre unidades.
- Nenhuma escrita no Firebase de produção ou alteração de conta real foi necessária.
