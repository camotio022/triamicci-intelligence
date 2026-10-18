# Padrão de experiência — Triamicci Intelligence
## Branch oficial: feat/ux-feedback-mobile-first
### Objetivo
Feedback consistente em toda operação e acabamento mobile-first mantendo a identidade institucional.
### Regras de aceite
- Toda ação mutável mostra estado em andamento, confirma resultado **somente após confirmação da API** e explica erro com orientação; impedir cliques duplicados.
- Mensagem global acessível (role status/alert), visível em mobile, fechamento manual, sem dependência de timeout.
- Validações inline e foco no campo incorreto; erros de autorização, conflito, conexão e formulário claramente distintos sem expor dados internos.
- Ações críticas têm confirmação contextual; evitar confirmar uma ação por toast se a gravação falhar.
- Nunca confundir toast de operação com notificação persistida destinada a outro funcionário.
- Mobile-first em 320, 375, 390, 600, 760 e 1024px: sem overflow lateral, alvos >=44px, inputs sem zoom e teclado acessível.
- Evoluir gradualmente Recebimento, Produção, Estoque, Inventário, Equipe e Administração; preservar contratos de API e logs.
- Capturar prints e executar testes end-to-end em ambiente isolado antes de liberar alterações sensíveis.
### Primeira entrega
- Provider de feedback acessível com estilos responsivos.
- Integração à ficha profissional para sucesso e falha de salvamento.
### Pendências
- Feedback consistente para os demais módulos, notificações persistentes por atribuição, jornada padrão editável, área Minha ficha profissional e testes mobile reais.
