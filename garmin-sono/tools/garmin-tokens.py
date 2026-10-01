"""Gera o token do Garmin para o Worker (rode uma vez, no seu computador).

    pip install garth
    python garmin-tokens.py

Pede e-mail, senha e o código 2FA (se tiver). Imprime o JSON do OAuth1 para
colar no secret do Worker:

    npx wrangler secret put GARMIN_OAUTH1
"""
import getpass, json
import garth

garth.login(input("E-mail do Garmin: "), getpass.getpass("Senha: "))
t = garth.client.oauth1_token
print("\nCole isto no secret GARMIN_OAUTH1:\n")
print(json.dumps({
    "oauth_token": t.oauth_token,
    "oauth_token_secret": t.oauth_token_secret,
    "mfa_token": getattr(t, "mfa_token", None),
}))
