# Plano integrado de entrega — Pacotes 05, 06 e 07

> Esta branch é uma integração em andamento. Não realizar merge enquanto algum critério estiver pendente. Não publicar regras de validade não homologadas.

## Pacote 05 — Colaboradores e habilidades (finalização)
- [ ] Cadastro, edição e convite separados; perfis sem conta não podem acessar dados
- [ ] Gestão de funções e setores, com permissões segregadas
- [ ] Catálogo de habilidades por setor (cozinha, frente, caixa, apoio e gestão)
- [ ] Turno não determina habilidades; alterações de setor preservam histórico de competências
- [ ] Competências compartilhadas e exceções multifuncionais com aprovação auditada
- [ ] Etiquetagem e controle de validade como habilidade (não concede autorização automaticamente)
- [ ] Ficha profissional, foto e menu responsivos; erros, vazios e estados de carregamento
- [ ] Testes de autorização no servidor, isolamento por unidade e regressões

## Pacote 06 — Escalas e folgas
- [ ] Escalas oficiais separadas da disponibilidade habitual
- [ ] Calendário com criação/rascunho/edição por gerência, publicação após aprovação
- [ ] Regras 6x1, folga semanal e domingo mensal adicional, conforme política validada
- [ ] Regras de dias permitidos para folga fixa, cobertura mínima e conflitos de equipe
- [ ] Bloqueio/alerta de cozinheiros em folga simultânea e cobertura qualificada de montagem no domingo
- [ ] Exceções gerenciais exigem justificativa, aprovação e trilha de auditoria
- [ ] Solicitação de folga não equivale a aprovação
- [ ] Colaboradores veem somente informação de escala autorizada
- [ ] Escalas publicadas aparecem no Mural; alterações geram nova versão e aviso
- [ ] Estados: rascunho, em análise, aprovada, publicada, substituída/cancelada
- [ ] Testes de conflitos, semanas de virada de mês, timezone, permissões e UI mobile

## Pacote 07 — Mural operacional e etiquetas
- [ ] Área de consulta unificada, com seções independentes: Escalas, Preparações, Etiquetas e Comunicados
- [ ] Escalas no mural são cópias/visões somente de versões publicadas, sem edição no mural
- [ ] Fichas técnicas editáveis por papéis autorizados: ingredientes, quantidades/unidades, rendimento, preparo, conservação e alergênicos
- [ ] Rascunho, aprovação, publicação, versionamento, pesquisa e favoritos
- [ ] Regras de prazo por categoria/local apenas após aprovação sanitária (10 dias massas, 30 dias carne reserva, 3 dias giro são propostas operacionais, não regras automáticas ainda)
- [ ] Etiquetas com produto, lote, local, quantidade, responsável, horários e datas
- [ ] Emissão/reimpressão/troca/movimentação de etiquetas com histórico imutável e motivo
- [ ] Troca de etiqueta nunca renova validade original; mudança para giro respeita vencimento mais próximo
- [ ] Impedir uso/reetiquetagem para consumo de produto vencido; orientação segura de segregação
- [ ] Impressão adaptada a etiqueta térmica e A4, após teste real da operação
- [ ] Atividades registradas aparecem no histórico profissional sem certificação automática
- [ ] Acesso por função, isolamento por unidade, testes de API, XSS e dados inválidos
- [ ] UX responsiva, acessível, pesquisa, estados vazios, impressão e navegação móvel

## Gate para o merge único
- [ ] Revisão funcional completa por pacote e conferência cruzada de escopo
- [ ] Backend e UI concluídos para todos os itens aprovados
- [ ] Sem funcionalidades simuladas apresentadas como reais
- [ ] Regras e índices Firebase definidos, validados e implantáveis em homologação
- [ ] Testes automatizados e build de produção passam
- [ ] Testes end-to-end/fluxos reais em homologação: permissões, escala, versões, etiquetas, impressão e responsividade
- [ ] Risco de migração, rollback e dados históricos verificado
- [ ] Aprovação funcional e sanitária das regras aplicáveis
- [ ] Único squash merge em main e posterior verificação de deploy READY

### Fora do escopo atual
Pedidos e compras de mercadorias: Pacote 08. Nenhum registro financeiro/estoque será alterado automaticamente ao implementar mural ou etiquetas.
