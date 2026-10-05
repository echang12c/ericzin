/* Meu Cofrin dentro do Ericzin's Life Plan — gerado a partir do moneyericana/index.html.
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

/* =====================================================================
   CONFIGURAÇÃO — cole aqui o firebaseConfig do seu projeto
   (Console Firebase → Configurações do projeto → Seus apps → Web)
   ===================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyCeMeH3yKVXG_rbXz9nzSTVMsH8XZX-B_U",
  authDomain: "moneyericana.firebaseapp.com",
  projectId: "moneyericana",
  storageBucket: "moneyericana.firebasestorage.app",
  messagingSenderId: "365886103218",
  appId: "1:365886103218:web:3bb068a075eab00e2ef3ab"
};

/* Categorias padrão — valem até o usuário personalizar as dele (aba Lançamentos → 🏷️ Categorias) */
const CATS_DESPESA = ["Moradia","Mercado","Restaurantes","Transporte","Saúde","Esportes","Pets","Lazer","Assinaturas","Educação","Viagem","Outros"];
const CATS_RECEITA = ["Salário","Extra","Investimentos","Outros"];
const CAT_COLORS = ["#00A86B","#FF5C4D","#FFAA00","#2D9CDB","#8B5CF6","#00C4B4","#FF7A00","#EC4899","#84CC16","#0EA5E9","#F43F5E","#6366F1"];

/* app com nome próprio: o LifePlan usa o app padrão (projeto ericzinlifeplan) */
const cofApp = firebase.initializeApp(firebaseConfig, 'cofrin');

/* ---- Firebase App Check (reCAPTCHA v3) ----
   Cole aqui a SITE KEY criada em Console Firebase → App Check → Apps → Web.
   Enquanto estiver vazia, o App Check fica desligado (o app funciona normalmente).
   Só ative o "enforcement" no console DEPOIS de publicar o app com a chave. */
const APP_CHECK_SITE_KEY = "6LcnU1ktAAAAAOJqplc-TzVwj5uI6PkdIXc7CXov";
if (APP_CHECK_SITE_KEY) {
  firebase.appCheck(cofApp).activate(APP_CHECK_SITE_KEY, true); // true = renova o token sozinho
}

const auth = cofApp.auth();
auth.useDeviceLanguage(); // e-mails de verificação/recuperação no idioma do aparelho
const db = cofApp.firestore();

/* ---------------- Estado ---------------- */
const state = {
  uid:null, nome:"",
  mes: mesAtual(),              // "YYYY-MM"
  dia: hojeISO(),               // "YYYY-MM-DD" (aba Metas)
  txs: [],                      // lançamentos do mês
  rotinas: [],                  // metas programadas (recorrentes por dia da semana)
  metasFeitas: {},              // {rotinaId:true} — status do dia selecionado
  bauDia: null,                 // recompensa já aberta no dia selecionado
  inventario: [],               // pets ganhos
  petsCfg: null,                // petsConfig/geral (tela Admin) — null = padrão do código
  admin: false,                 // existe admins/{uid}?
  trend: {},                    // {"YYYY-MM": {rec, desp}}
  filtroCat: null,
  camposCustom: [],             // definições de campos personalizados
  perfil: {},                   // {nome, foto} salvos no Firestore
  cats: null,                   // {despesa:[...], receita:[...]} — null = usa o padrão
  contas: [],                   // contas da casa: {id, nome, valor, dia?, pagamentos:{mes:centavosPago}}
  unsubTx:null, unsubRotinas:null, unsubMetaStatus:null, unsubInv:null, unsubCampos:null, unsubPerfil:null, unsubCats:null, unsubContas:null, unsubPetsCfg:null,
  charts:{cat:null, trend:null, rel:null, relDonut:null, relLinha:null,
           mkProd:null, mkComp:null, mkMercado:null, mkTop:null, contas:null},
};

/* ---------------- Utilidades ---------------- */
function mesAtual(){ const d=new Date(); return d.toISOString().slice(0,7); }
function isoLocal(dt){ return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`; }
function hojeISO(){ return isoLocal(new Date()); }
function shiftDia(d, delta){
  const dt=new Date(d+'T12:00');
  dt.setDate(dt.getDate()+delta);
  return isoLocal(dt);
}
function fmt(cents){ return (cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function parseValor(str){
  const n = parseFloat(String(str).replace(/\./g,'').replace(',','.'));
  if(isNaN(n) || n<=0) return null;
  return Math.round(n*100);
}
function mesLabel(m){
  const [y,mo]=m.split('-');
  return new Date(y, mo-1, 1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
}
function shiftMes(m, delta){
  const [y,mo]=m.split('-').map(Number);
  const d=new Date(y, mo-1+delta, 1);
  return d.toISOString().slice(0,7);
}
function toast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),2200);
}
function col(path){ return db.collection('users').doc(state.uid).collection(path); }

/* ---------------- Auth ---------------- */
function erroAuthPT(ex){
  const c=(ex&&ex.code)||'';
  if(c.includes('email-already-in-use')) return 'Não deu para criar a conta com este e-mail. Se você já tem cadastro, toque em "Entrar".';
  if(c.includes('invalid-email')) return 'E-mail inválido — confira a digitação.';
  if(c.includes('weak-password')||c.includes('password-does-not-meet-requirements')) return 'Senha muito fraca — use pelo menos 6 caracteres.';
  if(c.includes('missing-password')) return 'Digite a senha.';
  if(c.includes('user-disabled')) return 'Esta conta está desativada.';
  if(c.includes('wrong-password')||c.includes('invalid-credential')||c.includes('invalid-login')||c.includes('user-not-found')) return 'E-mail ou senha incorretos.';
  if(c.includes('too-many-requests')) return 'Muitas tentativas — por segurança, aguarde alguns minutos e tente de novo.';
  if(c.includes('requires-recent-login')) return 'Por segurança, saia e entre de novo antes desta ação.';
  if(c.includes('network-request-failed')) return 'Sem conexão — confira a internet e tente de novo.';
  console.error('auth:', ex); // detalhe técnico só no console, nunca na tela
  return 'Algo deu errado. Tente de novo em instantes.';
}

document.getElementById('loginForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const err=document.getElementById('loginErr'); err.textContent='';
  const btn=e.target.querySelector('button[type="submit"]');
  btn.disabled=true;
  try{
    await auth.signInWithEmailAndPassword(
      document.getElementById('loginEmail').value.trim(),
      document.getElementById('loginPass').value
    );
  }catch(ex){ err.textContent=erroAuthPT(ex); }
  btn.disabled=false;
});

/* "Esqueci minha senha" — resposta neutra: não revela se o e-mail tem cadastro */
document.getElementById('btnEsqueci').onclick=async ()=>{
  const email=document.getElementById('loginEmail').value.trim();
  const err=document.getElementById('loginErr');
  if(!email){ err.textContent='Digite seu e-mail no campo acima e toque de novo em "Esqueci minha senha".'; return; }
  err.textContent='';
  try{ await auth.sendPasswordResetEmail(email); }
  catch(ex){
    const c=String(ex&&ex.code||'');
    if(!c.includes('user-not-found')){ err.textContent=erroAuthPT(ex); return; }
  }
  toast('Se este e-mail tiver cadastro, o link de redefinição chega em instantes 📬');
};

let modoCadastro=false;
document.getElementById('loginSwap').onclick=()=>{
  modoCadastro=!modoCadastro;
  document.getElementById('loginForm').classList.toggle('hidden', modoCadastro);
  document.getElementById('cadForm').classList.toggle('hidden', !modoCadastro);
  document.getElementById('loginSwap').innerHTML =
    modoCadastro ? 'Já tem conta? <b>Entrar</b>' : 'Não tem conta? <b>Criar cadastro</b>';
};

document.getElementById('cadForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const err=document.getElementById('cadErr'); err.textContent='';
  const nome=document.getElementById('cadNome').value.trim();
  const p1=document.getElementById('cadPass').value;
  const p2=document.getElementById('cadPass2').value;
  if(p1!==p2){ err.textContent='As senhas não conferem.'; return; }
  const btn=e.target.querySelector('button[type="submit"]');
  btn.disabled=true;
  try{
    const cred=await auth.createUserWithEmailAndPassword(document.getElementById('cadEmail').value.trim(), p1);
    await cred.user.updateProfile({displayName:nome});
    state.nome=nome;
    // guarda a data do aceite da política p/ gravar no perfil no 1º acesso verificado
    localStorage.setItem('aceitePend_'+cred.user.uid, new Date().toISOString());
    await enviarVerificacao(cred.user); // o doc de perfil é criado no 1º acesso verificado
    toast('Conta criada! Agora confirme seu e-mail 📬');
  }catch(ex){ err.textContent=erroAuthPT(ex); }
  btn.disabled=false;
});

document.getElementById('btnLogout').addEventListener('click',()=>auth.signOut());

/* --- Verificação de e-mail: o app só abre com e-mail confirmado --- */
let verifyPoll=null, verifEnviadaEm=0;

async function enviarVerificacao(user){
  const agora=Date.now();
  if(agora-verifEnviadaEm<60000) return false; // no máx. 1 envio por minuto
  await user.sendEmailVerification();
  verifEnviadaEm=agora;
  return true;
}

function mostrarVerifyView(user){
  document.getElementById('verifyEmail').textContent=user.email;
  document.getElementById('appView').classList.add('hidden');
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('verifyView').classList.remove('hidden');
  // conta antiga que nunca recebeu o link (ou recarregou a página): envia sem precisar clicar
  enviarVerificacao(user).catch(()=>{});
  clearInterval(verifyPoll);
  verifyPoll=setInterval(()=>checarVerificacao(false), 5000);
}

async function checarVerificacao(manual){
  const user=auth.currentUser;
  if(!user){ clearInterval(verifyPoll); return; }
  try{ await user.reload(); }catch(e){ return; }
  if(user.emailVerified){
    clearInterval(verifyPoll); verifyPoll=null;
    await user.getIdToken(true); // renova o token p/ as security rules enxergarem email_verified
    document.getElementById('verifyView').classList.add('hidden');
    entrarNoApp(user);
    toast('E-mail confirmado! 🎉');
  }else if(manual){
    document.getElementById('verifyMsg').textContent='Ainda não consta como confirmado. Abriu o link do e-mail?';
  }
}

document.getElementById('btnVerifyCheck').onclick=()=>checarVerificacao(true);
document.getElementById('btnVerifyResend').onclick=async ()=>{
  const user=auth.currentUser; if(!user) return;
  const msg=document.getElementById('verifyMsg');
  try{
    msg.textContent = await enviarVerificacao(user)
      ? 'E-mail reenviado! Confira a caixa de entrada e o spam.'
      : 'Acabei de enviar — aguarde um minutinho antes de reenviar.';
  }catch(ex){ msg.textContent=erroAuthPT(ex); }
};
document.getElementById('btnVerifyLogout').onclick=()=>auth.signOut();

function entrarNoApp(user){
  state.uid=user.uid;
  state.nome=user.displayName||(user.email||'').split('@')[0];
  renderPerfilChip();
  document.getElementById('loginView').classList.add('hidden');
  document.getElementById('appView').classList.remove('hidden');
  carregarMes();
  escutarCats();
  escutarContas();
  escutarRotinas();
  escutarDiaMetas();
  escutarInventario();
  escutarPetsCfg();
  verificarAdmin();
  escutarCampos();
  escutarPerfil();
  carregarTendencia();
  if(!localStorage.getItem('guiaVisto_'+state.uid)){
    localStorage.setItem('guiaVisto_'+state.uid,'1');
    abrirGuia(0);
  }
}

auth.onAuthStateChanged(user=>{
  if(user && !user.emailVerified){
    mostrarVerifyView(user);
  }else if(user){
    document.getElementById('verifyView').classList.add('hidden');
    entrarNoApp(user);
  }else{
    state.uid=null; state.perfil={}; catMap=null;
    clearInterval(verifyPoll); verifyPoll=null;
    document.getElementById('verifyMsg').textContent='';
    if(state.unsubTx)state.unsubTx(); if(state.unsubCats)state.unsubCats();
    if(state.unsubContas)state.unsubContas(); state.contas=[];
    if(state.unsubRotinas)state.unsubRotinas(); if(state.unsubMetaStatus)state.unsubMetaStatus(); if(state.unsubInv)state.unsubInv();
    if(state.unsubCampos)state.unsubCampos(); if(state.unsubPerfil)state.unsubPerfil();
    if(state.unsubPetsCfg)state.unsubPetsCfg(); state.admin=false; adm.rasc=null; adm.sujo=false;
    document.getElementById('tabAdminBtn').classList.add('hidden');
    document.getElementById('appView').classList.add('hidden');
    document.getElementById('verifyView').classList.add('hidden');
    document.getElementById('loginView').classList.remove('hidden');
  }
});

/* ---------------- Navegação de mês / abas ---------------- */
document.getElementById('prevMonth').onclick=()=>{ state.mes=shiftMes(state.mes,-1); carregarMes(); };
document.getElementById('nextMonth').onclick=()=>{ state.mes=shiftMes(state.mes, 1); carregarMes(); };

const tabsMenu=document.getElementById('tabsMenu');
const tabsToggle=document.getElementById('tabsToggle');
tabsToggle.onclick=()=>{
  const open=tabsMenu.classList.toggle('open');
  tabsToggle.setAttribute('aria-expanded', open);
};
document.addEventListener('click', e=>{
  if(!tabsMenu.contains(e.target)){
    tabsMenu.classList.remove('open');
    tabsToggle.setAttribute('aria-expanded','false');
  }
});

document.querySelectorAll('nav.tabs button').forEach(b=>{
  b.onclick=()=>{
    document.querySelectorAll('nav.tabs button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    ['dash','tx','relat','mercado','contas','metas','pets','admin'].forEach(t=>
      document.getElementById('tab-'+t).classList.toggle('hidden', t!==b.dataset.tab));
    document.getElementById('tabsToggleLabel').textContent=b.textContent.trim();
    tabsMenu.classList.remove('open');
    tabsToggle.setAttribute('aria-expanded','false');
    if(b.dataset.tab==='relat') abrirRelatorios();
    if(b.dataset.tab==='mercado') abrirMercado();
    if(b.dataset.tab==='contas') abrirContas();
    if(b.dataset.tab==='admin') abrirAdmin();
  };
});

/* ---------------- Dados do mês ---------------- */
function carregarMes(){
  document.getElementById('monthLabel').textContent=mesLabel(state.mes);
  renderContasList();
  if(state.unsubTx)state.unsubTx();

  state.unsubTx = col('tx').where('mes','==',state.mes)
    .onSnapshot(snap=>{
      state.txs = snap.docs.map(d=>({id:d.id,...d.data()}))
        .sort((a,b)=> b.data.localeCompare(a.data));
      renderTudo();
      carregarTendencia(); // mantém gráfico coerente com edições
    });
}

/* ---------------- Tendência (6 meses) ---------------- */
async function carregarTendencia(){
  const meses=[]; for(let i=5;i>=0;i--) meses.push(shiftMes(state.mes,-i));
  const snap = await col('tx').where('mes','in',meses).get();
  const agg={}; meses.forEach(m=>agg[m]={rec:0,desp:0});
  snap.docs.forEach(d=>{
    const t=d.data();
    if(!agg[t.mes]) return;
    if(t.tipo==='receita') agg[t.mes].rec+=t.valor; else agg[t.mes].desp+=t.valor;
  });
  state.trend=agg;
  renderTrendChart();
}

/* ---------------- Render ---------------- */
function renderTudo(){ renderDash(); renderTx(); }

function totais(){
  let rec=0,desp=0; const porCat={};
  state.txs.forEach(t=>{
    if(t.tipo==='receita') rec+=t.valor;
    else{ desp+=t.valor; porCat[t.cat]=(porCat[t.cat]||0)+t.valor; }
  });
  return {rec,desp,porCat};
}

function renderDash(){
  const {rec,desp,porCat}=totais();
  const saldo=rec-desp;
  document.getElementById('kSaldo').textContent=fmt(saldo);
  document.getElementById('cardSaldo').classList.toggle('negativo', saldo<0);
  document.getElementById('kSaldoSub').textContent=
    saldo>=0 ? 'Dentro do verde este mês 🟢' : 'Gastando mais do que entra 🔴';
  document.getElementById('kReceitas').textContent=fmt(rec);
  document.getElementById('kDespesas').textContent=fmt(desp);

  // top 5 gastos
  const top=[...state.txs].filter(t=>t.tipo==='despesa').sort((a,b)=>b.valor-a.valor).slice(0,5);
  const box=document.getElementById('topGastos');
  box.innerHTML = top.length ? top.map(t=>txHTML(t)).join('') : '<div class="empty">Sem lançamentos ainda.</div>';
  ligarAcoes(box);

  // gráfico categorias
  const labels=Object.keys(porCat).sort((a,b)=>porCat[b]-porCat[a]);
  const data=labels.map(l=>porCat[l]/100);
  if(state.charts.cat) state.charts.cat.destroy();
  state.charts.cat=new Chart(document.getElementById('chartCat'),{
    type:'doughnut',
    data:{labels,datasets:[{data,backgroundColor:labels.map((_,i)=>CAT_COLORS[i%CAT_COLORS.length]),borderWidth:0}]},
    options:{maintainAspectRatio:false,cutout:'62%',
      plugins:{legend:{position:'right',labels:{boxWidth:12,font:{family:'Schibsted Grotesk'}}},
      tooltip:{callbacks:{label:c=>` ${c.label}: ${c.parsed.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`}}}}
  });
}

function renderTrendChart(){
  const meses=Object.keys(state.trend);
  const lbl=meses.map(m=>{const[y,mo]=m.split('-');return new Date(y,mo-1,1).toLocaleDateString('pt-BR',{month:'short'});});
  if(state.charts.trend) state.charts.trend.destroy();
  state.charts.trend=new Chart(document.getElementById('chartTrend'),{
    type:'bar',
    data:{labels:lbl,datasets:[
      {label:'Receitas',data:meses.map(m=>state.trend[m].rec/100),backgroundColor:'#00C87B',borderRadius:6},
      {label:'Despesas',data:meses.map(m=>state.trend[m].desp/100),backgroundColor:'#FF5C4D',borderRadius:6},
    ]},
    options:{maintainAspectRatio:false,
      plugins:{legend:{labels:{boxWidth:12,font:{family:'Schibsted Grotesk'}}},
      tooltip:{callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`}}},
      scales:{y:{ticks:{callback:v=>'R$ '+v.toLocaleString('pt-BR')}}}}
  });
}

const PAG_LABEL={credito:'💳 Crédito', debito:'💳 Débito', pix:'⚡ PIX'};

function customResumo(t){
  if(!t.custom) return '';
  return state.camposCustom
    .filter(c=>t.custom[c.id]!==undefined && t.custom[c.id]!==null && t.custom[c.id]!=='')
    .map(c=>{
      const v=t.custom[c.id];
      if(c.tipo==='monetario') return `${esc(c.nome)}: ${fmt(v)}`;
      if(c.tipo==='data'){ const[,m,d]=String(v).split('-'); return `${esc(c.nome)}: ${d}/${m}`; }
      return `${esc(c.nome)}: ${esc(v)}`;
    }).join(' · ');
}

function txHTML(t, sel){
  const [y,m,d]=t.data.split('-');
  const sinal=t.tipo==='receita'?'+':'−';
  const cls=t.tipo==='receita'?'pos':'neg';
  const cust=customResumo(t);
  return `<div class="txItem" data-id="${t.id}" title="${sel?'Toque para selecionar':'Toque para editar'}">
    ${sel?`<input type="checkbox" class="txSelChk"${txSelIds.has(t.id)?' checked':''}>`:''}
    <div class="txDate"><b>${d}</b>${new Date(y,m-1,d).toLocaleDateString('pt-BR',{month:'short'}).replace('.','')}</div>
    <div class="txInfo"><div class="d">${esc(t.desc)}</div>
      <div class="c">${esc(t.cat)}${t.pagamento?` <span class="payTag">${PAG_LABEL[t.pagamento]||esc(t.pagamento)}</span>`:''}${cust?' · '+cust:''}</div></div>
    <div class="txVal ${cls}">${sinal} ${fmt(t.valor)}</div>
    <button class="txDel" title="Excluir">✕</button>
  </div>`;
}
function esc(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function renderTx(){
  // filtro por categoria
  const cats=[...new Set(state.txs.map(t=>t.cat))].sort();
  const fbox=document.getElementById('txFilter');
  fbox.innerHTML = ['<button class="chip'+(state.filtroCat?'' :' active')+'" data-c="">Todas</button>',
    ...cats.map(c=>`<button class="chip${state.filtroCat===c?' active':''}" data-c="${esc(c)}">${esc(c)}</button>`)].join('');
  fbox.querySelectorAll('.chip').forEach(ch=>ch.onclick=()=>{state.filtroCat=ch.dataset.c||null;renderTx();});

  const list=document.getElementById('txList');
  const txs=txsVisiveis();
  // remove da seleção ids que já saíram da lista (ex.: excluídos em outro aparelho)
  [...txSelIds].forEach(id=>{ if(!state.txs.some(t=>t.id===id)) txSelIds.delete(id); });
  list.classList.toggle('selMode', txSelMode);
  list.innerHTML = txs.length ? txs.map(t=>txHTML(t, txSelMode)).join('') : '<div class="empty">Nenhum lançamento neste mês. Toque em + para adicionar.</div>';
  ligarAcoes(list, txSelMode);
  atualizarSelBar();
}

function ligarAcoes(container, selMode){
  container.querySelectorAll('.txItem').forEach(el=>{
    const id=el.dataset.id;
    el.onclick=e=>{
      if(e.target.closest('.txDel')) return;
      if(selMode){
        const chk=el.querySelector('.txSelChk');
        if(e.target!==chk) chk.checked=!chk.checked;
        if(chk.checked) txSelIds.add(id); else txSelIds.delete(id);
        atualizarSelBar();
        return;
      }
      const t=state.txs.find(x=>x.id===id);
      if(t) abrirTxModal(t);
    };
    el.querySelector('.txDel').onclick=async e=>{
      e.stopPropagation();
      if(confirm('Excluir este lançamento?')){ await col('tx').doc(id).delete(); toast('Lançamento excluído'); }
    };
  });
}

/* ---------------- Exclusão em massa de lançamentos ---------------- */
let txSelMode=false;
const txSelIds=new Set();
function txsVisiveis(){ return state.filtroCat? state.txs.filter(t=>t.cat===state.filtroCat) : state.txs; }
function atualizarSelBar(){
  document.getElementById('txSelBar').classList.toggle('hidden', !txSelMode);
  if(!txSelMode) return;
  const vis=txsVisiveis();
  document.getElementById('txSelCount').textContent=`${txSelIds.size} selecionado${txSelIds.size===1?'':'s'}`;
  document.getElementById('txSelAll').checked = vis.length>0 && vis.every(t=>txSelIds.has(t.id));
  document.getElementById('btnTxDelSel').disabled = txSelIds.size===0;
}
async function excluirTxIds(ids, msg){
  if(!ids.length){ toast('Nenhum lançamento para excluir'); return; }
  if(!confirm(msg)) return;
  try{
    for(let i=0;i<ids.length;i+=400){
      const batch=db.batch();
      ids.slice(i,i+400).forEach(id=>batch.delete(col('tx').doc(id)));
      await batch.commit();
    }
    txSelMode=false; txSelIds.clear();
    toast(`${ids.length} lançamento${ids.length>1?'s':''} excluído${ids.length>1?'s':''}`);
  }catch(ex){ toast('Erro ao excluir: '+ex.message); }
}
document.getElementById('btnTxSel').onclick=()=>{ txSelMode=!txSelMode; txSelIds.clear(); renderTx(); };
document.getElementById('btnTxSelCancel').onclick=()=>{ txSelMode=false; txSelIds.clear(); renderTx(); };
document.getElementById('txSelAll').onchange=e=>{
  const vis=txsVisiveis();
  if(e.target.checked) vis.forEach(t=>txSelIds.add(t.id)); else vis.forEach(t=>txSelIds.delete(t.id));
  renderTx();
};
document.getElementById('btnTxDelSel').onclick=()=>
  excluirTxIds([...txSelIds], `Excluir ${txSelIds.size} lançamento${txSelIds.size===1?'':'s'} selecionado${txSelIds.size===1?'':'s'}? Essa ação não pode ser desfeita.`);
document.getElementById('btnTxDelAll').onclick=()=>{
  const vis=txsVisiveis();
  const filtro=state.filtroCat? ` da categoria "${state.filtroCat}"` : '';
  excluirTxIds(vis.map(t=>t.id), `Apagar TODOS os ${vis.length} lançamentos${filtro} de ${mesLabel(state.mes)}? Essa ação não pode ser desfeita.`);
};

/* ---------------- Categorias personalizadas ----------------
   Ficam em users/{uid}/config/categorias: {despesa:[...], receita:[...]}.
   Enquanto o doc não existe, valem as listas padrão. */
function catsD(){ return (state.cats&&state.cats.despesa)||CATS_DESPESA; }
function catsR(){ return (state.cats&&state.cats.receita)||CATS_RECEITA; }
function catsDe(tipo){ return tipo==='receita'? catsR() : catsD(); }

function escutarCats(){
  if(state.unsubCats)state.unsubCats();
  state.unsubCats = col('config').doc('categorias').onSnapshot(doc=>{
    state.cats = doc.exists ? doc.data() : null;
    renderCatModal();
    renderTudo();
  });
}
async function salvarCats(despesa, receita){
  if(!despesa.includes('Outros')) despesa=[...despesa,'Outros'];
  if(!receita.includes('Outros')) receita=[...receita,'Outros'];
  await col('config').doc('categorias').set({despesa, receita});
}

function renderCatModal(){
  const item=(tipo,c)=>`<div class="campoItem" data-tipo="${tipo}" data-cat="${esc(c)}">
    <div class="txInfo"><div class="d">${esc(c)}</div></div>
    ${c==='Outros' ? '' : `<button type="button" class="catEditBtn" data-act="ren" title="Renomear">✎</button>
    <button type="button" class="txDel" data-act="del" title="Excluir">✕</button>`}
  </div>`;
  document.getElementById('catListDesp').innerHTML=catsD().map(c=>item('despesa',c)).join('');
  document.getElementById('catListRec').innerHTML=catsR().map(c=>item('receita',c)).join('');
  document.querySelectorAll('#catListDesp [data-act],#catListRec [data-act]').forEach(b=>{
    b.onclick=()=>{
      const el=b.closest('.campoItem');
      if(b.dataset.act==='ren') renomearCat(el.dataset.tipo, el.dataset.cat);
      else excluirCat(el.dataset.tipo, el.dataset.cat);
    };
  });
}

async function renomearCat(tipo, antiga){
  const nova=(prompt(`Novo nome para a categoria "${antiga}":`, antiga)||'').trim().slice(0,40);
  if(!nova || nova===antiga) return;
  const lista=[...catsDe(tipo)];
  if(lista.some(c=>c.toLowerCase()===nova.toLowerCase())){ toast('Já existe uma categoria com esse nome'); return; }
  const i=lista.indexOf(antiga); if(i<0) return;
  lista[i]=nova;
  try{
    await salvarCats(tipo==='despesa'?lista:[...catsD()], tipo==='receita'?lista:[...catsR()]);
    // atualiza os lançamentos existentes e a memória de categorias
    const [txSnap, cmSnap]=await Promise.all([
      col('tx').where('cat','==',antiga).get(),
      col('catMap').where('cat','==',antiga).get()
    ]);
    const ops=[
      ...txSnap.docs.map(d=>({ref:d.ref, dados:{cat:nova}})),
      ...cmSnap.docs.map(d=>({ref:d.ref, dados:{cat:nova, atualizadoEm:firebase.firestore.FieldValue.serverTimestamp()}}))
    ];
    for(let k=0;k<ops.length;k+=400){
      const batch=db.batch();
      ops.slice(k,k+400).forEach(o=>batch.update(o.ref,o.dados));
      await batch.commit();
    }
    toast(txSnap.size
      ? `Categoria renomeada — ${txSnap.size} lançamento${txSnap.size>1?'s':''} atualizado${txSnap.size>1?'s':''}`
      : 'Categoria renomeada');
  }catch(ex){ toast('Erro ao renomear: '+ex.message); }
}

async function excluirCat(tipo, nome){
  if(nome==='Outros') return;
  if(!confirm(`Excluir a categoria "${nome}"? Os lançamentos já feitos continuam com esse nome — ela só deixa de aparecer nas opções.`)) return;
  try{
    const lista=catsDe(tipo).filter(c=>c!==nome);
    await salvarCats(tipo==='despesa'?lista:[...catsD()], tipo==='receita'?lista:[...catsR()]);
    toast('Categoria excluída');
  }catch(ex){ toast('Erro ao excluir: '+ex.message); }
}

document.getElementById('btnCats').onclick=()=>{
  renderCatModal();
  document.getElementById('catModal').classList.remove('hidden');
};
document.getElementById('catForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const nome=document.getElementById('catNome').value.trim();
  const tipo=document.getElementById('catTipo').value;
  if(!nome) return;
  const lista=catsDe(tipo);
  if(lista.some(c=>c.toLowerCase()===nome.toLowerCase())){ toast('Essa categoria já existe'); return; }
  try{
    // a nova entra antes de "Outros", que fica sempre por último
    const nova=[...lista.filter(c=>c!=='Outros'), nome, 'Outros'];
    await salvarCats(tipo==='despesa'?nova:[...catsD()], tipo==='receita'?nova:[...catsR()]);
    document.getElementById('catNome').value='';
    toast(`Categoria "${nome}" criada! 🏷️`);
  }catch(ex){ toast('Erro ao criar: '+ex.message); }
});

/* ---------------- Relatórios ----------------
   Os filtros do topo (período, de/até e categoria) valem para
   todos os gráficos e tabelas da aba ao mesmo tempo. */
const rel={modo:'mensal', cat:''};

function abrirRelatorios(){
  if(!document.getElementById('relDe').value){
    document.getElementById('relDe').value=shiftMes(state.mes,-5);
    document.getElementById('relAte').value=state.mes;
    document.getElementById('relMes').value=state.mes;
  }
  preencherRelCats();
  gerarRelatorio();
}
function preencherRelCats(){
  const sel=document.getElementById('relCatSel');
  const atual=rel.cat;
  const todas=[...new Set([...catsD(),...catsR()])];
  sel.innerHTML='<option value="">— todas as categorias —</option>'+
    todas.map(c=>`<option value="${esc(c)}"${c===atual?' selected':''}>${esc(c)}</option>`).join('');
}
function relSegAtivo(segId, attr, val){
  document.querySelectorAll('#'+segId+' button').forEach(b=>
    b.className = b.dataset[attr]===val ? 'selInc' : '');
}
document.querySelectorAll('#relModo button').forEach(b=>{
  b.onclick=()=>{
    rel.modo=b.dataset.m;
    relSegAtivo('relModo','m',rel.modo);
    document.getElementById('relPeriodoMensal').classList.toggle('hidden', rel.modo!=='mensal');
    document.getElementById('relPeriodoDiario').classList.toggle('hidden', rel.modo!=='diario');
    gerarRelatorio();
  };
});
document.getElementById('relDe').onchange=gerarRelatorio;
document.getElementById('relAte').onchange=gerarRelatorio;
document.getElementById('relMes').onchange=gerarRelatorio;
document.getElementById('relCatSel').onchange=e=>{ rel.cat=e.target.value; gerarRelatorio(); };

function mesesEntre(ini,fim){
  const out=[]; let m=ini;
  while(m<=fim && out.length<60){ out.push(m); m=shiftMes(m,1); }
  return out;
}
function mesCurto(m){
  const [y,mo]=m.split('-');
  return new Date(y,mo-1,1).toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
}
function mkChart(slot, canvasId, cfg){
  if(state.charts[slot]) state.charts[slot].destroy();
  state.charts[slot]=new Chart(document.getElementById(canvasId), cfg);
}
function relBoxVisivel(boxId, slot, on){
  document.getElementById(boxId).classList.toggle('hidden', !on);
  if(!on && state.charts[slot]){ state.charts[slot].destroy(); state.charts[slot]=null; }
}
/* eixo do tempo do relatório: meses do intervalo ou dias do mês escolhido */
function relBuckets(mIni, mFim){
  if(rel.modo==='mensal') return {labels:mesesEntre(mIni,mFim), chave:t=>t.mes};
  const nDias=new Date(+mIni.slice(0,4), +mIni.slice(5,7), 0).getDate();
  return {labels:[...Array(nDias)].map((_,i)=>mIni+'-'+String(i+1).padStart(2,'0')), chave:t=>t.data};
}
function relBucketLbl(l){ return rel.modo==='mensal' ? mesCurto(l) : l.slice(8); }
/* totais por categoria de um tipo, em ordem decrescente (define a ordem das cores) */
function aggCats(txs, tipo){
  const m={};
  txs.forEach(t=>{
    if(t.tipo!==tipo) return;
    if(!m[t.cat]) m[t.cat]={total:0,qtd:0};
    m[t.cat].total+=t.valor; m[t.cat].qtd++;
  });
  return Object.entries(m).sort((a,b)=>b[1].total-a[1].total);
}
const moedaCB=v=>'R$ '+Number(v).toLocaleString('pt-BR');
const relTooltip={callbacks:{label:c=>` ${c.dataset.label||c.label}: ${(c.parsed.y!==undefined?c.parsed.y:c.parsed).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`}};

let relBusy=false;
async function gerarRelatorio(){
  if(!state.uid || relBusy) return;
  // campo de período vazio nunca trava o relatório: entra o padrão no lugar
  let mIni,mFim;
  if(rel.modo==='mensal'){
    mIni=document.getElementById('relDe').value;
    mFim=document.getElementById('relAte').value;
    if(!mIni){ mIni=shiftMes(state.mes,-5); document.getElementById('relDe').value=mIni; }
    if(!mFim){ mFim=state.mes; document.getElementById('relAte').value=mFim; }
    if(mIni>mFim){ [mIni,mFim]=[mFim,mIni];
      document.getElementById('relDe').value=mIni;
      document.getElementById('relAte').value=mFim;
    }
  }else{
    mIni=mFim=document.getElementById('relMes').value;
    if(!mIni){ mIni=mFim=state.mes; document.getElementById('relMes').value=mIni; }
  }
  relBusy=true;
  const tabela=document.getElementById('relTabela');
  tabela.innerHTML='<div class="empty">Montando o relatório…</div>';
  try{
    const snap=await col('tx').where('mes','>=',mIni).where('mes','<=',mFim).get();
    let txs=snap.docs.map(d=>d.data());
    if(rel.cat) txs=txs.filter(t=>t.cat===rel.cat);

    let rec=0,desp=0;
    txs.forEach(t=>{ if(t.tipo==='receita') rec+=t.valor; else desp+=t.valor; });
    document.getElementById('relRec').textContent=fmt(rec);
    document.getElementById('relDesp').textContent=fmt(desp);
    const saldoEl=document.getElementById('relSaldo');
    saldoEl.textContent=fmt(rec-desp);
    saldoEl.className='val '+(rec-desp>=0?'pos':'neg');

    if(!txs.length){
      mkChart('rel','chartRel',{type:'bar',data:{labels:[],datasets:[]},options:{maintainAspectRatio:false}});
      relBoxVisivel('relDonutBox','relDonut',false);
      relBoxVisivel('relLinhaBox','relLinha',false);
      document.getElementById('relChartTitle').textContent='Evolução';
      tabela.innerHTML='<div class="empty">Nenhum lançamento no período selecionado.</div>';
      return;
    }

    const bk=relBuckets(mIni,mFim);
    relEvolucao(txs, bk);        // gráfico 1: receitas × despesas no tempo
    relDistribuicao(txs);        // gráfico 2: rosca por categoria (some com categoria específica)
    relLinhasCategorias(txs, bk);// gráfico 3: linhas categoria a categoria
    tabela.innerHTML = tabelaTempoHTML(bk) + (rel.cat ? '' : tabelasCategoriaHTML(txs));
  }catch(ex){
    tabela.innerHTML='<div class="empty">Não consegui montar o relatório agora. Tente de novo.</div>';
    console.error('relatorio:', ex);
  }finally{ relBusy=false; }
}

/* gráfico 1: receitas × despesas ao longo do tempo (respeita o filtro de categoria) */
function relEvolucao(txs, bk){
  const agg={}; bk.labels.forEach(l=>agg[l]={rec:0,desp:0});
  txs.forEach(t=>{
    const b=agg[bk.chave(t)]; if(!b) return;
    if(t.tipo==='receita') b.rec+=t.valor; else b.desp+=t.valor;
  });
  bk.agg=agg; // reaproveitado pela tabela de detalhes
  document.getElementById('relChartTitle').textContent=
    (rel.modo==='mensal'?'Evolução mensal':'Movimento por dia')+(rel.cat?` — ${rel.cat}`:'');
  mkChart('rel','chartRel',{type:'bar',
    data:{labels:bk.labels.map(relBucketLbl),datasets:[
      {label:'Receitas',data:bk.labels.map(l=>agg[l].rec/100),backgroundColor:'#00C87B',borderRadius:5},
      {label:'Despesas',data:bk.labels.map(l=>agg[l].desp/100),backgroundColor:'#FF5C4D',borderRadius:5},
    ]},
    options:{maintainAspectRatio:false,
      plugins:{legend:{labels:{boxWidth:12,font:{family:'Schibsted Grotesk'}}},tooltip:relTooltip},
      scales:{y:{ticks:{callback:moedaCB}}}}
  });
}

/* tabela de detalhes por período (usa o agg calculado em relEvolucao) */
function tabelaTempoHTML(bk){
  const linhas=bk.labels.filter(l=>bk.agg[l].rec||bk.agg[l].desp);
  const nomeLinha=l=>rel.modo==='mensal'
    ? mesLabel(l)
    : new Date(l+'T12:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'});
  let totR=0,totD=0;
  const rows=linhas.map(l=>{
    const b=bk.agg[l]; totR+=b.rec; totD+=b.desp;
    const s=b.rec-b.desp;
    return `<tr><td>${esc(nomeLinha(l))}</td>
      <td class="num pos">${b.rec?fmt(b.rec):'—'}</td>
      <td class="num neg">${b.desp?fmt(b.desp):'—'}</td>
      <td class="num ${s>=0?'pos':'neg'}">${fmt(s)}</td></tr>`;
  }).join('');
  return `<div class="relGrupo">Por ${rel.modo==='mensal'?'mês':'dia'}${rel.cat?` — ${esc(rel.cat)}`:''}</div>
  <div class="relTableWrap"><table class="relTable">
    <thead><tr><th>${rel.modo==='mensal'?'Mês':'Dia'}</th><th class="num">Receitas</th><th class="num">Despesas</th><th class="num">Saldo</th></tr></thead>
    <tbody>${rows}
    <tr class="totRow"><td>Total</td><td class="num pos">${fmt(totR)}</td><td class="num neg">${fmt(totD)}</td>
      <td class="num ${totR-totD>=0?'pos':'neg'}">${fmt(totR-totD)}</td></tr></tbody>
  </table></div>`;
}

/* gráfico 2: rosca da distribuição por categoria (some quando há categoria filtrada) */
function relDistribuicao(txs){
  if(rel.cat){ relBoxVisivel('relDonutBox','relDonut',false); return; }
  const despCats=aggCats(txs,'despesa');
  const base=despCats.length ? despCats : aggCats(txs,'receita');
  if(!base.length){ relBoxVisivel('relDonutBox','relDonut',false); return; }
  document.getElementById('relDonutTitle').textContent=
    'Distribuição — '+(despCats.length?'despesas':'receitas')+' por categoria';
  relBoxVisivel('relDonutBox','relDonut',true);
  mkChart('relDonut','chartRelDonut',{type:'doughnut',
    data:{labels:base.map(([c])=>c),
      datasets:[{data:base.map(([,v])=>v.total/100),
        backgroundColor:base.map((_,i)=>CAT_COLORS[i%CAT_COLORS.length]),borderWidth:0}]},
    options:{maintainAspectRatio:false,cutout:'62%',
      plugins:{legend:{position:'right',labels:{boxWidth:12,font:{family:'Schibsted Grotesk'}}},tooltip:relTooltip}}
  });
}

/* gráfico 3: linhas — eixo X com os meses (ou dias), uma linha por categoria */
function relLinhasCategorias(txs, bk){
  const tipoBase = txs.some(t=>t.tipo==='despesa') ? 'despesa' : 'receita';
  const base=aggCats(txs, tipoBase); // ordem decrescente = cores iguais às da rosca
  if(!base.length){ relBoxVisivel('relLinhaBox','relLinha',false); return; }
  const idx={}; bk.labels.forEach((l,i)=>idx[l]=i);
  const serie={}; base.forEach(([c])=>serie[c]=bk.labels.map(()=>0));
  txs.forEach(t=>{
    if(t.tipo!==tipoBase || !serie[t.cat]) return;
    const i=idx[bk.chave(t)]; if(i!==undefined) serie[t.cat][i]+=t.valor;
  });
  document.getElementById('relLinhaTitle').textContent=
    (tipoBase==='despesa'?'Despesas':'Receitas')+' por categoria — '+(rel.modo==='mensal'?'mês a mês':'dia a dia');
  relBoxVisivel('relLinhaBox','relLinha',true);
  mkChart('relLinha','chartRelLinha',{type:'line',
    data:{labels:bk.labels.map(relBucketLbl),
      datasets:base.map(([c],i)=>({label:c, data:serie[c].map(v=>v/100),
        borderColor:CAT_COLORS[i%CAT_COLORS.length],
        backgroundColor:CAT_COLORS[i%CAT_COLORS.length],
        borderWidth:2, pointRadius:3, tension:.3}))},
    options:{maintainAspectRatio:false,
      plugins:{legend:{labels:{boxWidth:12,font:{family:'Schibsted Grotesk'}}},tooltip:relTooltip},
      scales:{y:{ticks:{callback:moedaCB}}}}
  });
}

/* tabelas de detalhes por categoria (despesas e receitas) */
function tabelasCategoriaHTML(txs){
  const grupo=(titulo, cats, cls)=>{
    if(!cats.length) return '';
    const tot=cats.reduce((a,[,v])=>a+v.total,0);
    return `<div class="relGrupo">${titulo}</div><div class="relTableWrap"><table class="relTable">
      <thead><tr><th>Categoria</th><th class="num">Total</th><th class="num">%</th><th class="num">Lançamentos</th></tr></thead>
      <tbody>${cats.map(([c,v])=>`<tr><td>${esc(c)}</td>
        <td class="num ${cls}">${fmt(v.total)}</td>
        <td class="num">${(v.total/tot*100).toFixed(1).replace('.',',')}%</td>
        <td class="num">${v.qtd}</td></tr>`).join('')}
      <tr class="totRow"><td>Total</td><td class="num ${cls}">${fmt(tot)}</td><td class="num">100%</td>
        <td class="num">${cats.reduce((a,[,v])=>a+v.qtd,0)}</td></tr></tbody>
    </table></div>`;
  };
  return grupo('Despesas por categoria', aggCats(txs,'despesa'), 'neg')
       + grupo('Receitas por categoria', aggCats(txs,'receita'), 'pos');
}

/* ====================================================================
   MERCADO — notas fiscais, preço por produto e comparação entre lojas
   Modelo de dados: users/{uid}/compras/{id}
     { mercado, mercadoKey, data, mes, itens:[...], subtotal, desconto,
       total, txId, origem, criadoEm }
   Cada item: { nome, qtd, un, unit, desconto, total, peso? }
     - unit / desconto / total em centavos (igual ao resto do app)
     - qtd numérica (0,674 kg · 2 un…) e peso opcional em gramas
   Preço médio, mínimo, máximo e R$/kg são sempre derivados das notas —
   nada de produto é duplicado no banco.
   ==================================================================== */
const UNIDADES=['UN','KG','G','L','ML','PCT','CX','DZ','M'];
const UN_MAP={UNIDADE:'UN',UNID:'UN',UND:'UN',UN:'UN',PCS:'UN',PC:'UN',PECA:'UN',BDJ:'UN',
  KGS:'KG',KILO:'KG',KG:'KG',GRAMA:'G',GR:'G',G:'G',
  LTS:'L',LITRO:'L',LT:'L',L:'L',ML:'ML',
  PCT:'PCT',PT:'PCT',FD:'CX',CX:'CX',DZ:'DZ',MT:'M',M:'M'};
function normUn(u){ return UN_MAP[String(u||'').toUpperCase()]||'UN'; }

function numBR(s){
  const t=String(s==null?'':s).trim().replace(/\s/g,'');
  if(!t) return 0;
  const n=parseFloat(t.replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.'));
  return isNaN(n)?0:n;
}
function centsBR(s){ return Math.round(numBR(s)*100); }
function cIn(c){ return c? (c/100).toFixed(2).replace('.',',') : ''; }
function qIn(q){ return q? String(q).replace('.',',') : ''; }
function fmtQtd(q,un){ return Number(q||0).toLocaleString('pt-BR',{maximumFractionDigits:3})+(un?' '+un.toLowerCase():''); }
function dataCurta(d){ return d? d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(2,4) : ''; }
/* chave de agrupamento: o mesmo produto escrito de jeitos diferentes cai no mesmo lugar */
function mkNorm(s){
  return String(s||'').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Z0-9% ]/g,' ').replace(/\s+/g,' ').trim();
}
/* R$/kg: direto quando a nota vende por peso, senão a partir do peso informado */
function precoKgItem(it){
  if(it.un==='KG' && it.unit>0) return it.unit;
  if(it.un==='G'  && it.unit>0) return Math.round(it.unit*1000);
  if(it.peso>0 && it.total>0)   return Math.round(it.total/(it.peso/1000));
  return null;
}

const mk={de:'', ate:'', mercado:'', busca:'', prod:'', metrica:'un', compras:[], busy:false};

function abrirMercado(){
  const de=document.getElementById('mkDe'), ate=document.getElementById('mkAte');
  if(!de.value){ de.value=shiftMes(state.mes,-5); ate.value=state.mes; }
  carregarMercado();
}
async function carregarMercado(){
  if(!state.uid || mk.busy) return;
  let de=document.getElementById('mkDe').value, ate=document.getElementById('mkAte').value;
  if(!de){ de=shiftMes(state.mes,-5); document.getElementById('mkDe').value=de; }
  if(!ate){ ate=state.mes; document.getElementById('mkAte').value=ate; }
  if(de>ate){ [de,ate]=[ate,de];
    document.getElementById('mkDe').value=de; document.getElementById('mkAte').value=ate; }
  mk.busy=true; mk.de=de; mk.ate=ate;
  document.getElementById('mkTabNotas').innerHTML='<div class="empty">Carregando…</div>';
  try{
    const snap=await col('compras').where('mes','>=',de).where('mes','<=',ate).get();
    mk.compras=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>b.data.localeCompare(a.data));
    renderMercado();
  }catch(ex){
    console.error('mercado:',ex);
    document.getElementById('mkTabNotas').innerHTML='<div class="empty">Não consegui carregar as notas agora. Tente de novo.</div>';
  }finally{ mk.busy=false; }
}

document.getElementById('mkDe').onchange=carregarMercado;
document.getElementById('mkAte').onchange=carregarMercado;
document.getElementById('mkMercadoSel').onchange=e=>{ mk.mercado=e.target.value; renderMercado(); };
document.getElementById('mkProdSel').onchange=e=>{ mk.prod=e.target.value; renderMercado(); };
document.getElementById('mkBusca').oninput=e=>{ mk.busca=e.target.value.trim(); renderMercado(); };
document.querySelectorAll('#mkMetrica button').forEach(b=>{
  b.onclick=()=>{ mk.metrica=b.dataset.m; relSegAtivo('mkMetrica','m',mk.metrica); renderMercado(); };
});

/* achata as notas numa lista de itens comprados (já com mercado e data) */
function mkItens(){
  const out=[];
  mk.compras.forEach(c=>{
    (c.itens||[]).forEach(it=>{
      const nome=(it.nome||'').trim(); if(!nome) return;
      out.push({...it, nome, chave:mkNorm(nome), compraId:c.id,
        data:c.data, mercado:(c.mercado||'—').trim(), precoKg:precoKgItem(it)});
    });
  });
  return out;
}
/* um "produto" = todos os itens com a mesma chave, com preço mín/máx/médio */
function mkProdutos(itens){
  const m={};
  itens.forEach(it=>{
    if(!it.chave) return;
    if(!m[it.chave]) m[it.chave]={chave:it.chave, nome:it.nome, un:it.un, qtd:0, gasto:0, desconto:0, hist:[]};
    const p=m[it.chave];
    p.qtd+=it.qtd||0; p.gasto+=it.total||0; p.desconto+=it.desconto||0; p.hist.push(it);
  });
  return Object.values(m).map(p=>{
    p.hist.sort((a,b)=>a.data.localeCompare(b.data));
    const precos=p.hist.map(h=>h.unit).filter(v=>v>0);
    p.min=precos.length?Math.min(...precos):0;
    p.max=precos.length?Math.max(...precos):0;
    p.minItem=p.hist.find(h=>h.unit===p.min)||p.hist[0];
    p.maxItem=p.hist.find(h=>h.unit===p.max)||p.hist[0];
    p.primeiro=p.hist[0].unit; p.ultimo=p.hist[p.hist.length-1].unit;
    p.ultimaData=p.hist[p.hist.length-1].data;
    p.ultimoMercado=p.hist[p.hist.length-1].mercado;
    p.medio=p.qtd>0?Math.round(p.gasto/p.qtd):0;
    p.varia=p.primeiro>0?((p.ultimo-p.primeiro)/p.primeiro*100):0;
    const kgs=p.hist.map(h=>h.precoKg).filter(v=>v>0);
    p.kgMedio=kgs.length?Math.round(kgs.reduce((a,b)=>a+b,0)/kgs.length):null;
    p.mercados=[...new Set(p.hist.map(h=>h.mercado))];
    return p;
  }).sort((a,b)=>b.gasto-a.gasto);
}

function renderMercado(){
  const todos=mkItens();
  const mercados=[...new Set(mk.compras.map(c=>(c.mercado||'—').trim()))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  if(mk.mercado && !mercados.includes(mk.mercado)) mk.mercado='';
  document.getElementById('mkMercadoSel').innerHTML='<option value="">— todos os mercados —</option>'+
    mercados.map(m=>`<option value="${esc(m)}"${m===mk.mercado?' selected':''}>${esc(m)}</option>`).join('');
  document.getElementById('mkMercadosDL').innerHTML=mercados.map(m=>`<option value="${esc(m)}">`).join('');

  const notas = mk.mercado ? mk.compras.filter(c=>(c.mercado||'—').trim()===mk.mercado) : mk.compras;
  const itens = mk.mercado ? todos.filter(i=>i.mercado===mk.mercado) : todos;

  const totalGasto=notas.reduce((a,c)=>a+(c.total||0),0);
  const totalDesc=notas.reduce((a,c)=>a+(c.desconto||0),0);
  document.getElementById('mkKTotal').textContent=fmt(totalGasto);
  document.getElementById('mkKNotas').innerHTML=`${notas.length} <small>nota${notas.length===1?'':'s'} · ${itens.length} itens</small>`;
  document.getElementById('mkKDesc').textContent=fmt(totalDesc);

  const produtos=mkProdutos(itens);

  /* select de produtos: os mais comprados primeiro */
  const ordProd=[...produtos].sort((a,b)=>b.hist.length-a.hist.length||b.gasto-a.gasto);
  if(mk.prod && !produtos.some(p=>p.chave===mk.prod)) mk.prod='';
  if(!mk.prod && ordProd.length) mk.prod=ordProd[0].chave;
  document.getElementById('mkProdSel').innerHTML=ordProd.length
    ? ordProd.map(p=>`<option value="${esc(p.chave)}"${p.chave===mk.prod?' selected':''}>${esc(p.nome)} (${p.hist.length}×)</option>`).join('')
    : '<option value="">— nenhum produto ainda —</option>';
  relSegAtivo('mkMetrica','m',mk.metrica);

  const sel=produtos.find(p=>p.chave===mk.prod)||null;
  mkResumoProduto(sel);
  mkGraficoProduto(sel);
  mkGraficoComparativo(sel);
  document.getElementById('mkTabProd').innerHTML=mkTabelaProdutoHTML(sel);

  /* rosca de gasto por mercado — some quando já há um mercado filtrado */
  const porMerc={};
  notas.forEach(c=>{ const m=(c.mercado||'—').trim(); porMerc[m]=(porMerc[m]||0)+(c.total||0); });
  const listaMerc=Object.entries(porMerc).sort((a,b)=>b[1]-a[1]);
  const mostrarRosca=!mk.mercado && listaMerc.length>1;
  document.getElementById('mkMercadoBox').classList.toggle('hidden', !mostrarRosca);
  if(mostrarRosca){
    mkChart('mkMercado','chartMkMercado',{type:'doughnut',
      data:{labels:listaMerc.map(([m])=>m),
        datasets:[{data:listaMerc.map(([,v])=>v/100),
          backgroundColor:listaMerc.map((_,i)=>CAT_COLORS[i%CAT_COLORS.length]),borderWidth:0}]},
      options:{maintainAspectRatio:false,cutout:'62%',
        plugins:{legend:{position:'right',labels:{boxWidth:12,font:{family:'Schibsted Grotesk'}}},tooltip:relTooltip}}});
  }else if(state.charts.mkMercado){ state.charts.mkMercado.destroy(); state.charts.mkMercado=null; }

  /* top produtos por gasto */
  const top=produtos.slice(0,10);
  mkChart('mkTop','chartMkTop',{type:'bar',
    data:{labels:top.map(p=>p.nome.length>26?p.nome.slice(0,25)+'…':p.nome),
      datasets:[{label:'Gasto no período',data:top.map(p=>p.gasto/100),
        backgroundColor:top.map((_,i)=>CAT_COLORS[i%CAT_COLORS.length]),borderRadius:5}]},
    options:{indexAxis:'y',maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:relTooltip},
      scales:{x:{ticks:{callback:moedaCB}}}}});

  document.getElementById('mkTabProdutos').innerHTML=mkTabelaProdutosHTML(produtos);
  document.getElementById('mkTabNotas').innerHTML=mkTabelaNotasHTML(notas);
  mkLigarTabelas();
}

const mkMetricaLbl=()=> mk.metrica==='kg' ? 'preço por kg' : 'preço unitário';
function mkValor(h){ return mk.metrica==='kg' ? h.precoKg : h.unit; }

function mkResumoProduto(p){
  const box=document.getElementById('mkProdResumo');
  if(!p){ box.innerHTML='<div class="empty">Escaneie uma nota para começar a acompanhar os preços.</div>'; return; }
  const pts=p.hist.filter(h=>mkValor(h)>0);
  if(!pts.length){
    box.innerHTML=`<div class="empty">Ainda não dá para calcular o ${mkMetricaLbl()} de "${esc(p.nome)}" — informe o peso do item ao editar a nota.</div>`;
    return;
  }
  const vals=pts.map(mkValor);
  const min=Math.min(...vals), max=Math.max(...vals);
  const barato=pts.find(h=>mkValor(h)===min), caro=pts.find(h=>mkValor(h)===max);
  const ult=pts[pts.length-1], prim=pts[0];
  const dif=mkValor(prim)>0 ? (mkValor(ult)-mkValor(prim))/mkValor(prim)*100 : 0;
  const sufixo=mk.metrica==='kg'?'/kg':'/'+(p.un||'un').toLowerCase();
  const economia=max-min;
  box.innerHTML=`
    <div class="b"><div class="k">Mais barato</div><div class="v pos">${fmt(min)}${sufixo}</div><div class="w">${esc(barato.mercado)} · ${dataCurta(barato.data)}</div></div>
    <div class="b"><div class="k">Mais caro</div><div class="v neg">${fmt(max)}${sufixo}</div><div class="w">${esc(caro.mercado)} · ${dataCurta(caro.data)}</div></div>
    <div class="b"><div class="k">Último preço</div><div class="v">${fmt(mkValor(ult))}${sufixo}</div><div class="w">${esc(ult.mercado)} · ${dataCurta(ult.data)}</div></div>
    <div class="b"><div class="k">Variação</div><div class="v ${dif>0.5?'neg':dif<-0.5?'pos':''}">${dif>0?'+':''}${dif.toFixed(1).replace('.',',')}%</div><div class="w">do 1º ao último preço</div></div>
    <div class="b"><div class="k">Diferença entre lojas</div><div class="v">${fmt(economia)}</div><div class="w">${min>0&&economia>0?('até '+(economia/min*100).toFixed(0)+'% de economia comprando no mais barato'):'mesmo preço em todas'}</div></div>`;
}

/* gráfico principal: uma linha por mercado com o preço a cada compra */
function mkGraficoProduto(p){
  const pts=p? p.hist.filter(h=>mkValor(h)>0) : [];
  const datas=[...new Set(pts.map(h=>h.data))].sort();
  const mercados=[...new Set(pts.map(h=>h.mercado))];
  const datasets=mercados.map((m,i)=>({
    label:m,
    data:datas.map(d=>{
      const hs=pts.filter(h=>h.mercado===m&&h.data===d);
      return hs.length ? hs.reduce((a,h)=>a+mkValor(h),0)/hs.length/100 : null;
    }),
    borderColor:CAT_COLORS[i%CAT_COLORS.length],
    backgroundColor:CAT_COLORS[i%CAT_COLORS.length],
    borderWidth:2, pointRadius:4, tension:.25, spanGaps:true,
  }));
  mkChart('mkProd','chartMkProd',{type:'line',
    data:{labels:datas.map(d=>d.slice(8,10)+'/'+d.slice(5,7)),datasets},
    options:{maintainAspectRatio:false,
      plugins:{legend:{labels:{boxWidth:12,font:{family:'Schibsted Grotesk'}}},tooltip:relTooltip},
      scales:{y:{ticks:{callback:moedaCB}}}}});
}

/* comparativo: preço médio × menor preço em cada mercado */
function mkGraficoComparativo(p){
  const pts=p? p.hist.filter(h=>mkValor(h)>0) : [];
  const mercados=[...new Set(pts.map(h=>h.mercado))];
  document.getElementById('mkCompBox').classList.toggle('hidden', !mercados.length);
  if(!mercados.length){
    if(state.charts.mkComp){ state.charts.mkComp.destroy(); state.charts.mkComp=null; }
    return;
  }
  const medias=mercados.map(m=>{
    const v=pts.filter(h=>h.mercado===m).map(mkValor);
    return {m, media:v.reduce((a,b)=>a+b,0)/v.length/100, min:Math.min(...v)/100};
  }).sort((a,b)=>a.media-b.media);
  document.getElementById('mkCompTitle').textContent=`Onde está mais barato — ${p.nome} (${mkMetricaLbl()})`;
  mkChart('mkComp','chartMkComp',{type:'bar',
    data:{labels:medias.map(x=>x.m),datasets:[
      {label:'Preço médio',data:medias.map(x=>x.media),
        backgroundColor:medias.map((_,i)=>i===0?'#a99cf5':'#cfc9e6'),borderRadius:5},
      {label:'Menor preço',data:medias.map(x=>x.min),backgroundColor:'#FFC53D',borderRadius:5},
    ]},
    options:{maintainAspectRatio:false,
      plugins:{legend:{labels:{boxWidth:12,font:{family:'Schibsted Grotesk'}}},tooltip:relTooltip},
      scales:{y:{ticks:{callback:moedaCB}}}}});
}

/* tabela 1: cada compra do produto escolhido — o detalhe que a nota traz */
function mkTabelaProdutoHTML(p){
  if(!p) return '<div class="empty">Escolha um produto acima.</div>';
  const rows=[...p.hist].reverse().map(h=>`<tr>
    <td>${dataCurta(h.data)}</td>
    <td>${esc(h.mercado)}</td>
    <td class="num">${fmtQtd(h.qtd,h.un)}</td>
    <td class="num">${fmt(h.unit)}</td>
    <td class="num">${h.desconto?('−'+fmt(h.desconto)):'—'}</td>
    <td class="num neg">${fmt(h.total)}</td>
    <td class="num">${h.precoKg?fmt(h.precoKg):'—'}</td></tr>`).join('');
  return `<div class="relGrupo">${esc(p.nome)} — ${p.hist.length} compra${p.hist.length===1?'':'s'}</div>
  <div class="relTableWrap"><table class="relTable">
    <thead><tr><th>Data</th><th>Mercado</th><th class="num">Qtd</th><th class="num">Vl. unit.</th>
      <th class="num">Desconto</th><th class="num">Total</th><th class="num">R$/kg</th></tr></thead>
    <tbody>${rows}
    <tr class="totRow"><td>Total</td><td></td><td class="num">${fmtQtd(p.qtd,p.un)}</td>
      <td class="num">${fmt(p.medio)}</td><td class="num">${p.desconto?('−'+fmt(p.desconto)):'—'}</td>
      <td class="num neg">${fmt(p.gasto)}</td><td class="num">${p.kgMedio?fmt(p.kgMedio):'—'}</td></tr></tbody>
  </table></div>`;
}

/* tabela 2: todos os produtos do período, com mínimo, máximo e variação */
function mkTabelaProdutosHTML(produtos){
  const busca=mkNorm(mk.busca);
  const lista=busca? produtos.filter(p=>p.chave.includes(busca)) : produtos;
  if(!lista.length) return `<div class="empty">${produtos.length?'Nenhum produto com esse nome.':'Nenhuma nota no período — escaneie a primeira! 📷'}</div>`;
  const rows=lista.slice(0,300).map(p=>{
    const v=p.varia;
    const tag=Math.abs(v)<1?'':`<span class="mkTag ${v>0?'alta':'baixa'}">${v>0?'▲':'▼'} ${Math.abs(v).toFixed(0)}%</span>`;
    return `<tr class="clicavel${p.chave===mk.prod?' sel':''}" data-prod="${esc(p.chave)}">
      <td><b>${esc(p.nome)}</b>${tag}<span class="sub">${p.hist.length} compra${p.hist.length===1?'':'s'} · ${esc(p.mercados.join(', '))}</span></td>
      <td class="num">${fmtQtd(p.qtd,p.un)}</td>
      <td class="num neg">${fmt(p.gasto)}</td>
      <td class="num">${fmt(p.medio)}</td>
      <td class="num pos">${fmt(p.min)}<span class="sub">${esc(p.minItem.mercado)}</span></td>
      <td class="num neg">${fmt(p.max)}<span class="sub">${esc(p.maxItem.mercado)}</span></td>
      <td class="num">${p.kgMedio?fmt(p.kgMedio):'—'}</td>
      <td class="num">${dataCurta(p.ultimaData)}<span class="sub">${esc(p.ultimoMercado)}</span></td>
      <td><button type="button" class="catEditBtn mkRen" data-prod="${esc(p.chave)}" title="Renomear produto">✎</button></td></tr>`;
  }).join('');
  return `<p class="impHint">Toque num produto para ver o gráfico de preço dele. O ✎ renomeia o produto em <b>todas</b> as notas — útil para juntar nomes que a nota abrevia de jeitos diferentes.</p>
  <div class="relTableWrap"><table class="relTable">
    <thead><tr><th>Produto</th><th class="num">Qtd</th><th class="num">Gasto</th><th class="num">Preço médio</th>
      <th class="num">Menor</th><th class="num">Maior</th><th class="num">R$/kg</th><th class="num">Última</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

/* tabela 3: as notas do período (toque para revisar/corrigir a nota inteira) */
function mkTabelaNotasHTML(notas){
  if(!notas.length) return '<div class="empty">Nenhuma nota no período.</div>';
  const rows=notas.map(c=>`<tr class="clicavel" data-nota="${esc(c.id)}">
    <td>${dataCurta(c.data)}</td>
    <td><b>${esc(c.mercado||'—')}</b><span class="sub">${(c.itens||[]).length} itens${c.txId?' · lançado como despesa':''}</span></td>
    <td class="num">${c.desconto?('−'+fmt(c.desconto)):'—'}</td>
    <td class="num neg">${fmt(c.total||0)}</td>
    <td><button type="button" class="txDel mkDelNota" data-nota="${esc(c.id)}" title="Excluir nota">✕</button></td></tr>`).join('');
  const tot=notas.reduce((a,c)=>a+(c.total||0),0);
  return `<div class="relTableWrap"><table class="relTable">
    <thead><tr><th>Data</th><th>Mercado</th><th class="num">Desconto</th><th class="num">Total</th><th></th></tr></thead>
    <tbody>${rows}
    <tr class="totRow"><td>Total</td><td></td><td></td><td class="num neg">${fmt(tot)}</td><td></td></tr></tbody>
  </table></div>`;
}

function mkLigarTabelas(){
  document.querySelectorAll('#mkTabProdutos tr.clicavel').forEach(tr=>{
    tr.onclick=e=>{
      if(e.target.closest('.mkRen')) return;
      mk.prod=tr.dataset.prod; renderMercado();
      document.getElementById('mkProdResumo').scrollIntoView({behavior:'smooth',block:'center'});
    };
  });
  document.querySelectorAll('#mkTabProdutos .mkRen').forEach(b=>{
    b.onclick=e=>{ e.stopPropagation(); renomearProduto(b.dataset.prod); };
  });
  document.querySelectorAll('#mkTabNotas tr.clicavel').forEach(tr=>{
    tr.onclick=e=>{
      if(e.target.closest('.mkDelNota')) return;
      const c=mk.compras.find(x=>x.id===tr.dataset.nota);
      if(c) abrirNotaEdicao(c, c.id);
    };
  });
  document.querySelectorAll('#mkTabNotas .mkDelNota').forEach(b=>{
    b.onclick=e=>{ e.stopPropagation(); excluirNota(b.dataset.nota); };
  });
}

/* renomear um produto em todas as notas (junta "COCA 2L" com "REFRIG COCA 2LT") */
async function renomearProduto(chave){
  const atual=(mkItens().find(i=>i.chave===chave)||{}).nome||'';
  const novo=prompt('Novo nome do produto (vale para todas as notas):', atual);
  if(novo===null) return;
  const nome=novo.trim().slice(0,80);
  if(!nome || nome===atual) return;
  try{
    const snap=await col('compras').get();
    let batch=db.batch(), n=0, mudadas=0;
    for(const d of snap.docs){
      const c=d.data(); let mudou=false;
      const itens=(c.itens||[]).map(it=>{
        if(mkNorm(it.nome)===chave){ mudou=true; return {...it, nome}; }
        return it;
      });
      if(!mudou) continue;
      batch.update(d.ref,{itens}); n++; mudadas++;
      if(n===400){ await batch.commit(); batch=db.batch(); n=0; }
    }
    if(n) await batch.commit();
    mk.prod=mkNorm(nome);
    toast(mudadas? `Renomeado em ${mudadas} nota${mudadas===1?'':'s'} ✏️` : 'Nada para renomear');
    carregarMercado();
  }catch(ex){ console.error('renomear produto:',ex); toast('Não consegui renomear agora'); }
}

async function excluirNota(id){
  const c=mk.compras.find(x=>x.id===id); if(!c) return;
  if(!confirm(`Excluir a nota de ${c.mercado} (${dataCurta(c.data)}) com ${(c.itens||[]).length} itens?`)) return;
  try{
    if(c.txId){ try{ await col('tx').doc(c.txId).delete(); }catch(_){ } }
    await col('compras').doc(id).delete();
    toast('Nota excluída');
    carregarMercado();
  }catch(ex){ console.error('excluir nota:',ex); toast('Não consegui excluir agora'); }
}

/* ---------------- Nota do mercado: leitura e conferência ---------------- */
const nota={id:null, txId:null, origem:'manual', itens:[], totalNota:0};

function passoNota(n){
  document.getElementById('notaStep1').classList.toggle('hidden', n!==1);
  document.getElementById('notaStep2').classList.toggle('hidden', n!==2);
}
document.getElementById('btnNotaFoto').onclick=()=>{
  nota.origem='foto';
  document.getElementById('notaTitle').textContent='Escanear nota fiscal';
  document.getElementById('notaProg').classList.add('hidden');
  passoNota(1);
  document.getElementById('notaModal').classList.remove('hidden');
};
document.getElementById('btnNotaManual').onclick=()=>{
  nota.origem='manual';
  abrirNotaEdicao({mercado:'', data:hojeISO(), itens:[{nome:'',qtd:1,un:'UN',unit:0,desconto:0,total:0,peso:0}], desconto:0, total:0});
};
document.getElementById('btnNotaCam').onclick=()=>document.getElementById('notaCam').click();
document.getElementById('btnNotaArq').onclick=()=>document.getElementById('notaArq').click();
document.getElementById('notaCam').onchange=e=>{ const f=e.target.files[0]; e.target.value=''; if(f) lerNota(f); };
document.getElementById('notaArq').onchange=e=>{ const f=e.target.files[0]; e.target.value=''; if(f) lerNota(f); };

/* abre o passo de conferência — serve tanto para nota nova quanto para editar uma salva */
function abrirNotaEdicao(r, id){
  nota.id=id||null;
  nota.txId=r.txId||null;
  nota.totalNota=r.total||0;
  nota.itens=(r.itens||[]).map(it=>({
    nome:it.nome||'', qtd:it.qtd||1, un:normUn(it.un), unit:it.unit||0,
    desconto:it.desconto||0, total:it.total||0, peso:it.peso||0,
  }));
  document.getElementById('notaTitle').textContent = nota.id
    ? 'Editar nota'
    : (nota.origem==='manual' ? 'Nova nota do mercado' : `Confira a nota — ${nota.itens.length} ${nota.itens.length===1?'item lido':'itens lidos'}`);
  document.getElementById('notaMercado').value=r.mercado||'';
  document.getElementById('notaData').value=r.data||hojeISO();
  document.getElementById('notaDescTotal').value=r.desconto?cIn(r.desconto):'';
  document.getElementById('notaLancar').checked = nota.id ? !!nota.txId : true;
  renderNotaItens();
  passoNota(2);
  document.getElementById('notaModal').classList.remove('hidden');
  if(!nota.id && nota.origem!=='manual' && !nota.itens.length)
    toast('Não achei os itens na imagem — dá para digitar aqui 👇');
}

function kgHint(it){
  const kg=precoKgItem(it);
  const partes=[];
  if(kg) partes.push('R$/kg: '+fmt(kg));
  if(it.qtd>0 && it.unit>0) partes.push('qtd × unit = '+fmt(Math.round(it.qtd*it.unit)));
  return partes.join('  ·  ');
}
function renderNotaItens(){
  const box=document.getElementById('notaItens');
  if(!nota.itens.length){
    box.innerHTML='<div class="empty">Nenhum item ainda. Toque em "+ Adicionar item".</div>';
    atualizarNotaTotal(); return;
  }
  box.innerHTML=nota.itens.map((it,i)=>`
    <div class="itemRow" data-i="${i}">
      <div class="itemTop">
        <input class="iNome" value="${esc(it.nome)}" placeholder="Nome do produto" maxlength="80">
        <button type="button" class="itemDel" title="Remover item">✕</button>
      </div>
      <div class="itemGrid">
        <label>Qtd<input class="iQtd" inputmode="decimal" value="${qIn(it.qtd)}"></label>
        <label>Un<select class="iUn">${UNIDADES.map(u=>`<option${u===it.un?' selected':''}>${u}</option>`).join('')}</select></label>
        <label>Unit R$<input class="iUnit" inputmode="decimal" value="${cIn(it.unit)}"></label>
        <label>Desc R$<input class="iDesc" inputmode="decimal" value="${cIn(it.desconto)}"></label>
        <label>Total R$<input class="iTotal" inputmode="decimal" value="${cIn(it.total)}"></label>
        <label>Peso g<input class="iPeso" inputmode="decimal" value="${it.peso||''}"></label>
      </div>
      <div class="itemKg">${kgHint(it)}</div>
    </div>`).join('');
  atualizarNotaTotal();
}
function atualizarNotaTotal(){
  const soma=nota.itens.reduce((a,it)=>a+(it.total||0),0);
  const descNota=Math.max(0,centsBR(document.getElementById('notaDescTotal').value));
  const total=Math.max(0, soma-descNota);
  document.getElementById('notaTotCalc').textContent=fmt(total);
  const dif=document.getElementById('notaTotDif');
  dif.textContent = (nota.totalNota && Math.abs(nota.totalNota-total)>2)
    ? ` a nota diz ${fmt(nota.totalNota)}` : '';
}
/* um listener só para a lista inteira: o campo não perde o foco enquanto se digita */
const notaItensBox=document.getElementById('notaItens');
notaItensBox.addEventListener('input', e=>{
  const row=e.target.closest('.itemRow'); if(!row) return;
  const it=nota.itens[+row.dataset.i]; if(!it) return;
  const c=e.target.className;
  if(c==='iNome') it.nome=e.target.value;
  else if(c==='iQtd'){ it.qtd=numBR(e.target.value); recalcItem(it,row); }
  else if(c==='iUnit'){ it.unit=centsBR(e.target.value); recalcItem(it,row); }
  else if(c==='iDesc'){ it.desconto=centsBR(e.target.value); recalcItem(it,row); }
  else if(c==='iTotal') it.total=centsBR(e.target.value);
  else if(c==='iPeso') it.peso=numBR(e.target.value);
  row.querySelector('.itemKg').textContent=kgHint(it);
  atualizarNotaTotal();
});
notaItensBox.addEventListener('change', e=>{
  if(e.target.className!=='iUn') return;
  const row=e.target.closest('.itemRow');
  const it=nota.itens[+row.dataset.i]; if(!it) return;
  it.un=e.target.value;
  row.querySelector('.itemKg').textContent=kgHint(it);
});
notaItensBox.addEventListener('click', e=>{
  if(!e.target.classList.contains('itemDel')) return;
  nota.itens.splice(+e.target.closest('.itemRow').dataset.i,1);
  renderNotaItens();
});
function recalcItem(it,row){
  it.total=Math.max(0, Math.round((it.qtd||0)*(it.unit||0)) - (it.desconto||0));
  row.querySelector('.iTotal').value=cIn(it.total);
}
document.getElementById('notaDescTotal').oninput=atualizarNotaTotal;
document.getElementById('btnNotaAddItem').onclick=()=>{
  nota.itens.push({nome:'',qtd:1,un:'UN',unit:0,desconto:0,total:0,peso:0});
  renderNotaItens();
  const inputs=notaItensBox.querySelectorAll('.iNome');
  if(inputs.length) inputs[inputs.length-1].focus();
};

document.getElementById('btnNotaSalvar').onclick=async ()=>{
  const btn=document.getElementById('btnNotaSalvar');
  const mercado=document.getElementById('notaMercado').value.trim();
  const data=document.getElementById('notaData').value;
  if(!mercado){ toast('Escreva o nome do mercado'); return; }
  if(!data){ toast('Escolha a data da compra'); return; }
  const itens=nota.itens.filter(it=>(it.nome||'').trim()).map(it=>{
    const o={ nome:it.nome.trim().slice(0,80),
      qtd:Math.round((it.qtd>0?it.qtd:1)*1000)/1000,
      un:UNIDADES.includes(it.un)?it.un:'UN',
      unit:Math.max(0,Math.round(it.unit||0)),
      desconto:Math.max(0,Math.round(it.desconto||0)),
      total:Math.max(0,Math.round(it.total||0)) };
    if(it.peso>0) o.peso=Math.round(it.peso);
    return o;
  });
  if(!itens.length){ toast('Adicione pelo menos um item com nome'); return; }
  const subtotal=itens.reduce((a,i)=>a+i.total,0);
  const descNota=Math.max(0,centsBR(document.getElementById('notaDescTotal').value));
  const total=Math.max(0, subtotal-descNota);
  const doc={ mercado:mercado.slice(0,80), mercadoKey:(mkNorm(mercado).slice(0,60)||'-'),
    data, mes:data.slice(0,7), itens, subtotal,
    desconto:descNota+itens.reduce((a,i)=>a+i.desconto,0), total, origem:nota.origem };

  btn.disabled=true; btn.textContent='Salvando…';
  try{
    const lancar=document.getElementById('notaLancar').checked && total>0;
    const catMercado=catsD().includes('Mercado')?'Mercado':'Outros';
    const txDoc={ tipo:'despesa', valor:total, desc:`Mercado — ${mercado}`.slice(0,200),
      cat:catMercado, data, mes:data.slice(0,7), pagamento:null, custom:{}, origem:'mercado' };

    let txId=nota.txId;
    if(lancar && txId){ await col('tx').doc(txId).update(txDoc); }
    else if(lancar){
      txDoc.criadoEm=firebase.firestore.FieldValue.serverTimestamp();
      txId=(await col('tx').add(txDoc)).id;
    }else if(txId){ try{ await col('tx').doc(txId).delete(); }catch(_){ } txId=null; }
    if(txId) doc.txId=txId;

    if(nota.id){
      await col('compras').doc(nota.id).set(doc,{merge:true});
      if(!txId) await col('compras').doc(nota.id).update({txId:firebase.firestore.FieldValue.delete()});
      toast('Nota atualizada 🛒');
    }else{
      doc.criadoEm=firebase.firestore.FieldValue.serverTimestamp();
      await col('compras').add(doc);
      toast(`Nota salva com ${itens.length} ${itens.length===1?'item':'itens'} 🛒`);
    }
    document.getElementById('notaModal').classList.add('hidden');
    /* se a nota é de outro mês, o período do painel se ajusta sozinho */
    if(doc.mes<mk.de) document.getElementById('mkDe').value=doc.mes;
    if(doc.mes>mk.ate) document.getElementById('mkAte').value=doc.mes;
    carregarMercado();
  }catch(ex){
    console.error('salvar nota:',ex);
    toast('Não consegui salvar a nota. Tente de novo.');
  }
  btn.disabled=false; btn.textContent='Salvar nota';
};

/* --- OCR da foto (roda no próprio aparelho, a imagem não sai daqui) --- */
let tessPromise=null;
function loadTesseract(){
  if(tessPromise) return tessPromise;
  tessPromise=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
    s.onload=()=>res(window.Tesseract);
    s.onerror=()=>{ tessPromise=null; rej(new Error('Falha ao carregar o leitor de imagem — confira a internet')); };
    document.head.appendChild(s);
  });
  return tessPromise;
}
/* nota térmica sai lavada na foto: reduz, tira a cor e força o contraste antes do OCR */
function prepararImagem(file){
  return new Promise((res,rej)=>{
    const img=new Image();
    img.onload=()=>{
      const escala=Math.min(1, 1600/Math.max(img.width,1));
      const c=document.createElement('canvas');
      c.width=Math.round(img.width*escala); c.height=Math.round(img.height*escala);
      const ctx=c.getContext('2d');
      ctx.drawImage(img,0,0,c.width,c.height);
      const d=ctx.getImageData(0,0,c.width,c.height), p=d.data;
      for(let i=0;i<p.length;i+=4){
        let g=p[i]*.299+p[i+1]*.587+p[i+2]*.114;
        g=(g-128)*1.7+130;
        p[i]=p[i+1]=p[i+2]= g<0?0 : g>255?255 : g;
      }
      ctx.putImageData(d,0,0);
      URL.revokeObjectURL(img.src);
      res(c);
    };
    img.onerror=()=>{ URL.revokeObjectURL(img.src); rej(new Error('Não consegui abrir esta imagem')); };
    img.src=URL.createObjectURL(file);
  });
}
async function ocrLinhas(file, onProg){
  const T=await loadTesseract();
  const canvas=await prepararImagem(file);
  const worker=await T.createWorker('por', 1, {
    logger:m=>{ if(m.status==='recognizing text') onProg(m.progress); },
  });
  try{
    const {data}=await worker.recognize(canvas);
    return String(data.text||'').split('\n').map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
  }finally{ try{ await worker.terminate(); }catch(_){ } }
}

/* --- QR code da nota (NFC-e): quando dá pra ler, busca os itens oficiais na Sefaz-SP --- */
let jsQrPromise=null;
function loadJsQR(){
  if(jsQrPromise) return jsQrPromise;
  jsQrPromise=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    s.onload=()=>res(window.jsQR);
    s.onerror=()=>{ jsQrPromise=null; rej(new Error('Falha ao carregar o leitor de QR code')); };
    document.head.appendChild(s);
  });
  return jsQrPromise;
}
function imagemParaCanvasQr(file){
  return new Promise((res,rej)=>{
    const img=new Image();
    img.onload=()=>{
      const escala=Math.min(1, 2000/Math.max(img.width,img.height,1));
      const c=document.createElement('canvas');
      c.width=Math.round(img.width*escala); c.height=Math.round(img.height*escala);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      URL.revokeObjectURL(img.src);
      res(c);
    };
    img.onerror=()=>{ URL.revokeObjectURL(img.src); rej(new Error('Não consegui abrir esta imagem')); };
    img.src=URL.createObjectURL(file);
  });
}
/* devolve o texto cru do QR (a URL da Sefaz), ou null se não achar nenhum na foto */
async function lerQrDaFoto(file){
  let canvas;
  try{ canvas=await imagemParaCanvasQr(file); }catch(_){ return null; }
  if('BarcodeDetector' in window){
    try{
      const det=new window.BarcodeDetector({formats:['qr_code']});
      const achados=await det.detect(canvas);
      if(achados&&achados[0]&&achados[0].rawValue) return achados[0].rawValue;
    }catch(_){ /* segue pro fallback */ }
  }
  try{
    const jsQR=await loadJsQR();
    const ctx=canvas.getContext('2d');
    const img=ctx.getImageData(0,0,canvas.width,canvas.height);
    const achado=jsQR(img.data, img.width, img.height);
    return achado ? achado.data : null;
  }catch(_){ return null; }
}
/* pede pro worker buscar a nota na Sefaz (o worker faz o fetch pra fugir do CORS) */
async function buscarNotaNaSefaz(qrUrl){
  const token=await auth.currentUser.getIdToken();
  const r=await fetch(PUSH_URL+'/nfce',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
    body:JSON.stringify({url:qrUrl}),
  });
  return await r.json().catch(()=>null); // {ok:true,...} ou {ok:false,error}; null só se a resposta nem veio
}
/* abre a conferência já com os dados que vieram do worker /nfce (via QR ou link colado) */
function abrirNotaComDadosSefaz(dadosSefaz){
  nota.origem='foto';
  abrirNotaEdicao({
    mercado:tituloBR(dadosSefaz.mercado||'').slice(0,60),
    data:dadosSefaz.data||hojeISO(),
    itens:dadosSefaz.itens.map(it=>({
      nome:tituloBR(it.nome||'').slice(0,80), qtd:it.qtd||1, un:normUn(it.un),
      unit:it.unitCents||0, desconto:0, total:it.totalCents||0, peso:0,
    })),
    desconto:0, total:dadosSefaz.totalCents||0,
  });
}

document.getElementById('btnNotaColar').onclick=()=>{
  document.getElementById('notaColarBox').classList.toggle('hidden');
  document.getElementById('notaColarTexto').focus();
};
/* cada linha: Nome | Qtd | Un | Valor unit. | Valor total */
function parseListaColada(texto){
  const itens=[];
  texto.split('\n').forEach(l=>{
    const p=l.split('|').map(s=>s.trim());
    if(p.length<5 || !p[0]) return;
    const qtd=numBR(p[1])||1, unit=centsBR(p[3]);
    let total=centsBR(p[4]);
    if(!total) total=Math.round(qtd*unit);
    itens.push({ nome:tituloBR(p[0]).slice(0,80), qtd, un:normUn(p[2]), unit, desconto:0, total, peso:0 });
  });
  return itens;
}
function processarListaColada(texto){
  const itens=parseListaColada(texto);
  if(!itens.length){ toast('Não entendi nenhuma linha — confira o formato Nome | Qtd | Un | Unit | Total'); return; }
  nota.origem='foto';
  document.getElementById('notaColarTexto').value='';
  document.getElementById('notaColarBox').classList.add('hidden');
  abrirNotaEdicao({ mercado:'', data:hojeISO(), itens, desconto:0, total:itens.reduce((a,i)=>a+i.total,0) });
}
document.getElementById('btnNotaColarIr').onclick=()=>{
  processarListaColada(document.getElementById('notaColarTexto').value);
};
document.getElementById('btnNotaColarArq').onclick=()=>document.getElementById('notaColarArq').click();
document.getElementById('notaColarArq').onchange=e=>{
  const f=e.target.files[0]; e.target.value='';
  if(!f) return;
  const reader=new FileReader();
  reader.onload=()=>processarListaColada(String(reader.result||''));
  reader.onerror=()=>toast('Não consegui abrir esse arquivo');
  reader.readAsText(f,'utf-8');
};

async function lerNota(file){
  const prog=document.getElementById('notaProg');
  const bar=document.getElementById('notaBar');
  const txt=document.getElementById('notaProgTxt');
  const setP=(p,t)=>{ bar.style.width=Math.round(p*100)+'%'; txt.textContent=t; };
  prog.classList.remove('hidden'); setP(.04,'Abrindo o arquivo…');
  const ehPdf=/pdf/i.test(file.type)||/\.pdf$/i.test(file.name);
  try{
    if(!ehPdf){
      setP(.08,'Procurando o QR code da nota…');
      const qrTexto=await lerQrDaFoto(file);
      if(qrTexto && /\d{44}/.test(qrTexto) && /nfce\.fazenda\.sp\.gov\.br/i.test(qrTexto)){
        setP(.3,'Achei o QR code — buscando os itens na Sefaz…');
        const dadosSefaz=await buscarNotaNaSefaz(qrTexto).catch(()=>null);
        if(dadosSefaz && dadosSefaz.itens && dadosSefaz.itens.length){
          setP(1,'Pronto!');
          abrirNotaComDadosSefaz(dadosSefaz);
          return;
        }
      }
    }
    let linhas;
    if(ehPdf){
      nota.origem='pdf';
      setP(.35,'Lendo o PDF da nota…');
      linhas=await pdfParaLinhas(file);
      setP(1,'Pronto!');
    }else{
      nota.origem='foto';
      setP(.1,'Carregando o leitor de imagem (só na primeira vez)…');
      linhas=await ocrLinhas(file, p=>setP(.15+p*.83,'Lendo a nota… '+Math.round(p*100)+'%'));
    }
    abrirNotaEdicao(parseNota(linhas));
  }catch(ex){
    console.error('ler nota:',ex);
    toast(ex.message||'Não consegui ler esta nota');
  }finally{ prog.classList.add('hidden'); }
}

/* --- Leitura do cupom: transforma as linhas em itens --- */
const RE_DINHEIRO=/\d{1,3}(?:\.\d{3})+,\d{2}|\d+[.,]\d{2,3}/g;
const UN_TOKENS='UNIDADE|UNID|UND|UN|PCS|PECA|PC|KGS|KILO|KG|GRAMA|GR|G|LTS|LT|LITRO|L|ML|PCT|PT|CX|DZ|FD|BDJ|MT|M';
const RE_ITEM_UN=new RegExp('(\\d{1,4}(?:[.,]\\d{1,3})?)\\s*('+UN_TOKENS+')\\b\\s*[Xx*]?\\s*(\\d{1,3}(?:\\.\\d{3})*[.,]\\d{2,3})','i');
const RE_ITEM_X=/(\d{1,4}(?:[.,]\d{1,3})?)\s*[Xx*]\s*(\d{1,3}(?:\.\d{3})*[.,]\d{2,3})/;
const RE_IGNORA=/(TOTAL|TROCO|DINHEIRO|CART[AÃ]O|CR[EÉ]DITO|D[EÉ]BITO|VISA|MASTER|ELO|PIX|VALOR PAGO|VALOR RECEBIDO|DESCONTO|ACR[EÉ]SCIMO|TRIBUT|IMPOSTO|CHAVE DE ACESSO|PROTOCOLO|CONSUMIDOR|CPF|CNPJ|EMISS|AUTORIZ|SAT |ECF|COO|OPERADOR|CAIXA|CUPOM|DANFE|NFC|SEFAZ|WWW\.|HTTP|ITENS|TROQUE|OBRIGAD)/i;

function limparNomeItem(s){
  return String(s||'')
    .replace(/^\s*\d{1,3}\s*[-.)]?\s+/,'')   // número de ordem do item
    .replace(/\b\d{6,14}\b/g,' ')            // código de barras / código interno
    .replace(/[|_•·"']+/g,' ')
    .replace(/\s+/g,' ').trim();
}
function tituloBR(s){
  return String(s).toLowerCase()
    .replace(/(^|[\s\-/(])([a-zà-ÿ])/g,(m,a,b)=>a+b.toUpperCase())
    .replace(/(\d)\s?(kg|g|ml|l|un|lt|cx|pct|mg)\b/gi,(m,d,u)=>d+u.toUpperCase());
}
function parseItemLinha(l, pendente){
  let m=l.match(RE_ITEM_UN), qtd, un, unit;
  if(m){ qtd=numBR(m[1]); un=normUn(m[2]); unit=centsBR(m[3]); }
  else{
    m=l.match(RE_ITEM_X);
    if(!m) return null;
    qtd=numBR(m[1]); un='UN'; unit=centsBR(m[2]);
  }
  if(!(qtd>0) || !(unit>0)) return null;
  const calc=Math.round(qtd*unit);
  const depois=l.slice(m.index+m[0].length).match(RE_DINHEIRO);
  let total=depois? centsBR(depois[depois.length-1]) : 0;
  /* OCR troca dígito com facilidade: total fora de escala volta para qtd × unit */
  if(!total || total>calc*3 || total*3<calc) total=calc;
  let nome=limparNomeItem(l.slice(0, m.index));
  if(nome.replace(/[^A-Za-zÀ-ÿ]/g,'').length<3) nome=pendente||'';
  if(nome.replace(/[^A-Za-zÀ-ÿ]/g,'').length<3) return null;
  return {nome:tituloBR(nome).slice(0,80), qtd, un, unit, desconto:0, total, peso:0};
}
function parseNota(linhas){
  const out={mercado:'', data:'', itens:[], desconto:0, total:0};

  for(const l of linhas.slice(0,10)){
    const t=l.replace(/[^\wÀ-ÿ&. -]/g,' ').replace(/\s+/g,' ').trim();
    if(t.length<5) continue;
    if(/CNPJ|CPF|I\.?E\.?[: ]|INSCR|RUA|AVENIDA|AV\.|ROD\.|CEP|BAIRRO|TEL|DANFE|CUPOM|NFC|DOCUMENTO|EXTRATO/i.test(t)) continue;
    if(!/[A-Za-zÀ-ÿ]{4}/.test(t)) continue;
    out.mercado=tituloBR(t).slice(0,60); break;
  }
  for(const l of linhas){
    const m=l.match(/(\d{2})[\/.\-](\d{2})[\/.\-](\d{2,4})/);
    if(!m) continue;
    const d=+m[1], mo=+m[2]; let y=+m[3];
    if(d<1||d>31||mo<1||mo>12) continue;
    if(y<100) y+=2000;
    if(y<2015||y>2100) continue;
    out.data=`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    break;
  }
  let pagar=0, bruto=0;
  linhas.forEach(l=>{
    const money=l.match(RE_DINHEIRO);
    if(!money) return;
    const ultimo=centsBR(money[money.length-1]);
    /* "valor a pagar" manda: já vem com o desconto tirado */
    if(/(VALOR|TOTAL)\s*A\s*PAGAR/i.test(l)) pagar=ultimo;
    else if(/(VALOR\s*TOTAL|TOTAL\s*(R\$|GERAL)|^TOTAL\b)/i.test(l) && ultimo>bruto) bruto=ultimo;
    if(/DESCONTO/i.test(l) && !out.desconto) out.desconto=ultimo;
  });
  out.total = pagar || bruto;
  let pendente='';
  linhas.forEach(l=>{
    if(RE_IGNORA.test(l)){ pendente=''; return; }
    const it=parseItemLinha(l, pendente);
    if(it){ out.itens.push(it); pendente=''; }
    else if(/[A-Za-zÀ-ÿ]{4}/.test(l) && !l.match(RE_DINHEIRO)) pendente=limparNomeItem(l);
  });
  return out;
}

/* ====================================================================
   CONTAS DA CASA — despesas fixas recorrentes (aluguel, luz, água…)
   Modelo de dados: users/{uid}/contas/{id}
     { nome, valor (esperado, centavos), dia (vencimento, opcional),
       pagamentos:{ "YYYY-MM": valorPagoCentavos }, criadoEm }
   Todo o histórico fica embutido no próprio documento — o gráfico
   mês a mês é montado no cliente, sem consultas extras ao Firestore.
   ==================================================================== */
const ct={conta:''};

function escutarContas(){
  if(state.unsubContas)state.unsubContas();
  state.unsubContas = col('contas').orderBy('criadoEm').onSnapshot(snap=>{
    state.contas = snap.docs.map(d=>({id:d.id,...d.data()}));
    preencherContaSel();
    renderContasList();
    renderContasChart();
  });
}
function contaPago(c, mes){ return c.pagamentos && c.pagamentos[mes]!=null ? c.pagamentos[mes] : null; }

function abrirContas(){
  const de=document.getElementById('ctDe'), ate=document.getElementById('ctAte');
  if(!de.value){ de.value=shiftMes(state.mes,-5); ate.value=state.mes; }
  preencherContaSel();
  renderContasList();
  renderContasChart();
}

function renderContasList(){
  document.getElementById('ctMesLbl').textContent=mesLabel(state.mes);
  const mes=state.mes;
  const box=document.getElementById('contasList');
  box.innerHTML = state.contas.length ? state.contas.map(c=>{
    const pago=contaPago(c, mes);
    const done=pago!=null;
    return `<div class="metaItem ${done?'done':''}" data-id="${c.id}">
      <button type="button" class="metaCheck" title="${done?'Desmarcar':'Marcar como paga'}">${done?'✓':''}</button>
      <div class="metaTxt">${esc(c.nome)}
        <div class="metaDias">${done?'Pago: '+fmt(pago):'Previsto: '+fmt(c.valor||0)}${c.dia?' · vence dia '+c.dia:''}</div>
      </div>
      <button type="button" class="catEditBtn" data-act="edit" title="Editar">✎</button>
      <button type="button" class="txDel" data-act="del" title="Excluir">✕</button>
    </div>`;
  }).join('') : '<div class="empty">Nenhuma conta cadastrada. Toque em "+ Nova conta" para começar.</div>';
  box.querySelectorAll('.metaItem').forEach(el=>{
    const c=state.contas.find(x=>x.id===el.dataset.id); if(!c) return;
    el.querySelector('.metaCheck').onclick=()=>toggleContaPaga(c);
    el.querySelector('[data-act="edit"]').onclick=()=>abrirContaModal(c);
    el.querySelector('[data-act="del"]').onclick=()=>excluirConta(c);
  });

  let pagoSum=0, abertoSum=0, pagas=0;
  state.contas.forEach(c=>{
    const p=contaPago(c, mes);
    if(p!=null){ pagoSum+=p; pagas++; } else abertoSum+=(c.valor||0);
  });
  document.getElementById('kContasPago').textContent=fmt(pagoSum);
  document.getElementById('kContasAberto').textContent=fmt(abertoSum);
  document.getElementById('kContasQtd').textContent=`${pagas} de ${state.contas.length}`;
}

async function toggleContaPaga(c){
  const mes=state.mes;
  if(contaPago(c, mes)!=null){
    if(!confirm(`Desmarcar "${c.nome}" como paga em ${mesLabel(mes)}?`)) return;
    try{ await col('contas').doc(c.id).update({[`pagamentos.${mes}`]:firebase.firestore.FieldValue.delete()}); }
    catch(ex){ toast('Erro: '+ex.message); }
    return;
  }
  const padrao=c.valor?(c.valor/100).toFixed(2).replace('.',','):'';
  const str=prompt(`Valor pago de "${c.nome}" em ${mesLabel(mes)}:`, padrao);
  if(str===null) return;
  const valor=parseValor(str);
  if(!valor){ toast('Valor inválido'); return; }
  try{
    await col('contas').doc(c.id).update({[`pagamentos.${mes}`]:valor});
    toast('Conta marcada como paga! ✅');
  }catch(ex){ toast('Erro: '+ex.message); }
}

async function excluirConta(c){
  if(!confirm(`Excluir a conta "${c.nome}"? Todo o histórico de pagamentos dela se perde.`)) return;
  try{ await col('contas').doc(c.id).delete(); toast('Conta excluída'); }
  catch(ex){ toast('Erro ao excluir: '+ex.message); }
}

let contaEditId=null;
function abrirContaModal(c){
  contaEditId = c ? c.id : null;
  document.getElementById('contaModalTitle').textContent = c ? 'Editar conta' : 'Nova conta';
  document.getElementById('contaNome').value = c ? c.nome : '';
  document.getElementById('contaValor').value = c && c.valor ? (c.valor/100).toFixed(2).replace('.',',') : '';
  document.getElementById('contaDia').value = c && c.dia ? c.dia : '';
  document.getElementById('contaModal').classList.remove('hidden');
}
document.getElementById('btnAddConta').onclick=()=>abrirContaModal(null);
document.getElementById('contaForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const nome=document.getElementById('contaNome').value.trim();
  const valor=parseValor(document.getElementById('contaValor').value);
  const diaStr=document.getElementById('contaDia').value;
  const dia = diaStr ? Math.max(1,Math.min(31,parseInt(diaStr,10))) : null;
  if(!nome){ toast('Dê um nome à conta'); return; }
  if(!valor){ toast('Informe o valor esperado'); return; }
  try{
    if(contaEditId){
      await col('contas').doc(contaEditId).update({nome, valor,
        dia: dia!=null ? dia : firebase.firestore.FieldValue.delete()});
      toast('Conta atualizada');
    }else{
      await col('contas').add({nome, valor, ...(dia!=null?{dia}:{}), pagamentos:{},
        criadoEm:firebase.firestore.FieldValue.serverTimestamp()});
      toast('Conta criada! 🏠');
    }
    document.getElementById('contaModal').classList.add('hidden');
  }catch(ex){ toast('Erro ao salvar: '+ex.message); }
});

function preencherContaSel(){
  const sel=document.getElementById('ctContaSel');
  const atual=ct.conta;
  sel.innerHTML='<option value="">— todas juntas —</option>'+
    state.contas.map(c=>`<option value="${c.id}"${c.id===atual?' selected':''}>${esc(c.nome)}</option>`).join('');
  if(atual && !state.contas.some(c=>c.id===atual)){ ct.conta=''; sel.value=''; }
}
function renderContasChart(){
  let de=document.getElementById('ctDe').value, ate=document.getElementById('ctAte').value;
  if(!de){ de=shiftMes(state.mes,-5); document.getElementById('ctDe').value=de; }
  if(!ate){ ate=state.mes; document.getElementById('ctAte').value=ate; }
  const meses=mesesEntre(de,ate);
  const contasAlvo = ct.conta ? state.contas.filter(c=>c.id===ct.conta) : state.contas;
  const data = meses.map(m=>contasAlvo.reduce((soma,c)=>soma+(contaPago(c,m)||0),0)/100);
  const contaSel = ct.conta && state.contas.find(c=>c.id===ct.conta);
  const titulo = contaSel ? contaSel.nome : 'todas as contas juntas';
  document.getElementById('ctChartTitle').textContent='Gasto mês a mês — '+titulo;
  mkChart('contas','chartContas',{type:'line',
    data:{labels:meses.map(mesCurto), datasets:[{label:titulo, data,
      borderColor:'#a99cf5', backgroundColor:'#a99cf5',
      borderWidth:2, pointRadius:3, tension:.3, fill:false}]},
    options:{maintainAspectRatio:false,
      plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.parsed.y.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}}},
      scales:{y:{ticks:{callback:moedaCB}}}}
  });
}
document.getElementById('ctDe').onchange=renderContasChart;
document.getElementById('ctAte').onchange=renderContasChart;
document.getElementById('ctContaSel').onchange=e=>{ ct.conta=e.target.value; renderContasChart(); };

/* ---------------- Metas do dia (rotinas programáveis) ---------------- */
const DIAS_SEMANA=['dom','seg','ter','qua','qui','sex','sáb'];
let novaDias=new Set();

function diaLabelTxt(d){
  const txt=new Date(d+'T12:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
  return d===hojeISO() ? 'Hoje · '+txt : txt;
}
function diasResumo(dias){
  if(dias.length===7) return 'todos os dias';
  return [1,2,3,4,5,6,0].filter(d=>dias.includes(d)).map(d=>DIAS_SEMANA[d]).join(' · ');
}
function escutarRotinas(){
  if(state.unsubRotinas)state.unsubRotinas();
  state.unsubRotinas = col('rotinas').onSnapshot(snap=>{
    state.rotinas = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderMetas();
    agendarSyncPush();
  });
}
function escutarDiaMetas(){
  if(state.unsubMetaStatus)state.unsubMetaStatus();
  document.getElementById('diaLabel').textContent=diaLabelTxt(state.dia);
  state.unsubMetaStatus = col('metasStatus').doc(state.dia).onSnapshot(doc=>{
    state.metasFeitas = doc.exists ? (doc.data().feitas||{}) : {};
    state.bauDia = doc.exists ? (doc.data().bau||null) : null;
    renderMetas();
  });
}
function rotinasDoDia(){
  const dw=new Date(state.dia+'T12:00').getDay();
  return state.rotinas.filter(r=>Array.isArray(r.dias)&&r.dias.includes(dw))
    .sort((a,b)=>{
      if(a.hora&&b.hora) return a.hora.localeCompare(b.hora);
      if(a.hora) return -1;
      if(b.hora) return 1;
      return ((a.criadoEm&&a.criadoEm.seconds)||0)-((b.criadoEm&&b.criadoEm.seconds)||0);
    });
}
function renderMetas(){
  const rotinas=rotinasDoDia();
  const total=rotinas.length;
  const feitas=rotinas.filter(r=>state.metasFeitas[r.id]).length;
  const pct = total ? Math.round(feitas/total*100) : 0;
  document.getElementById('metaCount').textContent = total ? `${feitas} de ${total} concluídas` : 'Nenhuma meta neste dia';
  document.getElementById('metaBar').style.width = pct+'%';
  document.getElementById('metaEmoji').textContent = !total ? '📝' : feitas===total ? '🎉' : pct>=50 ? '💪' : '🚀';
  document.getElementById('metaMsg').textContent =
    !total ? 'Programe suas metas escolhendo os dias da semana!' :
    feitas===total ? 'Todas concluídas! Você mandou muito bem!' :
    pct>=50 ? 'Metade do caminho! Continue assim!' : 'Bora! Uma meta de cada vez.';

  const box=document.getElementById('metaList');
  box.innerHTML = total ? rotinas.map(r=>{
    const done=!!state.metasFeitas[r.id];
    return `<div class="metaItem ${done?'done':''}" data-id="${r.id}">
      <button class="metaCheck" title="${done?'Desmarcar':'Concluir'}">${done?'✓':''}</button>
      <div class="metaTxt">${esc(r.texto)}<div class="metaDias">${diasResumo(r.dias||[])}</div></div>
      ${r.hora?`<span class="horaBadge">🕐 ${esc(r.hora)}</span>`:''}
      <button class="txDel" title="Excluir">✕</button>
    </div>`;
  }).join('') : '<div class="empty">Nenhuma meta programada para este dia. Crie uma abaixo! ✨</div>';

  box.querySelectorAll('.metaItem').forEach(el=>{
    const id=el.dataset.id;
    el.querySelector('.metaCheck').onclick=async ()=>{
      const novo=!state.metasFeitas[id];
      await col('metasStatus').doc(state.dia).set({feitas:{[id]:novo}},{merge:true});
      if(novo) toast('Meta concluída! 🎉');
    };
    el.querySelector('.txDel').onclick=async ()=>{
      if(confirm('Excluir esta meta? Ela sai de todos os dias da semana.')){
        await col('rotinas').doc(id).delete(); toast('Meta excluída');
      }
    };
  });
  renderBau(total, feitas);
}
function renderDiaChips(){
  document.querySelectorAll('.diaChip[data-d]').forEach(ch=>
    ch.classList.toggle('on', novaDias.has(Number(ch.dataset.d))));
  document.getElementById('chipTodos').classList.toggle('on', novaDias.size===7);
}
document.querySelectorAll('.diaChip[data-d]').forEach(ch=>{
  ch.onclick=()=>{
    const d=Number(ch.dataset.d);
    novaDias.has(d) ? novaDias.delete(d) : novaDias.add(d);
    renderDiaChips();
  };
});
document.getElementById('chipTodos').onclick=()=>{
  novaDias = novaDias.size===7 ? new Set() : new Set([0,1,2,3,4,5,6]);
  renderDiaChips();
};
document.getElementById('metaForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const inp=document.getElementById('metaInput');
  const texto=inp.value.trim();
  if(!texto){ toast('Escreva a meta primeiro'); return; }
  if(!novaDias.size){ toast('Escolha pelo menos um dia da semana'); return; }
  await col('rotinas').add({
    texto, dias:[...novaDias].sort((a,b)=>a-b),
    hora: document.getElementById('metaHora').value || null,
    criadoEm:firebase.firestore.FieldValue.serverTimestamp()
  });
  inp.value=''; document.getElementById('metaHora').value='';
  novaDias=new Set(); renderDiaChips();
  toast('Meta programada! 📅');
  inp.focus();
});
document.getElementById('prevDia').onclick=()=>{ state.dia=shiftDia(state.dia,-1); escutarDiaMetas(); };
document.getElementById('nextDia').onclick=()=>{ state.dia=shiftDia(state.dia, 1); escutarDiaMetas(); };
document.getElementById('btnHojeDia').onclick=()=>{ state.dia=hojeISO(); escutarDiaMetas(); };

/* ---------------- Baú de recompensas / Coleção de pets ---------------- */
const RAR={
  comum:   {label:'Comum',    p:60, emoji:'🐣'},
  raro:    {label:'Raro',     p:25, emoji:'⭐'},
  epico:   {label:'Épico',    p:12, emoji:'💜'},
  lendario:{label:'Lendário', p:3,  emoji:'👑'},
};
const PETS=[
  // comuns (12)
  ['pink-blob','Bolha Rosa','comum'],['green-blob','Bolha Verde','comum'],['green-spiky-blob','Bolha Espinhosa','comum'],
  ['pigeon','Pombo','comum'],['chicken','Galinha','comum'],['cat','Gato','comum'],['fish','Peixe','comum','Peixes'],
  ['frog','Sapo','comum'],['bunny','Coelho','comum'],['birb','Passarinho','comum'],['mushnub','Mushnub','comum'],['glub','Glub','comum'],
  // raros (14)
  ['alpaking','Alpaking','raro'],['armabee','Armabee','raro'],['cactoro','Cactoro','raro'],['goleling','Goleling','raro'],
  ['orc','Orc','raro'],['ninja','Ninja','raro'],['wizard','Mago','raro'],['ghost','Fantasma','raro'],['squidle','Lulinha','raro'],
  ['hywirl','Hywirl','raro'],['monkroose','Monkroose','raro'],['tribal','Guerreiro Tribal','raro'],['dino','Dino','raro'],['alien','Alien','raro'],
  // épicos (10)
  ['alpaking-evolved','Alpaking Evoluído','epico'],['armabee-evolved','Armabee Evoluída','epico'],['glub-evolved','Glub Evoluído','epico'],
  ['goleling-evolved','Goleling Evoluído','epico'],['mushnub-evolved','Mushnub Evoluído','epico'],['yeti','Yeti','epico'],
  ['demon','Demônio','epico'],['blue-demon','Demônio Azul','epico'],['ghost-skull','Caveira Fantasma','epico'],['orc-enemy','Orc Guerreiro','epico'],
  // lendários (3)
  ['dragon','Dragão','lendario'],['dragon-evolved','Dragão Ancestral','lendario'],['mushroom-king','Rei Cogumelo','lendario'],
  // novos comum (67)
  ['abelha','Abelha','comum'],['antilope','Antílope','comum'],['atum','Atum','comum','Peixes'],['avestruz','Avestruz','comum'],['babuino','Babuíno','comum'],
  ['borboleta','Borboleta','comum'],['bufalo','Búfalo','comum'],['cabra','Cabra','comum'],['cachorro','Cachorro','comum'],
  ['cachorro-quadrado','Cachorro Quadrado','comum'],['canguru','Canguru','comum'],['caranguejo','Caranguejo','comum'],['carneiro','Carneiro','comum'],
  ['cavala','Cavala','comum','Peixes'],['cavalo','Cavalo','comum'],['cavalo-quadrado','Cavalo Quadrado','comum'],['cavalo-selvagem','Cavalo Selvagem','comum'],
  ['coala','Coala','comum'],['coelho-branco','Coelho Branco','comum'],['coiote','Coiote','comum'],['corvo','Corvo','comum'],['emu','Emu','comum'],
  ['enguia','Enguia','comum','Peixes'],['estrela-do-mar','Estrela-do-mar','comum'],['foca','Foca','comum'],['formiga','Formiga','comum'],
  ['galinha-branca','Galinha Branca','comum'],['gamba','Gambá','comum'],['gato-cinza','Gato Cinza','comum'],['geleca','Geleca','comum'],
  ['golfinho','Golfinho','comum'],['guaxinim','Guaxinim','comum'],['guaxinim-quadrado','Guaxinim Quadrado','comum'],['hamster','Hamster','comum'],
  ['lagartixa','Lagartixa','comum'],['lagarto','Lagarto','comum'],['lhama','Lhama','comum'],['libelula','Libélula','comum'],
  ['linguado','Linguado','comum','Peixes'],['lula','Lula','comum'],['macaco','Macaco','comum'],['ovelha','Ovelha','comum'],
  ['ovelha-quadrada','Ovelha Quadrada','comum'],['pato','Pato','comum'],['peixe-cinza','Peixe Cinza','comum','Peixes'],
  ['peixe-laranja','Peixe Laranja','comum','Peixes'],['peixe-agulha','Peixe-agulha','comum','Peixes'],['peixinho','Peixinho','comum','Peixes'],['pinguim','Pinguim','comum'],
  ['pintinho','Pintinho','comum'],['plantinha','Plantinha','comum'],['polvinho','Polvinho','comum'],['porco','Porco','comum'],
  ['porco-quadrado','Porco Quadrado','comum'],['pug','Pug','comum'],['raposa','Raposa','comum'],['rato','Rato','comum'],['salmao','Salmão','comum','Peixes'],
  ['sapo-verde','Sapo Verde','comum'],['tamandua','Tamanduá','comum'],['texugo','Texugo','comum'],['urso','Urso','comum'],['urubu','Urubu','comum'],
  ['vaca','Vaca','comum'],['vaca-holandesa','Vaca Holandesa','comum'],['zebra','Zebra','comum'],['zebra-listrada','Zebra Listrada','comum'],
  // novos raro (41)
  ['anne','Anne','raro'],['arara-azul','Arara-azul','raro'],['arara-vermelha','Arara-vermelha','raro'],['arraia','Arraia','raro'],
  ['baleia-azul','Baleia Azul','raro'],['preguica','Bicho-preguiça','raro'],['capivara','Capivara','raro'],['caveirao','Caveirão','raro'],
  ['cervo','Cervo','raro'],['cobra','Cobra','raro'],['elefante','Elefante','raro'],['escorpiao','Escorpião','raro'],['esqueleto','Esqueleto','raro'],
  ['gato-selvagem','Gato-selvagem','raro'],['geleca-chifruda','Geleca Chifruda','raro'],['girafa','Girafa','raro'],['goblin','Goblin','raro'],
  ['golfinho-azul','Golfinho Azul','raro'],['henry','Henry','raro'],['lis','Lis','raro'],['lobo','Lobo','raro'],['matt','Matt','raro'],
  ['morcego','Morcego','raro'],['morsa','Morsa','raro'],['pastor-alemao','Pastor Alemão','raro'],['peixe-monstro','Peixe Monstro','raro'],
  ['peixe-boi','Peixe-boi','raro'],['planta-gigante','Planta Gigante','raro'],['planta-voadora','Planta Voadora','raro'],['polvo','Polvo','raro'],
  ['porco-espinho','Porco-espinho','raro'],['pug-aventureiro','Pug Aventureiro','raro'],['rinoceronte','Rinoceronte','raro'],['sam','Sam','raro'],
  ['shaun','Shaun','raro'],['shiba','Shiba','raro'],['tartaruga','Tartaruga','raro'],['touro','Touro','raro'],['tubarao','Tubarão','raro'],
  ['zumbi-bracudo','Zumbi Braçudo','raro'],['agua-viva','Água-viva','raro'],
  // novos epico (18)
  ['apatossauro','Apatossauro','epico'],['astronauta-abelha','Astronauta Abelha','epico'],['astronauta-flamingo','Astronauta Flamingo','epico'],
  ['astronauta-sapo','Astronauta Sapo','epico'],['baleia','Baleia','epico'],['cactoro-gigante','Cactoro Gigante','epico'],
  ['demonio-tridente','Demônio Tridente','epico'],['esqueleto-guerreiro','Esqueleto Guerreiro','epico'],['estegossauro','Estegossauro','epico'],
  ['leao','Leão','epico'],['mako','Mako','epico'],['narval','Narval','epico'],['ninja-mestre','Ninja Mestre','epico'],
  ['parassaurolofo','Parassaurolofo','epico'],['sharky','Sharky','epico'],['tigre','Tigre','epico'],['tubarao-feroz','Tubarão Feroz','epico'],
  ['velociraptor','Velociraptor','epico'],
  // novos lendario (7)
  ['alien-gigante','Alien Gigante','lendario'],['capitao-pirata','Capitão Pirata','lendario'],['gigante','Gigante','lendario'],
  ['robo-abelha','Robô Abelha','lendario'],['robo-flamingo','Robô Flamingo','lendario'],['robo-panda-vermelho','Robô Panda-vermelho','lendario'],
  ['robo-sapo','Robô Sapo','lendario'],
  // monstros2 comum (10)
  ['morceguinho','Morceguinho','comum'],
  ['abelhinha','Abelhinha','comum'],
  ['cactinho','Cactinho','comum'],
  ['franguinho','Franguinho','comum'],
  ['caranguejinho','Caranguejinho','comum'],
  ['cervinho','Cervinho','comum'],
  ['fantasminha','Fantasminha','comum'],
  ['cogumelinho','Cogumelinho','comum'],
  ['pinguinzinho','Pinguinzinho','comum'],
  ['porquinho','Porquinho','comum'],
  // monstros2 raro (6)
  ['alien-alto','Alien Alto','raro'],
  ['alien-fofo','Alien Fofo','raro'],
  ['diabinho','Diabinho','raro'],
  ['diabinho-verde','Diabinho Verde','raro'],
  ['panda','Panda','raro'],
  ['caveirinha','Caveirinha','raro'],
  // monstros2 epico (3)
  ['ciclope','Ciclope','epico'],
  ['arvore-viva','Árvore Viva','epico'],
  ['yetizinho','Yetizinho','epico'],
  // monstros2 lendario (2)
  ['cthulhu','Cthulhu','lendario'],
  ['dragao-amarelo','Dragão Amarelo','lendario'],
  // peixes comum (17)
  ['cascudo','Cascudo','comum','Peixes'],
  ['peixe-borboleta','Peixe-borboleta','comum','Peixes'],
  ['peixe-cardeal','Peixe-cardeal','comum','Peixes'],
  ['garoupa','Garoupa','comum','Peixes'],
  ['peixe-vaca','Peixe-vaca','comum','Peixes'],
  ['solha','Solha','comum','Peixes'],
  ['kinguio','Kinguio','comum','Peixes'],
  ['peixe-papagaio','Peixe-papagaio','comum','Peixes'],
  ['baiacu','Baiacu','comum','Peixes'],
  ['pargo','Pargo Vermelho','comum','Peixes'],
  ['grama-real','Grama-real','comum','Peixes'],
  ['cirurgiao','Cirurgião','comum','Peixes'],
  ['tetra','Tetra','comum','Peixes'],
  ['atum-azul','Atum Azul','comum','Peixes'],
  ['pregado','Pregado','comum','Peixes'],
  ['minhoca','Minhoca','comum','Peixes'],
  ['cirurgiao-amarelo','Cirurgião-amarelo','comum','Peixes'],
  // peixes raro (12)
  ['betta','Betta','raro','Peixes'],
  ['peixe-bolha','Peixe-bolha','raro','Peixes'],
  ['kinguio-azul','Kinguio Azul','raro','Peixes'],
  ['cirurgiao-azul','Cirurgião-azul','raro','Peixes'],
  ['peixe-palhaco','Peixe-palhaço','raro','Peixes'],
  ['flower-horn','Flower Horn','raro','Peixes'],
  ['peixe-napoleao','Peixe-napoleão','raro','Peixes'],
  ['peixe-leao','Peixe-leão','raro','Peixes'],
  ['idolo-mourisco','Ídolo-mourisco','raro','Peixes'],
  ['piranha','Piranha','raro','Peixes'],
  ['tubarao-cinza','Tubarão Cinza','raro','Peixes'],
  ['palhaco-zebra','Palhaço-zebra','raro','Peixes'],
  // peixes epico (6)
  ['peixe-diabo','Peixe-diabo','epico','Peixes'],
  ['peixe-leao-negro','Peixe-leão Negro','epico','Peixes'],
  ['carpa-koi','Carpa Koi','epico','Peixes'],
  ['peixe-mandarim','Peixe-mandarim','epico','Peixes'],
  ['peixe-lua','Peixe-lua','epico','Peixes'],
  ['peixe-espada','Peixe-espada','epico','Peixes'],
  // peixes lendario (1)
  ['tubarao-duende','Tubarão-duende','lendario','Peixes'],
].map(([id,nome,r,tipo])=>({id,nome,r,rPadrao:r,tipoPadrao:tipo||'',tipo:''}));
const petById=id=>PETS.find(p=>p.id===id);
const RAR_P_PADRAO={comum:60,raro:25,epico:12,lendario:3};

/* Configuração dos pets feita na aba Admin: doc petsConfig/geral, vale para todos os usuários.
   {rar:{comum,raro,epico,lendario} em %, repetida: % de chance de vir um pet que a pessoa já tem,
    tipos:[nomes, na ordem], pets:{id:{r,tipo}}}. Sem o doc, vale o padrão deste arquivo. */
function aplicarPetsCfg(cfg){
  state.petsCfg=cfg||null;
  const rar=(cfg&&cfg.rar)||{};
  Object.keys(RAR).forEach(k=>{ RAR[k].p = typeof rar[k]==='number' ? rar[k] : RAR_P_PADRAO[k]; });
  const pc=(cfg&&cfg.pets)||{};
  // pets que o Admin ainda não mexeu ficam no tipo padrão do código (ex.: "Peixes")
  const tipos=[...((cfg&&cfg.tipos)||[])];
  PETS.forEach(p=>{ if(!pc[p.id] && p.tipoPadrao && !tipos.includes(p.tipoPadrao)) tipos.push(p.tipoPadrao); });
  if(state.petsCfg) state.petsCfg={...state.petsCfg, tipos}; else if(tipos.length) state.petsCfg={tipos};
  PETS.forEach(p=>{
    const c=pc[p.id];
    p.r = c && RAR[c.r] ? c.r : p.rPadrao;
    p.tipo = c ? (tipos.includes(c.tipo) ? c.tipo : '') : p.tipoPadrao;
  });
}

function escutarPetsCfg(){
  if(state.unsubPetsCfg)state.unsubPetsCfg();
  state.unsubPetsCfg = db.collection('petsConfig').doc('geral').onSnapshot(doc=>{
    aplicarPetsCfg(doc.exists ? doc.data() : null);
    renderPets();
    if(!adm.sujo) renderAdmin();
  }, ()=>{ aplicarPetsCfg(null); renderPets(); }); // regras antigas sem petsConfig: segue com o padrão
}

// chance de cada raridade sair, considerando só as raridades que existem no grupo
function sortearRaridade(pool){
  const rars=Object.keys(RAR).filter(r=>RAR[r].p>0 && pool.some(p=>p.r===r));
  if(!rars.length) return null;
  let x=Math.random()*rars.reduce((s,r)=>s+RAR[r].p,0);
  for(const r of rars){ if(x<RAR[r].p) return r; x-=RAR[r].p; }
  return rars[rars.length-1];
}

function sortearPet(){
  let pool=PETS;
  const rep=state.petsCfg && typeof state.petsCfg.repetida==='number' ? state.petsCfg.repetida : null;
  if(rep!==null){ // a % de repetida decide se sai dos pets que a pessoa já tem ou dos que faltam
    const tem=new Set(state.inventario.map(i=>i.pet));
    const novos=PETS.filter(p=>!tem.has(p.id)), velhos=PETS.filter(p=>tem.has(p.id));
    pool = !novos.length ? velhos : !velhos.length ? novos : (Math.random()*100<rep ? velhos : novos);
  }
  const r=sortearRaridade(pool);
  const opcoes=r ? pool.filter(p=>p.r===r) : pool;
  return opcoes[Math.floor(Math.random()*opcoes.length)];
}

function escutarInventario(){
  if(state.unsubInv)state.unsubInv();
  state.unsubInv = col('inventario').onSnapshot(snap=>{
    state.inventario = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderPets();
  });
}

function renderBau(total, feitas){
  const box=document.getElementById('bauBox');
  if(!total){ box.innerHTML=''; return; }
  if(state.bauDia){
    const pet=petById(state.bauDia.pet);
    box.innerHTML=`<div class="bauHint">🎁 Baú do dia aberto: <b>${pet?esc(pet.nome):'?'}</b> ${RAR[state.bauDia.r].emoji} — veja na aba Coleção!</div>`;
    return;
  }
  if(feitas===total){
    box.innerHTML=`<div class="card bauCard">
      <div class="emoji">🎁</div>
      <div class="info"><div class="t">Você ganhou um baú!</div>
      <div class="s">Todas as metas do dia concluídas. Dentro dele vem um pet surpresa…</div></div>
      <button id="btnAbrirBau">Abrir baú</button>
    </div>`;
    document.getElementById('btnAbrirBau').onclick=abrirBau;
  }else{
    box.innerHTML=`<div class="bauHint">🎁 Complete todas as metas do dia para ganhar um baú com um pet surpresa! (${feitas}/${total})</div>`;
  }
}

// deixa o pet parado no primeiro quadro da animação (evita a pose em T); rotação manual continua livre
function poseParada(mv){
  if(!mv) return;
  mv.addEventListener('load',()=>{
    if(!mv.availableAnimations.length) return;
    try{ mv.play(); mv.pause(); mv.currentTime=0; }catch(e){}
  },{once:true});
}

async function abrirBau(){
  if(state.bauDia) return;
  const pet=sortearPet();
  const dia=state.dia;
  await col('metasStatus').doc(dia).set({bau:{pet:pet.id, r:pet.r,
    abertoEm:firebase.firestore.FieldValue.serverTimestamp()}},{merge:true});
  await col('inventario').add({pet:pet.id, r:pet.r, data:dia,
    criadoEm:firebase.firestore.FieldValue.serverTimestamp()});
  // animação: baú tremendo → revelação
  const body=document.getElementById('bauModalBody');
  body.innerHTML=`<div class="fase1">🎁</div><h3>Abrindo…</h3>`;
  document.getElementById('bauModal').classList.remove('hidden');
  setTimeout(()=>{
    body.innerHTML=`<div class="glow-${pet.r}">
      <model-viewer camera-orbit="30deg 75deg auto" src="pets/${pet.id}.glb" loading="eager" camera-controls disable-zoom shadow-intensity="1"></model-viewer></div>
      <h3>${esc(pet.nome)}</h3>
      <span class="rarPill r-${pet.r}">${RAR[pet.r].emoji} ${RAR[pet.r].label}</span>
      <div class="modalActions" style="margin-top:16px"><button class="btnPrimary" data-close>Que fofo!</button></div>`;
    poseParada(body.querySelector('model-viewer'));
    body.querySelector('[data-close]').onclick=()=>document.getElementById('bauModal').classList.add('hidden');
  },1600);
}

function renderPets(){
  const donos={};
  state.inventario.forEach(i=>{ donos[i.pet]=(donos[i.pet]||0)+1; });
  const descobertos=Object.keys(donos).length;
  document.getElementById('petCount').textContent=`${descobertos} de ${PETS.length} descobertos`;
  document.getElementById('petBar').style.width=Math.round(descobertos/PETS.length*100)+'%';

  const ordem={lendario:0,epico:1,raro:2,comum:3};
  const pets=[...PETS].sort((a,b)=> (donos[b.id]?1:0)-(donos[a.id]?1:0) || ordem[a.r]-ordem[b.r] || a.nome.localeCompare(b.nome));
  const grade=lista=>`<div class="petGrid">${lista.map(cardPet).join('')}</div>`;
  const cardPet=p=>{
    const tem=donos[p.id];
    return tem
      ? `<div class="petCard b-${p.r}" data-pet="${p.id}">
          <div class="pic"><model-viewer camera-orbit="30deg 75deg auto" src="pets/${p.id}.glb" loading="lazy" interaction-prompt="none" disable-zoom disable-tap disable-pan></model-viewer></div>
          <div class="nm">${esc(p.nome)}</div>
          <div class="qtd">${tem>1?'×'+tem:'&nbsp;'}</div></div>`
      : `<div class="petCard locked b-${p.r}">
          <div class="pic"><img src="pets/silhouettes/${p.id}.png" alt="???" onerror="this.replaceWith('❔')"></div>
          <div class="nm">???</div>
          <div class="qtd">&nbsp;</div></div>`;
  };
  // com tipos definidos no Admin, a coleção aparece separada por tipo
  const tipos=(state.petsCfg&&state.petsCfg.tipos)||[];
  if(PETS.some(p=>p.tipo)){
    const grupos=[...tipos,''].map(t=>({t, lista:pets.filter(p=>p.tipo===t)})).filter(g=>g.lista.length);
    document.getElementById('petGrid').innerHTML=grupos.map(g=>
      `<h3 class="petTipo">${g.t?esc(g.t):'Outros'}<span>${g.lista.filter(p=>donos[p.id]).length} de ${g.lista.length}</span></h3>${grade(g.lista)}`).join('');
  }else{
    document.getElementById('petGrid').innerHTML=grade(pets);
  }

  document.querySelectorAll('#petGrid .petCard[data-pet]').forEach(card=>{
    card.onclick=()=>abrirPetModal(petById(card.dataset.pet));
  });
}

// mostra o monstro em 3D (coleção e Admin)
function abrirPetModal(p){
  const body=document.getElementById('petModalBody');
  body.innerHTML=`<div class="glow-${p.r}">
    <model-viewer camera-orbit="30deg 75deg auto" src="pets/${p.id}.glb" loading="eager" camera-controls shadow-intensity="1"></model-viewer></div>
    <h3>${esc(p.nome)}</h3>
    <span class="rarPill r-${p.r}">${RAR[p.r].emoji} ${RAR[p.r].label}</span>
    <div class="modalActions" style="margin-top:16px"><button class="btnGhost" data-close style="flex:1">Fechar</button></div>`;
  poseParada(body.querySelector('model-viewer'));
  body.querySelector('[data-close]').onclick=()=>document.getElementById('petModal').classList.add('hidden');
  document.getElementById('petModal').classList.remove('hidden');
}

/* ---------------- Admin dos pets ----------------
   Só aparece para quem tem um doc em admins/{uid} (criado à mão no console do Firebase).
   As regras do Firestore garantem que só essas pessoas gravam petsConfig/geral. */
const adm={rasc:null, sujo:false};   // rascunho da tela e se tem mudança não salva

function verificarAdmin(){
  state.admin=false;
  document.getElementById('tabAdminBtn').classList.add('hidden');
  const uid=state.uid;
  db.collection('admins').doc(uid).get().then(d=>{
    if(state.uid!==uid) return;
    state.admin=d.exists;
    document.getElementById('tabAdminBtn').classList.toggle('hidden', !d.exists);
  }).catch(()=>{});
}

function admRascunhoAtual(){
  const c=state.petsCfg||{};
  return {
    rar:Object.fromEntries(Object.keys(RAR).map(k=>[k,RAR[k].p])),
    repetida: typeof c.repetida==='number' ? c.repetida : 30,
    tipos:[...(c.tipos||[])],
    pets:Object.fromEntries(PETS.map(p=>[p.id,{r:p.r, tipo:p.tipo}])),
  };
}

function abrirAdmin(){ renderAdmin(); }
function admMudou(){ adm.sujo=true; renderAdmin(); }
const admNum=v=>Math.round(Number(String(v).replace(',','.'))*100)/100;
const admPct=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:2})+'%';

function admSomaRar(){
  const soma=Object.values(adm.rasc.rar).reduce((s,v)=>s+(Number(v)||0),0);
  const el=document.getElementById('admSoma');
  const ok=Math.abs(soma-100)<0.01;
  el.textContent = ok ? 'Soma: 100% ✓' : `Soma: ${admPct(soma)}. Precisa dar 100%.`;
  el.classList.toggle('erro', !ok);
  return ok;
}

function renderAdmin(){
  if(!state.admin) return;
  if(!adm.rasc || !adm.sujo) adm.rasc=admRascunhoAtual();
  const R=adm.rasc;

  document.getElementById('admRar').innerHTML=Object.keys(RAR).map(k=>
    `<div class="field"><label>${RAR[k].emoji} ${RAR[k].label} (%)</label>
      <input type="number" min="0" max="100" step="0.1" inputmode="decimal" data-rar="${k}" value="${R.rar[k]}"></div>`).join('');
  document.querySelectorAll('#admRar input').forEach(i=>{
    i.oninput=()=>{ R.rar[i.dataset.rar]=admNum(i.value)||0; adm.sujo=true; admSomaRar(); };
    i.onchange=()=>renderAdmin();   // atualiza a chance de cada monstro ao sair do campo
  });
  admSomaRar();

  const repEl=document.getElementById('admRep');
  repEl.value=R.repetida;
  const repHint=()=>{ document.getElementById('admRepHint').textContent =
    `Em ${admPct(R.repetida)} dos baús pode vir um pet repetido; nos outros ${admPct(100-R.repetida)} vem um que a pessoa ainda não tem (enquanto faltar algum).`; };
  repEl.oninput=()=>{ R.repetida=Math.min(100,Math.max(0,admNum(repEl.value)||0)); adm.sujo=true; repHint(); };
  repHint();

  const qtdTipo=t=>Object.values(R.pets).filter(p=>p.tipo===t).length;
  document.getElementById('admTipos').innerHTML = R.tipos.length ? R.tipos.map((t,i)=>
    `<div class="campoItem" data-i="${i}">
      <div class="txInfo"><div class="d">${esc(t)}</div><div class="c">${qtdTipo(t)} monstro(s)</div></div>
      <button type="button" class="catEditBtn" data-act="ren" title="Renomear">✎</button>
      <button type="button" class="txDel" data-act="del" title="Excluir">✕</button>
    </div>`).join('') : '<div class="empty">Nenhum tipo ainda. Crie o primeiro abaixo.</div>';
  document.querySelectorAll('#admTipos [data-act]').forEach(b=>{
    b.onclick=()=>{
      const i=Number(b.closest('.campoItem').dataset.i), velho=R.tipos[i];
      if(b.dataset.act==='ren'){
        const novo=(prompt('Novo nome do tipo:', velho)||'').trim().slice(0,30);
        if(!novo || novo===velho) return;
        if(R.tipos.some(t=>t.toLowerCase()===novo.toLowerCase() && t!==velho)) return toast('Já existe um tipo com esse nome.');
        R.tipos[i]=novo;
        Object.values(R.pets).forEach(p=>{ if(p.tipo===velho) p.tipo=novo; });
      }else{
        if(!confirm(`Excluir o tipo "${velho}"? Os monstros dele ficam sem tipo.`)) return;
        R.tipos.splice(i,1);
        Object.values(R.pets).forEach(p=>{ if(p.tipo===velho) p.tipo=''; });
      }
      admMudou();
    };
  });

  // chance de cada monstro num sorteio entre todos (sem contar a regra de repetidos)
  const somaR=Object.keys(RAR).filter(r=>PETS.some(p=>R.pets[p.id].r===r)).reduce((s,r)=>s+(R.rar[r]||0),0);
  const chance=p=>{ const r=R.pets[p.id].r, n=PETS.filter(x=>R.pets[x.id].r===r).length;
    return somaR ? (R.rar[r]||0)/somaR/n*100 : 0; };
  const ordem={lendario:0,epico:1,raro:2,comum:3};
  const optsTipo=sel=>['',...R.tipos].map(t=>`<option value="${esc(t)}"${t===sel?' selected':''}>${t?esc(t):'— sem tipo —'}</option>`).join('');
  const optsRar=sel=>Object.keys(RAR).map(k=>`<option value="${k}"${k===sel?' selected':''}>${RAR[k].emoji} ${RAR[k].label}</option>`).join('');
  const grupos=[...R.tipos,''].map(t=>({t, lista:PETS.filter(p=>R.pets[p.id].tipo===t)
    .sort((a,b)=>ordem[R.pets[a.id].r]-ordem[R.pets[b.id].r] || a.nome.localeCompare(b.nome))})).filter(g=>g.lista.length);
  // mesmos cards da coleção, com o monstro colorido; tocar na imagem abre em 3D
  document.getElementById('admPets').innerHTML=grupos.map(g=>
    `<div class="admGrupo">${g.t?esc(g.t):'Sem tipo'}<span>${g.lista.length}</span></div>
    <div class="petGrid">${g.lista.map(p=>`<div class="petCard admPet b-${R.pets[p.id].r}" data-pet="${p.id}">
      <div class="pic" title="Ver em 3D"><img src="pets/thumbs/${p.id}.webp" alt="" loading="lazy" onerror="this.src='pets/silhouettes/${p.id}.png'"></div>
      <div class="nm">${esc(p.nome)}</div>
      <div class="qtd">≈ ${admPct(chance(p))} por baú</div>
      <select data-f="tipo" aria-label="Tipo de ${esc(p.nome)}">${optsTipo(R.pets[p.id].tipo)}</select>
      <select data-f="r" aria-label="Raridade de ${esc(p.nome)}">${optsRar(R.pets[p.id].r)}</select>
    </div>`).join('')}</div>`).join('');
  document.querySelectorAll('#admPets .pic').forEach(pic=>{
    pic.onclick=()=>abrirPetModal(petById(pic.closest('.admPet').dataset.pet));
  });
  document.querySelectorAll('#admPets select').forEach(sel=>{
    sel.onchange=()=>{ R.pets[sel.closest('.admPet').dataset.pet][sel.dataset.f]=sel.value; admMudou(); };
  });
}

document.getElementById('admTipoForm').addEventListener('submit', e=>{
  e.preventDefault();
  const inp=document.getElementById('admTipoNome'), nome=inp.value.trim().slice(0,30);
  if(!nome || !adm.rasc) return;
  if(adm.rasc.tipos.some(t=>t.toLowerCase()===nome.toLowerCase())) return toast('Já existe um tipo com esse nome.');
  if(adm.rasc.tipos.length>=50) return toast('Limite de 50 tipos.');
  adm.rasc.tipos.push(nome); inp.value='';
  admMudou();
});
document.getElementById('admDescartar').onclick=()=>{ adm.sujo=false; renderAdmin(); toast('Mudanças descartadas.'); };
document.getElementById('admSalvar').onclick=async()=>{
  const R=adm.rasc; if(!R) return;
  if(!admSomaRar()) return toast('A soma das raridades precisa dar 100%.');
  const btn=document.getElementById('admSalvar'); btn.disabled=true;
  try{
    await db.collection('petsConfig').doc('geral').set({
      rar:Object.fromEntries(Object.keys(RAR).map(k=>[k,admNum(R.rar[k])||0])),
      repetida:R.repetida,
      tipos:R.tipos,
      pets:Object.fromEntries(PETS.map(p=>[p.id,{r:R.pets[p.id].r, tipo:R.pets[p.id].tipo}])),
      atualizadoEm:firebase.firestore.FieldValue.serverTimestamp(),
    });
    adm.sujo=false;
    toast('Salvo! Vale a partir do próximo baú. ✅');
  }catch(ex){
    console.error('admin pets:', ex);
    toast('Não deu para salvar. Confira se as regras novas do Firestore foram publicadas.');
  }
  btn.disabled=false;
};

/* ---------------- Campos personalizados ---------------- */
const TIPO_CAMPO_LABEL={texto:'Texto simples',monetario:'Monetário (R$)',numero:'Numérico',data:'Data',opcoes:'Opções'};

function escutarCampos(){
  if(state.unsubCampos)state.unsubCampos();
  state.unsubCampos = col('camposCustom').onSnapshot(snap=>{
    state.camposCustom = snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>((a.criadoEm&&a.criadoEm.seconds)||0)-((b.criadoEm&&b.criadoEm.seconds)||0));
    renderCamposModal();
    renderTudo();
  });
}

function renderCamposModal(){
  const box=document.getElementById('camposList');
  box.innerHTML = state.camposCustom.length ? state.camposCustom.map(c=>`
    <div class="campoItem" data-id="${c.id}">
      <div class="txInfo"><div class="d">${esc(c.nome)}</div>
        <div class="c">${TIPO_CAMPO_LABEL[c.tipo]||esc(c.tipo)}${c.tipo==='opcoes'?': '+(c.opcoes||[]).map(esc).join(', '):''}</div></div>
      <button class="txDel" title="Excluir">✕</button>
    </div>`).join('') : '<div class="empty">Nenhum campo personalizado ainda.</div>';
  box.querySelectorAll('.txDel').forEach(b=>{
    b.onclick=async ()=>{
      if(confirm('Excluir este campo? Os valores já preenchidos deixam de aparecer nos lançamentos.')){
        await col('camposCustom').doc(b.closest('.campoItem').dataset.id).delete();
        toast('Campo excluído');
      }
    };
  });
}

document.getElementById('btnCampos').onclick=()=>document.getElementById('camposModal').classList.remove('hidden');
document.getElementById('campoTipo').onchange=e=>
  document.getElementById('campoOpcoesBox').classList.toggle('hidden', e.target.value!=='opcoes');
document.getElementById('campoForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const nome=document.getElementById('campoNome').value.trim();
  const tipo=document.getElementById('campoTipo').value;
  if(!nome){ toast('Dê um nome ao campo'); return; }
  let opcoes=null;
  if(tipo==='opcoes'){
    opcoes=document.getElementById('campoOpcoes').value.split(',').map(s=>s.trim()).filter(Boolean);
    if(!opcoes.length){ toast('Cadastre pelo menos uma opção'); return; }
  }
  await col('camposCustom').add({nome, tipo, ...(opcoes?{opcoes}:{}),
    criadoEm:firebase.firestore.FieldValue.serverTimestamp()});
  document.getElementById('campoNome').value='';
  document.getElementById('campoOpcoes').value='';
  toast('Campo criado! Ele aparece em todo lançamento.');
});

function renderTxCustomFields(tx){
  const box=document.getElementById('txCustomFields');
  box.innerHTML = state.camposCustom.map(c=>{
    const v = tx&&tx.custom ? tx.custom[c.id] : undefined;
    const attrs=`data-campo="${c.id}" data-ctipo="${c.tipo}" data-cnome="${esc(c.nome)}"`;
    let input;
    if(c.tipo==='opcoes')
      input=`<select ${attrs}><option value="">—</option>${(c.opcoes||[]).map(o=>`<option${v===o?' selected':''}>${esc(o)}</option>`).join('')}</select>`;
    else if(c.tipo==='data')
      input=`<input type="date" ${attrs} value="${v||''}">`;
    else if(c.tipo==='numero')
      input=`<input inputmode="decimal" ${attrs} value="${v!==undefined&&v!==null?v:''}">`;
    else if(c.tipo==='monetario')
      input=`<input inputmode="decimal" placeholder="0,00" ${attrs} value="${v!==undefined&&v!==null?(v/100).toFixed(2).replace('.',','):''}">`;
    else
      input=`<input maxlength="120" ${attrs} value="${v?esc(v):''}">`;
    return `<div class="field"><label>${esc(c.nome)}</label>${input}</div>`;
  }).join('');
}

function lerCustom(){
  const custom={}; let erro=null;
  document.querySelectorAll('#txCustomFields [data-campo]').forEach(el=>{
    const id=el.dataset.campo, tipo=el.dataset.ctipo;
    const raw=String(el.value||'').trim();
    if(!raw) return;
    if(tipo==='monetario'){
      const c=parseValor(raw);
      if(c===null){ erro=`Valor inválido no campo "${el.dataset.cnome}"`; return; }
      custom[id]=c;
    }else if(tipo==='numero'){
      const n=parseFloat(raw.replace(',','.'));
      if(isNaN(n)){ erro=`Número inválido no campo "${el.dataset.cnome}"`; return; }
      custom[id]=n;
    }else custom[id]=raw;
  });
  if(erro){ toast(erro); return undefined; }
  return custom;
}

/* ---------------- Perfil do usuário ---------------- */
let fotoPendente; // undefined = sem mudança, null = remover, string = nova foto (data URL)

function escutarPerfil(){
  if(state.unsubPerfil)state.unsubPerfil();
  state.unsubPerfil = col('perfil').doc('dados').onSnapshot(doc=>{
    if(!doc.exists && state.nome){ // 1º acesso verificado: cria o doc que o cadastro não grava mais
      const novo={nome:state.nome};
      const aceite=localStorage.getItem('aceitePend_'+state.uid);
      if(aceite){ novo.aceite=aceite; localStorage.removeItem('aceitePend_'+state.uid); }
      col('perfil').doc('dados').set(novo,{merge:true}).catch(()=>{});
    }
    state.perfil = doc.exists ? doc.data() : {};
    if(state.perfil.nome) state.nome=state.perfil.nome;
    renderPerfilChip();
  });
}
function renderPerfilChip(){
  document.getElementById('userName').textContent=state.nome;
  document.getElementById('userAvatar').innerHTML =
    state.perfil.foto ? `<img src="${state.perfil.foto}" alt="">` : '👤';
}

/* ---------------- Notificações push de metas ---------------- */
const PUSH_URL='https://cofre-notifier.ericchang12c.workers.dev';
const VAPID_PUBLIC='BMltuIq-4X91hpwo0cnKurFGY-E67UZXLWO3vNpEYx_-Jtob4ITXNNZRQJMxkpv4fwP6n7n81v9CXzREfQ3jpFc';

function pushSuportado(){
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function b64uParaBytes(s){
  s=s.replace(/-/g,'+').replace(/_/g,'/');
  const bin=atob(s+'='.repeat((4-s.length%4)%4));
  return Uint8Array.from(bin,c=>c.charCodeAt(0));
}
async function pushGetSub(){
  if(!pushSuportado()) return null;
  try{
    const reg=await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  }catch(e){ return null; }
}
async function apiPush(path, body){
  const token=await auth.currentUser.getIdToken();
  const r=await fetch(PUSH_URL+path,{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
    body:JSON.stringify(body)
  });
  if(!r.ok) throw new Error('api push '+r.status);
  return r.json();
}
function rotinasParaPush(){
  return state.rotinas.filter(r=>r.hora).map(r=>({id:r.id,texto:r.texto,dias:r.dias||[],hora:r.hora}));
}
function tzLocal(){
  try{ return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'; }
  catch(e){ return 'America/Sao_Paulo'; }
}
async function ativarNotif(){
  if(!pushSuportado()){
    toast('Este navegador não suporta push. No iPhone, instale o app na tela de início primeiro.');
    return false;
  }
  const perm=await Notification.requestPermission();
  if(perm!=='granted'){
    toast('Permissão negada — habilite as notificações do site nas configurações do navegador.');
    return false;
  }
  const reg=await navigator.serviceWorker.ready;
  const sub=await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:b64uParaBytes(VAPID_PUBLIC)});
  await apiPush('/sync',{tz:tzLocal(), rotinas:rotinasParaPush(), sub:sub.toJSON()});
  return true;
}
async function desativarNotif(){
  const sub=await pushGetSub();
  if(!sub) return;
  const ep=sub.endpoint;
  await sub.unsubscribe().catch(()=>{});
  try{ await apiPush('/sync',{removeEndpoint:ep}); }catch(e){}
}
/* Reenvia metas ao worker quando elas mudam (só se este aparelho está inscrito) */
let pushSyncTimer=null;
function agendarSyncPush(){
  clearTimeout(pushSyncTimer);
  pushSyncTimer=setTimeout(async ()=>{
    try{
      const sub=await pushGetSub();
      if(sub && auth.currentUser) await apiPush('/sync',{tz:tzLocal(), rotinas:rotinasParaPush()});
    }catch(e){/* sem rede ou worker fora — tenta de novo na próxima mudança */}
  }, 1500);
}
async function renderNotifUI(){
  const sw=document.getElementById('notifSwitch');
  const hint=document.getElementById('notifHint');
  const teste=document.getElementById('btnTestNotif');
  if(!pushSuportado()){
    sw.disabled=true; sw.classList.remove('on'); teste.classList.add('hidden');
    hint.textContent='Push não disponível aqui. No iPhone/iPad: toque em Compartilhar → "Adicionar à Tela de Início" e ative por lá.';
    return;
  }
  sw.disabled=false;
  const sub=await pushGetSub();
  const on=!!sub && Notification.permission==='granted';
  sw.classList.toggle('on', on);
  sw.setAttribute('aria-checked', on);
  teste.classList.toggle('hidden', !on);
  hint.textContent = on ? 'Ativo neste aparelho. Metas com horário vão gerar um aviso na hora certa.' :
    'Vale por aparelho: ative no celular para receber os avisos nele.';
}
document.getElementById('notifSwitch').onclick=async ()=>{
  const sw=document.getElementById('notifSwitch');
  sw.disabled=true;
  try{
    const ligado=sw.classList.contains('on');
    if(ligado){ await desativarNotif(); toast('Notificações desativadas neste aparelho.'); }
    else if(await ativarNotif()){ toast('Notificações ativadas! 🔔'); }
  }catch(e){ toast('Não consegui falar com o servidor de notificações.'); }
  await renderNotifUI();
};
document.getElementById('btnTestNotif').onclick=async ()=>{
  const b=document.getElementById('btnTestNotif');
  b.disabled=true;
  try{ await apiPush('/test',{}); toast('Teste enviado! Deve chegar em alguns segundos.'); }
  catch(e){ toast('Falha ao enviar o teste.'); }
  b.disabled=false;
};
function renderPerfilAvatar(){
  const foto = fotoPendente!==undefined ? fotoPendente : state.perfil.foto;
  document.getElementById('perfilAvatar').innerHTML = foto ? `<img src="${foto}" alt="">` : '👤';
  document.getElementById('btnRemoverFoto').classList.toggle('hidden', !foto);
}

function redimensionarFoto(file){
  return new Promise((res,rej)=>{
    const img=new Image();
    img.onload=()=>{
      const S=256, c=document.createElement('canvas');
      c.width=S; c.height=S;
      const m=Math.min(img.width,img.height);
      c.getContext('2d').drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,S,S);
      URL.revokeObjectURL(img.src);
      res(c.toDataURL('image/jpeg',.85));
    };
    img.onerror=()=>{ URL.revokeObjectURL(img.src); rej(new Error('Imagem inválida')); };
    img.src=URL.createObjectURL(file);
  });
}

async function reautenticar(senhaAtual){
  const user=auth.currentUser;
  const cred=firebase.auth.EmailAuthProvider.credential(user.email, senhaAtual);
  await user.reauthenticateWithCredential(cred);
}

document.getElementById('btnPerfil').onclick=()=>{
  fotoPendente=undefined;
  document.getElementById('perfilNome').value=state.nome;
  document.getElementById('emailAtual').value=(auth.currentUser&&auth.currentUser.email)||'';
  document.getElementById('emailForm').reset();
  document.getElementById('senhaForm').reset();
  renderPerfilAvatar();
  renderNotifUI();
  document.getElementById('perfilModal').classList.remove('hidden');
};
document.getElementById('btnTrocarFoto').onclick=()=>document.getElementById('fotoInput').click();
document.getElementById('btnRemoverFoto').onclick=()=>{ fotoPendente=null; renderPerfilAvatar(); };
document.getElementById('fotoInput').onchange=async e=>{
  const f=e.target.files[0]; if(!f) return;
  try{ fotoPendente=await redimensionarFoto(f); renderPerfilAvatar(); }
  catch(ex){ toast('Não consegui ler esta imagem'); }
  e.target.value='';
};

document.getElementById('perfilForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const nome=document.getElementById('perfilNome').value.trim();
  if(!nome){ toast('Escreva seu nome'); return; }
  try{
    await auth.currentUser.updateProfile({displayName:nome});
    const upd={nome};
    if(fotoPendente!==undefined)
      upd.foto = fotoPendente===null ? firebase.firestore.FieldValue.delete() : fotoPendente;
    await col('perfil').doc('dados').set(upd,{merge:true});
    fotoPendente=undefined;
    toast('Perfil atualizado! ✨');
  }catch(ex){ toast(erroAuthPT(ex)); }
});

document.getElementById('emailForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const novo=document.getElementById('novoEmail').value.trim();
  try{
    await reautenticar(document.getElementById('emailSenha').value);
    try{
      await auth.currentUser.updateEmail(novo);
      toast('E-mail atualizado! Use o novo no próximo login.');
    }catch(ex){
      if(ex.code==='auth/operation-not-allowed'){
        await auth.currentUser.verifyBeforeUpdateEmail(novo);
        toast('Enviamos um link de confirmação para o novo e-mail. A troca conclui após confirmar.');
      }else throw ex;
    }
    e.target.reset();
    document.getElementById('emailAtual').value=(auth.currentUser&&auth.currentUser.email)||'';
  }catch(ex){ toast(erroAuthPT(ex)); }
});

document.getElementById('senhaForm').addEventListener('submit', async e=>{
  e.preventDefault();
  try{
    await reautenticar(document.getElementById('senhaAtual').value);
    await auth.currentUser.updatePassword(document.getElementById('senhaNova').value);
    e.target.reset();
    toast('Senha atualizada! 🔒');
  }catch(ex){ toast(erroAuthPT(ex)); }
});

/* ---------------- Meus dados: exportação e exclusão (LGPD) ---------------- */
const COLECOES_USUARIO=['perfil','tx','compras','contas','orcamentos','assinaturas','rotinas','metasStatus','inventario','camposCustom','catMap','config'];

function converterTimestamps(v){
  if(v && typeof v.toDate==='function') return v.toDate().toISOString();
  if(Array.isArray(v)) return v.map(converterTimestamps);
  if(v && typeof v==='object'){ const o={}; for(const k in v) o[k]=converterTimestamps(v[k]); return o; }
  return v;
}

document.getElementById('btnExportar').onclick=async ()=>{
  const b=document.getElementById('btnExportar');
  b.disabled=true; b.textContent='Preparando arquivo…';
  try{
    const out={app:'SeuCofrin', formato:1, exportadoEm:new Date().toISOString(),
      conta:{email:auth.currentUser.email, nome:state.nome}, dados:{}};
    for(const c of COLECOES_USUARIO){
      const snap=await col(c).get();
      out.dados[c]=snap.docs.map(d=>({id:d.id, ...converterTimestamps(d.data())}));
    }
    const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`seucofrin-dados-${hojeISO()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    toast('Dados exportados! 📦');
  }catch(ex){ toast('Não consegui exportar agora. Tente de novo em instantes.'); }
  b.disabled=false; b.textContent='⬇️ Exportar meus dados';
};

document.getElementById('btnExcluirConta').onclick=()=>{
  document.getElementById('delForm').reset();
  document.getElementById('delErr').textContent='';
  document.getElementById('delModal').classList.remove('hidden');
};

async function apagarColecao(nome){
  while(true){ // apaga em lotes de 300 até esvaziar
    const snap=await col(nome).limit(300).get();
    if(snap.empty) return;
    const batch=db.batch();
    snap.docs.forEach(d=>batch.delete(d.ref));
    await batch.commit();
    if(snap.size<300) return;
  }
}

document.getElementById('delForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const err=document.getElementById('delErr'); err.textContent='';
  if(document.getElementById('delConfirma').value.trim().toUpperCase()!=='EXCLUIR'){
    err.textContent='Digite EXCLUIR (em maiúsculas) para confirmar.'; return;
  }
  const user=auth.currentUser; if(!user) return;
  const btn=document.getElementById('btnDelFinal');
  btn.disabled=true; btn.textContent='Excluindo…';
  try{
    await reautenticar(document.getElementById('delSenha').value);
    try{ await desativarNotif(); }catch(_){}      // remove a inscrição de push deste aparelho
    try{ await apiPush('/wipe',{}); }catch(_){}   // apaga os dados de push no worker (todos os aparelhos)
    for(const c of COLECOES_USUARIO) await apagarColecao(c);
    await user.delete(); // encerra a sessão sozinho → volta à tela de login
    document.getElementById('delModal').classList.add('hidden');
    document.getElementById('perfilModal').classList.add('hidden');
    toast('Conta excluída. Cuide-se! 👋');
  }catch(ex){ err.textContent=erroAuthPT(ex); }
  btn.disabled=false; btn.textContent='Excluir tudo';
});

/* ---------------- Modais ---------------- */
let txTipo='despesa';
let editandoTx=null;
function preencherCats(sel, tipo){
  sel.innerHTML=catsDe(tipo).map(c=>`<option>${esc(c)}</option>`).join('');
}
function abrirTxModal(tx){
  editandoTx = tx||null;
  txTipo = tx? tx.tipo : 'despesa';
  atualizarSeg();
  const selCat=document.getElementById('txCat');
  preencherCats(selCat, txTipo);
  document.getElementById('txModalTitle').textContent = tx? 'Editar lançamento' : 'Novo lançamento';
  if(tx){
    if(![...selCat.options].some(o=>o.value===tx.cat)) selCat.add(new Option(tx.cat,tx.cat));
    document.getElementById('txValor').value=(tx.valor/100).toFixed(2).replace('.',',');
    document.getElementById('txDesc').value=tx.desc;
    selCat.value=tx.cat;
    document.getElementById('txData').value=tx.data;
    document.getElementById('txPag').value=tx.pagamento||'';
  }else{
    const hoje=new Date().toISOString().slice(0,10);
    document.getElementById('txData').value = hoje.slice(0,7)===state.mes ? hoje : state.mes+'-01';
    document.getElementById('txValor').value=''; document.getElementById('txDesc').value='';
    document.getElementById('txPag').value='';
  }
  renderTxCustomFields(tx);
  document.getElementById('txModal').classList.remove('hidden');
  document.getElementById('txValor').focus();
}
function atualizarSeg(){
  document.querySelectorAll('#txTypeSeg button').forEach(b=>{
    b.className = b.dataset.t===txTipo ? (txTipo==='despesa'?'selExp':'selInc') : '';
  });
}
document.querySelectorAll('#txTypeSeg button').forEach(b=>{
  b.onclick=()=>{ txTipo=b.dataset.t; atualizarSeg(); preencherCats(document.getElementById('txCat'),txTipo); };
});
document.getElementById('fabAdd').onclick=()=>abrirTxModal();

document.getElementById('txForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const valor=parseValor(document.getElementById('txValor').value);
  if(valor===null){ toast('Valor inválido'); return; }
  const custom=lerCustom();
  if(custom===undefined) return;
  const data=document.getElementById('txData').value;
  const docTx={
    tipo:txTipo, valor,
    desc:document.getElementById('txDesc').value.trim(),
    cat:document.getElementById('txCat').value,
    data, mes:data.slice(0,7),
    pagamento:document.getElementById('txPag').value||null,
    custom
  };
  if(docTx.desc && docTx.cat!=='Outros') salvarCatMap(chaveDest(docTx.desc),{cat:docTx.cat,pagamento:docTx.pagamento,desc:docTx.desc});
  if(editandoTx){
    await col('tx').doc(editandoTx.id).update(docTx);
    toast('Lançamento atualizado');
  }else{
    docTx.criadoEm=firebase.firestore.FieldValue.serverTimestamp();
    await col('tx').add(docTx);
    toast('Lançamento salvo');
    if(data.slice(0,7)!==state.mes){ state.mes=data.slice(0,7); carregarMes(); }
  }
  editandoTx=null;
  document.getElementById('txModal').classList.add('hidden');
});

/* ---------------- Categoria automática por destinatário ----------------
   A "memória" fica em users/{uid}/catMap: 1 doc por destinatário
   (CNPJ ou nome normalizado) com a categoria escolhida pelo usuário.
   Por privacidade, CPF de pessoa física nunca é usado como chave —
   pessoas são identificadas só pelo nome que aparece no extrato. */
let catMap=null; // Map(chave -> {cat, pagamento?, desc})

function cnpjValido(d){
  if(!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const dv=n=>{
    let s=0, p=n-7;
    for(let i=0;i<n;i++){ s+=d[i]*p--; if(p<2)p=9; }
    const r=s%11; return r<2?0:11-r;
  };
  return dv(12)===+d[12] && dv(13)===+d[13];
}
function extrairCNPJ(desc){
  const m=String(desc||'').match(/(?<!\d)\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}(?!\d)/);
  if(!m) return null;
  const dig=m[0].replace(/\D/g,'');
  return cnpjValido(dig)? dig : null;
}
// CPF completo ou mascarado (•••.123.456-•• / ***.123.456-**) — usado só para detectar pessoa física
const RE_CPF=/(\d{3}|[•*]{2,3})\.?\d{3}\.?\d{3}[-.]?(\d{2}|[•*]{2})/;

function normalizarDesc(desc){
  return String(desc||'').toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^A-Z0-9 ]+/g,' ')
    .replace(/\s+/g,' ').trim();
}
function chaveNome(desc){
  const s=normalizarDesc(desc)
    .replace(/\b\d+\b/g,' ')
    .replace(/\b(COMPRA|NO|DEBITO|CREDITO|CARTAO|PGTO|PAGAMENTO|PIX|TRANSFERENCIA|ENVIADA|RECEBIDA|ENVIADO|RECEBIDO|PELO|TED|DOC|LTDA|SA|ME|EIRELI|AGENCIA|CONTA|DE|DA|DO|BR)\b/g,' ')
    .replace(/\s+/g,' ').trim();
  return s.length>=3 ? s.slice(0,60) : null;
}
// chave do destinatário: CNPJ quando houver (e for válido); senão nome normalizado
function chaveDest(desc){
  const c=extrairCNPJ(desc);
  if(c) return 'c'+c;
  const n=chaveNome(desc);
  return n ? 'n'+n.replace(/ /g,'_') : null;
}

/* dicionário embutido de estabelecimentos conhecidos (só despesas) */
const CAT_BUILTIN=[
  [/IFOOD|RAPPI|RESTAURANTE|LANCHONETE|PIZZARIA|HAMBURG|BURGER|MC ?DONALD|SUBWAY|HABIBS|OUTBACK|CHURRASCARIA/,'Restaurantes'],
  [/\bUBER\b|99 ?APP|99 ?POP|CABIFY|\bPOSTO\b|IPIRANGA|PETROBRAS|ESTACIONAMENTO|BILHETE UNICO|\bMETRO\b/,'Transporte'],
  [/SUPERMERC|MERCADO|CARREFOUR|ATACAD|PAO DE ACUCAR|ASSAI|SACOLAO|HORTIFRUTI|ACOUGUE|PADARIA/,'Mercado'],
  [/FARMACIA|DROGARIA|DROGASIL|DROGA RAIA|PACHECO|PAGUE MENOS|LABORATORIO|CLINICA|HOSPITAL/,'Saúde'],
  [/NETFLIX|SPOTIFY|DISNEY|\bHBO\b|GLOBOPLAY|YOUTUBE PREMIUM|DEEZER|CRUNCHYROLL|PRIME VIDEO/,'Assinaturas'],
  [/\bPETZ\b|COBASI|PET ?SHOP|VETERINAR/,'Pets'],
  [/SMART ?FIT|BLUEFIT|ACADEMIA|CROSSFIT/,'Esportes'],
  [/CINEMA|CINEMARK|INGRESSO|\bSTEAM\b|PLAYSTATION|XBOX|NINTENDO/,'Lazer'],
];
function catBuiltin(desc){
  const s=normalizarDesc(desc);
  const hit=CAT_BUILTIN.find(([re])=>re.test(s));
  return hit? hit[1] : null;
}

async function carregarCatMap(){
  if(catMap) return catMap;
  catMap=new Map();
  try{
    const snap=await col('catMap').get();
    snap.forEach(d=>catMap.set(d.id, d.data()));
  }catch(ex){ console.warn('catMap:', ex); }
  return catMap;
}
function salvarCatMap(chave, dados){
  if(!chave || !state.uid || !dados.cat || dados.cat==='Outros') return;
  const doc={cat:dados.cat, desc:String(dados.desc||'').slice(0,120)};
  if(dados.pagamento) doc.pagamento=dados.pagamento;
  if(catMap) catMap.set(chave, doc);
  try{
    col('catMap').doc(chave).set({...doc, atualizadoEm:firebase.firestore.FieldValue.serverTimestamp()})
      .catch(ex=>console.warn('catMap save:', ex));
  }catch(ex){ console.warn('catMap save:', ex); }
}

/* tenta extrair o nome da pessoa num Pix/transferência (para o popup de pergunta) */
function nomePessoaPix(desc){
  const d=String(desc||'');
  if(!/pix|transf|\bted\b|\bdoc\b/i.test(d)) return null;
  if(extrairCNPJ(d)) return null; // tem CNPJ → é empresa, não pergunta
  const segs=d.split(/\s[-–—|]\s/).map(s=>s.trim()).filter(Boolean);
  const ruido=/^(pix|transf|transfer[eê]ncia|pagamento|envio|recebimento|ted|doc|ag[eê]ncia|conta|banco|bco|nu pagamentos|itau|bradesco|santander|caixa|sicredi|sicoob|inter|c6|picpay|mercado ?pago|pagseguro|stone|nubank)/i;
  for(const seg of segs.slice(1)){
    if(RE_CPF.test(seg)) continue;
    if(ruido.test(seg)) continue;
    const soLetras=seg.replace(/[^A-Za-zÀ-ÿ ]/g,'').trim();
    if(soLetras.length>=5 && soLetras.split(/\s+/).length>=2) return soLetras;
  }
  return null;
}

/* fila de perguntas "esse Pix é de qual categoria?" */
let catAskFila=[], catAskAtual=null;
function proximoCatAsk(){
  catAskAtual=catAskFila.shift()||null;
  const modal=document.getElementById('catAskModal');
  if(!catAskAtual){ modal.classList.add('hidden'); return; }
  const p=catAskAtual;
  document.getElementById('catAskMsg').innerHTML = p.tipo==='receita'
    ? `Vimos que você recebeu um Pix de <span class="catAskNome">${esc(p.nome)}</span>. Ele se encaixa em qual categoria?`
    : `Vimos que você fez um Pix para <span class="catAskNome">${esc(p.nome)}</span>. Ele se encaixa em qual categoria?`;
  const cats=catsDe(p.tipo);
  document.getElementById('catAskChips').innerHTML =
    cats.map(c=>`<button type="button" class="catChip" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  modal.classList.remove('hidden');
}
document.getElementById('catAskChips').addEventListener('click', e=>{
  const b=e.target.closest('.catChip');
  if(!b || !catAskAtual) return;
  const {chave, nome}=catAskAtual, cat=b.dataset.cat;
  imp.items.forEach(it=>{ if(it.chave===chave){ it.cat=cat; it.auto=true; } });
  salvarCatMap(chave, {cat, desc:nome});
  renderImpPreview();
  proximoCatAsk();
});
document.getElementById('catAskSkip').onclick=()=>proximoCatAsk();

function perguntarPixDesconhecidos(){
  const vistos=new Set();
  catAskFila=[];
  imp.items.forEach(it=>{
    if(it.cat!=='Outros' || !it.chave || vistos.has(it.chave)) return;
    if(catMap && catMap.has(it.chave)) return;
    const nome=nomePessoaPix(it.desc);
    if(!nome) return;
    vistos.add(it.chave);
    catAskFila.push({chave:it.chave, nome, tipo:it.tipo});
  });
  if(catAskFila.length) proximoCatAsk();
}

/* ---------------- Importação de CSV ---------------- */
const imp={rows:[], items:[], header:true, cols:{data:0,desc:1,valor:2}, sinal:'neg'};

function parseCSV(text){
  text=text.replace(/^\uFEFF/,'');
  const firstLine=text.split(/\r?\n/).find(l=>l.trim())||'';
  const counts={';':(firstLine.match(/;/g)||[]).length, ',':(firstLine.match(/,/g)||[]).length, '\t':(firstLine.match(/\t/g)||[]).length};
  const delim=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
  const rows=[]; let row=[], cell='', inQ=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(inQ){
      if(ch==='"'){ if(text[i+1]==='"'){cell+='"';i++;} else inQ=false; }
      else cell+=ch;
    }else{
      if(ch==='"') inQ=true;
      else if(ch===delim){ row.push(cell); cell=''; }
      else if(ch==='\n'||ch==='\r'){
        if(ch==='\r'&&text[i+1]==='\n')i++;
        row.push(cell);
        if(row.some(c=>c.trim()!=='')) rows.push(row);
        row=[]; cell='';
      }
      else cell+=ch;
    }
  }
  row.push(cell);
  if(row.some(c=>c.trim()!=='')) rows.push(row);
  return rows;
}

function parseDataCSV(s){
  s=String(s||'').trim();
  let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return `${m[1]}-${m[2]}-${m[3]}`;
  m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if(m){
    let d=+m[1], mo=+m[2];
    if(mo>12&&d<=12){ const t=d; d=mo; mo=t; } // formato MM/DD invertido
    if(d>=1&&d<=31&&mo>=1&&mo<=12) return `${m[3]}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    return null;
  }
  m=s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/);
  if(m){
    const d=+m[1], mo=+m[2];
    if(d>=1&&d<=31&&mo>=1&&mo<=12) return `20${m[3]}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  return null;
}

function parseValorCSV(s){
  s=String(s||'').trim().replace(/R\$\s?/i,'');
  if(!s) return null;
  let neg=false;
  if(/^\(.*\)$/.test(s)){ neg=true; s=s.slice(1,-1).trim(); }
  if(s.startsWith('-')){ neg=true; s=s.slice(1).trim(); }
  else if(s.startsWith('+')) s=s.slice(1).trim();
  if(!/^[\d.,]+$/.test(s)) return null;
  const lastC=s.lastIndexOf(','), lastD=s.lastIndexOf('.');
  let n;
  if(lastC>lastD) n=parseFloat(s.replace(/\./g,'').replace(',','.'));
  else if(lastD>lastC) n=parseFloat(s.replace(/,/g,''));
  else n=parseFloat(s);
  if(isNaN(n)) return null;
  const cents=Math.round(n*100);
  if(cents===0) return null;
  return neg? -cents : cents;
}

function detectarColunas(){
  const rows=imp.rows;
  const nCols=Math.max(...rows.map(r=>r.length));
  const r0=rows[0]||[];
  imp.header = !r0.some(c=>parseDataCSV(c)) && !r0.some(c=>parseValorCSV(c)!==null);
  const dataRows=rows.slice(imp.header?1:0, (imp.header?1:0)+50);
  const scores=[...Array(nCols)].map((_,i)=>({
    data: dataRows.filter(r=>parseDataCSV(r[i])).length,
    valor: dataRows.filter(r=>parseValorCSV(r[i])!==null).length,
    texto: dataRows.reduce((a,r)=>a+String(r[i]||'').replace(/[\d.,\/\-]/g,'').length,0)
  }));
  const hdr=imp.header? r0.map(c=>String(c).toLowerCase()) : [];
  const byName=names=>hdr.findIndex(h=>names.some(n=>h.includes(n)));
  const best=(key,excl)=>{
    let bi=0,bv=-1;
    scores.forEach((s,i)=>{ if(excl.includes(i))return; if(s[key]>bv){bv=s[key];bi=i;} });
    return bi;
  };
  let cData=byName(['data','date']); if(cData<0) cData=best('data',[]);
  let cValor=byName(['valor','amount','montante','value']); if(cValor<0||cValor===cData) cValor=best('valor',[cData]);
  let cDesc=byName(['desc','título','titulo','title','hist','lançamento','lancamento','memo','estabelecimento','identificador não','detalhe']);
  if(cDesc<0||cDesc===cData||cDesc===cValor) cDesc=best('texto',[cData,cValor]);
  imp.cols={data:cData, desc:cDesc, valor:cValor};
  // se não há valores negativos, provavelmente é fatura de cartão (tudo despesa)
  const temNeg=dataRows.some(r=>{ const v=parseValorCSV(r[cValor]); return v!==null&&v<0; });
  imp.sinal = temNeg? 'neg' : 'todos';
}

function montarMapa(){
  const nCols=Math.max(...imp.rows.map(r=>r.length));
  const sample=imp.rows[imp.header?1:0]||[];
  const opts=sel=>[...Array(nCols)].map((_,c)=>{
    const nome=imp.header&&imp.rows[0][c] ? String(imp.rows[0][c]).slice(0,22) : `Coluna ${c+1}`;
    const ex=String(sample[c]||'').slice(0,18);
    return `<option value="${c}"${c===sel?' selected':''}>${esc(nome)}${ex?' — '+esc(ex):''}</option>`;
  }).join('');
  document.getElementById('impColData').innerHTML=opts(imp.cols.data);
  document.getElementById('impColDesc').innerHTML=opts(imp.cols.desc);
  document.getElementById('impColValor').innerHTML=opts(imp.cols.valor);
  document.getElementById('impHeader').checked=imp.header;
  document.getElementById('impSinal').value=imp.sinal;
  const todasCats=[...new Set([...catsD(),...catsR()])];
  document.getElementById('impBulkCat').innerHTML=
    '<option value="">— aplicar a todas —</option>'+todasCats.map(c=>`<option>${c}</option>`).join('');
}

function rebuildItems(){
  const start=imp.header?1:0;
  imp.items=[];
  imp.rows.slice(start).forEach(r=>{
    const data=parseDataCSV(r[imp.cols.data]);
    const v=parseValorCSV(r[imp.cols.valor]);
    if(!data||v===null) return;
    const desc=String(r[imp.cols.desc]||'').trim()||'(sem descrição)';
    let tipo='despesa';
    if(imp.sinal==='neg') tipo = v<0?'despesa':'receita';
    else if(imp.sinal==='pos') tipo = v>0?'despesa':'receita';
    // categoria automática: memória do usuário > dicionário embutido > Outros
    const chave=chaveDest(desc);
    const cats=catsDe(tipo);
    let cat='Outros', pagamento='', auto=false;
    const lembrado=chave && catMap && catMap.get(chave);
    if(lembrado && cats.includes(lembrado.cat)){
      cat=lembrado.cat; auto=true;
      if(lembrado.pagamento) pagamento=lembrado.pagamento;
    }else if(tipo==='despesa'){
      const b=catBuiltin(desc);
      if(b && cats.includes(b)){ cat=b; auto=true; }
    }
    imp.items.push({data, desc, valor:Math.abs(v), tipo, cat, pagamento, incluir:true, chave, auto});
  });
  renderImpPreview();
}

function impCountTxt(){
  document.getElementById('impCount').textContent = imp.items.length
    ? `${imp.items.filter(i=>i.incluir).length} de ${imp.items.length} linhas serão importadas. Ajuste tipo, categoria e pagamento em cada linha.`
    : 'Nenhuma linha válida encontrada — confira as colunas de data e valor.';
}

function renderImpPreview(){
  impCountTxt();
  const catOpts=(tipo,sel)=>catsDe(tipo)
    .map(c=>`<option${c===sel?' selected':''}>${esc(c)}</option>`).join('');
  const pagOpts=sel=>['','credito','debito','pix'].map(p=>
    `<option value="${p}"${p===sel?' selected':''}>${p===''?'—':p==='credito'?'Crédito':p==='debito'?'Débito':'PIX'}</option>`).join('');
  document.getElementById('impList').innerHTML=imp.items.map((it,i)=>`
    <div class="impRow ${it.incluir?'':'off'}" data-i="${i}">
      <input type="checkbox" data-k="incluir" ${it.incluir?'checked':''}>
      <div class="txInfo"><div class="d">${esc(it.desc)}</div>
        <div class="c mono">${it.data.split('-').reverse().join('/')} · <span class="${it.tipo==='receita'?'pos':'neg'}">${fmt(it.valor)}</span>${it.auto?' · <span class="autoTag" title="categoria preenchida automaticamente">🧠 auto</span>':''}</div></div>
      <div class="selRow">
        <select data-k="tipo">
          <option value="despesa"${it.tipo==='despesa'?' selected':''}>Despesa</option>
          <option value="receita"${it.tipo==='receita'?' selected':''}>Receita</option>
        </select>
        <select data-k="cat">${catOpts(it.tipo,it.cat)}</select>
        <select data-k="pagamento">${pagOpts(it.pagamento)}</select>
      </div>
    </div>`).join('');
}

document.getElementById('btnImportCSV').onclick=()=>{
  document.getElementById('impFile').value='';
  document.getElementById('impStep2').classList.add('hidden');
  document.getElementById('impStep1').classList.remove('hidden');
  document.getElementById('impModal').classList.remove('hidden');
};

/* --- Leitura de PDF (extrato/fatura) --- */
let pdfjsPromise=null;
function loadPdfJs(){
  if(pdfjsPromise) return pdfjsPromise;
  pdfjsPromise=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    s.onload=()=>{
      window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      res(window.pdfjsLib);
    };
    s.onerror=()=>{ pdfjsPromise=null; rej(new Error('Falha ao carregar o leitor de PDF — confira a internet')); };
    document.head.appendChild(s);
  });
  return pdfjsPromise;
}

async function pdfParaLinhas(file){
  const pdfjs=await loadPdfJs();
  const buf=await file.arrayBuffer();
  let doc;
  try{ doc=await pdfjs.getDocument({data:buf.slice(0)}).promise; }
  catch(ex){
    if(ex&&ex.name==='PasswordException'){
      const senha=prompt('Este PDF é protegido. Digite a senha dele (bancos costumam usar dígitos do CPF):');
      if(!senha) throw new Error('PDF protegido por senha');
      doc=await pdfjs.getDocument({data:buf.slice(0), password:senha}).promise;
    }else throw ex;
  }
  const linhas=[];
  for(let p=1;p<=doc.numPages;p++){
    const page=await doc.getPage(p);
    const tc=await page.getTextContent();
    const rows=[];
    tc.items.forEach(it=>{
      if(!it.str||!it.str.trim()) return;
      const y=it.transform[5], x=it.transform[4];
      let row=rows.find(r=>Math.abs(r.y-y)<3);
      if(!row){ row={y, itens:[]}; rows.push(row); }
      row.itens.push({x, str:it.str});
    });
    rows.sort((a,b)=>b.y-a.y);
    rows.forEach(r=>{
      const txt=r.itens.sort((a,b)=>a.x-b.x).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();
      if(txt) linhas.push(txt);
    });
  }
  return linhas;
}

const MES_ABREV={jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
function anoInferido(mo){
  const hoje=new Date();
  let y=hoje.getFullYear();
  if(mo-1>hoje.getMonth()) y--; // mês futuro sem ano informado → ano passado
  return y;
}
function dataInicioLinha(l){
  let m=l.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})\b/);
  if(m) return {iso:`${m[3]}-${m[2]}-${m[1]}`, len:m[0].length};
  m=l.match(/^(\d{4})-(\d{2})-(\d{2})\b/);
  if(m) return {iso:m[0].slice(0,10), len:m[0].length};
  m=l.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{2})\b/);
  if(m) return {iso:`20${m[3]}-${m[2]}-${m[1]}`, len:m[0].length};
  m=l.match(/^(\d{1,2})\s+(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b\.?/i);
  if(m){
    const mo=MES_ABREV[m[2].toLowerCase()];
    return {iso:`${anoInferido(mo)}-${String(mo).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`, len:m[0].length};
  }
  m=l.match(/^(\d{1,2})[\/\-.](\d{1,2})\b(?![\/\-.\d])/);
  if(m){
    const d=+m[1], mo=+m[2];
    if(d>=1&&d<=31&&mo>=1&&mo<=12)
      return {iso:`${anoInferido(mo)}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`, len:m[0].length};
  }
  return null;
}
function extrairTxPDF(linhas){
  const out=[];
  const reValor=/(-\s?)?(?:R\$\s*)?(-\s?)?(\d{1,3}(?:\.\d{3})*,\d{2})(\s?[DC](?![A-Za-zà-úÀ-Ú]))?(\s?-)?/g;
  linhas.forEach(l=>{
    const dt=dataInicioLinha(l);
    if(!dt) return;
    const resto=l.slice(dt.len).trim();
    const matches=[...resto.matchAll(reValor)];
    if(!matches.length) return;
    const m=matches[matches.length-1]; // último valor da linha (evita nº de documento no meio)
    const cents=Math.round(parseFloat(m[3].replace(/\./g,'').replace(',','.'))*100);
    if(!cents) return;
    let neg=!!(m[1]||m[2]||m[5]);
    if(m[4]){ neg = m[4].trim().toUpperCase()==='D'; }
    const desc=(resto.slice(0,m.index)+' '+resto.slice(m.index+m[0].length)).replace(/\s+/g,' ').trim();
    if(!desc || /^saldo\b/i.test(desc) || /saldo (anterior|final|do dia|dispon)/i.test(desc)) return;
    out.push([dt.iso, desc, (neg?'-':'')+(cents/100).toFixed(2).replace('.',',')]);
  });
  return out;
}

document.getElementById('impFile').addEventListener('change', async e=>{
  const f=e.target.files[0]; if(!f) return;
  const isPDF=/\.pdf$/i.test(f.name)||f.type==='application/pdf';
  let rows;
  if(isPDF){
    toast('Lendo PDF…');
    try{
      const txs=extrairTxPDF(await pdfParaLinhas(f));
      if(!txs.length){
        toast('Não achei lançamentos neste PDF. Se ele for digitalizado (imagem), exporte em CSV no app do banco.');
        return;
      }
      rows=[['Data','Descrição','Valor'],...txs];
    }catch(ex){ toast('Erro ao ler o PDF: '+ex.message); return; }
  }else{
    rows=parseCSV(await f.text());
  }
  if(!rows.length){ toast('Não consegui ler o arquivo'); return; }
  await carregarCatMap();
  imp.rows=rows;
  detectarColunas();
  montarMapa();
  rebuildItems();
  document.getElementById('impStep1').classList.add('hidden');
  document.getElementById('impStep2').classList.remove('hidden');
  perguntarPixDesconhecidos();
});

document.getElementById('impColData').onchange=e=>{ imp.cols.data=+e.target.value; rebuildItems(); };
document.getElementById('impColDesc').onchange=e=>{ imp.cols.desc=+e.target.value; rebuildItems(); };
document.getElementById('impColValor').onchange=e=>{ imp.cols.valor=+e.target.value; rebuildItems(); };
document.getElementById('impHeader').onchange=e=>{ imp.header=e.target.checked; montarMapa(); rebuildItems(); };
document.getElementById('impSinal').onchange=e=>{ imp.sinal=e.target.value; rebuildItems(); };
document.getElementById('impBulkCat').onchange=e=>{
  const v=e.target.value; if(!v) return;
  imp.items.forEach(it=>{
    if(catsDe(it.tipo).includes(v)) it.cat=v;
  });
  renderImpPreview(); e.target.value='';
};
document.getElementById('impBulkPag').onchange=e=>{
  const v=e.target.value; if(!v) return;
  imp.items.forEach(it=>it.pagamento=v);
  renderImpPreview(); e.target.value='';
};
document.getElementById('impList').addEventListener('change', e=>{
  const row=e.target.closest('.impRow'); if(!row) return;
  const it=imp.items[+row.dataset.i]; const k=e.target.dataset.k;
  if(k==='incluir'){ it.incluir=e.target.checked; row.classList.toggle('off',!it.incluir); impCountTxt(); return; }
  it[k]=e.target.value;
  // aprende com a correção do usuário (só edição individual, não a em massa)
  if(k==='cat'){ it.auto=false; salvarCatMap(it.chave,{cat:it.cat,pagamento:it.pagamento,desc:it.desc}); }
  if(k==='pagamento'&&it.cat!=='Outros') salvarCatMap(it.chave,{cat:it.cat,pagamento:it.pagamento,desc:it.desc});
  if(k==='tipo'){
    if(!catsDe(it.tipo).includes(it.cat)) it.cat='Outros';
    renderImpPreview();
  }
});

document.getElementById('btnImpConfirm').onclick=async ()=>{
  const items=imp.items.filter(i=>i.incluir);
  if(!items.length){ toast('Nenhuma linha selecionada'); return; }
  const btn=document.getElementById('btnImpConfirm');
  btn.disabled=true; btn.textContent='Importando…';
  try{
    for(let i=0;i<items.length;i+=400){
      const batch=db.batch();
      items.slice(i,i+400).forEach(it=>{
        batch.set(col('tx').doc(),{
          tipo:it.tipo, valor:it.valor, desc:it.desc, cat:it.cat,
          pagamento:it.pagamento||null, data:it.data, mes:it.data.slice(0,7),
          origem:'csv', criadoEm:firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }
    toast(`${items.length} lançamento${items.length>1?'s':''} importado${items.length>1?'s':''} 🎉`);
    document.getElementById('impModal').classList.add('hidden');
    const mesRecente=items.map(i=>i.data.slice(0,7)).sort().pop();
    if(mesRecente!==state.mes){ state.mes=mesRecente; carregarMes(); }
    else carregarTendencia();
  }catch(ex){ toast('Erro ao importar: '+ex.message); }
  btn.disabled=false; btn.textContent='Importar';
};

/* ---------------- Guia de boas-vindas ---------------- */
const GUIA_PASSOS=[
  {e:'👋',t:'Bem-vindo ao Meu Cofrin!',c:`
    <p>Este é o organizador financeiro da casa: gastos, relatórios e metas do dia — tudo num lugar só.</p>
    <ul>
      <li>Seus dados ficam salvos na nuvem: entre com a mesma conta no celular e no computador.</li>
      <li>Use as setas <b>‹ ›</b> no topo para navegar entre os meses.</li>
      <li>O botão laranja <b>+</b> no canto da tela cadastra um gasto ou receita a partir de qualquer aba.</li>
    </ul>
    <p>Vamos conhecer cada aba? 👇</p>`},
  {e:'📊',t:'Dashboard',c:`
    <p>É o resumo do mês selecionado — a primeira coisa que você vê ao abrir o app.</p>
    <ul>
      <li><b>Saldo do mês</b>: receitas menos despesas.</li>
      <li><b>Gastos por categoria</b>: o gráfico mostra para onde o dinheiro foi.</li>
      <li><b>Últimos 6 meses</b>: compara receitas × despesas ao longo do tempo.</li>
      <li><b>Maiores gastos</b>: os lançamentos mais pesados do mês.</li>
    </ul>`},
  {e:'💸',t:'Lançamentos',c:`
    <p>Cada gasto ou receita é um lançamento. É aqui que a vida financeira acontece.</p>
    <ul>
      <li>Toque em <b>+</b> para adicionar: valor, descrição, categoria, data e forma de pagamento (crédito, débito ou PIX).</li>
      <li>Toque em um lançamento da lista para <b>editar ou excluir</b>.</li>
      <li>Use os chips de categoria para filtrar a lista.</li>
      <li><b>📥 Importar CSV/PDF</b>: exporte o extrato ou a fatura no app do banco e importe aqui — você revisa cada linha antes de confirmar.</li>
      <li><b>🏷️ Categorias</b>: crie, renomeie ou exclua suas próprias categorias de despesa e receita.</li>
      <li><b>⚙️ Campos personalizados</b>: crie campos extras para todo lançamento, como "Quem gastou" ou "Parcelas".</li>
    </ul>`},
  {e:'📈',t:'Relatórios',c:`
    <p>Monte relatórios do jeito que você quiser e entenda para onde o dinheiro vai.</p>
    <ul>
      <li><b>Mensal</b>: escolha um intervalo de meses e compare receitas × despesas mês a mês.</li>
      <li><b>Diário</b>: veja o movimento dia a dia dentro de um mês.</li>
      <li>Três gráficos de uma vez: evolução no tempo, distribuição por categoria e linhas categoria a categoria.</li>
      <li>Os filtros do topo (período e categoria) valem para <b>todos os gráficos e tabelas</b> ao mesmo tempo.</li>
    </ul>`},
  {e:'🛒',t:'Mercado',c:`
    <p>Fotografe a nota fiscal do mercado e o app monta o histórico de preço de cada produto que você compra.</p>
    <ul>
      <li><b>📷 Escanear nota</b>: tire a foto (ou anexe o PDF da nota eletrônica). A leitura acontece <b>dentro do seu aparelho</b> — a foto não é enviada para lugar nenhum.</li>
      <li>Antes de salvar você <b>confere item por item</b>: quantidade, unidade, valor unitário, desconto, total e o peso (para calcular o R$/kg).</li>
      <li>Escolha um produto e veja o <b>preço ao longo do tempo</b>, uma linha para cada mercado — dá para saber onde compensa comprar.</li>
      <li>A tabela <b>Meus produtos</b> mostra menor preço, maior preço, preço médio, R$/kg e a variação desde a primeira compra.</li>
      <li>Toque numa nota salva para corrigir qualquer coisa, e no ✎ de um produto para renomeá-lo em todas as notas.</li>
    </ul>`},
  {e:'🏠',t:'Contas da casa',c:`
    <p>Cadastre as despesas fixas da casa (aluguel, luz, água, internet…) e não perca o controle de quais já foram pagas.</p>
    <ul>
      <li><b>+ Nova conta</b>: nome, valor esperado e, se quiser, o dia do vencimento.</li>
      <li>Toque no ✓ para marcar como paga no mês selecionado no topo — você informa o valor pago (pode ser diferente do esperado).</li>
      <li>Toque em ✎ para editar ou em ✕ para excluir uma conta.</li>
      <li>O gráfico mostra o gasto mês a mês, somando todas as contas ou filtrando uma específica.</li>
    </ul>`},
  {e:'✅',t:'Metas do dia',c:`
    <p>Transforme tarefas em rotina — e ganhe recompensas por cumprir.</p>
    <ul>
      <li>Programe uma meta e escolha em quais <b>dias da semana</b> ela se repete (ou todos os dias).</li>
      <li>Defina um <b>horário opcional 🔔</b> para receber uma notificação na hora (ative os avisos no seu perfil).</li>
      <li>Marque as metas conforme for concluindo; navegue entre os dias com ‹ › ou o botão "Hoje".</li>
      <li>Completou <b>todas</b> as metas do dia? Você ganha um <b>baú de recompensa</b>! 🎁</li>
    </ul>`},
  {e:'🐾',t:'Coleção de pets',c:`
    <p>Cada baú traz um <b>pet 3D surpresa</b> para a sua coleção — são ${PETS.length} espécies para descobrir.</p>
    <ul>
      <li>Raridades: 🐣 Comum (60%), ⭐ Raro (25%), 💜 Épico (12%) e 👑 Lendário (3%).</li>
      <li>Toque em um pet descoberto para vê-lo em 3D, girando na tela.</li>
      <li>Quanto mais dias com todas as metas cumpridas, mais perto de completar a coleção!</li>
    </ul>`},
  {e:'👤',t:'Seu perfil',c:`
    <p>Toque no seu <b>nome ou avatar</b> no topo da tela para abrir o perfil.</p>
    <ul>
      <li>Troque sua <b>foto</b> e seu <b>nome</b>.</li>
      <li>Ative os <b>avisos de metas neste aparelho</b> e envie uma notificação de teste.</li>
      <li>Altere o <b>e-mail de login</b> ou a <b>senha</b> quando precisar.</li>
    </ul>`},
  {e:'📲',t:'Instale como aplicativo',c:`
    <p>O Meu Cofrin funciona como um app de verdade, direto da tela inicial.</p>
    <ul>
      <li><b>Android (Chrome)</b>: menu ⋮ → "Instalar app" ou "Adicionar à tela inicial".</li>
      <li><b>iPhone (Safari)</b>: botão Compartilhar → "Adicionar à Tela de Início".</li>
      <li><b>Computador</b>: ícone de instalação na barra de endereço do navegador.</li>
    </ul>
    <p>E sempre que bater a dúvida, toque no <b>?</b> no topo para reabrir este guia. Bons cofrinhos! 🐷💰</p>`},
];
const guiaModal=document.getElementById('guiaModal');
let guiaIdx=0;
function abrirGuia(i){ guiaIdx=i||0; renderGuia(); guiaModal.classList.remove('hidden'); }
function fecharGuia(){ guiaModal.classList.add('hidden'); }
function renderGuia(){
  const p=GUIA_PASSOS[guiaIdx], ultimo=guiaIdx===GUIA_PASSOS.length-1;
  document.getElementById('guiaBody').innerHTML=`
    <div class="guiaPasso">Guia do app · ${guiaIdx+1} de ${GUIA_PASSOS.length}</div>
    <div class="guiaEmoji">${p.e}</div>
    <h3>${p.t}</h3>
    <div class="guiaCorpo">${p.c}</div>
    <div class="guiaDots">${GUIA_PASSOS.map((_,k)=>`<span class="${k===guiaIdx?'on':''}" data-k="${k}"></span>`).join('')}</div>
    <div class="guiaNav">
      ${guiaIdx>0?'<button type="button" class="btnGhost" id="guiaPrev">‹ Voltar</button>':''}
      <button type="button" class="btnPrimary" id="guiaNext">${ultimo?'Começar a usar! 🚀':'Avançar ›'}</button>
    </div>
    ${ultimo?'':'<button type="button" class="guiaSkip" id="guiaSkip">Pular o tour (reabra no ? lá em cima)</button>'}`;
  const prev=document.getElementById('guiaPrev');
  if(prev) prev.onclick=()=>{ guiaIdx--; renderGuia(); };
  document.getElementById('guiaNext').onclick=()=>{ if(ultimo) fecharGuia(); else { guiaIdx++; renderGuia(); } };
  const skip=document.getElementById('guiaSkip');
  if(skip) skip.onclick=fecharGuia;
  guiaModal.querySelectorAll('.guiaDots span').forEach(d=>d.onclick=()=>{ guiaIdx=Number(d.dataset.k); renderGuia(); });
}
document.getElementById('btnGuia').onclick=()=>abrirGuia(0);

document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('.modalWrap').classList.add('hidden'));
document.querySelectorAll('.modalWrap').forEach(w=>w.addEventListener('click',e=>{ if(e.target===w) w.classList.add('hidden'); }));

/* ---------------- PWA: service worker ---------------- */
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('cofrin-sw.js').catch(()=>{/* offline-first é opcional */});
  });
}

/* chamado pelo LifePlan quando a seção aparece: gráficos criados escondidos precisam se remedir */
window.cofrinOnShow = function(){
  temaGraficos();
  Object.values(state.charts || {}).forEach(c => { if (c && c.resize) { c.update('none'); c.resize(); } });
};
/* as abas do cofrin viraram itens do menu do LifePlan: ele escolhe a aba por aqui */
window.cofrinAbrirAba = function(tab){
  const b = document.querySelector('nav.tabs button[data-tab="' + tab + '"]');
  if (b) b.click();
};
})();
