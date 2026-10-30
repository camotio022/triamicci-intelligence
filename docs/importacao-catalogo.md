# Importação inicial do catálogo Triamicci (Firestore)

O catálogo de 20 itens é definido em `data/triamicci-product-catalog.json`.
A importação cria documentos em `productCatalog/{id}` com `active: false`.
**Não** cria ou altera `units/{unitId}/products`, saldos ou movimentações.

## Antes de começar

- Revise nomes, unidades e itens provisórios no JSON.
- Tenha Node.js instalado e acesso administrativo **autorizado** ao projeto Firebase.
- Não publique chaves/credenciais no GitHub ou no chat. Execute localmente ou em ambiente seguro.
- Confirme o **ID exato do projeto Firebase** em Firebase Console → Configurações do projeto.

## 1. Simulação (sem acessar Firebase)

Na raiz do repositório:

```bash
npm install
node scripts/seed-product-catalog.mjs
```

A saída esperada informa 20 itens e **SIMULAÇÃO**. Nenhuma gravação é feita.

## 2. Importação autenticada (Windows PowerShell)

Uma opção de autenticação é instalar o Google Cloud CLI e executar `gcloud auth application-default login` com uma conta autorizada. Depois:

```powershell
$env:GOOGLE_CLOUD_PROJECT="ID_EXATO_DO_PROJETO"
$env:CONFIRM_FIREBASE_PROJECT="ID_EXATO_DO_PROJETO"
node scripts/seed-product-catalog.mjs --apply
```

O script verifica os IDs iguais antes de qualquer escrita. É necessário que a identidade autenticada tenha permissão de gravação no Firestore. Confirme que é o projeto correto **antes** de executar `--apply`.

## 3. Verificação

No Firebase Console → Firestore Database procure a coleção `productCatalog`: documentos como `peito-frango`, `frango-cubos`, `strogonoff-frango` e `oleo-soja` devem existir com `active: false`.
Verifique também se `units/barigui/products` permaneceu inalterada.

O script usa `create()`, portanto documentos existentes são **preservados**, não sobrescritos. Se ocorrer erro de permissão ou conexão, a importação pode ser parcial; corrija o problema e execute novamente, pois os documentos já criados serão pulados.

## Próximo passo (ainda não implementado)

Criar consulta autenticada ao catálogo e integrar a seleção na tela de cadastro. Não liberar produtos automaticamente para movimentação, nem transformação com lotes, antes dos testes e revisões.
