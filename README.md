# echangsci

Os apps pessoais do Eric, num repositório só.

| Pasta | App | No ar em |
|---|---|---|
| [`ericzin-life-plan/`](ericzin-life-plan/) | Ericzin's Life Plan: painel semanal com os 6 pilares da vida, incluindo a seção Meu Cofrin | https://ericzin.pages.dev |
| [`meucofrin/`](meucofrin/) | Meu Cofrin: finanças da casa (lançamentos, metas, Mercado, Contas da casa, Relatórios) | https://seucofrin.pages.dev |

[`garmin-sono/`](garmin-sono/) é o Worker que traz o sono do Garmin para o LifePlan (deploy manual, ver o README dele).

Os dois são sites estáticos (HTML + JS, sem build) hospedados no Cloudflare Pages.

## Como as duas pastas se relacionam

- **`meucofrin/` é a fonte do Cofrin.** Toda mudança no Cofrin é feita aqui.
  A pasta também guarda as regras do Firestore (`firestore.rules`) e o worker
  de notificações push (`notifier/`, Cloudflare Worker `cofre-notifier`).
- **A seção Meu Cofrin do LifePlan é gerada a partir dela.** Depois de mexer no
  Cofrin, rode:

  ```bash
  node ericzin-life-plan/tools/sincronizar-cofrin.mjs
  ```

  Isso regenera `ericzin-life-plan/cofrin.css`, `cofrin.js` e o trecho entre
  `<!-- COFRIN:INICIO -->` e `<!-- COFRIN:FIM -->` do `index.html`. Não edite
  esses arquivos à mão. Detalhes em [`ericzin-life-plan/README.md`](ericzin-life-plan/README.md).
- Os dados do Cofrin ficam no Firebase `moneyericana` e os do LifePlan no
  `ericzinlifeplan`. Os dois apps não compartilham login nem dados.

## Rodar localmente

Qualquer servidor estático serve, por exemplo:

```bash
npx serve ericzin-life-plan   # LifePlan
npx serve meucofrin           # Cofrin
```

## Publicar

Automático: todo push no `Main` roda `.github/workflows/publicar.yml`, que publica
o seucofrin e o LifePlan no Cloudflare Pages (dá pra rodar à mão na aba Actions →
Publicar no Cloudflare → Run workflow). Usa os secrets `CLOUDFLARE_API_TOKEN`
(token com permissão *Cloudflare Pages: Edit*) e `CLOUDFLARE_ACCOUNT_ID`.
O worker de push (`notifier`) continua manual.

Os comandos manuais, se precisar:

- LifePlan: `npx wrangler pages deploy <pasta> --project-name ericzin --branch main`,
  com o conteúdo de `ericzin-life-plan/` sem a pasta `tools/`.
- Cofrin sozinho (seucofrin.pages.dev, projeto do tipo Direct Upload, sem ligação com o GitHub),
  a partir da raiz do repo: `npx wrangler pages deploy meucofrin --project-name seucofrin --branch main`.
- Worker de push: `cd meucofrin/notifier && npx wrangler deploy`.
