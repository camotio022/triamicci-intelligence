# Versionamento — Triamicci Intelligence

## Princípio
O produto está em **fase V1 de desenvolvimento e homologação**. Nomes de funcionalidades como `KitchenV3`, `UI V4`, `V4.1` e `CatalogV2Review` são identificadores internos, **não lançamentos independentes do produto**. O `package.json` ainda identifica o projeto como `0.1.0`; **não alterar para 1.0.0 sem definir um marco de release validado**.

## Como identificar o código
- **Commit SHA**: identifica exatamente o conteúdo analisado ou implantado.
- **Branch e PR**: isolam, revisam e testam alterações antes do merge.
- **Deploy Vercel**: registra qual commit foi publicado em produção; `READY` significa build/deploy concluído, **não homologação operacional**.
- **Tag anotada de release**: somente no marco autorizado, apontando para SHA imutável; usar SemVer (`v1.0.0`, `v1.1.0`, `v1.1.1`).
- **Changelog**: descrever mudanças observáveis, telas afetadas, migrações e pendências.

## Critérios antes de marcar uma release
1. PR aprovada, CI verde e validação visual mobile/desktop.
2. Regras de autorização conferidas por perfil e unidade.
3. Para estoque: testes de idempotência, lotes, recebimento parcial, reserva e giro; **não** migrar dados reais sem aprovação.
4. Registro de `tag → commit SHA → PR/issue → deploy → evidências`.
5. Explicitar o que foi apenas inspecionado versus testado funcionalmente.

## Política de dados
Fotografias, notas, cardápios e tabelas de cozinha são **evidências para conciliação**, não autorização de importação. Não usar preços, validades, saldos ou rendimentos extraídos de fotos sem validação. O recebimento deve reutilizar o pedido existente; o colaborador confere itens/quantidades reais e divergências, sem preencher novamente campos de compra.

Referência de planejamento: issue #90.
