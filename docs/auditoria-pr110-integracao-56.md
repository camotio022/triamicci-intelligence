# PR 110 — auditoria da integração dos 56 produtos

Data: 29/10/2026. Escopo: código da branch do PR 110. Sem merge ou deploy de produção, sem migração e sem acesso ao Firestore de produção.

## Falha original

O E2E V4 criava produtos sem `operationalCatalogVersion`, enquanto a consulta de produtos só incluía `56-v1`. O teste falhava ao procurar `physicalBalance` em um resultado ausente. As fixtures operacionais agora declaram a aprovação; uma fixture experimental sem aprovação continua excluída. Nenhuma validação foi removida para fazer o teste passar.

## Lacunas corrigidas

- Elegibilidade compartilhada entre a consulta principal, painel de insumos e gravações de pedidos, recebimentos, transferências, produção, contagem e saídas. Arquivos históricos continuam disponíveis; não são novas opções operacionais.
- Ativação cria o perfil operacional e um saldo inicial não contado. Zero inicial não vira contagem física fictícia.
- Conciliação explícita permite reaproveitar um ID existente compatível. Nunca exclui ou renomeia eventos anteriores e não reinicializa saldo.
- Candidatos à conciliação são procurados por catalogId, nome normalizado, aliases do produto/perfil e duas correspondências conhecidas (Noisettes/Batata noisette e Bife de alcatra fatiado/Bife de alcatra). Alcatra genérica não é sinônimo de bife ou cubos.
- Conflitos de unidade, validade, origem, registros duplicados ou saldo exclusivamente legado bloqueiam conciliação automática. Alterações incompatíveis em definição central já ativa também são bloqueadas.
- Vias antigas de ativação em lote e vínculo direto encaminham para configuração individual, evitando produtos ativos invisíveis ou sem revisão.
- Fichas listadas para novas produções precisam de ingredientes/produto final elegíveis. Fichas antigas e produções registradas não são apagadas. Planejamento novo revalida as referências.

## Fontes e IDs

| Etapa | Referência usada |
|---|---|
| Lista de revisão | Manifesto local de 56 posições, ainda sujeito à revisão do operador |
| Definição central | productCatalog/{catalogId} |
| Produto na unidade | units/{unitId}/products/{productId}; ID existente preservado na conciliação |
| Configuração operacional | operationalProfiles/{productId} |
| Pedido e conferência | items/lines.productId |
| Reserva/Giro | physicalBalances/{productId}, campos reserve/rotation |
| Produção | lines/items.productId e outputProductId |
| Contagem e histórico | physicalCounts.productId e demais eventos, sem reescrever IDs antigos |

## Verificações locais concluídas

- 158 testes de regras passaram antes do envio.
- Build Vite e checagem de whitespace concluídos.
- Firebase Auth/Firestore emulados no projeto demo-triamicci-v31: E2E V3.1, V4 e teste novo do catálogo passaram.
- Novo E2E ativa as 56 posições fictícias, valida perfil operacional para cada nova ativação e presença nas duas consultas operacionais.
- Reaproveita Feijão existente com nome equivalente, preservando ID, saldo 12 e contagem anterior; recusa unidade incompatível e criação duplicada.
- Pedido multi-itens: bife recebido em unidades e frango em kg; conferência pelo auxiliar não altera saldo; aprovação gerencial soma uma vez.
- Transferência Reserva→Giro preserva total; produção fictícia explicitamente definida debita ingrediente e credita preparo uma vez; contagem decimal registra os saldos esperados.
- Auxiliar não aprova recebimento nem registra contagem oficial; unidade estrangeira não compartilha cadastros; produto experimental sem aprovação não pode ser contado ou incluído em pedido novo.
- Repetição de aprovação/produção não duplica saldo. E2E V4 preserva seus cenários de concorrência, lotes, unidade estrangeira e saldo legado não somado.

## Limites para a decisão de implantação

Os 56 são posições do manifesto, não 56 produtos reais já homologados. O teste usa escolhas fictícias explícitas no emulador. A classificação do checklist e as unidades/origens de cada posição ainda precisam de conferência operacional. Não houve ativação/importação no banco real.

A conciliação real exige inventário somente leitura dos produtos, perfis, aliases, saldos e referências da unidade. Casos incompatíveis permanecem bloqueados; uma migração de unidade ou unificação de duplicados exige plano separado. As 12 marcações de não aplicável e dúvidas de identificação não autorizam cadastro automático.

A homologação visual móvel da nova conciliação e os checks remotos devem ser conferidos no último commit do PR. Build aprovado sozinho não comprova a operação real. O PR 109 (organização de histórico/rotina atual) permanece fora deste escopo.
