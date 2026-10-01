# Garmin Sono

Cloudflare Worker que leva o sono do Garmin Connect para a página **Sono & Descanso**
do LifePlan. Ao abrir a página (logado com o Google), o app chama `GET /sono` e
preenche as horas da noite, o score e as fases (profundo, leve, REM, acordado).

- Só responde ao e-mail `ALLOWED_EMAIL` (em `wrangler.jsonc`), conferindo o token do Firebase.
- Usa a API **não oficial** do Garmin Connect (mesma do app do celular). Pode mudar ou
  ser bloqueada pelo Garmin sem aviso.
- Não guarda sua senha: só o token OAuth1 do Garmin, no secret `GARMIN_OAUTH1`.

## Configurar (uma vez)

1. No seu computador: `pip install garth && python garmin-sono/tools/garmin-tokens.py`
   (pede e-mail, senha e código 2FA, se tiver) e copie o JSON impresso.
2. `cd garmin-sono && npx wrangler secret put GARMIN_OAUTH1` e cole o JSON.
3. `npx wrangler deploy` (fica em `https://garmin-sono.ericchang12c.workers.dev`,
   o endereço usado por `GARMIN_URL` no `index.html` do LifePlan).

Se o app mostrar "gere os tokens de novo", repita os passos 1 e 2.
