# echangsci

Os apps pessoais do Eric, num repositório só.

| Pasta | App | No ar em |
|---|---|---|
| [`ericzin-life-plan/`](ericzin-life-plan/) | Ericzin: finanças e rotina (lançamentos, Raio-X, Mercado, Contas da casa, Metas do dia) | https://ericzin.pages.dev |
| [`meucofrin/`](meucofrin/) | Meu Cofrin: finanças da casa (lançamentos, metas, Mercado, Contas da casa, Relatórios) | https://seucofrin.pages.dev |

[`garmin-sono/`](garmin-sono/) é o Worker que traz o sono do Garmin para o antigo pilar Sono do Life Plan (hoje sem uso no app; deploy manual, ver o README dele).

Os dois são sites estáticos (HTML + JS, sem build) hospedados no Cloudflare Pages.

## Como as duas pastas se relacionam

- **`ericzin-life-plan/` agora é o app Ericzin (finanças e rotina), independente.** Não há mais
  sincronização a partir do `meucofrin/`; cada pasta evolui sozinha.
- Os dois usam o mesmo Firebase (`moneyericana`), então a conta e os dados são os mesmos.
  `meucofrin/` guarda também as regras do Firestore (`firestore.rules`) e o worker de push (`notifier/`).

## Rodar localmente

Qualquer servidor estático serve, por exemplo:

```bash
npx serve ericzin-life-plan   # Ericzin
npx serve meucofrin           # Cofrin
```

## Publicar

Automático: todo push no `Main` roda `.github/workflows/publicar.yml`, que publica
o seucofrin e o Ericzin no Cloudflare Pages (dá pra rodar à mão na aba Actions →
Publicar no Cloudflare → Run workflow). Usa os secrets `CLOUDFLARE_API_TOKEN`
(token com permissão *Cloudflare Pages: Edit*) e `CLOUDFLARE_ACCOUNT_ID`.
O worker de push (`notifier`) continua manual.

Os comandos manuais, se precisar:

- Ericzin: `npx wrangler pages deploy <pasta> --project-name ericzin --branch main`,
  com o conteúdo de `ericzin-life-plan/` sem a pasta `tools/`.
- Cofrin sozinho (seucofrin.pages.dev, projeto do tipo Direct Upload, sem ligação com o GitHub),
  a partir da raiz do repo: `npx wrangler pages deploy meucofrin --project-name seucofrin --branch main`.
- Worker de push: `cd meucofrin/notifier && npx wrangler deploy`.
