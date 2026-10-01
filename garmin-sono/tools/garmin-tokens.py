"""Gera os tokens do Garmin para o Worker (rode uma vez, no seu computador).

    pip install garminconnect
    python garmin-tokens.py

Pede e-mail, senha e o código 2FA (se tiver). Imprime uma linha de JSON para
colar no secret do Worker:

    npx wrangler secret put GARMIN_TOKENS

Essa linha é uma chave de acesso à sua conta: não compartilhe.
"""
import getpass

from garminconnect.client import Client

client = Client()
client.login(
    input("E-mail do Garmin: "),
    getpass.getpass("Senha: "),
    prompt_mfa=lambda: input("Código 2FA (enviado pelo Garmin): ").strip(),
)
print("\nLogin ok. Cole a linha abaixo no secret GARMIN_TOKENS:\n")
print(client.dumps())
