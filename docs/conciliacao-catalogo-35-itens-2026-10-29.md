# Conciliação preliminar: 20 itens base × 35 marcados para cadastrar
Data: 2026-10-29. **Somente documentação — não executar importação.**

## Distinções
- Os 20 registros abaixo são do arquivo `data/triamicci-product-catalog.json`, não uma consulta aos documentos ativos do Firebase.
- A proposta V2 tem 22 registros e inclui `alcatra-bife` (kg), incompatível com a contagem operacional em unidades relatada; validar antes de migrar.
- A checklist do usuário tem 35 solicitações, 9 já existentes e 12 não aplicáveis. A classificação do usuário não garante ausência/presença no Firebase.
- **Não apagar produtos ligados a histórico, lotes, receitas ou movimentos.** Primeiro identificar referências e preferir desativação/migração de vínculo.

## Cadastro inicial — 20
1. `peito-frango` — Peito de frango (kg)
2. `frango-cubos` — Frango em cubos para strogonoff (kg)
3. `frango-file-120g` — Filé de frango porcionado (120 g) (un)
4. `strogonoff-frango` — Strogonoff de frango (kg)
5. `oleo-soja` — Óleo de soja (L)
6. `alcatra` — Alcatra (kg)
7. `file-mignon` — Filé mignon (kg)
8. `contrafile-chorizo` — Contrafilé / chorizo (kg)
9. `alcatra-cubos` — Cubos de alcatra (kg)
10. `noisettes` — Noisettes (un)
11. `tilapia` — Tilápia (kg)
12. `almondegas` — Almôndegas (kg)
13. `arroz` — Arroz (kg)
14. `feijao` — Feijão (kg)
15. `ovos` — Ovos (un)
16. `margarina` — Margarina (kg)
17. `queijos` — Queijos (tipo a definir) (kg)
18. `massas` — Massas (tipo a definir) (kg)
19. `hortifruti` — Verduras e legumes (itens a definir) (kg)
20. `temperos` — Temperos (itens a definir) (kg)

## Solicitações — 35
| Nº | Produto | Correspondência no arquivo inicial | Revisão necessária |
|---:|---|---|---|
| 1 | Limão | Não identificada | Validar unidade, tipo, embalagem e existência no Firebase |
| 2 | Alho | temperos | Validar unidade, tipo, embalagem e existência no Firebase |
| 3 | Cebola | temperos | Validar unidade, tipo, embalagem e existência no Firebase |
| 4 | Salsinha | temperos | Validar unidade, tipo, embalagem e existência no Firebase |
| 5 | Leite | Não identificada | Validar unidade, tipo, embalagem e existência no Firebase |
| 6 | Queijo minas | queijos | DESDOBRAR genérico queijos |
| 7 | Provolone | queijos | DESDOBRAR genérico queijos |
| 8 | Arroz arbóreo | Não identificada | Validar unidade, tipo, embalagem e existência no Firebase |
| 9 | Sal | temperos | Validar unidade, tipo, embalagem e existência no Firebase |
| 10 | Farinha/mistura para empanar | Não identificada | Validar unidade, tipo, embalagem e existência no Firebase |
| 11 | Vinho branco culinário | Não identificada | Validar unidade, tipo, embalagem e existência no Firebase |
| 12 | Bacon | Não identificada | Validar unidade, tipo, embalagem e existência no Firebase |
| 13 | Tomate | hortifruti | Validar unidade, tipo, embalagem e existência no Firebase |
| 14 | Tomate seco | hortifruti | Validar unidade, tipo, embalagem e existência no Firebase |
| 15 | Rúcula | hortifruti | Validar unidade, tipo, embalagem e existência no Firebase |
| 16 | Alface | hortifruti | Validar unidade, tipo, embalagem e existência no Firebase |
| 17 | Brócolis | hortifruti | Validar unidade, tipo, embalagem e existência no Firebase |
| 18 | Champignon | Não identificada | Validar unidade, tipo, embalagem e existência no Firebase |
| 19 | Alho-poró | hortifruti | Validar unidade, tipo, embalagem e existência no Firebase |
| 20 | Berinjela | hortifruti | Validar unidade, tipo, embalagem e existência no Firebase |
| 21 | Couve | hortifruti | Validar unidade, tipo, embalagem e existência no Firebase |
| 22 | Parmesão | queijos | DESDOBRAR genérico queijos |
| 23 | Cheddar | queijos | DESDOBRAR genérico queijos |
| 24 | Creme de leite | Não identificada | Validar unidade, tipo, embalagem e existência no Firebase |
| 25 | Manteiga | Não identificada | Validar unidade, tipo, embalagem e existência no Firebase |
| 26 | Batata frita | Não identificada | CONFIRMAR forma de compra/contagem/porção |
| 27 | Batata palha | Não identificada | Validar unidade, tipo, embalagem e existência no Firebase |
| 28 | Batata noisette | noisettes | POSSÍVEL_CORRESPONDÊNCIA com Noisettes; categoria original suspeita |
| 29 | Purê de batatas | Não identificada | PREPARAÇÃO: validar se há controle de estoque próprio |
| 30 | Feijão | feijao | EXISTE_NO_ARQUIVO_INICIAL (verificar Firebase e motivo da marcação cadastrar) |
| 31 | Fettuccine | massas | DESDOBRAR genérico massas |
| 32 | Penne | massas | DESDOBRAR genérico massas |
| 33 | Espaguete | massas | DESDOBRAR genérico massas |
| 34 | Nhoque | massas | DESDOBRAR genérico massas |
| 35 | Molho sugo | Não identificada | PREPARAÇÃO: validar ficha antes de movimentar |

## Políticas antes de apply
1. Inventariar `productCatalog` e `units/{unitId}/products` em leitura somente e cruzar por ID, nomes normalizados, aliases e tipo.
2. Classificar: manter, corrigir inativo, substituir com migração, criar inativo ou não cadastrar. Não contar categorias genéricas como produtos físicos.
3. Exigir unidade aprovada para cada novo produto, principalmente ingredientes vendidos por pacote e preparações.
4. Tratar `alcatra` genérica como nome insuficiente. Bife de alcatra chega fatiado em sacolão e é contado por **unidade no recebimento**; cadastro V2 o define como kg e deve ser corrigido antes de uso. Cubos de alcatra são outro produto.
5. A rotina atual `seed-product-catalog.mjs` lê o arquivo de 20 itens e cria docs inativos com `ref.create`, ignorando apenas IDs já existentes. Ela **não remove obsoletos**, **não atualiza IDs existentes** e **não deduplica nomes diferentes**.
6. O `dry-run` atual valida o JSON local sem consultar o Firebase. Uma simulação de reconciliação real exigirá um inventário seguro em leitura.
7. Gerar manifesto aprovado e revisar diff antes de qualquer apply. Proteger main e dados reais.

## Estado
Base de conciliação preparada; nenhuma modificação no arquivo de importação; nenhuma importação, exclusão, alteração de estoque ou consulta ao Firebase realizada.