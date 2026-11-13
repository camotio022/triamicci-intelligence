# Auditoria e homologação — reconhecimento de listas manuscritas (13/11/2026)

## Causa técnica encontrada
- Antes desta branch, `src/ProductionPhotoImport.jsx` carregava Tesseract.js 5.1.1 no Safari/PWA e executava até três passagens do mesmo motor (recorte central, contraste e imagem inteira).
- O motor OCR tradicional não foi especializado para escrita manuscrita irregular. As três passagens não adicionam capacidade de reconhecimento de caligrafia.
- `evaluatePhotoRecognition` exigia proporção >= 35% de correspondências de catálogo e confiança média >= 45. Uma linha legível podia ser descartada devido a outras linhas ruins.
- O `catch` da leitura apagava o erro, impedindo diagnosticar falha de rede, decodificação ou worker.
- O recorte anterior era fixo (18%/17%/64%/80%) e podia remover texto. Safari pode variar na decodificação de HEIC e na memória disponível ao usar Canvas/WASM.
- Testes anteriores eram sintéticos de interpretação de texto, não verificações de OCR com imagem real.
- Reproduzido em ambiente local: a captura de tela recebida foi recortada e ampliada, e o Tesseract CLI retornou somente texto sem sentido. Isso é um *indicador*, não benchmark equivalente ao Tesseract.js nem prova de desempenho do novo motor.

## Alternativas
| Alternativa | Pontos positivos | Limitações |
| --- | --- | --- |
| Tesseract.js local | Sem cobrança por imagem, não envia dados | Caligrafia de cozinha pouco confiável; CPU/memória do iPhone |
| TrOCR/PaddleOCR próprios | Possibilidade de modelo especializado e controle de dados | Hospedagem de inferência, treinamento, GPU/CPU e manutenção; qualidade em PT-BR depende de dados |
| Google Cloud Vision DOCUMENT_TEXT_DETECTION | Suporte a manuscritos, serviço gerenciado, sem processamento pesado no iPhone | Exige projeto habilitado, credencial de serviço e faturamento; foto enviada ao provedor |
| Modelo multimodal com visão | Pode interpretar contexto da lista | Custo, latência, possibilidade de invenção; exige validação rígida |

## Implementação proposta nesta branch
- Substituir o caminho padrão do Tesseract por ação autenticada `recognizePhoto` em `/api/production/manage` (Cloud Vision, opt-in).
- Usar o service account no servidor, sem chave no frontend. `PHOTO_OCR_PROVIDER=google-vision` habilita o recurso. O projeto precisa habilitar a Vision API, conceder permissões ao service account e configurar faturamento. Sem isso, o recurso **não está operacional**.
- Limitar JPEG/PNG/WebP a 1,8 MB decodificados, verificar assinatura, exigir consentimento explícito e aplicar limite de 20 leituras por usuário/dia/unidade no Firestore. O aplicativo não persiste fotos de OCR; o provedor externo possui suas próprias políticas de tratamento de dados.
- Mostrar o recorte e permitir ampliar, deslocar e girar a foto; preservar original para conferência.
- Extrair texto, mapear apenas preparações presentes no catálogo, exibir candidatos não vinculados desmarcados, exigir revisão e confirmação antes de importar.
- `dayImport` continua com autenticação, permissões, isolamento por unidade, idempotência e auditoria; não movimenta estoque.

## Homologação obrigatória antes de merge/produção
| Caso | Status |
| --- | --- |
| Foto manuscrita real original (não apenas captura de tela) | PENDENTE |
| Recorte da mesma anotação | PENDENTE |
| Iluminação ruim | PENDENTE |
| Lista digitada | PENDENTE |
| Manuscrito parcialmente ilegível | PENDENTE |
| Quantidades antes dos nomes | Teste de parser; OCR real PENDENTE |
| Nomes semelhantes no catálogo | Teste de parser; OCR real PENDENTE |
| Foto sem lista de produção | Teste de parser; OCR real PENDENTE |
| Safari PWA iPhone / câmera / galeria / HEIC | PENDENTE |
| Testes automatizados e build CI | Acompanhar status na PR |

### Critérios para aceitar
1. Comparar linhas verdadeiras com o OCR bruto, medir precisão por linha, taxa de falsos positivos, tempo por foto e custo por imagem.
2. Confirmar que a foto real produz sugestões úteis e que ambiguidades não são selecionadas automaticamente.
3. Conferir visual e desempenho em iPhone real; sem esse teste não afirmar compatibilidade homologada.
4. Validar permissões, ausência de movimentos de estoque e ausência de gravação de imagem.
5. Não integrar à main nem publicar antes de homologar.

**Atenção:** o código oferece a integração, mas não comprova acerto do Cloud Vision na fotografia real. Não há credenciais nem projeto de faturamento fornecidos neste teste.
