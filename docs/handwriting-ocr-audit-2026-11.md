# Auditoria e prova de conceito: OCR manuscrito (13/11/2026)

## Achados no código antes da alteração

- `src/ProductionPhotoImport.jsx` carregava Tesseract.js 5.1.1 do CDN no cliente, worker `por`; a PR #207 repetia 2–3 passes com recorte fixo, contraste e foto inteira.
- Tesseract documenta baixa adequação a manuscritos, tendo sido concebido para texto impresso.
- `evaluatePhotoRecognition` exige >=35% das linhas casadas com catálogo e confiança global >=45; qualquer falha nesse portão zera todas as sugestões. É uma decisão de segurança, mas mascara acertos parciais.
- O `catch` original engolia erros, deixando a interface sem diagnóstico de CDN, modelo de idioma, memória, decode ou worker do iOS.
- A opção de recorte é uma região fixa, não um editor livre; o botão não oferece recorte visual real.
- `suggestRecipe` compara texto normalizado ao catálogo e rejeita associações ambíguas; importação passa por confirmação humana e fluxo de planejamento existente.

## Opções

1. **Tesseract local:** sem custo por imagem, sem upload, baixa chance de resolver manuscritos reais; manter como contingência, não solução principal.
2. **Google Cloud Vision DOCUMENT_TEXT_DETECTION:** OCR com suporte a manuscritos documentado, integração HTTP leve via backend, primeira faixa gratuita limitada; custo após franquia e transferência de imagem a terceiro. **Implementado somente como prova de conceito configurável.**
3. **Modelo multimodal (Gemini ou similar):** pode interpretar contexto e caligrafia, mas precisa de validação rigorosa contra alucinação de itens, política de dados e orçamento. Não ativado.
4. **HTR auto-hospedado:** controle maior sobre dados, porém exige infraestrutura/modelo, validação para PT-BR e manutenção; não selecionado sem benchmark.

## Mudanças nesta branch

- Rota autenticada `POST /api/operations/stock` com `action: 'photoRecognize'` (handler interno em `server/production/photo-recognize.js`) usando `GOOGLE_VISION_API_KEY` **apenas no servidor**, validando MIME, assinatura, tamanho, origem, login e vínculo de unidade.
- Controle de até 20 chamadas por usuário/dia UTC e espaçamento mínimo de 20 s por conta; sem guardar fotos ou texto no Firestore (apenas contadores).
- Foto convertida pelo navegador para JPEG antes da transmissão; envio acontece somente após ação explícita. A imagem transita por Google Cloud Vision, sujeito às políticas da conta do provedor.
- UI tenta serviço de manuscrito primeiro; se indisponível, informa motivo e usa Tesseract local como fallback.
- O cadastro existente segue sendo a única fonte de preparações; OCR não executa escrita de tarefas ou estoque.

## Configuração para homologação (não produção)

- Ativar Google Cloud Vision em projeto de teste, criar credencial restrita à API e por backend, configurar `GOOGLE_VISION_API_KEY` somente no ambiente de Preview da Vercel. **Não habilitar em produção até validação e orçamento aprovados**.
- Confirmar `PUBLIC_APP_URL` com a origem exata do preview, lembrando que `checkRequest` rejeita origens divergentes.
- Confirmar política de privacidade/contrato com o provedor antes de enviar fotos operacionais.
- Configurar alertas e limites de orçamento no Google Cloud. A franquia não é garantia de custo zero.
- Verificar que autenticação terminal / usuário funciona no endpoint e que nenhum segredo aparece no bundle ou nas respostas.

## Matriz de aceitação ainda pendente

| Cenário | Critério |
| --- | --- |
| Foto manuscrita real anexada | Medir caracteres/linhas legíveis e falsos positivos, comparar ao gabarito humano |
| Recorte próximo | Comparar precisão com foto completa |
| Baixa iluminação | Retornar itens confiáveis ou pedir revisão sem inventar |
| Lista digitada | Verificar fidelidade textual |
| Texto parcialmente ilegível | Não inventar trechos ausentes |
| 30 alcatra / 40 frango | Quantidade separada do nome e vínculo de catálogo explícito |
| Preparações semelhantes | Exigir confirmação para empate/genérico |
| Foto sem lista | Zero tarefas propostas |
| PWA Safari iOS | Validar HEIC, canvas, network, memória, zoom/recorte, fallback, foco e acessibilidade |
| Segurança | 401 sem token, 403 sem unidade/origem, 429 limite, 400 formato incorreto |

**Não homologado:** não houve execução do endpoint com credencial Cloud Vision, nem teste de imagem real em Safari no iPhone. A screenshot de erro confirma o problema anterior, mas não prova desempenho da solução nova. O código de Preview deve passar por CI, revisão de segurança e teste real antes de merge.

## Gatilhos para não fazer merge

- Menos itens legíveis corretos do que entrada manual assistida ou falsos positivos perigosos.
- Erros de iOS que ocultem mensagens, OCR demorado demais ou travamento no PWA.
- Chave exposta, ausência de restrições de custo/rate limit, vazamento entre unidades.
- Qualquer escrita de estoque pela importação de foto.

## CI após criação da PR

A primeira execução de `tests/catalog-56.test.mjs` detectou que a criação de uma função Vercel extra excederia o limite de 12 funções. O handler foi movido para `server/production/photo-recognize.js` e passou a usar a rota `/api/operations/stock` existente; é obrigatória nova verificação do CI antes da homologação.
