# Pacote 04 — Inventário Diário Inteligente

Fonte: Plano Diretor MVP v1.0 (16/10/2026), RF-007 a RF-012. Piloto: unidade Barigui.

## Entregas e critérios de aceite
1. Apuração por produto/unidade: reserva + giro da mesma contagem, unidade física compatível.
2. Fechamento de contagem em transação autenticada: rascunho → conferência → fechamento imutável; idempotência por requestId; bloqueio de concorrência; correções em eventos auditados sem sobrescrever o registro fechado.
3. Consultar todas as entradas na janela (anterior, atual] e a última entrada separadamente; considerar saídas auditadas do Pacote 02 e consumo já baixado do Pacote 03, evitando segunda baixa.
4. Exibir disponibilidade, variação, saída física estimada (apenas informação, nunca venda/perda confirmada), divergências e reposição.
5. Preservar lotes/FEFO, validade, saldo legado e fronteiras de unidade; nenhuma conversão kg ↔ peças.
6. Dashboard e histórico paginado mobile-first, sem números simulados em produção.
7. Testar múltiplas entradas, ausência da contagem anterior, valores negativos, conflitos, retries, permissões, eventos fora da janela e unidades divergentes.

## Regra de segurança
O cálculo puro em `server/operations/daily-inventory.js` **não grava saldo**, não executa baixa, não faz fechamento e não pode ser tratado como relatório homologado sem os eventos completos. O backend é responsável por verificar integridade, corte temporal, permissões, completude e seleção de movimentos; não confiar em eventos fornecidos pelo navegador.

## Política de entrega
Branch `feat/pacote-04-inventario-diario` → PR rascunho → testes locais e CI → revisão → um merge e um deploy. Nenhum deploy de código incompleto para `main`. Testes: `node --test tests/daily-inventory.test.js`.

## Dependências de homologação
Verificar Pacote 03 no Firebase real (sem alterar saldo no teste), disponibilidade dos eventos de produção, bases físicas e a consistência de lotes. Confrontar estoques históricos antes da ativação.
