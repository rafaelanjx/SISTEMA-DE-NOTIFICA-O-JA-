import { initializeApp }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, push, remove, update, onValue, set, onDisconnect }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ────────────────────────────────────────────
   ESTADO
──────────────────────────────────────────── */
let db = null, meuId = null, meuNome = null;
let lastTs = Date.now();
let abaAtual = 'fila';

/* badges por aba */
const badges = { fila:0, administrativo:0, financeiro:0, finalizado:0 };

/* ────────────────────────────────────────────
   SETUP MODAL
──────────────────────────────────────────── */
window.abrirSetup = () => {
  const n = localStorage.getItem('jaR_pcNome')||'';
  const u = localStorage.getItem('jaR_fbUrl') ||'';
  document.getElementById('inputPcNome').value = n;
  document.getElementById('inputFbUrl').value  = u;
  document.getElementById('setupOverlay').classList.add('show');
};
window.fecharSetup = () => document.getElementById('setupOverlay').classList.remove('show');

window.salvarConfig = () => {
  const n = document.getElementById('inputPcNome').value.trim();
  // remove espaços, quebras de linha e caracteres invisíveis da URL
  const u = document.getElementById('inputFbUrl').value.replace(/\s+/g,'').trim();
  if (!n) { alert('Digite o nome deste computador!'); return; }
  if (!u) { alert('Cole a URL do Firebase Realtime Database!'); return; }
  // aceita tanto firebaseio.com quanto firebase.google.com
  if (!u.includes('firebaseio') && !u.includes('firebase')) {
    alert('URL inválida! Cole a URL do Firebase Realtime Database.\nExemplo: https://meu-projeto-default-rtdb.firebaseio.com');
    return;
  }
  localStorage.setItem('jaR_pcNome', n);
  localStorage.setItem('jaR_fbUrl', u);
  location.reload();
};

/* ALT+H */
document.addEventListener('keydown', e => {
  if (e.altKey && e.key.toLowerCase()==='h') {
    e.preventDefault();
    const ov = document.getElementById('setupOverlay');
    if (ov.classList.contains('show')) { fecharSetup(); toast('⚙ Configurações fechadas'); }
    else { abrirSetup(); toast('⚙ Configurações abertas — ALT+H para fechar'); }
  }
});

/* ────────────────────────────────────────────
   TROCA DE ABA
──────────────────────────────────────────── */
window.trocarAba = (aba, el) => {
  abaAtual = aba;
  document.querySelectorAll('.nav-item').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('aba-'+aba).classList.add('active');
  // zerar badge
  badges[aba] = 0;
  const b = document.getElementById('badge'+capitalize(aba));
  if (b) { b.style.display='none'; }
};

function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }

function incrementarBadge(aba) {
  if (abaAtual === aba) return;
  badges[aba]++;
  const b = document.getElementById('badge'+capitalize(aba));
  if (b) { b.textContent = badges[aba]; b.style.display='flex'; }
}

/* ────────────────────────────────────────────
   SOM
──────────────────────────────────────────── */
let audioCtx = null;
function iniciarAudio(){
  if (!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  if (audioCtx.state==='suspended') audioCtx.resume();
}
document.addEventListener('click', iniciarAudio, {once:false});

function tocarSom(tipo='fila'){
  try {
    iniciarAudio();
    const notas = tipo==='administrativo'
      ? [[523,.0],[659,.18],[784,.36]]
      : tipo==='financeiro'
      ? [[880,.0],[1046,.18],[880,.36],[1046,.54]]
      : [[440,.0],[554,.18],[659,.36],[880,.54]];
    notas.forEach(([f,t])=>{
      const o=audioCtx.createOscillator(), g=audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.frequency.value=f; o.type='sine';
      g.gain.setValueAtTime(.45,audioCtx.currentTime+t);
      g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+t+.4);
      o.start(audioCtx.currentTime+t); o.stop(audioCtx.currentTime+t+.45);
    });
  } catch(e){}
}

/* ────────────────────────────────────────────
   POPUP
──────────────────────────────────────────── */
window.fecharPopup = ()=>document.getElementById('popupOverlay').classList.remove('show');

function mostrarPopup(nome, por, tipo){
  document.getElementById('popupName').textContent = nome;
  document.getElementById('popupSub').textContent  = 'por ' + por;
  const stepEl  = document.getElementById('popupStep');
  const labelEl = document.getElementById('popupLabel');
  const bellEl  = document.getElementById('popupBell');
  if (tipo==='administrativo'){
    labelEl.textContent='AGUARDANDO ADMINISTRATIVO';
    stepEl.textContent='🧾 ETAPA 1 — ADMINISTRATIVO';
    stepEl.className='popup-step administrativo';
    bellEl.textContent='🧾';
    tocarSom('administrativo');
  } else if (tipo==='financeiro'){
    labelEl.textContent='AGUARDANDO FINANCEIRO';
    stepEl.textContent='💰 ETAPA 2 — FINANCEIRO';
    stepEl.className='popup-step financeiro';
    bellEl.textContent='💰';
    tocarSom('financeiro');
  } else {
    labelEl.textContent='AGUARDANDO FINALIZAÇÃO';
    stepEl.textContent='📋 NOVO NA FILA';
    stepEl.className='popup-step fila';
    bellEl.textContent='🔔';
    tocarSom('fila');
  }
  document.getElementById('popupOverlay').classList.add('show');
  if ('Notification' in window && Notification.permission==='granted')
    new Notification('🔔 JÁ Reciclagem', { body: nome + ' — ' + (stepEl.textContent||'') });
}

/* ────────────────────────────────────────────
   TOAST
──────────────────────────────────────────── */
function toast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),3200);
}

/* ────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────── */
function hr(ts){ return new Date(ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); }

function tagOp(v){ return v?`<span class="tag tag-op">${v}</span>`:''; }
function tagSc(v){ return v?`<span class="tag tag-sc">${v}</span>`:''; }

/* ────────────────────────────────────────────
   INIT FIREBASE
──────────────────────────────────────────── */
const sNome = localStorage.getItem('jaR_pcNome');
const sUrl  = localStorage.getItem('jaR_fbUrl');

if (!sNome || !sUrl) {
  // primeira vez — abre setup automaticamente
  setTimeout(abrirSetup, 400);
} else {
  meuNome = sNome;
  meuId   = 'pc_'+sNome.replace(/\s+/g,'_')+'_'+Math.random().toString(36).slice(2,6);

  document.getElementById('pcDisplay').textContent    = '💻 '+sNome;
  document.getElementById('statusLabel').textContent  = 'CONECTANDO...';

  const app = initializeApp({ databaseURL: sUrl });
  db = getDatabase(app);

  /* presença */
  const presRef = ref(db,'presenca/'+meuId);
  set(presRef,{nome:sNome, desde:Date.now()});
  onDisconnect(presRef).remove();

  /* PRESENÇA */
  onValue(ref(db,'presenca'), snap=>{
    const dados=snap.val()||{};
    const ids=Object.keys(dados);
    document.getElementById('chipOnline').textContent=ids.length+' online';
    const lista=document.getElementById('listaOnline');
    if(!ids.length){ lista.innerHTML='<div class="empty"><span>🖥</span>Nenhum online.</div>'; return; }
    lista.innerHTML='';
    ids.forEach(id=>{
      const pc=dados[id], sou=id===meuId;
      const d=document.createElement('div');
      d.className='online-item'+(sou?' eu':'');
      d.innerHTML=`
        <div class="pc-icon">🖥</div>
        <div style="flex:1">
          <div class="online-nome">${pc.nome}${sou?' <span style="font-size:11px;color:var(--steel-dim)">(este PC)</span>':''}</div>
          <div class="online-since">online desde ${hr(pc.desde)}</div>
        </div>
        <div class="online-dot"></div>`;
      lista.appendChild(d);
    });
  });

  /* FILA PRINCIPAL */
  onValue(ref(db,'fila'), snap=>{
    const dados=snap.val()||{};
    const itens=Object.entries(dados).sort((a,b)=>a[1].ts-b[1].ts);

    /* cache de nomes p/ modal de pagamento */
    itens.forEach(([key,item])=>{ nomesFila[key]=item.nome; });

    /* contadores */
    document.getElementById('chipFila').textContent      = itens.length+' na fila';
    document.getElementById('chipFilaGeral').textContent = itens.length;

    const aguardAdministrativo   = itens.filter(([,i])=>!i.administrativoOk);
    const aguardFinanceiro= itens.filter(([,i])=>i.administrativoOk && !i.financeiroOk);

    document.getElementById('chipAdministrativo').textContent   = aguardAdministrativo.length+' aguardando';
    document.getElementById('chipFinanceiro').textContent= aguardFinanceiro.length+' aguardando';

    /* badges sidebar */
    atualizarBadgeSilencioso('Administrativo',   aguardAdministrativo.length);
    atualizarBadgeSilencioso('Financeiro',aguardFinanceiro.length);

    /* renderizar fila geral */
    renderFilaGeral(itens);

    /* renderizar aba administrativo */
    renderListaEtapa('listaAdministrativo', aguardAdministrativo, 'administrativo');

    /* renderizar aba financeiro */
    renderListaEtapa('listaFinanceiro', aguardFinanceiro, 'financeiro');

    /* renderizar 4 listas filtradas */
    renderListas(itens);

    /* notificar novos itens (de outros PCs) */
    itens.forEach(([,item])=>{
      if(item.ts > lastTs && item.porId !== meuId){
        mostrarPopup(item.nome, item.por, 'fila');
        incrementarBadge('fila');
        lastTs = item.ts;
      }
      if(item.administrativoTs && item.administrativoTs > lastTs && item.administrativoFinId !== meuId){
        mostrarPopup(item.nome, item.administrativoPor||'?', 'financeiro');
        incrementarBadge('financeiro');
        lastTs = item.administrativoTs;
      }
    });
  });

  /* FINALIZADOS */
  onValue(ref(db,'finalizado'), snap=>{
    const dados=snap.val()||{};
    const itens=Object.values(dados).sort((a,b)=>b.tsF-a.tsF);
    document.getElementById('chipDone').textContent=itens.length+' finalizado(s)';
    const lista=document.getElementById('listaFinalizado');
    if(!itens.length){ lista.innerHTML='<div class="empty"><span>✅</span>Nenhum finalizado ainda.</div>'; return; }
    lista.innerHTML='';
    itens.forEach(item=>{
      const d=document.createElement('div');
      d.className='done-item';
      const pagamentoTxt = item.pagamento ? (item.pagamento==='DINHEIRO'?'💵 Dinheiro':'📱 Pix') : '—';
      d.innerHTML=`
        <div class="done-check">✅</div>
        <div class="done-info">
          <div class="done-nome">${item.nome}</div>
          <div class="fila-tags" style="margin-top:6px">${tagOp(item.operacao)}${tagSc(item.sucata)}</div>
          <div class="done-meta">
            Entrada: ${hr(item.ts)} por ${item.por}<br>
            🧾 Administrativo: ${item.administrativoTs?hr(item.administrativoTs)+' por '+(item.administrativoPor||'?'):'—'}<br>
            💰 Financeiro: ${item.tsF?hr(item.tsF)+' por '+(item.finPor||'?'):'—'}<br>
            💳 Pagamento: ${pagamentoTxt}
          </div>
        </div>
        <div class="done-tag">CONCLUÍDO</div>`;
      lista.appendChild(d);
    });
  });

  /* status OK */
  document.getElementById('dotStatus').classList.add('online');
  document.getElementById('sidebarStatus').classList.add('online');
  document.getElementById('statusLabel').textContent='ONLINE';

  if('Notification' in window && Notification.permission==='default')
    Notification.requestPermission();
}

/* ────────────────────────────────────────────
   RENDER FILA GERAL (com etapas visuais)
──────────────────────────────────────────── */
function renderFilaGeral(itens){
  const lista=document.getElementById('listaFilaGeral');
  if(!itens.length){ lista.innerHTML='<div class="empty"><span>📋</span>Nenhum cliente na fila.</div>'; return; }
  lista.innerHTML='';
  itens.forEach(([key,item],idx)=>{
    const etapa1 = item.administrativoOk;
    const etapa2 = item.financeiroOk;
    const d=document.createElement('div');
    d.className='fila-item';
    d.innerHTML=`
      <div class="fila-num">${idx+1}</div>
      <div class="fila-info">
        <div class="fila-nome">${item.nome}</div>
        <div class="fila-tags">${tagOp(item.operacao)}${tagSc(item.sucata)}</div>
        <div class="step-track">
          <div class="step-row ${etapa1?'done':(true?'active':'wait')}">
            <div class="step-dot"></div>
            <span class="step-label">🧾 ADMINISTRATIVO${etapa1?' — '+hr(item.administrativoTs):' — AGUARDANDO'}</span>
          </div>
          <div class="step-row ${etapa2?'done':(etapa1?'active':'wait')}">
            <div class="step-dot"></div>
            <span class="step-label">💰 FINANCEIRO${etapa2?' — '+hr(item.tsFinanceiro):etapa1?' — AGUARDANDO':' — PENDENTE'}</span>
          </div>
        </div>
        <div class="fila-meta">Adicionado por ${item.por} · ${hr(item.ts)}</div>
      </div>`;
    lista.appendChild(d);
  });
}

/* ────────────────────────────────────────────
   RENDER LISTAS POR ETAPA (Administrativo / Financeiro)
──────────────────────────────────────────── */
function renderListaEtapa(elId, itens, tipo){
  const lista=document.getElementById(elId);
  const emptyMsg = tipo==='administrativo'
    ? '<div class="empty"><span>🧾</span>Nenhum cliente aguardando administrativo.</div>'
    : '<div class="empty"><span>💰</span>Nenhum cliente aguardando financeiro.</div>';
  if(!itens.length){ lista.innerHTML=emptyMsg; return; }
  lista.innerHTML='';
  itens.forEach(([key,item],idx)=>{
    const d=document.createElement('div');
    d.className='fila-item';

    const btnAdministrativo = tipo==='administrativo'
      ? `<button class="btn-step btn-administrativo" onclick="finalizarAdministrativo('${key}')">🧾 FINALIZAR<br>ADMINISTRATIVO</button>`
      : '';
    const btnFinanceiro = tipo==='financeiro'
      ? `<button class="btn-step btn-financeiro" onclick="finalizarFinanceiro('${key}')">💰 FINALIZAR<br>FINANCEIRO</button>`
      : '';

    d.innerHTML=`
      <div class="fila-num">${idx+1}</div>
      <div class="fila-info">
        <div class="fila-nome">${item.nome}</div>
        <div class="fila-tags">${tagOp(item.operacao)}${tagSc(item.sucata)}</div>
        <div class="fila-meta">Entrada: ${hr(item.ts)} · por ${item.por}
          ${tipo==='financeiro'?'<br>🧾 Administrativo: '+hr(item.administrativoTs)+' por '+(item.administrativoPor||'?'):''}
        </div>
      </div>
      <div class="fila-actions">${btnAdministrativo}${btnFinanceiro}</div>`;
    lista.appendChild(d);
  });
}

/* ────────────────────────────────────────────
   RENDER 4 LISTAS FILTRADAS
──────────────────────────────────────────── */
function renderListas(itens){
  const grupos={
    comprou:  {val:'COMPROU MATERIAL',campo:'operacao',el:'listaComprou',  cnt:'countComprou'},
    vendeu:   {val:'VENDEU MATERIAL', campo:'operacao',el:'listaVendeu',   cnt:'countVendeu'},
    temSucata:{val:'TEM SUCATA',      campo:'sucata',  el:'listaTemSucata',cnt:'countTemSucata'},
    naoTem:   {val:'NÃO TEM SUCATA', campo:'sucata',  el:'listaNaoTem',   cnt:'countNaoTem'},
  };
  const emojis={comprou:'💰',vendeu:'📦',temSucata:'✅',naoTem:'❌'};
  Object.entries(grupos).forEach(([gk,g])=>{
    const fil=itens.filter(([,it])=>it[g.campo]===g.val);
    document.getElementById(g.cnt).textContent=fil.length;
    const el=document.getElementById(g.el);
    if(!fil.length){ el.innerHTML=`<div class="mini-empty" style="text-align:center;padding:20px;color:var(--steel-dim);font-size:13px"><span style="display:block;font-size:24px;margin-bottom:6px">${emojis[gk]}</span>Nenhum</div>`; return; }
    el.innerHTML='';
    fil.forEach(([,item],idx)=>{
      const etapa = item.administrativoOk?'financeiro':'administrativo';
      const d=document.createElement('div');
      d.className='mini-item';
      d.innerHTML=`
        <div class="mini-num">${idx+1}</div>
        <div class="mini-info">
          <div class="mini-nome">${item.nome}</div>
          <div class="mini-hora">por ${item.por} · ${hr(item.ts)}</div>
        </div>
        <div class="mini-step-badge ${etapa}">${etapa==='administrativo'?'🧾 ADMINISTRATIVO':'💰 FINANCEIRO'}</div>`;
      el.appendChild(d);
    });
  });
}

/* ────────────────────────────────────────────
   BADGE SILENCIOSO (só conta, não popup)
──────────────────────────────────────────── */
function atualizarBadgeSilencioso(nome, qtd){
  const b=document.getElementById('badge'+nome);
  if(!b) return;
  if(qtd>0 && abaAtual!==nome.toLowerCase()){
    b.textContent=qtd; b.style.display='flex';
  } else {
    b.style.display='none';
  }
}

/* ────────────────────────────────────────────
   ENVIAR NOME PARA FILA
──────────────────────────────────────────── */
window.enviarNome = async ()=>{
  if(!db){ abrirSetup(); return; }
  const input=document.getElementById('nomeInput');
  const nome=input.value.trim();
  if(!nome){ input.focus(); return; }

  const operacao=document.querySelector('input[name="operacao"]:checked');
  const sucata  =document.querySelector('input[name="sucata"]:checked');
  let erros=false;

  const gOp=document.getElementById('grupoOperacao');
  const gSc=document.getElementById('grupoSucata');
  if(!operacao){ gOp.classList.add('err'); erros=true; } else gOp.classList.remove('err');
  if(!sucata)  { gSc.classList.add('err'); erros=true; } else gSc.classList.remove('err');
  if(erros){ toast('⚠ Selecione operação e situação da sucata!'); return; }

  const btn=document.getElementById('btnEnviar');
  btn.disabled=true; btn.textContent='⏳ ENVIANDO...';
  try {
    await push(ref(db,'fila'),{
      nome, ts:Date.now(), por:meuNome, porId:meuId,
      operacao:operacao.value, sucata:sucata.value,
      administrativoOk:false, financeiroOk:false
    });
    input.value='';
    document.querySelectorAll('input[name="operacao"],input[name="sucata"]').forEach(r=>r.checked=false);
    gOp.classList.remove('err'); gSc.classList.remove('err');
    toast('✅ Cliente adicionado à fila!');
  } catch(e){ alert('Erro: '+e.message); }
  btn.disabled=false; btn.textContent='+ COLOCAR NA FILA';
};

/* ────────────────────────────────────────────
   FINALIZAR ADMINISTRATIVO (etapa 1)
   Pergunta a forma de pagamento:
   - DINHEIRO → pula o financeiro e vai direto para FINALIZADO
   - PIX      → segue normalmente para o FINANCEIRO
──────────────────────────────────────────── */
let pagamentoKeyAtual = null;
const nomesFila = {}; // cache de nomes por chave, para exibir no modal de pagamento

window.finalizarAdministrativo = (key)=>{
  if(!db) return;
  pagamentoKeyAtual = key;
  document.getElementById('pagamentoNome').textContent = nomesFila[key] || '';
  document.getElementById('pagamentoOverlay').classList.add('show');
};

window.cancelarPagamento = ()=>{
  pagamentoKeyAtual = null;
  document.getElementById('pagamentoOverlay').classList.remove('show');
};

window.confirmarPagamento = async (forma)=>{
  const key = pagamentoKeyAtual;
  if(!key || !db) return;
  document.getElementById('pagamentoOverlay').classList.remove('show');
  pagamentoKeyAtual = null;

  try {
    if (forma === 'DINHEIRO') {
      /* dinheiro: finaliza administrativo E financeiro de uma vez, direto para FINALIZADO */
      const snap = await new Promise(res=>{
        const u=onValue(ref(db,'fila/'+key),s=>{ res(s); u(); });
      });
      const item = snap.val();
      if(!item) return;
      const agora = Date.now();
      await push(ref(db,'finalizado'),{
        ...item,
        administrativoOk:true, administrativoTs:agora, administrativoPor:meuNome, administrativoFinId:meuId,
        financeiroOk:true, tsFinanceiro:agora, finPor:meuNome, finId:meuId,
        pagamento:'DINHEIRO',
        tsF:agora
      });
      await remove(ref(db,'fila/'+key));
      toast('💵 Pago em dinheiro! Atendimento finalizado direto.');
    } else {
      /* pix: finaliza só a etapa administrativo, segue para o financeiro */
      await update(ref(db,'fila/'+key),{
        administrativoOk:true,
        administrativoTs:Date.now(),
        administrativoPor:meuNome,
        administrativoFinId:meuId,
        pagamento:'PIX'
      });
      toast('📱 Pix selecionado! Cliente segue para o Financeiro.');
    }
  } catch(e){ alert('Erro: '+e.message); }
};

/* ────────────────────────────────────────────
   FINALIZAR FINANCEIRO (etapa 2) → move para finalizado
──────────────────────────────────────────── */
window.finalizarFinanceiro = async (key)=>{
  if(!db) return;
  try {
    /* busca o item atual para copiar todos os dados */
    const snap = await new Promise(res=>{
      const u=onValue(ref(db,'fila/'+key),s=>{ res(s); u(); });
    });
    const item = snap.val();
    if(!item) return;
    await push(ref(db,'finalizado'),{
      ...item,
      financeiroOk:true,
      tsFinanceiro:Date.now(),
      finPor:meuNome, finId:meuId,
      tsF:Date.now()
    });
    await remove(ref(db,'fila/'+key));
    toast('💰 Atendimento concluído! Cliente finalizado.');
  } catch(e){ alert('Erro: '+e.message); }
};
