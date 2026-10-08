# Ericzin's Life Plan

Painel pessoal semanal com 6 pilares da vida (Saúde & Corpo, Sono & Descanso,
Mente, Estudo, Finanças, Carreira). Cada pilar tem sua própria página com os
widgets certos pra aquele assunto (checklist de dias da semana, gráficos de
evolução, metas com "+10%", contador de sequência, etc.) e a Visão Geral
resume o progresso de todos.

**Ao vivo:** https://ericzin.pages.dev (Cloudflare Pages, projeto `ericzin`, branch de produção `main`).
Deploy: `npx wrangler pages deploy <pasta> --project-name ericzin --branch main`, sem a pasta `tools/`.
Ícones (coração pixelado sobre roxo) em `icons/`, gerados por `node ericzin-life-plan/tools/gerar-icones.mjs`; o manifest é `manifest.webmanifest`.
O endereço antigo (silent-cell-1dd6.ericchang12c.workers.dev, um Worker) ainda está no ar.

## O que é isto, tecnicamente

Um único arquivo HTML (`index.html`) autocontido: CSS e JavaScript inline, sem
build step, sem framework, sem dependências de npm. As únicas coisas
carregadas de fora são fontes do Google Fonts, o Chart.js (via cdnjs) e o SDK
do Firebase (via gstatic), todos por `<script src>`/`<link>` direto no HTML.

Por ser um arquivo único, publicar uma atualização é literalmente substituir
esse arquivo na hospedagem estática (Cloudflare Pages, no caso).

**Exceção: a seção Meu Cofrin** (menu → Casa → Meu Cofrin). Ela traz arquivos
próprios, que precisam subir junto com o `index.html`: `cofrin.css`,
`cofrin.js`, `cofrin-sw.js`, `cofrin-icon.png` e a pasta `pets/`.

## Seção Meu Cofrin

É o app de finanças da casa (pasta `meucofrin/` deste repo, no ar sozinho em
seucofrin.pages.dev) fundido aqui dentro com a paleta do LifePlan.

- **Os dados continuam no Firebase `moneyericana`**, não no `ericzinlifeplan`. O
  cofrin roda como um segundo app Firebase com nome próprio (`'cofrin'`), então
  tem login próprio (e-mail/senha do cofrin) e as mesmas regras, push e worker de
  sempre. Os dois apps não compartilham sessão nem dados.
- **Não edite `cofrin.css`, `cofrin.js` nem a marcação entre
  `<!-- COFRIN:INICIO -->` e `<!-- COFRIN:FIM -->`**: são gerados. Para trazer
  mudanças do cofrin original (`meucofrin/index.html`):

  ```bash
  node ericzin-life-plan/tools/sincronizar-cofrin.mjs
  ```

  O script isola o CSS (todo seletor prefixado com `#cofrin`), troca a paleta
  verde/creme pelos tokens do LifePlan (então o modo escuro funciona), roda o JS
  dentro de uma função e pluga o Firebase no app nomeado. Se o cofrin mudar um
  trecho que ele substitui, o script para com `não achei: ...` em vez de gerar
  algo quebrado. Aí é ajustar a regra no script.
- **Chart.js:** o LifePlan usa a versão 3.9 e o cofrin a 4. A 4 carrega antes e é
  guardada como `window.CofrinChart`. Não remova nenhuma das duas.
- **Container:** o cofrin mora em `#cofrin`, irmão do `#main`, porque o render das
  outras páginas reescreve o `#main` inteiro. `showCofrin()` só alterna qual dos
  dois aparece.
- **Abas no menu do LifePlan:** o menu de abas do cofrin fica escondido; Dashboard,
  Lançamentos, Relatórios, Mercado, Contas da casa, Metas do dia, Coleção (e Admin)
  são itens do grupo *Casa* da sidebar (no celular, a barra de baixo troca para elas
  quando você está no Cofrin). O LifePlan escolhe a aba via `window.cofrinAbrirAba`.
  Link direto: `/#cofrin/metas` (qualquer id de aba).
- **Raio-X (antiga aba Relatórios) e Resumo:** pensados para o celular. Os filtros do Raio-X
  (período, categorias, forma de pagamento e perfil Essencial/Bem-estar/Prazer) valem para todos os
  gráficos e ficam no `localStorage` (`cofrin_raiox_v1`, `cofrin_perfis_v1`), sem mudar o Firestore.
  A aba Mercado ganhou período rápido e gráficos próprios (gasto por mês, dia da semana, lojas lado a
  lado, inflação do carrinho). Tudo isso vive em `meucofrin/index.html`; é só rodar o sincronizador.
  Da Finanças dá para abrir o Raio-X direto (`window.lpCofrinTab`).
- **Notificação das metas:** o worker manda `https://ericzin.pages.dev/#cofrin/metas`, então
  ela abre o LifePlan mesmo quando o aparelho foi inscrito pelo seucofrin
  (precisa publicar o `notifier` à mão).
- **Push das metas (service worker):** `cofrin-sw.js` só trata push (sem cache, de propósito).
- **Domínio novo:** ao publicar em outra URL, autorize-a no Firebase
  **moneyericana** (Authentication → Settings → Authorized domains) e na chave
  reCAPTCHA do App Check dele. Sem isso a seção Meu Cofrin não consegue ler os dados.

## Dados e login

- Login com Google via Firebase Authentication.
- Dados salvos no Firestore, um documento por usuário (`paineis/{uid}`), então
  sincronizam entre aparelhos.
- Projeto Firebase: `ericzinlifeplan`. A config do SDK (`FIREBASE_CONFIG`, perto
  do topo do `<script>`) já está preenchida com os valores reais — esses
  valores são públicos por design no Firebase; a segurança de verdade está nas
  regras do Firestore (usuário só lê/escreve o próprio documento).
- Se o Firebase não estiver configurado ou não carregar (ex: dentro de um
  preview com CSP restritivo, como o artifact viewer do Claude), o app cai
  automaticamente para `localStorage` do navegador, sem login. Isso é
  intencional — não é um bug.

## Publicar uma atualização

1. Edite `index.html` diretamente (é um arquivo só).
2. Cloudflare Pages → o projeto já existente → suba o `index.html` atualizado
   (upload manual, ou `wrangler pages deploy` se preferir CLI).
3. Se adicionar um domínio/URL novo (outro ambiente de preview, domínio
   próprio etc.), lembre de autorizá-lo em Firebase Console → Authentication →
   Settings → Authorized domains — senão o login com Google é recusado nesse
   domínio.

## Contexto pra quem (ou qual IA) for mexer aqui depois

- Este app não tem nenhuma relação com o resto deste repositório (que é o
  Cofrin, rastreador de preços de mercado em Next.js). Ele mora aqui só pra
  ficar num lugar versionado e fácil de achar.
- O design já passou por algumas iterações a pedido do dono: começou com
  paleta azul-mar/vermelho-fogo, depois um visual "alegre" com fontes
  arredondadas, e por fim adotou a paleta neutra + roxo (`--primary: #8570fd`)
  que está em produção hoje — veja os tokens de cor no topo do `<style>`.
- As páginas de cada pilar (Saúde, Estudo, Finanças, Carreira, Mente, Sono)
  foram desenhadas uma por vez a partir de mockups que o dono forneceu, então
  cada uma tem sua própria estrutura de dados e widgets em vez de um template
  genérico — veja as seções `/* ---------- <Pilar> ---------- */` dentro do
  `<script>`.
