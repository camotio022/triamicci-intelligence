# Triamicci Intelligence

Aplicativo de operação de cozinha, estoque, recebimento, produção e gestão da equipe.

## Ambiente reproduzível

Use **Node 24** (`.nvmrc`). As versões da aplicação e das ferramentas de teste estão
fixadas em `package.json` e `package-lock.json`.

```sh
npm ci
npm run test:rules
npm run build
```

`npm run dev` inicia o frontend Vite. O backend usa as funções em `api/` na Vercel.
Para desenvolvimento com dados próprios, configure um projeto Firebase de staging
separado conforme `.env.example`; não use credenciais de produção para testes.
Os testes abaixo configuram suas próprias fixtures demo e não dependem da quota real.

## Validação isolada

```sh
# Regras, contratos e concorrência controlada em memória:
npm run test:rules
# Telas com fixtures, sem autenticação real:
npx playwright install chromium
npm run test:browser
# Auth, Firestore, Storage e fluxos completos, somente no projeto demo:
# Requer Java 21 e portas locais 8080, 9099 e 9199 livres.
npm run test:emulator
# Orçamento de leituras, com handlers reais e banco em memória:
node --experimental-test-module-mocks scripts/measure-firestore-reads.mjs --session
```

O Cloud pode usar um Chromium instalado definindo
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`.
O CI usa o navegador correspondente à versão fixada do Playwright.

## Documentação

- [Arquitetura e contratos atuais](docs/architecture.md)
- [Acesso pelo caixa, autorização no celular e desvinculação](docs/terminal-access.md)
- [Implementação da auditoria e critérios de aceite](docs/refatoracao-auditoria-2026-11-10.md)
- [Auditoria histórica da arquitetura](docs/auditoria-arquitetura-2026-11-10.md)
- [Redução de leituras e limites das medições](docs/firestore-read-reduction-192.md)
- [Versionamento e identificação de releases](VERSIONING.md)
- [Isolamento de unidades e segurança](docs/V4_TENANCY_AUDIT.md)

Documentos datados registram o código e as decisões daquele momento; consulte o
commit implantado para identificar o comportamento vigente. Nunca commitar tokens,
credenciais de serviço, arquivos `.env` ou evidências reais nos testes.
