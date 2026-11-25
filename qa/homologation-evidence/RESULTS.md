# Homologa??o local E2E (emuladores)

## Ambiente
- Branch: `fix/playwright-test-infra` (preserva `a52ae23`, `b6328a7`)
- Firebase: **Auth + Firestore Emulator** (projeto demo `demo-triamicci-v31`) ? sem Firebase real
- API local: `http://127.0.0.1:3001`
- Web local: `http://localhost:5173` (`.env.homologation.local`)
- Seed reproduz?vel: `npm run homolog:seed` / reset `npm run homolog:reset`
- Comandos: `homolog:emulators`, `homolog:api`, `homolog:web`, `homolog:start`, `homolog:seed`, `homolog:reset`, `homolog:restore`

## Prote??es contra Firebase real
- `server/_lib.js`: modo emulador s? inicializa Admin para projeto `demo-*` com `FIREBASE_AUTH_EMULATOR_HOST`/`FIRESTORE_EMULATOR_HOST`, `APP_ENV=local|homologation`; bloqueia combina??es inseguras/projeto de produ??o; ignora `checkRevoked` no emulador.
- `src/firebase.js`: conecta Auth/Firestore emuladores apenas em modo local/homologa??o expl?cito; exige projeto demo e recusa `triamicci-v31`.
- `src/AuthGate.jsx`: login email/senha **somente** quando `isLocalHomologation`.

## Dados simulados (seed)
- Unidade: `homolog-unit` (Homologa??o Triamicci), per?odo `2026-11`.
- Usu?rios (senha `Homolog@12345`): Helena Gerente (admin), Sergio Subgerente (subgerente), Carla Cozinheira, Rafael Cozinheiro, Aline Auxiliar, Bruno Auxiliar, Daniela Atendente, Eduardo Atendente, Fernanda Caixa.
- Escala publicada `2026-11`, folga/aus?ncia aprovada `uid-atendente1_2026-11-28`, produ??o, pedido/recebimento, produto/saldo, mural, notifica??o, propostas de cobertura.

## Evid?ncias E2E (app real local)
Screenshots em `qa/homologation-evidence/shots/`.

| Cen?rio | Resultado | Evid?ncia |
|---|---|---|
| Login gerente (emulador) | OK | Login real no app local com `gerente@homolog.local`. |
| Aceite (colaboradora, sess?o independente) | OK | Aline (`?session=independent`) aceitou convite 27/11 Cozinha ? Noite; status "Aguardando aprova??o gerencial". |
| Aprova??o (gest?o) | OK | Aprova??o inicial pelo criador bloqueada (403 esperado). Subgerente (`?session=subgerente`) aprovou; status "Aprovada". |
| Convite | OK | Subgerente convidou Rafael Cozinheiro para 27/11 Cozinha ? Noite; UI "Convite encaminhado ? Minha Ficha / Aguardando resposta". `20-...`, `21-...`. |
| Conclus?o | OK | Eduardo Atendente, 23/11 Frente ? Manh?; "Cobertura realizada registrada." `07-...`. Bug encontrado/corrigido: `fee.rateRole` undefined no Firestore. |
| Pagamento | OK | Pagamento confirmado para Eduardo; "Pagamento registrado", gaveta "Paga". `08-...`. |
| Minha Ficha | OK (parcial visual) | Perfil/coberturas da Aline na sess?o independente; aprova??o refletida. `23-...`, `24-...`. |
| Mural | OK (visual) | Mural carregado com comunicados/escala/produ??o. `28-mural-aline.png`. |
| Notifica??es | OK (parcial) | Central de notifica??es acessada; badge/atualiza??o observados. `22-notificacoes-gerente.png`. |
| Gera??o de escala | OK (rascunho) | Planejamento de escala: "Sugerir domingos" + "Salvar rascunho" retornou 200 "Rascunho salvo. Ainda n?o est? vis?vel no Mural." `25-...`, `26-...`, `27-...`. |
| Aus?ncia/folga | OK (evid?ncia seeded + tela) | Tela Solicita??es de folga exibiu aus?ncia aprovada 28/11 "Aus?ncia simulada para homologa??o (consulta m?dica)". `29-ausencia-folgas.png`. Registro de nova aus?ncia via UI n?o executado nesta rodada. |
| Duas sess?es independentes / sync | PARCIAL | Evidenciado: Aline (`?session=independent`) viu convite aprovado; subgerente/gerente em sess?es distintas. Observa??o: ao navegar URL padr?o houve ind?cio de bleed de sess?o; validar isolamento antes de confiar em navega??o por URL sem `?session`. |

## Bugs reais encontrados e corrigidos durante E2E
1. **Conclus?o 500**: `api/coverage/manage.js` gravava `fee.rateRole: undefined` quando proposta n?o tinha `rateRole`. Corre??o: `p.rateRole ?? p.fee?.rateRole ?? null`; seed atualizado com `rateRole: 'other'`.
2. **Aprova??o 500**: `decideCoverage` chamava `readCoverageContext(member.unitId,date)`, mas helper espera `DocumentReference`. Corre??o: `readCoverageContext(unit,date)`.
3. **Kanban cards ocultos em mobile**: `.roster-board .day` escondia `.ti-cov-ticket` em `max-width:720px` por n?o ter `.active`. Corre??o em `src/roster-board.css`: escopo `:not(.ti-cov-ticket)`.

## Valida??es
- `npm run build`: OK.
- `npm run test:browser`: 4/4 pass.
- `npm run test:rules`: 393/393 pass (ap?s parar emuladores homolog; test:rules usa emuladores pr?prios).

## Pend?ncias / limita??es desta rodada
- N?o executar publica??o Vercel, n?o alterar `main`, n?o usar Firebase real.
- Gera??o de escala: evid?ncia de rascunho/sugest?o; publicar/revisar fluxo completo pode ser aprofundado.
- Aus?ncia: evid?ncia por tela/seed; criar nova aus?ncia pela UI seria refor?o.
- Sync duas sess?es: evid?ncia parcial; recomenda-se teste expl?cito de atualiza??o live/refresh cruzado e investiga??o do bleed de sess?o default.
- Emuladores homolog foram interrompidos para rodar `test:rules`; para retomar E2E: `npm run homolog:start` (ou emulators+api+web) e `npm run homolog:seed` se resetado.
