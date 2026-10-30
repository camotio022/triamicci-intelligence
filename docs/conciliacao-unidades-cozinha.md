# Conciliação com as unidades revisadas da cozinha

A configuração existente da unidade é a referência para os produtos já cadastrados. A sugestão do manifesto não substitui estoque, contagem, recebimento, validade, estoque mínimo ou frequência revisados pelo responsável.

O painel apresenta os dois conjuntos lado a lado e carrega o vínculo quando existe uma única correspondência. Várias correspondências exigem seleção. Alterar um campo exige nova confirmação da revisão.

A ativação revalida as unidades contra cadastro, perfil e saldo dentro da transação. Mantém o ID e os saldos. Uma definição central já ativa não é reescrita para adaptar uma única unidade. Divergências retornam o motivo específico.

Saldo presente apenas no controle anterior continua bloqueando a ativação automática: não é substituído por saldo físico zero nem convertido. Esses casos exigem análise separada de quantidade, unidade e rastreabilidade.

Validação: 188 testes puros e build locais. Firebase E2E ampliado para preservar uma unidade local `un` e recebimento `kg` sobre definição central `kg`, com validade desativada e saldo 7 preservados; alteração de unidade e criação de zero sobre saldo anterior continuam bloqueadas. Teste mobile verifica o preenchimento com os dados existentes.
