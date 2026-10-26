# Ericzin — finanças e rotina

App pessoal para o celular e o computador: lançamentos, Raio-X dos gastos, Mercado (notas fiscais),
Contas da casa e Planner do dia (com a Coleção de pets como recompensa).

**Ao vivo:** https://ericzin.pages.dev (Cloudflare Pages, projeto `ericzin`, branch `main`).
Os pilares do antigo "Life Plan" (Saúde, Sono, Mente, Estudo, Finanças, Carreira) foram retirados;
dá para pedir de volta depois.

## Estrutura

Site estático, sem build:

- `index.html`: marcação (login, telas, modais).
- `app.css`: todo o visual (tema claro/escuro automático).
- `app.js`: toda a lógica (Firebase, gráficos, telas).
- `cofrin-sw.js`: service worker só para o push das tarefas do planner (sem cache). O nome foi mantido para não
  perder as inscrições de notificação já feitas.
- `manifest.webmanifest`, `icons/`, `pets/`: PWA e modelos 3D dos pets.
- `tools/gerar-icones.mjs`: gera os ícones.

## Navegação

- Celular: barra de baixo com Início, Lançamentos, Raio-X, Planner e Mais (Mercado, Contas da casa,
  Coleção, perfil, guia e sair). Botão **+** flutuante em Início e Lançamentos.
- Computador (≥ 900px): menu lateral com todas as telas.
- Links `#metas`, `#cofrin/metas` etc. abrem a tela direto (a notificação das metas usa isso).

## Dados e login

Mesmo backend do Meu Cofrin: Firebase **moneyericana** (login por e-mail e senha, Firestore em
`users/{uid}/…`). O domínio `ericzin.pages.dev` já está autorizado lá. Ao publicar em outra URL,
autorize-a em Authentication → Settings → Authorized domains e na chave reCAPTCHA do App Check.
O projeto Firebase antigo do Life Plan (`ericzinlifeplan`) não é mais usado por este app.

## Publicar

Push no `Main` publica pelo GitHub Actions (`.github/workflows/publicar.yml`), sem a pasta `tools/`.
Manual: `npx wrangler pages deploy <pasta> --project-name ericzin --branch main`.

## Rodar localmente

`npx serve ericzin-life-plan`

## Planner do dia

A aba `#metas` (agora "Planner") é uma agenda do dia: faixa da semana, tarefas separadas em
Qualquer hora / Manhã / Dia / Noite, com ícone, horário e duração opcionais. Cada tarefa vale só
para um dia (`data`) ou se repete por dia da semana (`dias`). Coleção `users/{uid}/rotinas`.
Recompensa: a cada 3 tarefas concluídas no dia sai um baú (`TAREFAS_POR_BAU` em `app.js`); o
número de baús abertos fica em `metasStatus/{dia}.bausAbertos`.
