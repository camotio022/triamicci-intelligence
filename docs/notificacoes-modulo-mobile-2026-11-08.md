# Módulo de Notificações — mobile first

## Entrega

O sino abre a rota `?page=notifications`, com histórico de navegação e entrada em **Meu espaço → Notificações**. Todos os cinco perfis podem acessar os próprios avisos. O antigo painel sobreposto deixa de ser usado.

- Cabeçalho compacto no vermelho padrão Triamicci e contador de mensagens não lidas.
- Filtros **Recebidas**, **Lixeira** e **Não lidas**.
- Lista agrupada por Hoje, Ontem e datas no fuso do restaurante. A data acompanha a virada do dia.
- Cada linha mostra categoria, horário, título e prévia em até duas linhas. O toque revela mensagem completa, datas, origem e ações.
- Abrir marca o aviso como lido. No filtro Não lidas, ele permanece visível enquanto estiver expandido, permitindo consultar ou excluir antes de recolher.
- Exclusão reversível e restauração preservadas; avisos vão à lixeira.
- **Abrir área** respeita o destino conhecido do aviso e as permissões do perfil.
- Estoque e entregas aparecem como um resumo compacto com acesso à central de insumos.
- **Avisos neste aparelho** começa recolhido; mostra o estado e abre os controles de ativação, teste e desativação sob demanda.
- Um único provider mantém dados e assinatura de atualização para sino e módulo. A navegação não abre consultas duplicadas.
- Tipografia, superfícies, bordas, raios, foco e cor usam os tokens existentes. Controles têm altura mínima de 44 px, texto longo quebra e o rodapé respeita a área segura.

## Validação

- Build de produção aprovado.
- 252 testes de regras e 34 contratos de interface aprovados.
- Teste em Chromium com o Workspace real e APIs/Firebase isolados: larguras 320, 390, 430, 768 e 1280 px, sem overflow horizontal nem erros de JavaScript.
- O teste cobre a rota própria, navegação pelo sino sem recarregar dados, leitura sem perder detalhes no filtro Não lidas, exclusão, lixeira, restauração e controles push.
- Capturas de 320 e 390 px inspecionadas visualmente. Os testes usam dados fictícios e não enviam notificações reais.

## Continuidade do push

A correção de alteração de acesso, ficha profissional e publicação de escala foi integrada no PR #183 e publicada antes deste módulo. A confirmação física do teste push no iPhone foi fornecida pelo usuário. Após esta entrega, repetir uma nova alteração de perfil em conta ativa confirma o evento real; não se reenvia automaticamente o histórico antigo.
