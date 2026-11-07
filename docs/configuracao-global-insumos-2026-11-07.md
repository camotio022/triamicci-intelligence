# Configuração global do insumo na unidade — 07/11/2026

## Decisão do usuário

O catálogo configura o insumo operacional, não um cardápio. Nome, sinônimos e unidade definidos pela gestão devem aparecer no estoque, conferência/contagem, recebimento e produção, mantendo o mesmo ID. O usuário confirmou expressamente que os saldos atuais são experimentais e autorizou sua substituição na fase de testes.

## Implementação

- Perfil da unidade prevalece sobre sugestões do catálogo central nas consultas de produtos e preparação.
- Salvar o perfil sincroniza nome, aliases, unidade e perfil no mesmo produto, na mesma transação. A coleção de perfis continua compatível com os fluxos existentes; não existe novo catálogo.
- Trocar a unidade reinicia o saldo experimental atual e o mínimo em zero, com qualidade CONFIGURATION_RESET, sem data de contagem confirmada. A próxima contagem estabelece os valores na nova unidade.
- Saldos anteriores e lotes experimentais são preservados em auditoria. Os lotes antigos saem da coleção operacional para não bloquear a nova contagem. Contagens e movimentos históricos permanecem nas unidades originais.
- Não há conversão presumida entre kg e pacote, peça ou porção.
- Fichas ativas que dependiam da unidade antiga ficam em revisão; os fatores de consumo precisam ser configurados na nova unidade antes de voltar à execução. Renomear na mesma unidade não reinicia saldo nem desativa fichas.
- Busca por nome configurado, nome anterior e sinônimos; busca de conferência indica outra área quando o item só está configurado na Reserva ou no Giro. Pesquisar também localiza itens que não estão no filtro padrão de atenção.
- Disponibilidade continua como Tem/Pouco/Acabou na conferência rápida; quantitativo usa a unidade configurada na contagem física.

## Validação

Teste isolado com 300 kg experimentais, alteração para pacotes, consulta com o mesmo ID em estoque/dashboard/conferência, nova contagem de 8 pacotes, recebimento de 2 e consumo de 1 na produção. Verifica isolamento entre unidades, bloqueio de auxiliar para configurar, versão concorrente, preservação de histórico/auditoria e ausência de duplicação. Testes de interface em 320/390/768/1280 px verificam nome, sinônimo e navegação para a área configurada.

O reset automático é específico da política desta fase experimental autorizada. Antes da entrada de saldos reais, deve ser substituído por uma decisão explícita de migração/recontagem.
