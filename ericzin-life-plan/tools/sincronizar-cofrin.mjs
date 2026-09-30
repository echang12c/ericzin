// Sincroniza a seção Meu Cofrin com o app original (pasta meucofrin/ deste repo).
// Uso: node ericzin-life-plan/tools/sincronizar-cofrin.mjs [caminho do index.html do cofrin; padrão meucofrin/index.html]
// Gera cofrin.css e cofrin.js e reescreve a marcação entre <!-- COFRIN:INICIO --> e <!-- COFRIN:FIM --> no index.html.
// Se o cofrin mudar um trecho que este script substitui, ele para com 'não achei: ...' em vez de gerar algo quebrado.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.argv[2] || path.resolve(OUT, '..', 'meucofrin', 'index.html');
const src = fs.readFileSync(SRC, 'utf8');

const between = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i + a.length); if (i < 0 || j < 0) throw new Error('marcador: ' + a); return s.slice(i + a.length, j); };
function rep(s, from, to, { all = false, must = true } = {}) {
  const n = s.split(from).length - 1;
  if (must && n === 0) throw new Error('não achei: ' + from);
  if (!all && n > 1) throw new Error(n + 'x (esperado 1): ' + from);
  return s.split(from).join(to);
}

/* ============================== CSS ============================== */
let css = between(src, '<style>', '</style>');
// tokens e base do cofrin saem: quem manda agora é o :root do LifePlan
css = css.replace(/:root\{[\s\S]*?\n\}\n/, '');
css = rep(css, '*{box-sizing:border-box;margin:0;padding:0}\n', '');
css = rep(css, 'html{-webkit-text-size-adjust:100%}\n', '');
css = css.replace(/^body\{.*\}\n/m, '');

const cores = [
  // verde da marca -> roxo do LifePlan
  ['linear-gradient(135deg,#00C87B,#009E62)', 'linear-gradient(135deg,var(--primary),var(--primary-hover))', true],
  ['border:1px solid #009E62', 'border:1px solid var(--primary-hover)', true],
  ['border-color:#009E62', 'border-color:var(--primary-hover)', true],
  ['rgba(0,168,107,.3)', 'rgba(99,73,248,.3)', true],
  ['linear-gradient(90deg,#00C87B,#00A86B)', 'linear-gradient(90deg,var(--primary-500),var(--primary))', false],
  ['linear-gradient(135deg,#00C87B 0%,#00A88F 55%,#0E7DC2 100%)', 'linear-gradient(135deg,#cfc7fa 0%,#a99cf5 55%,#8f80ee 100%)', false],
  ['rgba(0,168,140,.35)', 'rgba(99,73,248,.35)', false],
  ['.metaItem.done .metaCheck{background:linear-gradient(135deg,#00C87B,#00A86B);border-color:#00A86B}', '.metaItem.done .metaCheck{background:var(--income);border-color:var(--income)}', false],
  ['linear-gradient(135deg,#0E7DC2 0%,#00A88F 60%,#00C87B 100%)', 'linear-gradient(135deg,#8f80ee 0%,#a99cf5 60%,#cfc7fa 100%)', false],
  ['rgba(14,125,194,.35)', 'rgba(99,73,248,.35)', false],
  ['color:#0B6BA8', 'color:#4a3bb8', false],
  ['linear-gradient(135deg,#8B5CF6,#7C3AED)', 'linear-gradient(135deg,var(--primary),var(--primary-hover))', false],
  ['linear-gradient(135deg,#FF8A3C,#FF5C4D)', 'linear-gradient(135deg,var(--primary),var(--primary-hover))', false],
  ['rgba(255,92,77,.45)', 'rgba(99,73,248,.45)', false],
  ['background:linear-gradient(90deg,#00A86B,#0E7DC2 70%,#8B5CF6)', 'background:linear-gradient(90deg,#d9d2fb,#a99cf5 45%,#8f80ee)', false],
  ['color:#00794E', 'color:var(--income)', true],
  ['rgba(21,32,25,.45)', 'rgba(17,24,39,.55)', false],
  ['rgba(139,92,246,.3)', 'rgba(99,73,248,.3)', true],
  // superfícies creme/claras fixas -> tokens (funcionam no modo escuro)
  ['#FAFCFA', 'var(--surface)', true],
  ['#FFFDF8', 'var(--surface)', true],
  ['#FAF6EC', 'var(--surface-2)', true],
  ['#F5EBD8', 'var(--surface-2)', true],
  ['#FFFDF6', 'var(--surface-2)', true],
  ['.btnGhost:hover{background:#fff}', '.btnGhost:hover{background:var(--surface-2)}', false],
  ['background:#E8ECE8', 'background:var(--border-strong)', false],
  ['linear-gradient(135deg,#8B5CF6 0%,#C061CB 60%,#FF5C9D 100%)', 'linear-gradient(135deg,#8f80ee 0%,#a99cf5 55%,#d9d2fb 100%)', false],
  ['rgba(139,92,246,.35)', 'rgba(99,73,248,.35)', false],
  ['color:#B45309', 'color:var(--warn)', false],
  ['box-shadow:0 10px 40px rgba(21,32,25,.08)', 'box-shadow:var(--shadow)', false],
  ['#loginView,#verifyView{min-height:100dvh;', '#loginView,#verifyView{min-height:70dvh;', false],
  ['#toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);background:var(--ink)', '#toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);background:#111827', false],
];
for (const [a, b, all] of cores) css = rep(css, a, b, { all });

// pastel: texto escuro sobre os botões roxos e sombras suaves
css = css.replace(/(var\(--primary-hover\)\)[^}]*?);?color:#fff/g, '$1;color:var(--on-accent)');
css = css.replace(/rgba\(99,73,248,/g, 'rgba(169,156,245,');

// cabeçalho: sem a borda arco-íris e sem a classe .app (colide com a do LifePlan)
css = css.replace(/^header\.app\{.*\}$/m, 'header.cfHeader{position:sticky;top:0;z-index:5;background:var(--bg);border-bottom:1px solid var(--border);margin-bottom:4px}');
css = rep(css, 'main{max-width:980px;margin:0 auto;padding:20px 18px 90px}', 'main{max-width:980px;margin:0 auto;padding:20px 0 90px}');
css = rep(css, '.headerRow{max-width:980px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;padding:14px 18px 8px}',
                '.headerRow{max-width:980px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 0 8px}');
css = rep(css, '.monthBar{max-width:980px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:14px;padding:4px 18px 10px}',
                '.monthBar{max-width:980px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:14px;padding:4px 0 10px}');
css = rep(css, '.tabsMenu{max-width:980px;margin:0 auto;padding:0 18px 12px;position:relative}',
                '.tabsMenu{max-width:980px;margin:0 auto;padding:0 0 12px;position:relative}');
// cartões com a cara dos do LifePlan
css = rep(css, '.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:18px;box-shadow:0 3px 0 var(--line)}',
               '.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow)}\n.card+.card{margin-top:0}');
css = rep(css, '.petCard{background:var(--surface);border:2px solid var(--line);border-radius:var(--radius);padding:14px 10px;text-align:center;cursor:pointer;box-shadow:0 3px 0 var(--line);',
               '.petCard{background:var(--surface);border:2px solid var(--line);border-radius:var(--radius);padding:14px 10px;text-align:center;cursor:pointer;box-shadow:var(--shadow);');
// .brand e .nav também existem no LifePlan: zera o que vazaria de lá
css = css.replace(/^\.brand\{/m, '.brand{display:block;padding:0;gap:0;');
css = rep(css, '.diaBar button.nav{', '.diaBar button.nav{display:inline-flex;flex-direction:row;align-items:center;justify-content:center;');
// no desktop as abas viram uma fileira de pílulas; o menu suspenso fica só no celular
css += `
@media(min-width:760px){.tabsToggle{display:none}nav.tabs{display:flex;flex-direction:row;flex-wrap:wrap;padding-top:0}}
.cfTitle{font-family:var(--display);font-size:clamp(1.6rem,2.4vw,2rem);line-height:1.1}
.cfTitle small{display:block;font-family:var(--body);font-size:13px;font-weight:600;color:var(--muted);margin-top:2px}
.monthBar button,.diaBar button.nav{color:var(--ink)}
input,select,textarea{color:inherit}
`;

// @keyframes ficam fora do escopo
const keyframes = [];
css = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, m => { keyframes.push(m); return ''; });

// prefixa todo seletor com #cofrin (sem depender de CSS nesting, que falha em iOS < 17.2)
function scope(block) {
  let out = '', i = 0;
  while (i < block.length) {
    const open = block.indexOf('{', i);
    if (open < 0) { out += block.slice(i); break; }
    const head = block.slice(i, open);
    let depth = 1, j = open + 1;
    while (depth) { if (block[j] === '{') depth++; else if (block[j] === '}') depth--; j++; }
    const body = block.slice(open + 1, j - 1);
    const lead = head.match(/^\s*/)[0];
    const sel = head.trim();
    if (sel.startsWith('@media')) out += lead + sel + '{' + scope(body) + '}';
    else if (sel.startsWith('/*') || sel.includes('*/')) {
      // comentário antes do seletor
      const k = head.lastIndexOf('*/') + 2;
      out += head.slice(0, k) + scope(head.slice(k) + '{' + body + '}');
    } else out += lead + sel.split(',').map(s => '#cofrin ' + s.trim()).join(',') + '{' + body + '}';
    i = j;
  }
  return out;
}
const tokens = `/* Meu Cofrin dentro do LifePlan — gerado a partir do moneyericana/index.html.
   Cores: os nomes antigos do cofrin apontam para os tokens do LifePlan (:root),
   então o modo escuro vem de graça. Todo seletor é prefixado com #cofrin. */
#cofrin{
  --ink:var(--text); --muted:var(--text-2); --line:var(--border);
  --primary-soft:var(--primary-light);
  --accent:var(--primary); --accent-soft:var(--primary-light);
  --income:#0b6b45; --income-soft:#dcf5e8;
  --expense:#b3202f; --expense-soft:#fde6e8;
  --warn:#8a5300; --warn-soft:#fdf0cf;
  --danger:#b3202f; --sun:#FFC53D;
  --radius:20px;
  --display:'Baloo 2',system-ui,sans-serif;
  --body:'Nunito',system-ui,sans-serif;
  --mono:'Nunito',system-ui,sans-serif;
  color:var(--text); font-family:var(--body); font-size:15px; line-height:1.45;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]) #cofrin{
    --income:#8ff0bd; --income-soft:#123527;
    --expense:#ffb3b8; --expense-soft:#3a1c20;
    --warn:#fbbf24; --warn-soft:#3a2a0c; --danger:#ff8a8a;
    color-scheme:dark;
  }
}
:root[data-theme="dark"] #cofrin{
  --income:#8ff0bd; --income-soft:#123527;
  --expense:#ffb3b8; --expense-soft:#3a1c20;
  --warn:#fbbf24; --warn-soft:#3a2a0c; --danger:#ff8a8a;
  color-scheme:dark;
}
#cofrin *{margin:0;padding:0}
`;
css = tokens + scope(css) + '\n' + keyframes.join('\n') + '\n';

/* ============================== HTML ============================== */
let html = between(src, '<body>\n', '\n<script>\n');
html = rep(html, 'href="privacidade.html"', 'href="https://seucofrin.pages.dev/privacidade.html"', { all: true });
html = rep(html, '<div class="brand">SeuCofrin<small>organizador financeiro da casa</small></div>', '<div class="brand">Meu Cofrin<small>organizador financeiro da casa</small></div>');
html = rep(html, '<div class="brand">SeuCofrin<small>confirme seu e-mail</small></div>', '<div class="brand">Meu Cofrin<small>confirme seu e-mail</small></div>');
html = rep(html, '<header class="app">', '<header class="cfHeader">');
html = rep(html, '<div class="brand">SeuCofrin</div>', '<h1 class="cfTitle">Meu Cofrin<small>finanças da casa</small></h1>');
html = rep(html, 'que você guardou no SeuCofrin', 'que você guardou no Meu Cofrin');
html = '<!-- ================= MEU COFRIN (gerado a partir do moneyericana) ================= -->\n'
     + '<div id="cofrin" class="main" hidden>\n' + html.trim() + '\n</div>\n';

/* ============================== JS =============================== */
let js = between(src, '\n<script>\n', '\n</script>\n</body>');
js = rep(js, 'firebase.initializeApp(firebaseConfig);', "/* app com nome próprio: o LifePlan usa o app padrão (projeto ericzinlifeplan) */\nconst cofApp = firebase.initializeApp(firebaseConfig, 'cofrin');");
js = rep(js, 'firebase.appCheck().activate(', 'firebase.appCheck(cofApp).activate(');
js = rep(js, 'const auth = firebase.auth();', 'const auth = cofApp.auth();');
js = rep(js, 'const db = firebase.firestore();', 'const db = cofApp.firestore();');
js = rep(js, "navigator.serviceWorker.register('sw.js')", "navigator.serviceWorker.register('cofrin-sw.js')");
js = rep(js, "borderColor:'#0E7DC2', backgroundColor:'#0E7DC2'", "borderColor:'#a99cf5', backgroundColor:'#a99cf5'");
js = rep(js, "backgroundColor:medias.map((_,i)=>i===0?'#00C87B':'#8FA3B8')", "backgroundColor:medias.map((_,i)=>i===0?'#a99cf5':'#cfc9e6')");
js = rep(js, "{e:'👋',t:'Bem-vindo ao SeuCofrin!'", "{e:'👋',t:'Bem-vindo ao Meu Cofrin!'");
js = rep(js, 'O SeuCofrin funciona como um app de verdade', 'O Meu Cofrin funciona como um app de verdade');

js = `/* Meu Cofrin dentro do Ericzin's Life Plan — gerado a partir do moneyericana/index.html.
   Roda isolado numa função: não enxerga nem é enxergado pelo script do LifePlan. */
(function(){
/* o LifePlan usa Chart.js 3; o cofrin foi escrito para o 4, carregado antes com outro nome */
const Chart = window.CofrinChart;
function temaGraficos(){
  const cs = getComputedStyle(document.documentElement);
  Chart.defaults.color = cs.getPropertyValue('--text-2').trim() || '#6b7280';
  Chart.defaults.borderColor = cs.getPropertyValue('--border').trim() || '#e5e7eb';
  Chart.defaults.font.family = "'Nunito', system-ui, sans-serif";
}
temaGraficos();
if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', temaGraficos);

${js}

/* chamado pelo LifePlan quando a seção aparece: gráficos criados escondidos precisam se remedir */
window.cofrinOnShow = function(){
  temaGraficos();
  Object.values(state.charts || {}).forEach(c => { if (c && c.resize) { c.update('none'); c.resize(); } });
};
})();
`;

fs.writeFileSync(path.join(OUT, 'cofrin.css'), css);
fs.writeFileSync(path.join(OUT, 'cofrin.js'), js);
// a marcação vai direto no index.html, entre os marcadores
const idxPath = path.join(OUT, 'index.html');
const idx = fs.readFileSync(idxPath, 'utf8');
const A = '<!-- COFRIN:INICIO -->', B = '<!-- COFRIN:FIM -->';
if (!idx.includes(A) || !idx.includes(B)) throw new Error('marcadores do cofrin não estão no index.html');
fs.writeFileSync(idxPath, idx.slice(0, idx.indexOf(A) + A.length) + '\n' + html + idx.slice(idx.indexOf(B)));
console.log('ok', css.length, js.length, html.length);
