const D = window.D;
const COR_Z = {1:'#3b82f6', 2:'#22c55e', 3:'#facc15', 4:'#f97316', 5:'#ef4444'};
// cor e peso de cada trecho: os deste alimentador aqui; os dos alimentadores selecionados (assets/selecionados.js), pelo
// window.__alKit, com a mesma regra
function prepara(d) {
  d.trechos.forEach(t => {
    t.cor = COR_Z[t.zona] || '#d946ef';                  // cor pela classe: T2, T2-A, T2-B… na mesma cor
    t.peso = t.tipo === 'principal' ? 6 : t.tipo === 'ramal' ? 4.5 : 3;
  });
}
prepara(D);
const TR = {};
for (const t of D.trechos) TR[t.nome] = t;
const TIPO = {DJ:'disjuntor', '79':'religador', '03':'fusível 03', '33':'fusível 33', '02':'chave 02',
              '40':'trip saver 40', '41':'trip saver 41', SEC:'seccionamento',
              FTR:'fusível no tronco (não abre T3)'};
// formatadores criados uma vez (km e mil rodam milhares de vezes ao montar a lista de trechos), no 1º uso: montar o 1º
// formatador de números do navegador leva uns 10 ms, que assim não entram no começo deste script (o mapa vem antes)
let NF2 = null, NF0 = null;
const nf2 = () => NF2 || (NF2 = new Intl.NumberFormat('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2}));
const nf0 = () => NF0 || (NF0 = new Intl.NumberFormat('pt-BR'));
const km = m => m < 1000 ? Math.round(m) + ' m' : nf2().format(m / 1000) + ' km';
const nv = q => q + (q === 1 ? ' vão' : ' vãos');
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const mil = x => nf0().format(Number(x));               // 1996 → 1.996
const $ = id => document.getElementById(id);
// vãos seguidos (o fim de um é o início do outro) viram uma linha só: o mapa projeta metade dos pontos a cada zoom e o
// Leaflet simplifica a linha de longe. O traço é o mesmo; o clique acha o vão pela lista de vãos, não pela linha.
function cadeias(vs) {
  const out = []; let c = null, la = NaN, lo = NaN;
  for (const v of vs) {
    if (c && v[0] === la && v[1] === lo) c.push([v[2], v[3]]);
    else out.push(c = [[v[0], v[1]], [v[2], v[3]]]);
    la = v[2]; lo = v[3];
  }
  return out;
}
window.__cadeias = cadeias;
const FECHA = '<button type="button" class="fecha" id="todos" aria-label="Limpar seleção" title="Limpar seleção">✕</button>';

// ---------- montagem em fatias (window.__al) ----------
// O que pesa na carga (as ~2.000 linhas da rede, os rótulos, os pontos dos fusíveis e as linhas da lista) é montado em
// fatias de poucos milissegundos, devolvendo a vez ao navegador entre elas: a página pinta, anima e responde ao toque
// enquanto monta. No fim deste script o mapa já existe (window.__map, com vista) e os outros scripts podem usá-lo; a rede
// entra em seguida, o tronco primeiro. Contrato para os outros scripts da página:
//   __al.cheia()     a fatia atual acabou? (a conta é uma só para a página: quem fatiar o seu trabalho usa esta)
//   __al.cede()      promessa: devolve a vez ao navegador, deixa sair o próximo quadro e continua logo depois dele, numa
//                    fatia nova que vai até pouco antes do quadro seguinte (uso, dentro do laço de uma função async:
//                    `if (__al.cheia()) await __al.cede();`). Enquanto se espera o quadro, os scripts seguintes da
//                    página podem rodar: quem usa cede() não pode contar que termina antes deles
//   __al.segue()     promessa: só devolve a vez (sem esperar o quadro) e continua na frente do resto da fila; os quadros
//                    ficam para depois, então só para trechos curtos que precisam sair juntos (aqui: o tronco da rede)
//   __al.ocioso()    promessa: idem, mas só continua quando o navegador estiver à toa (o que não aparece na 1ª tela)
//   __al.espera(p)   a página só fica pronta (classe al-pronto: o painel aparece) depois de a promessa p terminar
//   __al.dom         promessa: o HTML acabou e todos os scripts da página já rodaram (DOMContentLoaded)
//   __al.linhas      promessa: todas as linhas da rede estão no mapa (evento 'al:linhas' no document). Camada que entra no
//                    canvas depois dela poupa um redesenho inteiro do canvas (linha que chega com camada por cima não pode
//                    ser só pintada: no fim, o canvas é refeito)
//   __al.rede        promessa: linhas, rótulos e fusíveis estão no mapa (evento 'al:rede' no document)
//   __al.lista       promessa: a lista de trechos está inteira (window.__listaInteira() termina na hora, se preciso)
//   __al.pronto      promessa: o painel apareceu (evento 'al:pronto' no document); window.__alPronto é a mesma
// Marcas de tempo (performance.mark): al:mapa, al:tronco, al:linhas, al:rede, al:lista, al:pronto.
let fimRede, fimLista, fimLinhas;
const marca = n => { try { performance.mark(n); } catch (e) { /* sem marcas */ } };
const AL = window.__al = (() => {
  const FATIA = 10, S = window.scheduler, raiz = document.documentElement;
  let fim = 0;
  requestAnimationFrame(() => {});                        // um quadro já pedido: ele entra na fila antes da continuação do HTML (ver montaRede)
  const volta = S && S.yield ? () => S.yield()
    : S && S.postTask ? () => S.postTask(() => {}, {priority: 'user-blocking'})
    : window.MessageChannel ? (() => { const c = new MessageChannel(), f = []; c.port1.onmessage = () => f.shift()(); return () => new Promise(r => { f.push(r); c.port2.postMessage(0); }); })()
    : () => new Promise(r => setTimeout(r, 0));
  // Uma fatia por quadro. Esperar só a vez (volta) não basta: a continuação passa na frente do desenho da tela, e os
  // quadros só saíam a cada ~100 ms. Por isso cede() espera o quadro seguinte (requestAnimationFrame), continua logo
  // depois de ele ser pintado e trabalha até pouco antes do próximo: com quadro leve, 60 por segundo; com quadro pesado
  // (aparelho lento), um intervalo sim, um não (30 por segundo). Aba escondida ou quadro que não vem (página fora da
  // tela): segue sem esperar por ele
  const segue = () => volta().then(() => { fim = performance.now() + FATIA; });
  const TELA = 1000 / 60;
  let semQuadro = 0, sonda = 0;
  const quadro = () => new Promise(r => {
    let feito = false;
    const t = setTimeout(() => { if (!feito) { feito = true; semQuadro++; r(0); } }, 60);
    requestAnimationFrame(ts => { if (!feito) { feito = true; clearTimeout(t); semQuadro = 0; r(ts); } });
  });
  const cede = async () => {
    if (!document.hidden && semQuadro < 3) {
      const ts = await quadro();
      await volta();
      const agora = performance.now();
      if (ts) {
        const prox = ts + TELA - 3;                       // até aqui o quadro seguinte sai na hora
        fim = Math.min(agora + 14, prox - agora >= 5 ? prox : Math.max(agora + 4, prox + TELA));
        return;
      }
    } else {
      if (!document.hidden && ++sonda % 20 === 0) requestAnimationFrame(() => { semQuadro = 0; });   // os quadros voltaram?
      await volta();
    }
    fim = performance.now() + FATIA;
  };
  const ocioso = () => new Promise(r => {
    const vai = d => { fim = performance.now() + Math.max(3, Math.min(FATIA, (d && d.timeRemaining ? d.timeRemaining() : FATIA) - 1)); r(); };
    if (window.requestIdleCallback) requestIdleCallback(vai, {timeout: 2000}); else setTimeout(vai, 40);
  });
  // Variante só da lista de trechos: espera o tempo ocioso por pouco (80 ms); se a vez vem pelo prazo (o navegador
  // não tem folga nenhuma), devolve true e a fatia é a de sempre (FATIA), não a de 3 ms de ocioso()
  const ociosoLista = () => new Promise(r => {
    let prazo = true;
    const vai = d => { prazo = !!(d && d.didTimeout); fim = performance.now() + (prazo ? FATIA : Math.max(3, Math.min(FATIA, (d && d.timeRemaining ? d.timeRemaining() : FATIA) - 1))); r(prazo); };
    if (window.requestIdleCallback) requestIdleCallback(vai, {timeout: 80}); else setTimeout(() => vai({didTimeout: true}), 40);
  });
  // pronta = o HTML acabou (todos os scripts rodaram) e nada do que o painel mostra está por montar. A classe al-pronto
  // quem põe é o script do cabeçalho da página, no DOMContentLoaded; com algo por montar, ela sai e volta quando terminar
  // (espera() vale até o DOMContentLoaded, ouvintes do document incluídos; depois dele, só enquanto ainda houver espera)
  let pend = 0, dcl = document.readyState !== 'loading', tarde = dcl, feito = false, solta, soltaDom;
  const pronto = new Promise(r => { solta = r; }), dom = new Promise(r => { soltaDom = r; });
  const confere = () => {
    if (feito || !dcl || pend) return;
    feito = true;
    if (raiz.classList.contains('al-site')) raiz.classList.add('al-pronto');
    marca('al:pronto');
    solta();
    document.dispatchEvent(new Event('al:pronto'));
  };
  const espera = p => {
    if (feito || (tarde && !pend)) return p;             // o painel já apareceu (ou vai aparecer neste quadro): não some de novo
    pend++;
    const f = () => { pend--; confere(); };
    Promise.resolve(p).then(f, f);
    return p;
  };
  const chegou = () => { dcl = true; soltaDom(); confere(); };
  if (dcl) setTimeout(chegou, 0);
  else {
    document.addEventListener('DOMContentLoaded', () => { if (pend) raiz.classList.remove('al-pronto'); });
    addEventListener('DOMContentLoaded', () => { tarde = true; if (pend) raiz.classList.remove('al-pronto'); setTimeout(chegou, 0); });   // chegou(): depois dos ouvintes dos outros scripts
  }
  return {fatia: FATIA, cheia: () => performance.now() >= fim, cede, segue, ocioso, ociosoLista, espera, dom, pronto,
    linhas: new Promise(r => { fimLinhas = r; }), rede: new Promise(r => { fimRede = r; }), lista: new Promise(r => { fimLista = r; })};
})();
window.__alPronto = AL.pronto;

// legenda
const nRamal = D.trechos.filter(t => t.tipo === 'ramal').length;
const leg = [['T1', COR_Z[1], ''], [nRamal > 1 ? 'T2-A, T2-B…' : nRamal ? 'T2-A' : 'T2', COR_Z[2], '']];
[3, 4, 5].forEach(z => { if (D.trechos.some(t => t.zona === z)) leg.push([`T${z}-…`, COR_Z[z], 'fino']); });
if (D.trechos.some(t => t.zona > 5)) leg.push(['T6+', '#d946ef', 'fino']);
$('legenda').innerHTML = leg.map(([n, c, k]) => `<span><i class="${k}" style="--c:${c}"></i>${esc(n)}</span>`).join('');

// interrupções (NAE): coletiva = atuou DJ, religador, fusível ou trafo; individual = um consumidor
const NAE = D.nae || null;
const rotNae = d => ((d.meta || {}).origem || {}).nae_filtro === 'arvore' ? 'NAE - vegetação' : 'NAE';   // NAE só de árvore/eucalipto
const ROT_NAE = rotNae(D);
// o contexto do detalhe, do bloco NAE e das UCs: este alimentador (EU, o padrão de todas as funções que recebem cx). Um
// alimentador selecionado (assets/selecionados.js) passa o dele, com o mesmo formato: os dados, os trechos pelo nome, a NAE,
// o rótulo da NAE, o código, as UCs (promessa) e abre(nomes), o link da página dele
const EU = {D, TR, NAE, ROT_NAE, al: (D.meta || {}).al || '', ucs: () => UCS_P};
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotMes1 = m => `${MESES[+m.slice(5, 7) - 1]}/${m.slice(0, 4)}`;
// meses escolhidos (botão #mes, lista de marcar): vazio = todos. As funções da NAE recebem a NAE de um alimentador (N; o
// padrão é a deste): os meses escolhidos valem para todos, cada um no período que tem
const mesSel = new Set();
const noPeriodo = m => !mesSel.size || mesSel.has(m);
const escolhidos = (N = NAE) => N.meses.filter(noPeriodo);
const segue = (a, b) => { const n = +a.slice(0, 4) * 12 + +a.slice(5, 7); return +b.slice(0, 4) * 12 + +b.slice(5, 7) === n + 1; };
// texto curto do botão "Meses: …": "todos", "mar/2026", "mar, abr/2026", "3 meses"
function rotBotao() {
  const ms = escolhidos();
  if (!mesSel.size && NAE.meses.length > 1) return 'todos';
  if (ms.length === 1) return rotMes1(ms[0]);
  return ms.length === 2 && ms[0].slice(0, 4) === ms[1].slice(0, 4) ? `${MESES[+ms[0].slice(5, 7) - 1]}, ${rotMes1(ms[1])}` : `${ms.length} meses`;
}
const ABR = {DJ: 'DJ', RL: 'religador', 'CH FUS': 'fusível', CH: 'chave', TR: 'trafo', UC: 'consumidor'};
// período real da Crítica junto de todo número de NAE: "jan a ago/2026", "dez/2025 a fev/2026" ou os meses escolhidos
function periodo(N = NAE) {
  if (!N) return '';
  const ms = escolhidos(N);
  if (!ms.length) return '';
  const a = ms[0], b = ms[ms.length - 1], seguidos = ms.every((m, i) => !i || segue(ms[i - 1], m));
  if (ms.length === 1) return rotMes1(a);
  if (seguidos) return (a.slice(0, 4) === b.slice(0, 4) ? MESES[+a.slice(5, 7) - 1] : rotMes1(a)) + ' a ' + rotMes1(b);
  return `${ms.length} meses entre ${rotMes1(a)} e ${rotMes1(b)}`;
}
// tipo da ocorrência: disjuntor e religador (a contagem por trecho não muda: regra aprovada), trafo e o resto da rede MT
const tipoOc = o => o.abr === 'DJ' || o.abr === 'RL' ? 'djrl' : o.abr === 'TR' || !o.col ? 'tr' : 'mt';
// CHI em consumidor·hora, a mesma unidade do Ranking e do Priorizador: o.chi (somado por passo de manobra, critica.py)
// quando a Crítica foi reprocessada; sem ele, consumidores × duração / 60, que é estimativa
const chiOc = o => o.chi != null ? o.chi : (o.cons || 0) * (o.dur || 0) / 60;
const chi = os => os.reduce((s, o) => s + chiOc(o), 0);
const chiTxt = (v, est) => `CHI ${mil(Math.round(v))} consumidor·hora${est ? ' (estimado)' : ''}`;
const chiEst = os => os.some(o => o.chi == null);
// "x rede MT · y trafo · z de disjuntor/religador": TR e rede MT separados, DJ/RL à parte
function tiposOc(os) {
  const n = {mt: 0, tr: 0, djrl: 0};
  os.forEach(o => n[tipoOc(o)]++);
  return [n.mt ? `${n.mt} rede MT` : '', n.tr ? `${n.tr} trafo` : '', n.djrl ? `${n.djrl} de disjuntor/religador` : ''].filter(Boolean).join(' · ');
}
if (NAE && NAE.meses.length) {
  $('ctrl').hidden = false;
  $('mes-lista').innerHTML = (NAE.meses.length > 1 ? `<label class="mes-tds"><input type="checkbox" value="" checked> Todos <small>${rotMes1(NAE.meses[0])} a ${rotMes1(NAE.meses[NAE.meses.length - 1])}</small></label>` : '') +
    NAE.meses.map(m => `<label><input type="checkbox" value="${m}"${NAE.meses.length > 1 ? '' : ' checked'}> ${rotMes1(m)}</label>`).join('');
  $('mes-lista').append(document.querySelector('label[for="ind"]'));   // "Contar individuais" fica na lista, embaixo dos meses
  document.querySelector('label[for="ind"]').classList.add('mes-ind');
  $('mes').querySelector('.mes-txt').textContent = rotBotao();
}
const filtra = l => (l || []).filter(o => noPeriodo(o.mes) && (o.col || $('ind').checked));
const doMes = (N = NAE) => N ? filtra(N.oc) : [];        // NAE deste alimentador (Crítica): o total do alimentador
const doExt = (N = NAE) => N ? filtra(N.ext) : [];       // NAE de outro alimentador cujo ativo hoje está num trecho daqui
const doTrecho = (N = NAE) => [...doMes(N), ...doExt(N)];   // bloco do trecho: soma a NAE de todos os ativos do trecho
function contagem(N = NAE) { const c = {}; doTrecho(N).forEach(o => { if (o.trecho) c[o.trecho] = (c[o.trecho] || 0) + 1; }); return c; }
function chiTrecho() { const c = {}; doTrecho().forEach(o => { if (o.trecho) c[o.trecho] = (c[o.trecho] || 0) + chiOc(o); }); return c; }
const raizAl = location.pathname.includes('/alimentadores/') ? '../' : null;   // no site: link para o outro alimentador
function listaOc(os, comTrecho) {
  return `<ul class="oc">${os.map(o => `<li class="${o.col ? 'col' : ''}"><span class="q">${comTrecho ? `<b>${esc(o.trecho)}</b> · ` : ''}${esc(o.dia)} · ${!o.col ? '1 consumidor · trafo ' + esc(o.ativo) : esc(ABR[o.abr] || o.abr) + ' ' + esc(o.prob || o.ativo) + (o.prob && o.prob !== o.ativo ? ' · trafo ' + esc(o.ativo) : '')}</span><br>` +
    `${esc(o.sub || o.causa)}${o.prog ? ' · <b>programada</b>' : ''} · ${o.cons} cons. · ${o.dur} min` +
    (o.lonlat && map ? ` · <button type="button" class="ir" data-ll="${o.lonlat[1]},${o.lonlat[0]}" data-at="${esc(o.ativo)}">ver no mapa</button>` : '') +
    // DJ e religador: o ativo é a proteção que abriu, não o ponto do defeito (regra aprovada: marca, não tira da conta)
    (o.abr === 'DJ' ? '<br><b>atuou o disjuntor</b>: o defeito está em algum ponto depois dele' : o.abr === 'RL' ? '<br><b>atuou o religador</b>: o defeito está em algum ponto depois dele' : '') +
    (o.de ? `<br><b>registrada no ${raizAl ? `<a href="${raizAl}${encodeURIComponent(o.de)}/">${esc(o.de)}</a>` : esc(o.de)}</b> (a Crítica conta lá; o ativo hoje fica aqui)` : '') +
    (o.hoje ? `<br>ativo hoje no ${raizAl && o.hoje[1] ? `<a href="${raizAl}${encodeURIComponent(o.hoje[0])}/?t=${encodeURIComponent(o.hoje[1])}">${esc(o.hoje[0])} · ${esc(o.hoje[1])}</a>` : esc(o.hoje[0]) + (o.hoje[1] ? ' · ' + esc(o.hoje[1]) : '')}${o.hoje[1] ? ' (conta também lá)' : ''}` : '') +
    `</li>`).join('')}</ul>`;
}
// (cx: o alimentador do trecho; um selecionado sem nenhum dos meses escolhidos diz que eles estão fora do período dele)
function blocoNae(nome, l, cx = EU) {
  const os = doTrecho(cx.NAE).filter(o => (l || [nome]).includes(o.trecho)), col = os.filter(o => o.col).length, ext = os.filter(o => o.de).length;
  const ind = $('ind').checked ? ` · ${os.length - col} individua${os.length - col === 1 ? 'l' : 'is'}` : '';
  const tip = tiposOc(os);
  return `<dt class="nae">${cx.ROT_NAE}</dt><dd class="nae"><b>${os.length}</b> · ${periodo(cx.NAE) || (cx === EU ? '' : 'fora do período da Crítica deste alimentador')} (${col} coletiva${col === 1 ? '' : 's'}${ind}${ext ? ` · ${ext} registrada${ext === 1 ? '' : 's'} em outro alimentador` : ''})` +
    `${tip ? `<br><small>${tip}${os.length ? ` · ${chiTxt(chi(os), chiEst(os))}` : ''}</small>` : ''}${os.length ? listaOc(os, !!l) : ''}</dd>`;
}
function atualizaNae() {
  desenhaLista($('busca').value);
  multi.length ? detalheVarios(multi) : sel ? detalhe(TR[sel]) : resumo();
  marcaNaeVis();
  refazRotulos();
  avisaNae();
}
// aviso de que a NAE mudou (meses, "Contar individuais", botão NAE): os selecionados (assets/selecionados.js) refazem a deles
const avisaNae = () => document.dispatchEvent(new Event('al:nae'));
// marcadores de NAE dos trechos escolhidos que estão à vista: com a classe escondida (T1 T2 T3) a seleção fica, sem eles
// no mapa (como em mostraClasses)
function marcaNaeVis() {
  const v = (multi.length ? multi : sel ? [sel] : []).filter(n => visivel[classeDe(n)]);
  marcaNae(v.length ? v : null);
}
// rótulo do trecho: o nome, a NAE (bolinha vermelha) e o que outra camada põe ao lado (window.__rotuloExtra(nome): HTML ou
// ''; a Queimadas, assets/focos.js, põe a bolinha laranja com os focos). Com algo a mais o rótulo fica por cima dos rótulos
// das chaves (zIndexOffset acima dos 500 do DJ e do religador e dos 950 da NAE no ativo); o T3 aparece também de longe
// quando o HTML a mais pede (data-longe: os trechos com mais focos), como o de NAE
const extraRot = n => (window.__rotuloExtra ? window.__rotuloExtra(n) || '' : '');
// (data-z no HTML a mais: quanto ele sobe entre os rótulos com algo a mais; a Queimadas põe os de mais focos por cima)
const zRot = (t, x) => x ? 960 + Math.min(1000, +((/data-z="(\d+)"/.exec(x) || [])[1] || 0)) : t.tipo === 'fusivel' ? 0 : 400;
// NAE no mapa (botão NAE, o 1º do Menu Camadas e da fileira do alto; só no site): desligado, o mapa mostra a rede como ela
// é: somem os rótulos dos trechos (o nome e a bolinha vermelha: CSS #map.sem-nae), os T3 que aparecem de longe só por
// terem NAE e os marcadores de NAE nos ativos (marcaNae). Ficam as linhas, os equipamentos e o rótulo do trecho escolhido
// (sem a bolinha), e a Queimadas segue pondo os dela; o painel não muda. Começa desligado e lembra a escolha (localStorage);
// fora do site (sem o Menu) fica ligado, como sempre foi
const NAE_SITE = document.documentElement.classList.contains('al-site');
let naeMapa = !NAE_SITE || (() => { try { return localStorage.getItem('nae-mapa') === '1'; } catch (e) { return false; } })();
const contaMapa = () => naeMapa ? contagem() : {};       // a NAE dos rótulos do mapa: nenhuma com o botão desligado
// rótulo fixo: com o NAE desligado, o nome dos trechos escolhidos no modo Limpeza de faixa aparece (sem a bolinha), como o
// do trecho escolhido do jeito normal (modo-faixa-rascunho.js define window.__rotuloFixo e chama window.__refazRotulos);
// com o NAE ligado nada muda
const rotFixo = n => !naeMapa && !!(window.__rotuloFixo && window.__rotuloFixo(n));
$('map').classList.toggle('sem-nae', !naeMapa);
let btNae = null;
function ligaNae(on) {
  naeMapa = on;
  try { localStorage.setItem('nae-mapa', on ? '1' : '0'); } catch (e) { /* sem localStorage: vale só nesta página */ }
  $('map').classList.toggle('sem-nae', !on);
  if (btNae) btNae.setAttribute('aria-pressed', String(on));
  marcaNaeVis();
  refazRotulos();
  avisaNae();
}
// extras.js chama ao montar o Menu, antes de as outras camadas (Faixa, Inspeção…) porem os seus botões
window.__naeBotao = l2 => {
  if (btNae || !map || !l2) return;
  const c = document.createElement('div');
  c.className = 'ctl-card';
  c.innerHTML = `<button type="button" class="ctl-nae" aria-pressed="${naeMapa}" title="Mostrar ou esconder os rótulos dos trechos e a NAE no mapa">NAE</button>`;
  l2.prepend(c);
  btNae = c.firstChild;
  btNae.addEventListener('click', () => ligaNae(!naeMapa));
};
// sem o botão (extras.js antigo ainda no cache do navegador): a NAE fica ligada, como antes
if (NAE_SITE) AL.dom.then(() => { if (!btNae && !naeMapa && map) { naeMapa = true; $('map').classList.remove('sem-nae'); refazRotulos(); avisaNae(); } });
// a camada que mudou o que põe nos rótulos chama window.__refazRotulos(): o conteúdo, a ordem e os T3 que aparecem
function refazRotulos() {
  const c = contaMapa();
  Object.entries(rotulos).forEach(([n, m]) => {
    const el = m.getElement(), x = extraRot(n);
    if (el) { el.firstChild.innerHTML = esc(n) + (c[n] ? `<span class="n">${c[n]}</span>` : '') + x; el.firstChild.classList.toggle('oc', !!c[n]); el.firstChild.classList.toggle('fo', !!x); el.firstChild.classList.toggle('fo-l', x.includes('data-longe')); el.firstChild.classList.toggle('fixo', rotFixo(n)); }
    if (TR[n]) m.setZIndexOffset(zRot(TR[n], x));
  });
  rotulosT3();
}
window.__refazRotulos = refazRotulos;
$('ind').addEventListener('change', atualizaNae);
// lista dos meses: marcar "Todos" volta a todos; marcar um mês a partir de todos fica só ele; todos marcados um a um = todos
function marcaMeses() {
  $('mes-lista').querySelectorAll('input:not(#ind)').forEach(i => { i.checked = i.value ? mesSel.has(i.value) || NAE.meses.length === 1 : !mesSel.size; });
  $('mes').querySelector('.mes-txt').textContent = rotBotao();
}
$('mes-lista').addEventListener('change', e => {
  if (e.target.id === 'ind') return;                     // "Contar individuais" tem o próprio aviso
  const v = e.target.value;
  if (!v) mesSel.clear(); else if (e.target.checked) mesSel.add(v); else mesSel.delete(v);
  if (mesSel.size === NAE.meses.length) mesSel.clear();
  marcaMeses();
  atualizaNae();
});
// abre e fecha: botão, Esc (só a lista, antes do Esc da tela cheia), clique fora ou Tab para fora; ↑ ↓ Home End andam na lista
const abreMes = (sim, foco) => {
  $('mes-lista').hidden = !sim;
  $('mes').setAttribute('aria-expanded', String(sim));
  if (sim && foco) ($('mes-lista').querySelector('input:checked') || $('mes-lista').querySelector('input')).focus();
};
$('mes').addEventListener('click', () => abreMes($('mes-lista').hidden, true));
$('mes').addEventListener('keydown', e => { if (e.key === 'ArrowDown' && $('mes-lista').hidden) { e.preventDefault(); abreMes(true, true); } });
$('mes-lista').addEventListener('keydown', e => {
  const is = [...$('mes-lista').querySelectorAll('input')], i = is.indexOf(e.target), passo = {ArrowDown: 1, ArrowUp: -1, Home: -Infinity, End: Infinity}[e.key];
  if (i < 0 || passo === undefined) return;
  e.preventDefault();
  is[Math.max(0, Math.min(is.length - 1, i + passo))].focus();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || $('mes-lista').hidden) return;
  e.stopPropagation();
  if ($('mes-lista').contains(document.activeElement)) $('mes').focus();
  abreMes(false);
}, true);
document.addEventListener('pointerdown', e => { if (!$('mes-lista').hidden && !$('mes').parentElement.contains(e.target)) abreMes(false); }, true);
$('mes').parentElement.addEventListener('focusout', e => { if (e.relatedTarget && !$('mes').parentElement.contains(e.relatedTarget)) abreMes(false); });

// lista
const GRUPOS = [['principal', 'T1'], ['ramal', 'T2 (T2-A, T2-B…, um por religador)'], ['fusivel', 'Depois de fusível']];
// ordem da lista: maior NAE primeiro (padrão), menor NAE primeiro, ou T1 › T2 › T3 (os grupos acima). Empate e sem NAE: a ordem
// dos trechos (T1, T2, T2-A…, T3-A…). Fica guardada no navegador.
let ordemLista = (() => { try { return localStorage.getItem('ordem-lista') || 'nae'; } catch (e) { return 'nae'; } })();
if (!['nae', 'nae-', 'chi', 'hier'].includes(ordemLista)) ordemLista = 'nae';
if (NAE && NAE.meses.length) {                           // sem NAE a lista fica sempre em T1 › T2 › T3 (sem o seletor)
  $('ord-lista').hidden = false;
  // CHI (consumidor·hora): um trafo de 1 cliente não pesa igual a um religador de 3.206
  if (!$('ordem').querySelector('option[value="chi"]')) $('ordem').querySelector('option[value="nae-"]').after(Object.assign(document.createElement('option'), {value: 'chi', textContent: 'Maior CHI'}));
  $('ordem').value = ordemLista;
  $('ordem').addEventListener('change', e => {
    ordemLista = e.target.value;
    try { localStorage.setItem('ordem-lista', ordemLista); } catch (x) { /* sem armazenamento */ }
    desenhaLista($('busca').value);
    $('lista').scrollTop = 0;
  });
}
function fimTxt(t) { return t.fim.join(' / '); }
let porNome = {}, marcadas = [];                         // linha de cada trecho; linhas escolhidas (aria-current)
const linha = n => porNome[n] || null;
let porPoste = null;                                       // poste → trechos dos vãos que chegam nele (busca na lista)
const doPoste = () => porPoste || (porPoste = D.vaos.reduce((m, v) => { [v[6], v[7]].forEach(p => { if (p) (m[String(p).toLowerCase()] = m[String(p).toLowerCase()] || new Set()).add(D.trechos[v[4]].nome); }); return m; }, {}));
// A lista sai inteira de uma vez (busca, ordem, meses do NAE). Só na carga ela entra aos poucos (aosPoucos): o começo já,
// o resto em pedaços no tempo livre (listaAosPoucos), com data-parcial="1" no #lista enquanto falta. Quem precisa dela
// inteira na hora (teclado na lista, filtro trocado, a lista do olho) chama listaInteira() (window.__listaInteira).
const LOTE_LISTA = 40;
let pendLista = null, selSemLinha = null;                  // pendLista: o que falta pôr {itens, html, i}; selSemLinha: trecho escolhido antes de a linha dele chegar
function desenhaLista(filtro, aosPoucos) {
  const q = (filtro || '').trim().toLowerCase();
  const casa = t => !q || [t.nome, t.inicio, t.inicio_poste, ...t.fim, ...t.passa].some(s => String(s).toLowerCase().includes(q))
    || (q.length >= 3 && (doPoste()[q] || new Set()).has(t.nome));
  const cnt = NAE ? contagem() : null;
  const ord = cnt ? ordemLista : 'hier', pos = new Map(D.trechos.map((t, i) => [t, i]));
  const pt = cnt ? periodo() : '', ch = ord === 'chi' ? chiTrecho() : null, chE = ch && chiEst(doTrecho()), per = cnt ? ` · NAE ${pt}` : '';
  const blocos = ord === 'hier' ? GRUPOS.map(([g, titulo]) => [titulo + per, D.trechos.filter(t => t.tipo === g && casa(t))])
    : ord === 'chi' ? [['Maior CHI primeiro' + per, D.trechos.filter(casa).sort((a, b) => (ch[b.nome] || 0) - (ch[a.nome] || 0) || pos.get(a) - pos.get(b))]]
    : [[(ord === 'nae' ? 'Maior NAE primeiro' : 'Menor NAE primeiro') + per, D.trechos.filter(casa).sort((a, b) =>
      ((cnt[b.nome] || 0) - (cnt[a.nome] || 0)) * (ord === 'nae' ? 1 : -1) || pos.get(a) - pos.get(b))]];
  // itens da lista na ordem: o título de cada grupo (texto pronto) e os trechos dele
  const itens = [];
  blocos.forEach(([titulo, ts]) => {
    if (!ts.length) return;
    itens.push(`<div class="grp" role="heading" aria-level="3">${titulo} · ${mil(ts.length)}</div>`);
    for (const t of ts) itens.push(t);
  });
  const html = t => typeof t === 'string' ? t :
    `<button type="button" class="row" tabindex="-1" data-t="${esc(t.nome)}" aria-current="${escolhido(t.nome)}"><i style="--c:${t.cor}"></i><b>${esc(t.nome)}</b>` +
    `<span title="${esc(t.inicio + ' → ' + fimTxt(t))}">${esc(t.inicio)} → ${esc(fimTxt(t).replace('fim de linha · poste ', 'fim '))}</span>${cnt ? `<strong class="nae ${cnt[t.nome] ? 'tem' : ''}" title="NAE ${esc(pt)}${ch ? ` · ${chiTxt(ch[t.nome] || 0, chE)}` : ''}">${cnt[t.nome] || 0}<span class="vh"> NAE</span></strong>` : ''}<em>${km(t.ext)}</em></button>`;
  listaFeita = true;
  const n = aosPoucos ? Math.min(itens.length, LOTE_LISTA) : itens.length;
  pendLista = n < itens.length ? {itens, html, i: n} : null;
  if (pendLista) $('lista').dataset.parcial = '1'; else delete $('lista').dataset.parcial;
  let h = '';
  for (let i = 0; i < n; i++) h += html(itens[i]);
  $('lista').innerHTML = h || '<p class="lede">Nada encontrado.</p>';
  porNome = {}; marcadas = [];
  linhasNovas(null);
  tabLista();
  if (!pendLista) listaPronta();
}
// linhas que acabaram de entrar na lista (depois do elemento `de`, ou todas): o índice por trecho e as escolhidas
function linhasNovas(de) {
  for (let b = de ? de.nextElementSibling : $('lista').firstElementChild; b; b = b.nextElementSibling) {
    if (!b.classList.contains('row')) continue;
    porNome[b.dataset.t] = b;
    if (b.getAttribute('aria-current') === 'true') marcadas.push(b);
  }
}
// põe mais n itens da lista em montagem; devolve false quando ela ficou inteira
function maisLista(n) {
  const p = pendLista, l = $('lista');
  if (!p) return false;
  const ult = l.lastElementChild, ate = Math.min(p.itens.length, p.i + n);
  let h = '';
  for (; p.i < ate; p.i++) h += p.html(p.itens[p.i]);
  l.insertAdjacentHTML('beforeend', h);
  linhasNovas(ult);
  if (p.i < p.itens.length) return true;
  pendLista = null;
  delete l.dataset.parcial;
  if (!l.contains(document.activeElement)) tabLista();
  if (selSemLinha && escolhido(selSemLinha)) rolaNaLista(selSemLinha, areaVisivel(rolador()));   // a linha do trecho escolhido durante a carga chegou
  listaPronta();
  document.dispatchEvent(new Event('al:lista'));
  return false;
}
// 1ª montagem do painel, depois da rede (o painel só aparece no fim dela): o resumo e o começo da lista (com texto guardado
// no campo de busca, a lista filtrada inteira); o resto da lista entra no tempo livre. Quem escolheu um trecho ou buscou
// antes disso já tem o detalhe e a lista feitos: nada é refeito por cima
let listaFeita = false;
async function comeco(vez) {
  await vez();
  nf0(); nf2();                                           // o 1º formatador de números do navegador, numa fatia só dele
  await vez();
  if (!listaFeita) desenhaLista($('busca').value, !$('busca').value.trim());
  if (!sel && !multi.length) resumo();
}
function listaPronta() { selSemLinha = null; if (fimLista) { fimLista(); fimLista = null; marca('al:lista'); } }
function listaInteira() { if (pendLista) maisLista(Infinity); }
window.__listaInteira = listaInteira;
// o resto da lista, no tempo livre: um pedaço, a vez dos observadores da lista (selos da faixa, filtros) e, se a folga acabou, espera a próxima
async function listaAosPoucos() {
  let prazo = false;                                     // a última vez veio pelo prazo (sem folga): daí em diante uma fatia por quadro, como os outros passos
  while (pendLista) {
    if (prazo) await AL.cede(); else prazo = await AL.ociosoLista();
    while (maisLista(LOTE_LISTA)) { await null; if (AL.cheia()) break; }
  }
}
// rolar a lista (mouse, toque) perto do fim da parte já posta: põe mais já, para não haver fim falso enquanto o resto não chegou
$('lista').addEventListener('scroll', () => {
  const l = $('lista');
  if (pendLista && l.scrollTop + 3 * l.clientHeight >= l.scrollHeight) maisLista(2 * LOTE_LISTA);
}, {passive: true});
// escolher um trecho só troca o aria-current das linhas (não refaz as ~2.000 linhas): mais rápido e o foco do teclado fica onde está
function marcaLista() {
  marcadas.forEach(b => b.setAttribute('aria-current', 'false'));
  marcadas = (multi.length ? multi : sel ? [sel] : []).map(linha).filter(Boolean);
  marcadas.forEach(b => b.setAttribute('aria-current', 'true'));
  if (!$('lista').contains(document.activeElement)) tabLista();
}
// teclado: a lista é uma parada só do Tab (a linha escolhida ou a 1ª à vista); as setas andam de linha em linha
function tabLista(alvo) {
  const l = $('lista'), atual = l.querySelector('.row[tabindex="0"]');
  alvo = alvo || marcadas.find(b => !b.hidden) || (atual && !atual.hidden ? atual : null) || l.querySelector('.row:not([hidden])');
  if (atual && atual !== alvo) atual.tabIndex = -1;
  if (alvo) alvo.tabIndex = 0;
}
window.__tabLista = () => tabLista();                     // extras.js: depois de filtrar por classe ou município
$('lista').addEventListener('focusin', e => { const b = e.target.closest('.row'); if (b && b.tabIndex !== 0) tabLista(b); });
$('lista').addEventListener('keydown', e => {
  const b = e.target.closest('.row'), passo = {ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10, Home: -Infinity, End: Infinity}[e.key];
  if (!b || passo === undefined || e.altKey) return;
  e.preventDefault();
  listaInteira();                                        // ainda entrando (carga): Fim e PgDn contam com todas as linhas
  const vs = [...$('lista').querySelectorAll('.row:not([hidden])')], i = vs.indexOf(b);
  const n = vs[Math.max(0, Math.min(vs.length - 1, i + passo))] || vs[passo < 0 ? 0 : vs.length - 1];
  if (!n || n === b) return;
  tabLista(n);
  n.focus({preventScroll: true});
  n.scrollIntoView({block: 'nearest'});                  // rola só o necessário (o título fixo do grupo fica de fora: scroll-margin)
});
// quem rola: o painel (computador e gaveta da tela cheia rolam por dentro) ou, sem isso, a página
function rolador() {
  const p = document.querySelector('.panel');
  return p && getComputedStyle(p).overflowY !== 'visible' && p.scrollHeight > p.clientHeight ? p : null;
}
// parte da tela onde o painel aparece: o próprio painel, ou a página abaixo do mapa fixo no alto (celular)
function areaVisivel(r) {
  if (r) { const q = r.getBoundingClientRect(); return {top: q.top, bottom: q.bottom}; }
  const mb = document.querySelector('.mapbox'), alto = mb && matchMedia('(max-width:980px)').matches && !document.body.classList.contains('tela-cheia');
  return {top: alto ? Math.max(0, mb.getBoundingClientRect().bottom) : 0, bottom: innerHeight};
}
const suave = () => matchMedia('(prefers-reduced-motion:no-preference)').matches ? 'smooth' : 'auto';
function rolaPara(r, y) { (r || window).scrollTo({top: Math.max(0, y), behavior: suave()}); }
let daLista = false;                                      // escolha feita na própria lista: nada se mexe
$('lista').addEventListener('click', e => {
  const b = e.target.closest('.row');
  if (!b) return;
  const y = b.getBoundingClientRect().top;
  daLista = true;
  try { clique(b.dataset.t, e, true); } finally { daLista = false; }
  requestAnimationFrame(() => {                          // depois dos acréscimos (limpeza, NAE, caminho no cabeçalho), antes de pintar
    if (!b.isConnected) return;
    const r = rolador(), rola = d => { if (d) r ? (r.scrollTop += d) : window.scrollBy(0, d); };
    rola(b.getBoundingClientRect().top - y);             // a linha tocada fica no mesmo lugar da tela
    // o detalhe vem logo abaixo da lista: se o começo dele não aparece, sobe o necessário, sem tirar a linha tocada da vista
    const v = areaVisivel(r), d = $('det').getBoundingClientRect().top, falta = d + 120 - v.bottom, folga = b.getBoundingClientRect().top - v.top - 40;
    if (d < v.top) rolaPara(r, (r ? r.scrollTop : scrollY) + d - v.top - 8);   // no site o detalhe vem antes da lista (extras.js): ele vai para o alto
    else if (falta > 0 && folga > 0) rola(Math.min(falta, folga));
  });
});
// trecho escolhido fora da lista (mapa, busca, link, detalhe): a lista rola por dentro até a linha e o detalhe aparece
function rolaNaLista(nome, v) {
  const b = linha(nome), l = $('lista');
  if (b && !b.hidden) {                                  // parte da lista que aparece (no celular, a de cima pode estar sob o mapa)
    const r = b.getBoundingClientRect(), q = l.getBoundingClientRect(), c = {top: Math.max(q.top, v.top), bottom: Math.min(q.bottom, v.bottom)};
    if (c.bottom - c.top < 100) Object.assign(c, {top: q.top, bottom: q.bottom});
    const topo = (c.top === q.top ? 32 : 8);             // 32: título do grupo, fixo no alto da lista
    if (r.top < c.top + topo) l.scrollTop -= c.top + topo - r.top;
    else if (r.bottom > c.bottom - 8) l.scrollTop += r.bottom - c.bottom + 8;
  }
}
function naLista(nome) {
  const p = rolador(), v = areaVisivel(p);
  if (!linha(nome) && (pendLista || !listaFeita)) selSemLinha = nome;   // a linha ainda não entrou (carga): a lista rola até ela quando chegar
  rolaNaLista(nome, v);
  mostraDet(p, v);
}
// o detalhe à vista, sem mexer na lista (também o de um trecho de alimentador selecionado, que não está nela)
function mostraDet(p = rolador(), v = areaVisivel(p)) {
  if (document.activeElement === $('busca')) return;   // digitando na busca: o campo fica onde está
  const det = $('det').getBoundingClientRect().top;
  if (p) { if (det < v.top || det > v.top + (v.bottom - v.top) / 2) rolaPara(p, p.scrollTop + det - v.top - 8); }   // painel: o detalhe vai para o alto
  else if (det < v.top) rolaPara(null, scrollY + det - v.top - 8);   // página (celular): só desce o detalhe que ficou escondido sob o mapa
}

// UCs ligadas por trecho (planilha UC por trafo): dados/ucs/<AL>.json, lido uma vez; sem o arquivo a linha "Clientes" não aparece
const UCS_P = fetch(`../../dados/ucs/${encodeURIComponent((D.meta || {}).al || '')}.json`).then(r => r.ok ? r.json() : {}).catch(() => ({}));
// (o trecho do detalhe é conferido pelo nome e pelo alimentador: T1 e T2 existem em todos, e as UCs deste, ainda chegando,
// não podem cair no T1 de um selecionado)
function poeUc(u, nomes, cx = EU) {
  const dd = $('uc-dd'), dt = $('uc-dt');
  if (!dd || dd.dataset.t !== nomes.join('|') || (dd.dataset.al || '') !== (cx === EU ? '' : cx.al) || !Object.keys(u).length) return;      // outro trecho já foi aberto, ou sem arquivo
  const e = nomes.map(n => u[n] || [0, 0, 0]), dir = e.reduce((s, x) => s + x[0], 0), tr = e.reduce((s, x) => s + x[2], 0);
  const fmt = n => n.toLocaleString('pt-BR'), trafos = ` · ${tr} trafo${tr === 1 ? '' : 's'}`;
  dd.innerHTML = nomes.length === 1
    ? `<b>${fmt(e[0][1])}</b> UC${e[0][1] === 1 ? '' : 's'} ligada${e[0][1] === 1 ? '' : 's'} (trecho e a jusante)${e[0][1] !== dir ? ` · ${fmt(dir)} nos trafos do próprio trecho` : ''}${trafos}`
    : `<b>${fmt(dir)}</b> UC${dir === 1 ? '' : 's'} ligada${dir === 1 ? '' : 's'} nos trafos dos trechos${trafos}`;
  dt.style.display = dd.style.display = '';
}
const daAl = cx => cx === EU ? '' : ` data-al="${esc(cx.al)}"`;   // outro alimentador: o código dele nos chips e nas UCs
const LINHA_UC = (nomes, cx = EU) => `<dt id="uc-dt" style="display:none">Clientes</dt><dd id="uc-dd" style="display:none" data-t="${nomes.map(esc).join('|')}"${daAl(cx)}></dd>`;
// detalhe de um selecionado: o #det leva o código (data-al: as camadas deste não põem as seções delas nele) e, logo
// depois do título, de que alimentador é o trecho e o link da página dele
function detDe(cx, nomes) {
  if (cx === EU) { delete $('det').dataset.al; return ''; }
  $('det').dataset.al = cx.al;
  return `<p class="det-al">No alimentador <b class="mono">${esc(cx.al)}</b> · <a href="${esc(cx.abre(nomes))}">Abrir</a></p>`;
}
// detalhe
function detalhe(t, vao, cx = EU) {
  const chip = n => `<button class="chip" data-t="${esc(n)}"${daAl(cx)}>${esc(n)}</button>`;
  const chips = l => l.length ? `<div class="chips">${l.slice(0, 8).map(chip).join('')}` +   // muitos: os 8 primeiros e o resto ao pedir
    (l.length > 8 ? `<details class="mais"><summary>mais ${l.length - 8}</summary><div class="chips">${l.slice(8).map(chip).join('')}</div></details>` : '') + '</div>' : '—';
  const tipoTxt = {principal: 'T1', ramal: 'T2', fusivel: `depois de fusível · T${t.zona}`}[t.tipo];
  $('det').innerHTML = `<h2 tabindex="-1"><i style="--c:${t.cor}"></i>${esc(t.nome)} <small>${tipoTxt}</small></h2>${detDe(cx, [t.nome])}${FECHA}<dl>
    <dt>Início</dt><dd><span class="mono">${esc(t.inicio)}</span> · ${TIPO[t.inicio_tipo] || t.inicio_tipo} · poste ${esc(t.inicio_poste)}</dd>
    ${t.passa.length ? `<dt>Passa por</dt><dd class="mono">${t.passa.map(esc).join(', ')}</dd>` : ''}
    <dt>Fim</dt><dd class="mono">${t.fim.map(esc).join('<br>')}</dd>
    <dt>Extensão</dt><dd>${km(t.ext)} · ${nv(t.qtd)}</dd>
    ${t.fase ? `<dt>Fases</dt><dd>${esc(t.fase)}${t.fases && Object.keys(t.fases).length > 1 ? ' · ' + Object.entries(t.fases).map(([f, m]) => `${esc(f)} ${km(m)}`).join(' · ') : ''}</dd>` : ''}
    <dt>Vem de</dt><dd>${t.pai ? chips([t.pai]) : '—'}</dd>
    <dt>Derivações</dt><dd>${chips(t.derivacoes)}</dd>
    ${LINHA_UC([t.nome], cx)}
    ${cx.NAE ? blocoNae(t.nome, null, cx) : ''}
    ${vao ? `<dt>Vão</dt><dd class="mono">${esc(vao[5])} · poste ${esc(vao[6])} → ${esc(vao[7])} · ${Math.round(vao[8])} m</dd>` : ''}
  </dl>`;
  cx.ucs().then(u => poeUc(u, [t.nome], cx));
}
// vários trechos (Ctrl ou ⌘ + clique): soma de extensão e NAE, e cada trecho com o seu
function detalheVarios(l, cx = EU) {
  const ts = l.map(n => cx.TR[n]), ext = ts.reduce((s, t) => s + t.ext, 0), c = cx.NAE ? contagem(cx.NAE) : {};
  const nae = cx.NAE ? blocoNae(null, l, cx) : '';
  $('det').innerHTML = `<h2 tabindex="-1">${l.length} trechos <small>${km(ext)} · ${nv(ts.reduce((s, t) => s + t.qtd, 0))}</small></h2>${detDe(cx, l)}${FECHA}
    <div class="varios">${ts.map(t => `<div><button class="chip" data-t="${esc(t.nome)}"${daAl(cx)}>${esc(t.nome)}</button><span>${km(t.ext)}</span>` +
      `${cx.NAE ? `<span><b>${c[t.nome] || 0}</b> NAE</span>` : ''}<small class="mono">${esc(t.inicio)} → ${esc(fimTxt(t).replace('fim de linha · poste ', 'fim '))}</small></div>`).join('')}</div><dl>
    <dt>Extensão</dt><dd>${km(ext)} somados</dd>
    ${LINHA_UC(l, cx)}
    ${nae}
  </dl><p class="lede so-mouse">Ctrl (⌘ no Mac) + clique põe ou tira um trecho. Clique sem Ctrl volta a um trecho só.</p>`;
  cx.ucs().then(u => poeUc(u, l, cx));
}
// total da Crítica no alimentador e por que a soma dos trechos dá outro número (sem trecho; de outro alimentador)
function resumoNae() {
  const oc = doMes(), sem = oc.filter(o => !o.trecho).length, ext = doExt().filter(o => o.trecho).length, tip = tiposOc(oc);
  const soma = oc.length - sem + ext;
  return `<dt class="nae">${ROT_NAE}</dt><dd class="nae"><b>${mil(oc.length)}</b> no alimentador · ${periodo()}` +
    (tip ? `<br><small>${tip}</small>` : '') +
    (sem || ext ? `<br><small>${sem ? `${sem} sem trecho (ativo fora do mapa deste alimentador)` : ''}${sem && ext ? ' · ' : ''}${ext ? `+${ext} de outro alimentador em trechos daqui` : ''}: os trechos somam ${mil(soma)}</small>` : '') + '</dd>';
}
function resumo() {
  const total = ((D.meta || {}).resumo || {}).extensao_m ?? D.trechos.reduce((s, t) => s + t.ext, 0);
  // trechos e extensão por classe (T1, T2, T3): as informações gerais do alimentador, no alto do painel, sem título (o Total já dá)
  const cl = {T1: [0, 0], T2: [0, 0], T3: [0, 0]};
  D.trechos.forEach(t => { const c = cl[t.nome.split('-')[0]]; if (c) { c[0]++; c[1] += t.ext; } });
  const tabela = `<table class="resumo-classe"><tr><th>Classe</th><th>Trechos</th><th>Extensão</th></tr>` +
    Object.entries(cl).map(([k, [n, m]]) => `<tr><td>${k}</td><td>${mil(n)}</td><td>${km(m)}</td></tr>`).join('') +
    `<tr><th>Total</th><th>${mil(D.trechos.length)}</th><th>${km(total)}</th></tr></table>`;
  delete $('det').dataset.al;
  $('det').innerHTML = `${tabela}
  ${NAE ? `<dl>${resumoNae()}</dl>` : ''}`;
}
$('det').addEventListener('click', e => {
  const v = e.target.closest('[data-ll]');               // ocorrência da lista: vai até o ativo no mapa
  if (v) {
    if (!map) return;
    const ll = v.dataset.ll.split(',').map(Number);
    map.setView(ll, 18);
    // NAE desligado: sem o marcador vermelho no ativo, um pino (o do ativo da busca) mostra qual é; sai na próxima escolha,
    // ao tocar no mapa e ao ligar o NAE (marcaNae)
    if (pinoAt) { pinoAt.remove(); pinoAt = null; }        // um pino só: o novo "ver no mapa" tira o anterior
    if (!naeMapa) pinoAt = L.marker(ll, {interactive: false, keyboard: false, zIndexOffset: 1000,
      icon: L.divIcon({className: '', iconSize: null, html: `<div class="ie ativo"><em>ATIVO</em>${esc(v.dataset.at || '')}</div>`})}).addTo(map);
    const r = $('map').getBoundingClientRect();          // o mapa fica fixo no alto: só rola se ele estiver fora da tela
    if (r.bottom < 0 || r.top > innerHeight) $('map').scrollIntoView({block: 'nearest'});
    return;
  }
  const b = e.target.closest('.chip, #todos'); if (!b) return;
  const tinhaFoco = b.contains(document.activeElement);  // o detalhe é refeito: o foco do teclado volta ao título dele (não cai no body)
  // chip de um trecho de alimentador selecionado (data-al): escolhe nele (assets/selecionados.js)
  b.id === 'todos' ? limpar() : b.dataset.al && window.__alSel ? window.__alSel.clique(b.dataset.al, b.dataset.t, e, true) : clique(b.dataset.t, e, true);
  if (tinhaFoco && !$('det').contains(document.activeElement)) $('det').querySelector('h2')?.focus({preventScroll: true});
});

// mapa
let map = null, sel = null, multi = [];                // multi: trechos escolhidos com Ctrl (ou ⌘) + clique
const escolhido = n => n === sel || multi.includes(n);
const linhas = {}, rotulos = {};
window.__linhas = linhas;                                 // nome do trecho → [linha no mapa, vãos]; na carga as linhas entram aos poucos (__al.rede)
// v = [lat1, lon1, lat2, lon2, idx_trecho, id, poste_ini, poste_fim, ext]
const vaosDe = {};                                        // vãos de cada trecho, pelo índice dele (prontos antes das linhas)
D.vaos.forEach(v => (vaosDe[v[4]] = vaosDe[v[4]] || []).push(v));
const vaosDoNome = n => vaosDe[D.trechos.indexOf(TR[n])] || [];
let realcados = null;                                     // trechos em destaque no mapa (os outros ficam apagados); null: nenhum
const visivel = {T1: true, T2: true, T3: true};
window.__visivel = visivel;                               // a camada de limpeza segue os botões T1/T2/T3
let fusMarcas = null;                                     // pontos dos fusíveis: somem junto com o T3          // botões T1 / T2 / T3 sobre o mapa
// de longe (abaixo do zoom 12) o mapa mostra só as linhas: sem DJ, religador e pontos dos fusíveis; o número operativo do
// DJ e do religador só do zoom 15 em diante (antes, a caixinha do tipo)
const Z_EQUIP = 12, Z_NUM = 15, Z_EQ_LONGE = 7;   // Z_EQ_LONGE: abaixo dele (visão do estado inteiro) o aberto fica sem DJ, religador e fusíveis
// (Z_EQUIP segue valendo para os selecionados: abaixo dele, só a etiqueta do código no DJ)
let fusLonge = false;                                     // abaixo do Z_EQ_LONGE: os pontos dos fusíveis não são pintados nem tocados
const classeDe = nome => nome.split('-')[0];          // nome do trecho → [polyline com todos os vãos, vãos]; rótulos no mapa
let halo = null, marcas = null;
// papel de uma chave nos trechos dos dados d ("início do T2-A · fim do T2"): os índices (sem eles cada um dos ~2.000
// fusíveis varria todos os trechos) são montados no 1º balão
function papelDe(d) {
  let fimDe = null, iniDe = null;
  return nome => {
    if (!fimDe) {
      fimDe = {}; iniDe = {};
      d.trechos.forEach(t => { t.fim.forEach(f => (fimDe[f] = fimDe[f] || []).push(t.nome)); (iniDe[t.inicio] = iniDe[t.inicio] || []).push(t.nome); });
    }
    return [...(iniDe[nome] || []).map(n => 'início do ' + n), ...(fimDe[nome] || []).map(n => 'fim do ' + n)].join(' · ');
  };
}
const papel = papelDe(D);
// ---------- Google Maps e Google Earth (pedido do usuário: "ativo e qualquer ponto") ----------
// O balão de cada ativo (DJ, religador e fusível aqui; chaves 88/faca: chaves.js; transformador, outros equipamentos e
// poste: ativos-zoom.js; o pino da busca do olho: lupa-painel.js; equipamentos dos vizinhos: vizinhos.js) leva os botões
// "Maps" e "Earth" com a coordenada dele; o clique direito (ou o toque longo no celular) em qualquer ponto do mapa abre o
// menu do ponto (no fim da montagem do mapa). Os endereços: o do Maps (api=1) abre o app no celular; o do Earth é a busca
// pela coordenada: centraliza e marca o ponto (o "@lat,lon,…" volta ao globo inteiro quando o Earth abre do zero:
// conferido no Earth na web, nov/2026). Nova aba, 6 casas decimais (~10 cm).
const GEO = window.__geo = (() => {
  const c6 = x => (+x).toFixed(6);
  const maps = (la, lo) => `https://www.google.com/maps/search/?api=1&query=${c6(la)},${c6(lo)}`;
  const earth = (la, lo) => `https://earth.google.com/web/search/${c6(la)},${c6(lo)}`;
  const FORA = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5v4H2.5V4h4"/></svg>';
  const botoes = (la, lo) => `<span class="geo-bts"><a class="geo-b" href="${maps(la, lo)}" target="_blank" rel="noopener" title="Abrir no Google Maps" aria-label="Abrir no Google Maps">${FORA}Maps</a>` +
    `<a class="geo-b" href="${earth(la, lo)}" target="_blank" rel="noopener" title="Abrir no Google Earth" aria-label="Abrir no Google Earth">${FORA}Earth</a></span>`;
  // UTM no SIRGAS 2000 (elipsoide GRS80; para o mapa, o mesmo que o WGS 84): fuso, letra da faixa de latitude, E e N em
  // metros. Série de Krüger até a 3ª ordem (erro de milímetros dentro do fuso), N com 10.000 km no hemisfério sul
  function utm(la, lo) {
    const a = 6378137, f = 1 / 298.257222101, e2 = f * (2 - f), ep2 = e2 / (1 - e2), k0 = 0.9996;
    const fuso = Math.min(60, Math.floor((lo + 180) / 6) + 1), l0 = ((fuso - 1) * 6 - 177) * Math.PI / 180;
    const p = la * Math.PI / 180, sp = Math.sin(p), cp = Math.cos(p), tp = Math.tan(p);
    const N = a / Math.sqrt(1 - e2 * sp * sp), T = tp * tp, C = ep2 * cp * cp, A = cp * (lo * Math.PI / 180 - l0);
    const M = a * ((1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256) * p - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * p) +
      (15 * e2 * e2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * p) - (35 * e2 ** 3 / 3072) * Math.sin(6 * p));
    const E = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
    const Y = k0 * (M + N * tp * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
    const faixa = 'CDEFGHJKLMNPQRSTUVWX'[Math.max(0, Math.min(19, Math.floor((la + 80) / 8)))];
    return {fuso, faixa, e: Math.round(E), n: Math.round(la < 0 ? Y + 10000000 : Y), txt: `${fuso}${faixa} ${Math.round(E)} E ${Math.round(la < 0 ? Y + 10000000 : Y)} N`};
  }
  // balão do ativo (camada ou ponto ll): o código, o que ele é e os botões. Fecha a dica do mouse dele (o balão diz o mesmo)
  function balao(alvo, cod, sub) {
    if (!map) return null;
    const ll = alvo instanceof L.Layer ? alvo.getLatLng() : L.latLng(alvo);
    if (alvo instanceof L.Layer && alvo.closeTooltip) alvo.closeTooltip();
    return L.popup({className: 'geo-popup', maxWidth: 280, autoPanPadding: [20, 20], autoPanPaddingTopLeft: window.__folgaBalao ? window.__folgaBalao() : [20, 20]})
      .setLatLng(ll).setContent(`<div class="geo-pop"><b>${esc(cod)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}${botoes(ll.lat, ll.lng)}</div>`).openOn(map);
  }
  return {c6, maps, earth, botoes, utm, balao};
})();
// DJ ou religador a no mapa: a caixinha do tipo e o número operativo (pf: o papel nos trechos do alimentador dele; o: mais
// opções do marcador). O clique (ou toque) abre o balão com Maps e Earth; o número (.num-at, prioridade 0 o DJ e 1 o
// religador) procura lugar livre em volta da caixinha ([data-ns], o símbolo) no arranjo dos números (fim da montagem)
const principal = (a, pf = papel, o) => L.marker([a.lat, a.lon], Object.assign({icon: L.divIcon({className: 'al-at', iconSize: null, html: `<div class="at"><b data-ns>${a.t === 'DJ' ? 'DJ' : '79'}</b><span class="num-at" data-np="${a.t === 'DJ' ? 0 : 1}">${esc(a.nome)}</span></div>`}), zIndexOffset: 500}, o))
  .bindTooltip(`${esc(a.nome)} · ${esc(TIPO[a.t])} · poste ${esc(a.poste)}${pf(a.nome) ? ' · ' + esc(pf(a.nome)) : ''}`, {direction: 'top'})
  .on('click', e => { L.DomEvent.stopPropagation(e); GEO.balao(e.target, a.nome, `${TIPO[a.t]} · poste ${a.poste}${pf(a.nome) ? ' · ' + pf(a.nome) : ''}`); });
// clique com Ctrl (⌘ no Mac): põe ou tira o trecho da seleção; sem Ctrl: um trecho só
const comCtrl = e => !!e && (e.ctrlKey || e.metaKey);
function clique(nome, e, enquadrar, vao) {
  if (!comCtrl(e)) return selecionar(nome, enquadrar, vao);
  const l = multi.length ? multi.slice() : sel ? [sel] : [], i = l.indexOf(nome);
  i < 0 ? l.push(nome) : l.splice(i, 1);
  if (l.length > 1) selecionarVarios(l, nome);
  else if (l.length) selecionar(l[0], false);
  else limpar();
}
function selecionar(nome, enquadrar, vao) {
  sel = nome; multi = [];
  detalhe(TR[nome], vao);
  marcaLista();
  if (!daLista) naLista(nome);
  realca([nome], enquadrar);
}
function selecionarVarios(l, ultimo) {
  sel = null; multi = l;
  detalheVarios(l);
  marcaLista();
  if (!daLista) naLista(ultimo);
  realca(l, false);
}
// destaca no mapa os trechos escolhidos: os outros ficam apagados; pinos de início e fim (com vários, só o início de cada um)
function realca(nomes, enquadrar) {
  if (!map) return;
  realcados = nomes;                                      // as linhas que ainda vão entrar (carga) já nascem assim
  Object.entries(linhas).forEach(([n, [l]]) => l.setStyle({opacity: nomes.includes(n) ? 1 : 0.28}));
  if (halo) halo.remove();
  const meus = n => cadeias(vaosDoNome(n));
  halo = L.layerGroup(nomes.map(n => Object.assign(L.polyline(meus(n), {color: '#fff', weight: TR[n].peso + 6, opacity: .9, interactive: false}), {_alHalo: true}))).addTo(map);
  halo.eachLayer(l => l.bringToBack());
  Object.entries(rotulos).forEach(([n, m]) => m.getElement() && m.getElement().firstChild.classList.toggle('sel', nomes.includes(n)));
  if (marcas) marcas.remove();
  marcas = pinosDe(nomes).addTo(map);
  if (enquadrar) map.fitBounds(L.latLngBounds(nomes.flatMap(n => meus(n).flat())).pad(0.12), {maxZoom: 17, paddingTopLeft: [24, 72], paddingBottomRight: [24, 64]});   // folga para os controles sobre o mapa
  marcaNae(nomes);
  rotulosT3();
  avisaSel(nomes);                                         // contorno da seleção por cima da camada de limpeza
}
// Aviso da seleção às camadas: window.__onSel, que limpeza.js e inspecao.js definem quando carregam. Com um trecho já
// escolhido quando um deles chega (escolha feita durante a carga), o aviso é repetido assim que o script termina; sem isso
// o contorno da seleção na camada só aparecia na escolha seguinte
let ganchoSel = window.__onSel || null;
try {
  Object.defineProperty(window, '__onSel', {configurable: true, enumerable: true, get: () => ganchoSel,
    set: f => {
      ganchoSel = f;
      if (realcados && typeof f === 'function') Promise.resolve().then(() => { if (ganchoSel === f && realcados) f(realcados); });
    }});
} catch (e) { /* fica como propriedade comum */ }
// O evento 'al:sel' no document (detail: os nomes, ou null) diz o mesmo aos alimentadores selecionados (assets/selecionados.js):
// um trecho escolhido aqui, ou nenhum, solta o de lá
function avisaSel(nomes) { const f = window.__onSel; if (f) f(nomes); document.dispatchEvent(new CustomEvent('al:sel', {detail: nomes})); }
// pinos de início e fim dos trechos nomes (dos trechos T; com vários, só o início de cada um); o: mais opções dos marcadores
function pinosDe(nomes, T = TR, o) {
  const pino = (pt, cls, tag, txt) => L.marker(pt, Object.assign({interactive: false, zIndexOffset: 900, icon: L.divIcon({className: '', iconSize: null, html: `<div class="ie ${cls}"><em>${tag}</em>${esc(txt)}</div>`})}, o));
  const t = T[nomes[0]];
  return L.layerGroup(nomes.length > 1 ? nomes.map(n => pino([T[n].inicio_lat, T[n].inicio_lon], 'ini', esc(n), T[n].inicio))
    : [pino([t.inicio_lat, t.inicio_lon], 'ini', 'INÍCIO', t.inicio),
      ...t.fim.map((f, i) => pino(t.fim_pts[i], 'fim', 'FIM', f.replace('fim de linha · poste ', 'poste ') + (f.startsWith('fim de linha') ? ' (fim de linha)' : '')))]);
}
// ativos com NAE nos trechos escolhidos: um marcador vermelho por ativo, com quantas NAE teve (mês e filtro da tela)
let naeMarcas = null, pinoAt = null;                   // pinoAt: o ativo do "ver no mapa" com o NAE desligado
function marcaNae(nomes) {
  if (naeMarcas) { naeMarcas.remove(); naeMarcas = null; }
  if (pinoAt) { pinoAt.remove(); pinoAt = null; }
  if (!map || !NAE || !nomes || !naeMapa) return;          // NAE desligado no mapa: sem os marcadores
  naeMarcas = camadaNae(nomes).addTo(map);
}
// os marcadores de NAE dos trechos nomes, com a NAE N (o: mais opções dos marcadores)
function camadaNae(nomes, N = NAE, o) {
  const g = {};
  doTrecho(N).forEach(o => { if (o.lonlat && nomes.includes(o.trecho)) { const k = o.ativo + '|' + o.trecho; (g[k] = g[k] || {o, n: 0, de: new Set()}).n++; if (o.de) g[k].de.add(o.de); } });
  return L.layerGroup(Object.values(g).map(({o: a, n, de}) => L.marker([a.lonlat[1], a.lonlat[0]], Object.assign({zIndexOffset: 950, keyboard: false,
    icon: L.divIcon({className: '', iconSize: null, html: `<div class="nae-at">${n}</div>`})}, o))
    .bindTooltip(`${esc(ABR[a.abr] || a.abr)} ${esc(a.ativo)} · ${n} NAE · ${esc(a.trecho)}${de.size ? ' · registrada no ' + esc([...de].join(', ')) : ''}`, {direction: 'top'})
    .on('click', e => { L.DomEvent.stopPropagation(e); map.setView(e.latlng, Math.max(map.getZoom(), 17)); })));
}
function limpar() {
  const nada = !sel && !multi.length && !realcados && !halo && !marcas;   // nada escolhido nem em destaque no mapa
  sel = null; multi = [];
  marcaNae(null);
  avisaSel(null);
  resumo();
  marcaLista();
  if (!map || nada) return;                               // (clique fora da rede sem nada escolhido: repintar as ~2.000 linhas iguais era redesenhar o canvas inteiro à toa)
  realcados = null;
  Object.values(linhas).forEach(([l]) => l.setStyle({opacity: 1}));
  if (halo) { halo.remove(); halo = null; }
  if (marcas) { marcas.remove(); marcas = null; }
  Object.values(rotulos).forEach(m => m.getElement() && m.getElement().firstChild.classList.remove('sel'));
  rotulosT3();
}
// vão do trecho mais perto do ponto tocado (o trecho é desenhado como uma linha só)
function vaoPerto(vs, ll) {
  const k = Math.cos(ll.lat * Math.PI / 180);
  let melhor = null, dmin = Infinity;
  vs.forEach(v => {
    const ax = v[1] * k, ay = v[0], bx = v[3] * k, by = v[2], px = ll.lng * k, py = ll.lat;
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const f = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
    const d = (ax + f * dx - px) ** 2 + (ay + f * dy - py) ** 2;
    if (d < dmin) { dmin = d; melhor = v; }
  });
  return melhor;
}
// HTML do rótulo do trecho t (c: a NAE por trecho; x: o que outra camada põe; sel: escolhido; fixo: o do modo de faixa)
const htmlRotulo = (t, c, x, sel, fixo) => `<div class="lb ${t.tipo === 'fusivel' ? 'fus' : ''}${sel ? ' sel' : ''}${c && c[t.nome] ? ' oc' : ''}${x ? ' fo' : ''}${x.includes('data-longe') ? ' fo-l' : ''}${fixo ? ' fixo' : ''}" style="--c:${t.cor}">${esc(t.nome)}${c && c[t.nome] ? `<span class="n">${c[t.nome]}</span>` : ''}${x}</div>`;
// rótulos: T1/T2 sempre; T3 só de perto e só os que estão na tela (mais leve em alimentador grande)
function rotulo(t, c) {
  const x = extraRot(t.nome);
  const m = L.marker(t.rotulo, {icon: L.divIcon({className: '', iconSize: null, html: htmlRotulo(t, c, x, escolhido(t.nome), rotFixo(t.nome))}), zIndexOffset: zRot(t, x)})
    .bindTooltip(`${esc(t.inicio)} → ${esc(fimTxt(t))}`, {direction: 'top'})
    .on('click', e => { L.DomEvent.stopPropagation(e); clique(t.nome, e.originalEvent, false); }).addTo(map);
  rotulos[t.nome] = m;
}
function mostraClasses() {
  if (!map) return;
  Object.entries(linhas).forEach(([n, [l]]) => { const v = visivel[classeDe(n)]; if (v && !map.hasLayer(l)) l.addTo(map); else if (!v && map.hasLayer(l)) l.remove(); });
  D.trechos.forEach(t => { if (t.tipo === 'fusivel') return;
    const v = visivel[classeDe(t.nome)];
    if (v && !rotulos[t.nome]) rotulo(t, contaMapa()); else if (!v && rotulos[t.nome]) { rotulos[t.nome].remove(); delete rotulos[t.nome]; } });
  if (visivel.T3 && !map.hasLayer(fusMarcas)) fusMarcas.addTo(map); else if (!visivel.T3) fusMarcas.remove();
  rotulosT3();
  const esc_ = (multi.length ? multi : sel ? [sel] : []), vis = esc_.filter(n => visivel[classeDe(n)]);
  if (esc_.length) {                                        // seleção com classe escondida: some do mapa (a seleção fica)
    if (vis.length) realca(vis, false);
    else { if (halo) { halo.remove(); halo = null; } if (marcas) { marcas.remove(); marcas = null; } marcaNae(null); }
  }
  if (window.__onClasses) window.__onClasses();
}
function rotulosT3() {
  if (!map) return;
  const perto = map.getZoom() >= 15.5, b = map.getBounds().pad(0.2), c = contaMapa();
  D.trechos.forEach(t => {
    if (t.tipo !== 'fusivel') return;
    const ver = visivel.T3 && (escolhido(t.nome) || c[t.nome] || extraRot(t.nome) || rotFixo(t.nome) || (perto && b.contains(t.rotulo)));
    if (ver && !rotulos[t.nome]) rotulo(t, c);
    else if (!ver && rotulos[t.nome]) { rotulos[t.nome].remove(); delete rotulos[t.nome]; }
  });
}

// o quadro (x, y, z) do satélite toca o Tocantins? Pelo contorno do estado (window.TOCANTINS, dados/tocantins.js: só no
// site); sem ele, null (o mapa avulso pede todos, como sempre). Em unidades de Mercator (0 a 1), com memória por quadro
const quadroNoTO = (() => {
  const TO = Array.isArray(window.TOCANTINS) && window.TOCANTINS[0];
  if (!TO || TO.length < 3) return null;
  const P = TO.map(([la, lo]) => [(lo + 180) / 360, 0.5 - Math.log(Math.tan(Math.PI / 4 + la * Math.PI / 360)) / (2 * Math.PI)]);
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  P.forEach(([x, y]) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
  const dentro = (x, y) => { let d = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xa, ya] = P[j], [xb, yb] = P[i]; if ((ya > y) !== (yb > y) && x < xa + (y - ya) * (xb - xa) / (yb - ya)) d = !d; } return d; };
  // o lado (a, b) do contorno passa pelo retângulo r? (Liang–Barsky)
  const corta = (ax, ay, bx, by, r) => {
    let t0 = 0, t1 = 1;
    const dx = bx - ax, dy = by - ay, ps = [-dx, dx, -dy, dy], qs = [ax - r[0], r[2] - ax, ay - r[1], r[3] - ay];
    for (let i = 0; i < 4; i++) {
      const p = ps[i], q = qs[i];
      if (!p) { if (q < 0) return false; continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return true;
  };
  const memo = new Map();
  const toca = r => r[2] >= x0 && r[0] <= x1 && r[3] >= y0 && r[1] <= y1 &&
    (dentro((r[0] + r[2]) / 2, (r[1] + r[3]) / 2) || P.some((b, i) => corta(P[i ? i - 1 : P.length - 1][0], P[i ? i - 1 : P.length - 1][1], b[0], b[1], r)));
  const f = c => {
    const k = c.z + '/' + c.x + '/' + c.y;
    let v = memo.get(k);
    if (v === undefined) { const n = Math.pow(2, c.z); memo.set(k, v = toca([c.x / n, c.y / n, (c.x + 1) / n, (c.y + 1) / n])); }
    return v;
  };
  // visao-tocantins.js (a máscara): algum lado do contorno passa pelo retângulo r? O ponto (x, y) está dentro do estado?
  f.borda = r => P.some((b, i) => corta(P[i ? i - 1 : P.length - 1][0], P[i ? i - 1 : P.length - 1][1], b[0], b[1], r));
  f.dentro = dentro;
  return f;
})();
window.__quadroNoTO = quadroNoTO;

if (typeof L === 'undefined') {
  $('nolib').hidden = false;
} else {
  // área de toque em volta das linhas: não precisa acertar em cima do trecho (mais larga no celular)
  map = L.map('map', {preferCanvas: true, renderer: L.canvas({tolerance: L.Browser.mobile ? 16 : 10}), zoomSnap: 0.25, zoomDelta: 0.5});
  window.__map = map;
  let falhas = 0;
  // Satélite da Esri: onde não há foto num zoom, o servidor manda o quadro cinza "Map data not yet available".
  // Com blankTile=false ele responde 404 e o quadro vira a foto do nível de cima ampliada (até 6 níveis acima).
  const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';
  const ATR_SAT = 'Imagem © Esri — Esri, Maxar, Earthstar Geographics';
  // Site, de longe (mapa abaixo do zoom 10, onde a máscara de visao-tocantins.js deixa o mapa escuro fora do Tocantins;
  // do 9,5 ao 9,99 os quadros já são os do 10): só os quadros que tocam o estado (dados/tocantins.js, carregado antes deste
  // script); quadro inteiro fora dele nem é pedido. De perto, todos, como antes (o contorno do estado tem 568 pontos: erra
  // até ~750 m na borda). No voo do botão Tocantins (visao-tocantins.js) fica quieto: nada de quadros dos zooms do meio do
  // caminho, só os do pouso
  const Satelite = L.TileLayer.extend({
    getTileUrl: c => `${SAT}${c.z}/${c.y}/${c.x}?blankTile=false`,
    _isValidTile(c) { return L.TileLayer.prototype._isValidTile.call(this, c) && (!quadroNoTO || this._map.getZoom() >= 10 || quadroNoTO(c)); },
    _onMoveEnd() { if (!this._quieto) L.TileLayer.prototype._onMoveEnd.call(this); },
    // Leaflet 1.9: no zoomanim o mapa ainda está no zoom de antes; com o nível novo a mais de 1 dele, o _update voltava ao
    // nível de antes e podava os quadros da tela (quadros pretos na roda rápida e no zoom > 1 nível): usa o zoom do destino
    _update(c) {
      const m = this._map;
      if (!m || !m._animatingZoom || m._animateToZoom === undefined) return L.TileLayer.prototype._update.call(this, c);
      const g = m.getZoom; m.getZoom = () => m._animateToZoom;
      try { return L.TileLayer.prototype._update.call(this, c); } finally { m.getZoom = g; }
    },
    createTile(c, done) { const t = L.TileLayer.prototype.createTile.call(this, c, done); t._xyz = c; t._k = 0; return t; },
    _tileOnError(done, t, e) {
      const c = t._xyz, k = ++t._k;
      if (!c || k > 6 || c.z - k < 0) return L.TileLayer.prototype._tileOnError.call(this, done, t, e);
      // pedaço deste quadro na foto de cima; sem a soma de cores do Leaflet (plus-lighter), que clareia a borda recortada
    const f = 2 ** k, n = 256 * f, x = (c.x % f) * 256, y = (c.y % f) * 256;
      Object.assign(t.style, {width: n + 'px', height: n + 'px', marginLeft: -x + 'px', marginTop: -y + 'px', mixBlendMode: 'normal',
        clipPath: `inset(${y}px ${n - x - 256}px ${n - y - 256}px ${x}px)`});
      t.src = `${SAT}${c.z - k}/${c.y >> k}/${c.x >> k}?blankTile=false`;
    }
  });
  const satelite = new Satelite(SAT + '{z}/{y}/{x}', {
    maxZoom: 19, maxNativeZoom: 18, attribution: ATR_SAT
  }).on('tileerror', () => { if (++falhas > 3) $('nosat').hidden = false; });   // entra no mapa na 1ª fatia da montagem (montaRede)
  window.__satelite = satelite;                           // visao-tocantins.js: o fundo (quadros de longe) e o voo
  // Datas das fotos de satélite na legenda, com o que está na tela (pedido do usuário): o próprio World_Imagery tem, por
  // escala, de quando é cada pedaço da foto (camadas "… Resolution Metadata": SRC_DATE e o fornecedor, NICE_DESC). A cada
  // parada do mapa consulta a camada do nível dos quadros mostrados e põe na legenda a data (ou de qual a qual, se a tela
  // junta fotos de datas diferentes); passar o mouse mostra todas. Longe, a foto da Esri não tem data: a legenda pede para
  // aproximar. Sem internet, fica só com a Esri, como antes.
  const META_SAT = 'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/';
  // camada de metadados de cada nível de quadro (escala do quadro = 591657527,59 / 2^z; faixas de escala do serviço)
  const camadaSat = z => { const e = 591657527.591555 / 2 ** z;
    const f = [[106,5],[212,6],[425,7],[850,8],[1700,9],[3400,10],[6800,11],[13500,12],[27000,13],[54000,14],[108000,15],[216000,16],[432000,17]].find(([m]) => e <= m);
    return f ? f[1] : 18; };
  const dataSat = s => `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
  const escSat = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  // a data entra no mesmo texto da Esri, depois de " · " (o Leaflet separaria com vírgula, como se fosse outro crédito)
  let legSat = ATR_SAT, pedSat = 0, tSat = 0;
  function legendaSat(html) {
    const a = map.attributionControl, nova = html ? `${ATR_SAT} · ${html}` : ATR_SAT;
    if (!a || nova === legSat) return;
    a.removeAttribution(legSat); a.addAttribution(nova); legSat = nova;
  }
  function datasSat() {
    clearTimeout(tSat);
    tSat = setTimeout(async () => {
      const meu = ++pedSat, z = Math.min(18, Math.round(map.getZoom())), b = map.getBounds();
      const ext = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map(v => v.toFixed(5)).join(',');
      let fs = [];
      try {
        // sem foto neste nível o quadro vem ampliado do nível de cima (blankTile=false): procura até 2 níveis acima
        for (let c = camadaSat(z), fim = Math.min(18, c + 2); c <= fim && !fs.length; c++) {
          const r = await fetch(`${META_SAT}${c}/query?f=json&geometry=${ext}&geometryType=esriGeometryEnvelope&inSR=4326` +
            '&spatialRel=esriSpatialRelIntersects&outFields=SRC_DATE,NICE_DESC,NICE_NAME&returnGeometry=false&returnDistinctValues=true');
          const d = await r.json();
          if (meu !== pedSat) return;
          fs = (d.features || []).map(f => f.attributes || {});
        }
      } catch (e) { return; }                              // sem internet: a legenda fica como estava
      if (meu !== pedSat) return;
      const ds = [...new Set(fs.map(f => String(f.SRC_DATE)).filter(x => /^(19|20)\d{6}$/.test(x)))].sort();
      const de = [...new Set(fs.filter(f => /^(19|20)\d{6}$/.test(String(f.SRC_DATE))).map(f => f.NICE_DESC || f.NICE_NAME).filter(Boolean))];
      // longe (zoom até ~11) a Esri mostra um mosaico de baixa resolução, sem data de captura: avisa que de perto tem
      if (!ds.length) { legendaSat(fs.length ? '<span class="sat-data">aproxime para ver a data da foto</span>' : ''); return; }
      const txt = (ds.length === 1 ? `foto de ${dataSat(ds[0])}` : `fotos de ${dataSat(ds[0])} a ${dataSat(ds[ds.length - 1])}`) +
        (de.length ? ` (${de.slice(0, 2).join(', ')})` : '');
      legendaSat(`<span class="sat-data" title="${escSat('Datas das fotos de satélite na tela: ' + ds.map(dataSat).join(', '))}">${escSat(txt)}</span>`);
    }, 400);
  }
  map.on('moveend', datasSat);
  // a vista primeiro (caixa da rede sem montar 50 mil pares de pontos): com o mapa já no lugar, cada linha entra direto
  // nele, sem fila de espera, e os outros scripts da página já podem usar window.__map
  let sul = 90, oeste = 180, norte = -90, leste = -180;
  D.vaos.forEach(v => { sul = Math.min(sul, v[0], v[2]); norte = Math.max(norte, v[0], v[2]); oeste = Math.min(oeste, v[1], v[3]); leste = Math.max(leste, v[1], v[3]); });
  const todos = L.latLngBounds([sul, oeste], [norte, leste]);
  map.fitBounds(todos.pad(0.04));
  window.__caixaRede = todos;                             // visao-tocantins.js: o voo de volta à vista com que o alimentador abre

  // ---------- desenho em fatias (o canvas da rede; municipios.js usa o mesmo no das divisas: window.__alFatias) ----------
  // No fim de cada zoom e de cada arrasto o Leaflet projetava, recortava e desenhava de uma vez todas as linhas do canvas,
  // numa tarefa só: no celular com a CPU 4× mais lenta, 250 a 450 ms parado a cada passo da roda no LD01065015, uns 2/3
  // disso a pintura das linhas no fim da tarefa (o canvas 2D era 46% da linha principal no gesto). Aqui a vista nova é
  // desenhada num 2º canvas, fora da página, um pouco por quadro (umas dezenas de ms com a pintura: o custo de pintar é
  // estimado pelo tamanho das linhas e medido a cada fatia), e entra no lugar do de antes de uma vez, quando fica pronta.
  // Até lá a imagem de antes continua no lugar, esticada e levada junto com o mapa, como no zoom do Leaflet. O desenho é o
  // mesmo, operação por operação e na mesma ordem: a imagem final é idêntica à do Leaflet. Um gesto novo (zoom, arrasto,
  // pinça) interrompe o desenho em curso: só a vista em que o mapa para é desenhada (na roda seguida, a do último passo).
  // A projeção e o recorte de cada linha também ficam para o desenho (as que estão fora da vista nem são projetadas); o
  // clique e o mouse sobre as linhas, que precisam deles, completam na hora o que faltar. Mudanças no meio do desenho: linha
  // nova entra no fim da ordem (o desenho chega nela); a que muda de estilo ou de forma depois de desenhada, ou que sai do
  // mapa, ganha um redesenho da área dela logo depois da troca (como o Leaflet faz); a que muda de lugar na ordem recomeça
  // o desenho. Camada com dois traços (o contorno e a cor da limpeza.js: _alPasso) pode ter cada traço numa fatia.
  // liga(): desde quando (o da rede, depois da carga: as linhas entram no mapa em levas, pintadas por cima do canvas).
  // ren._alQuando(f): f roda quando o canvas mostrar a vista de agora (visao-tocantins.js: a rede volta no pouso do voo).
  const FT = {un: L.Browser.mobile ? 0.006 : 0.002};    // ms de pintura por unidade de custo (medido e ajustado a cada fatia)
  function fatiado(ren, liga) {
    const C = L.Canvas.prototype, R = L.Renderer.prototype, m = map, PEDIDO = -1;   // PEDIDO: "redesenho em curso" (_redrawRequest)
    const o0 = {update: C._update, reset: C._reset, zoomEnd: R._onZoomEnd, redraw: C._redraw, req: C._requestRedraw, ext: C._extendRedrawBounds,
      click: C._onClick, hover: C._handleMouseHover, init: C._initPath, upd: C._updatePath, frente: C._bringToFront, fundo: C._bringToBack,
      tr: R._updateTransform};
    // voo: o desenho em curso; pend: desenho pedido nesta tarefa (começa no fim dela); incons: o canvas da página não mostra a
    // vista de agora (desenho em curso, ou interrompido por um gesto: o próximo fim de movimento refaz tudo)
    // reset: o último fim de movimento foi um viewreset (setView sem animação): o Leaflet, depois do _update, punha no canvas
    // a posição exata (com fração de pixel) do _updateTransform; nos outros, a posição inteira do canto
    let voo = null, pend = false, incons = false, nv = 0, reserva = null, quando = [], reset = false;
    // a imagem que o canvas da página tem: canto (px absolutos do zoom z) e o tamanho do mapa quando foi desenhada. O
    // _updateTransform do Leaflet põe o canvas pelo tamanho de agora: com o mapa de outro tamanho (tela cheia, gaveta, barra
    // do navegador, giro) e a imagem de antes ainda no lugar, ela ia para fora do lugar (esticada no zoom)
    let img = null;
    const guarda = (a, z) => { img = a ? {a: a.add(m.getPixelOrigin()), z, t: m.getSize()} : null; };
    const ativo = () => !!ren._bounds && !!ren._map && liga();
    const chave = () => { const o = m.getPixelOrigin(); return m.getZoom() + '|' + o.x + '|' + o.y; };
    const caixa = () => {                                 // a mesma conta de L.Renderer._update
      const p = ren.options.padding, t = m.getSize(), a = m.containerPointToLayerPoint(t.multiplyBy(-p)).round();
      return new L.Bounds(a, a.add(t.multiplyBy(1 + p * 2)).round());
    };
    const novo = () => {                                  // canvas com os ouvintes do L.Canvas._initContainer
      const c = document.createElement('canvas');
      L.DomEvent.on(c, 'mousemove', ren._onMouseMove, ren);
      L.DomEvent.on(c, 'click dblclick mousedown mouseup contextmenu', ren._onClick, ren);
      L.DomEvent.on(c, 'mouseout', ren._handleMouseOut, ren);
      c._leaflet_disable_events = true;
      return c;
    };
    const FORA = new L.Point(-1e9, -1e9), CXFORA = new L.Bounds(FORA, FORA);
    // linha (ou ponto) pronta para a vista do desenho v: projetada (se a vista mudou), recortada e simplificada pelo Leaflet;
    // fora da vista (com 64 px de folga, mais que a área de toque e a largura do traço), nada a desenhar nem a tocar
    function prepara(l, v) {
      if (l._alEp === v.id) return;
      l._alEp = v.id;
      if (l instanceof L.Polyline) {
        if (!(l._bounds && l._bounds.isValid() && v.vb.intersects(l._bounds))) { l._parts = []; return; }
      } else if (l instanceof L.CircleMarker && !(l instanceof L.Circle) && l._latlng && !v.vb.contains(l._latlng)) {
        l._point = FORA; l._pxBounds = CXFORA; l._alPk = null; return;
      }
      if (l._alPk !== v.chave) {
        l._project(); l._alPk = v.chave;
        if (l._rings && l._alNp === undefined) { let n = 0; for (const r of l._rings) n += r.length; l._alNp = n; }   // (tamanho: fatia.)
      }
      l._update();                                        // (_drawing é false: só recorta e simplifica)
    }
    // custo de pintar a linha l com o traço de largura w: pontos e comprimento (px) vezes a largura (fora da vista: quase nada)
    function custo(l, w) {
      const ps = l._parts;
      if (!ps) return l._point === FORA ? 1 : 12;
      if (!ps.length) return 1;
      let n = 12;
      const k = (w || 0) + 2;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        let s = 0;
        for (let j = 1; j < p.length; j++) s += Math.abs(p[j].x - p[j - 1].x) + Math.abs(p[j].y - p[j - 1].y);
        n += p.length + s * k / 16;
      }
      return n;
    }
    // o canvas de trás em branco e a ordem do começo: o _clear e o começo do _draw do Leaflet
    function limpa(v) {
      const c = v.c, x = v.ctx;
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height); x.restore();
      x.save();
      v.cur = ren._drawFirst; v.passo = 0; v.des = ++nv; v.sujo = null;
    }
    function inicia() {
      pend = false;
      if (voo) solta(voo);
      if (!ativo() || m._animatingZoom) return;
      const nb = caixa(), k = L.Browser.retina ? 2 : 1, t = nb.getSize(), c = reserva || novo();
      reserva = null;
      c.width = k * t.x; c.height = k * t.y; c.style.width = t.x + 'px'; c.style.height = t.y + 'px';
      const ctx = c.getContext('2d');
      if (k === 2) ctx.scale(2, 2);
      ctx.translate(-nb.min.x, -nb.min.y);
      const M = 64, sw = m.layerPointToLatLng([nb.min.x - M, nb.max.y + M]), ne = m.layerPointToLatLng([nb.max.x + M, nb.min.y - M]);
      if (ren._redrawRequest && ren._redrawRequest !== PEDIDO) L.Util.cancelAnimFrame(ren._redrawRequest);
      ren._redrawRequest = PEDIDO; ren._redrawBounds = null;
      voo = {c, ctx, nb, vb: L.latLngBounds(sw, ne), centro: m.getCenter(), zoom: m.getZoom(), chave: chave(), id: ++nv};
      limpa(voo);
    }
    // desenha a partir de onde parou, até ms de JS ou un de custo. Camada grande (a rede inteira da Faixa) é preparada numa
    // fatia e pintada noutra; o traço que não cabe no que sobra da fatia fica para a seguinte (que começa por ele)
    function fatia(v, ms, un) {
      const t0 = performance.now(), b0 = ren._bounds, x0 = ren._ctx;
      let u = 0;
      ren._bounds = v.nb;                                 // o recorte e os pontos (L.CircleMarker._empty) são da vista nova
      try {
        while (v.cur) {
          const o = v.cur, l = o.layer;
          if (l._order !== o || !l._map) { v.cur = o.next; v.passo = 0; continue; }   // saiu do mapa
          if (l._alEp !== v.id) {
            if (u > 0 && (l._alNp || (l._latlngs ? l._latlngs.length : 0)) > 1500) break;
            prepara(l, v);
            if (performance.now() - t0 >= ms) break;
          }
          const dois = !!l._alPasso, c = custo(l, dois && !v.passo ? l._contorno.weight : l.options.weight);
          if (u > 0 && u + c > un) break;
          ren._ctx = v.ctx; ren._drawing = true;
          try { if (dois) l._alPasso(v.passo); else l._updatePath(); } finally { ren._drawing = false; ren._ctx = x0; }
          u += c;
          l._alDes = v.des;
          if (dois && ++v.passo < 2) continue;
          v.passo = 0; v.cur = o.next;
          if (u >= un || performance.now() - t0 >= ms) break;
        }
      } finally { ren._bounds = b0; }
      v.u = u;
      if (!v.cur) troca(v);
    }
    // pronto: o canvas de trás entra no lugar do da página (que fica de reserva para o próximo desenho)
    function troca(v) {
      const nb = caixa();
      if (!nb.min.equals(v.nb.min) || !nb.max.equals(v.nb.max) || chave() !== v.chave) { inicia(); return; }   // o mapa mudou sem avisar (tamanho): de novo
      v.ctx.restore();
      v.morto = true;
      const velho = ren._container;
      v.c.className = velho.className;
      L.DomUtil.setPosition(v.c, v.nb.min);
      if (velho.parentNode) velho.parentNode.replaceChild(v.c, velho);
      ren._container = v.c; ren._ctx = v.ctx; ren._bounds = v.nb; ren._center = v.centro; ren._zoom = v.zoom;
      guarda(v.nb.min, v.zoom);
      if (reset) ren._updateTransform(v.centro, v.zoom);
      reserva = velho; voo = null; incons = false;
      ren._redrawRequest = null; ren._redrawBounds = null;
      if (v.sujo) { ren._redrawBounds = v.sujo; ren._redrawRequest = L.Util.requestAnimFrame(ren._redraw, ren); }
      const fs = quando;
      quando = [];
      fs.forEach(f => { try { f(); } catch (e) { console.error(e); } });
    }
    function solta(v) {                                   // desenho interrompido (gesto novo): o canvas da página fica como está
      v.morto = true;
      if (v.raf) cancelAnimationFrame(v.raf);
      v.ctx.restore();
      if (!reserva) reserva = v.c;
      if (voo === v) voo = null;
    }
    function recomeca(v) { v.ctx.restore(); limpa(v); }  // a ordem do desenho mudou no meio dele
    const canal = (() => { const c = new MessageChannel(), f = []; c.port1.onmessage = () => f.shift()(); return g => { f.push(g); c.port2.postMessage(0); }; })();
    // a próxima fatia: depois da pintura desta (no fim da tarefa dela; o tempo dela ajusta o custo) e do quadro seguinte
    function segue(v) {
      const t1 = performance.now();
      canal(() => {
        if (v.morto) return;
        if (v.u > 400) FT.un = Math.min(0.05, Math.max(0.0003, 0.5 * FT.un + 0.5 * (performance.now() - t1) / v.u));
        v.raf = requestAnimationFrame(() => {
          v.raf = 0;
          canal(() => { if (v.morto) return; fatia(v, 8, 20 / FT.un); if (voo) segue(voo); });
        });
      });
    }
    // as linhas para o toque: todas prontas na vista nova (o desenho em curso não precisa refazê-las)
    function geo() {
      if (pend) inicia();
      const v = voo;
      if (!v) return;
      const b0 = ren._bounds;
      ren._bounds = v.nb;
      try { for (let o = ren._drawFirst; o; o = o.next) prepara(o.layer, v); } finally { ren._bounds = b0; }
    }
    // área de uma camada já desenhada nesta vista que mudou ou saiu: redesenhada depois da troca
    const marca = (l, v) => {
      if (l._alDes !== v.des || !l._pxBounds) return;
      const w = (l.options.weight || 0) + 1, b = l._pxBounds;
      v.sujo = v.sujo || new L.Bounds();
      v.sujo.extend(b.min.subtract([w, w])); v.sujo.extend(b.max.add([w, w]));
    };
    ren._update = function () {                           // fim de movimento (moveend) e viewreset
      if (!ativo()) { const r = o0.update.call(this); guarda(this._bounds && this._bounds.min, this._zoom); return r; }
      if (m._animatingZoom && this._bounds) return;
      if (voo) solta(voo);
      incons = true; reset = false;
      if (this._redrawRequest && this._redrawRequest !== PEDIDO) L.Util.cancelAnimFrame(this._redrawRequest);
      this._redrawRequest = PEDIDO; this._redrawBounds = null;
      if (pend) return;
      pend = true;                                        // no fim desta tarefa (os outros ouvintes do fim do movimento antes): a 1ª fatia, pequena
      queueMicrotask(() => { if (!pend) return; inicia(); if (voo) { fatia(voo, 3, 6 / FT.un); if (voo) segue(voo); } });
    };
    ren._reset = function () {                            // viewreset: a projeção e o recorte das camadas ficam para o desenho
      if (!ativo()) return o0.reset.call(this);
      this._update();
      this._updateTransform(m.getCenter(), m.getZoom());   // (a imagem de antes na vista nova: com o _center dela, ficava parada na tela)
      reset = true;
    };
    ren._onZoomEnd = function () { if (!ativo()) return o0.zoomEnd.call(this); };   // idem
    ren._updateTransform = function (c, z) {
      const g = img;
      if (!g || g.t.equals(m.getSize())) return o0.tr.call(this, c, z);
      const s = m.getZoomScale(z, g.z), p = g.a.multiplyBy(s).subtract(m._getNewPixelOrigin(c, z));
      if (L.Browser.any3d) L.DomUtil.setTransform(this._container, p, s); else L.DomUtil.setPosition(this._container, p);
    };
    ren._redraw = function () {
      if (pend) inicia();
      if (voo) {                                          // redesenho pedido no meio do desenho em fatias: termina agora
        for (let i = 0; voo && i < 3; i++) fatia(voo, Infinity, Infinity);   // (recomeça se o mapa mudou de tamanho)
        if (this._redrawRequest && this._redrawRequest !== PEDIDO) L.Util.cancelAnimFrame(this._redrawRequest);
        this._redrawBounds = null;
      } else if (incons) { this._redrawRequest = PEDIDO; this._redrawBounds = null; return; }
      return o0.redraw.call(this);
    };
    ren._extendRedrawBounds = function (l) {
      if (voo) return marca(l, voo);
      if (pend || incons) return;
      return o0.ext.call(this, l);
    };
    ren._requestRedraw = function (l) {
      const v = voo;
      if (v) {
        if (l._alDes === v.des && l._alEp !== v.id && l._order && l._map) {   // forma nova numa já desenhada: pronta já, para a área certa
          const b0 = this._bounds;
          this._bounds = v.nb;
          try { prepara(l, v); } finally { this._bounds = b0; }
        }
        return marca(l, v);
      }
      if (pend || incons) return;
      return o0.req.call(this, l);
    };
    ren._initPath = function (l) { l._alPk = null; l._alEp = -1; l._alDes = 0; return o0.init.call(this, l); };
    ren._updatePath = function (l) { l._alPk = null; l._alEp = -1; return o0.upd.call(this, l); };   // (redraw: forma nova)
    ren._bringToFront = function (l) { o0.frente.call(this, l); if (voo) recomeca(voo); };
    ren._bringToBack = function (l) { o0.fundo.call(this, l); if (voo) recomeca(voo); };
    ren._onClick = function (e) { if ((voo || pend) && /click|contextmenu/.test(e.type)) geo(); return o0.click.call(this, e); };
    ren._handleMouseHover = function (e, p) { if ((voo || pend) && !this._mouseHoverThrottled) geo(); return o0.hover.call(this, e, p); };
    ren._alQuando = f => { if (incons || pend) quando.push(f); else f(); };
    m.on('movestart zoomstart', () => { pend = false; if (voo) solta(voo); });
  }
  window.__alFatias = fatiado;
  const ren = map.options.renderer;                       // o canvas da rede
  let redeOk = false;
  AL.rede.then(() => { redeOk = true; });
  fatiado(ren, () => redeOk);                             // (antes de entrar no mapa: os ouvintes do canvas são os daqui)
  map.addLayer(ren);
  fusMarcas = L.layerGroup().addTo(map);
  window.__fusMarcas = fusMarcas;                         // limpeza.js: com a Faixa ligada, os ~2.000 pontos só aparecem de perto (zoom 14+)
  marca('al:mapa');

  // Projeção com memória: a cada zoom o Leaflet refaz a conta de Mercator (seno e logaritmo) de todos os pontos de todas as
  // linhas do mapa (as da rede e as das camadas). A parte que não depende do zoom fica guardada em cada ponto; a cada zoom
  // sobram uma multiplicação e um arredondamento, com o mesmo resultado, pixel a pixel, da conta original do Leaflet.
  if (map.options.crs === L.CRS.EPSG3857 && !L.Polyline.prototype._alProj) {
    const P = L.Polyline.prototype, antes = P._projectLatlngs, tr = L.CRS.EPSG3857.transformation, pj = L.CRS.EPSG3857.projection;
    P._alProj = true;
    P._projectLatlngs = function (latlngs, result, projectedBounds) {
      const m = this._map;
      if (m.options.crs !== L.CRS.EPSG3857 || !(latlngs[0] instanceof L.LatLng)) return antes.call(this, latlngs, result, projectedBounds);
      const s = m.options.crs.scale(m.getZoom()), o = m.getPixelOrigin(), ox = o.x, oy = o.y, n = latlngs.length, ring = new Array(n);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < n; i++) {
        const ll = latlngs[i];
        if (ll._la !== ll.lat || ll._lo !== ll.lng) {      // 1ª vez (ou ponto mudado): a parte da conta que não depende do zoom
          const q = pj.project(ll);
          ll._ux = tr._a * q.x + tr._b; ll._uy = tr._c * q.y + tr._d; ll._la = ll.lat; ll._lo = ll.lng;
        }
        const x = Math.round(s * ll._ux) - ox, y = Math.round(s * ll._uy) - oy;
        ring[i] = new L.Point(x, y);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      if (n) { projectedBounds.extend(new L.Point(x0, y0)); projectedBounds.extend(new L.Point(x1, y1)); }
      result.push(ring);
    };
  }

  // Um ouvinte só para todas as linhas e outro para todos os fusíveis (clique, realce ao passar o mouse); o balão com o
  // nome de cada um é criado na 1ª vez que o mouse (ou o toque) chega nele, e não ~4.000 de uma vez na carga
  const paiL = new L.Evented(), paiF = new L.Evented();
  const balaoL = l => l.bindTooltip(esc(l._al.nome), {sticky: true, direction: 'top', offset: [0, -8]});
  paiL.on('click', e => {
    const l = e.layer, t = l._al, novo = !l.getTooltip();
    if (novo) balaoL(l);
    L.DomEvent.stopPropagation(e);
    clique(t.nome, e.originalEvent, false, vaoPerto(linhas[t.nome][1], e.latlng));
    if (novo) l._openTooltip(e);
  });
  paiL.on('mouseover', e => {
    const l = e.layer;
    if (!l.getTooltip()) { balaoL(l); l._openTooltip(e); }
    l.setStyle({weight: l._al.peso + 3});
  });
  paiL.on('mouseout', e => e.layer.setStyle({weight: e.layer._al.peso}));
  const balaoF = (m, e) => {
    const a = m._al;
    m.bindTooltip(`${esc(a.nome)} · ${esc(TIPO[a.t] || a.t)}${papel(a.nome) ? ' · ' + esc(papel(a.nome)) : ''}`, {direction: 'top'});
    m._openTooltip(e);
  };
  paiF.on('click', e => {
    const m = e.layer, a = m._al;
    if (!m.getTooltip()) balaoF(m, e);
    L.DomEvent.stopPropagation(e);
    if (a.trecho) clique(a.trecho, e.originalEvent, false);
    // o balão com Maps e Earth (Ctrl + clique só soma o trecho à seleção, sem balão)
    if (!comCtrl(e.originalEvent)) GEO.balao(m, a.nome, `${TIPO[a.t] || a.t}${papel(a.nome) ? ' · ' + papel(a.nome) : ''}`);
  });
  paiF.on('mouseover', e => { const m = e.layer; if (!m.getTooltip()) balaoF(m, e); });

  // Ordem de desenho (a mesma de quando tudo entrava de uma vez): as linhas na ordem dos trechos, os pontos dos fusíveis
  // logo depois delas, e por cima o que os outros scripts põem no mapa. Como aqui linhas e pontos entram aos poucos, algo
  // alheio (camada de outro script, prévia da busca) pode entrar no meio: cada linha nova vai para logo depois da linha
  // anterior, e cada ponto para logo depois do ponto anterior (o 1º, para depois das linhas ou, se o grupo dos fusíveis
  // saiu e voltou ao mapa, para onde ele voltou).
  // Pintura: o que entra por último na ordem é desenhado por cima do que já está no canvas (a mesma imagem de limpar e
  // redesenhar tudo, sem o custo disso a cada leva); o que entra no meio da ordem espera o fim da leva e pede um
  // redesenho do canvas inteiro (por pedaço, o Leaflet recorta as linhas compridas das camadas e as pontas delas saem
  // com outro serrilhado). O pedido de redesenho do Leaflet só é calado durante a entrada dessas linhas e pontos.
  let calado = false, inteiro = false;
  const pede = ren._requestRedraw, redesenha = ren._redraw;
  ren._requestRedraw = function (layer) { if (!calado) pede.call(this, layer); };
  ren._redraw = function () { if (inteiro) { inteiro = false; this._redrawBounds = null; } return redesenha.call(this); };
  const pintaNovas = ls => {
    if (!ls.length || !ren._ctx) return;
    ren._ctx.save();
    ren._drawing = true;
    for (const l of ls) if (l._map) l._updatePath();
    ren._drawing = false;
    ren._ctx.restore();
  };
  const naOrdem = o => !!o && o.layer._order === o;     // o nó ainda está na ordem de desenho do canvas
  function depoisDe(l, a) {                               // leva a camada l para logo depois do nó a (null: para o começo)
    const o = l._order;
    if (!o || o === a || o.prev === a) return;
    if (o.prev) o.prev.next = o.next; else ren._drawFirst = o.next;
    if (o.next) o.next.prev = o.prev; else ren._drawLast = o.prev;
    o.prev = a;
    o.next = a ? a.next : ren._drawFirst;
    if (o.next) o.next.prev = o; else ren._drawLast = o;
    if (a) a.next = o; else ren._drawFirst = o;
  }
  const criadas = [];                                     // linhas, na ordem em que foram criadas (a dos trechos)
  // o começo da ordem: os halos da seleção (ficam por baixo de tudo) e, com `linhas`, as linhas da rede que vêm em seguida
  const comeco0 = linhas => { let a = null; for (let o = ren._drawFirst; o && (o.layer._alHalo || (linhas && o.layer._al && !(o.layer instanceof L.CircleMarker))); o = o.next) a = o; return a; };
  function poeLinha(i) {
    const t = D.trechos[i], vs = vaosDe[i];
    const l = L.polyline(cadeias(vs), {color: t.cor, weight: t.peso, opacity: realcados && !realcados.includes(t.nome) ? 0.28 : 1, lineCap: 'round'});
    l._al = t;
    l.addEventParent(paiL);
    linhas[t.nome] = [l, vs];
    criadas.push(l);
    if (!visivel[classeDe(t.nome)]) return null;         // classe escondida nos botões T1 T2 T3: a linha fica pronta, fora do mapa
    l.addTo(map);
    let a = null, j = criadas.length - 2;
    while (j >= 0 && !criadas[j]._order) j--;             // a linha anterior que está no mapa
    depoisDe(l, j >= 0 ? criadas[j]._order : comeco0(false));
    return l;
  }
  // pontos dos fusíveis: o grupo entra no mapa vazio e os pontos são criados depois (montaFusiveis), um de cada vez, logo
  // depois das linhas na ordem de desenho. Se o grupo sair e voltar ao mapa antes disso (limpeza.js ao aproximar, botões
  // T1 T2 T3), os que faltam são criados nessa hora: voltam todos juntos para o fim da ordem, como sempre foi
  let iFus = 0, fusAncora, fusVoltou = false;
  // de longe (fusLonge, abaixo do zoom 7) os pontos ficam no mapa e no lugar deles na ordem de desenho, mas o canvas não
  // os pinta e o mouse e o toque não os acham: a rede fica só com as linhas, sem tirar e pôr ~2.000 pontos a cada zoom
  const fusPinta = function () { if (!fusLonge) L.CircleMarker.prototype._updatePath.call(this); };
  const fusToca = function (p) { return !fusLonge && L.CircleMarker.prototype._containsPoint.call(this, p); };
  function poeFusivel() {
    const a = D.fusiveis[iFus++];
    const m = L.circleMarker([a.lat, a.lon], {radius: 4, color: '#111', weight: 1.5, fillColor: a.t === 'SEC' || a.t === 'FTR' ? '#9ca3af' : '#fff', fillOpacity: 1});
    m._updatePath = fusPinta; m._containsPoint = fusToca;
    m._al = a;
    m.addEventParent(paiF);
    fusMarcas.addLayer(m);
    if (!m._map) return null;                             // o grupo está fora do mapa (T3 escondido, ou a Faixa de longe)
    if (!fusVoltou) {                                     // nunca saiu do mapa: logo depois das linhas (o 1º) e do ponto anterior
      if (fusAncora === undefined) fusAncora = comeco0(true);
      if (fusAncora === null || naOrdem(fusAncora)) depoisDe(m, fusAncora);
      fusAncora = m._order;
    }
    return m;
  }
  fusMarcas.on('add', () => { fusVoltou = true; while (iFus < D.fusiveis.length) poeFusivel(); });
  // leva de linhas ou pontos (`faz` devolve o que entrou no mapa, ou null)
  function leva() {
    let novas = [], guardadas = [];
    return {
      poe(faz, x) {
        calado = true;
        let l;
        try { l = faz(x); } finally { calado = false; }
        if (!l || map._animatingZoom) return;             // no meio de um zoom: o fim dele redesenha tudo
        (l._order && !l._order.next ? novas : guardadas).push(l);   // última da ordem: por cima; no meio dela: espera
      },
      pinta() { if (!map._animatingZoom) pintaNovas(novas); novas = []; },
      fim() {
        this.pinta();
        const g = guardadas.find(l => l._map);
        if (g) { inteiro = true; pede.call(ren, g); }       // o próximo redesenho do Leaflet é o do canvas inteiro
        guardadas = [];
      }
    };
  }
  // 1) o tronco (T1, T2, T2-A…: poucos trechos) de uma vez, já no 1º quadro, com DJ, religadores e os rótulos dele;
  // 2) um pouco por quadro: os rótulos de T3 que aparecem de longe (com NAE) e o começo do painel (resumo e lista); daqui
  //    em diante a página pode ficar pronta; 3) os trechos de fusível. Os pontos dos fusíveis vêm depois (montaFusiveis)
  let essencial;                                          // promessa: 1) e 2) feitos (o painel espera por ela)
  async function montaRede() {
    let feito;
    essencial = new Promise(r => { feito = r; });
    try {
      await AL.segue();                                   // o tronco sai de uma vez, antes dos scripts seguintes da página
      satelite.addTo(map);
      const ids = Object.keys(vaosDe), lv = leva();       // na ordem dos trechos, como sempre
      let k = 0;
      for (; k < ids.length && D.trechos[ids[k]].tipo !== 'fusivel'; k++) {   // o tronco: os trechos do começo que não são de fusível
        lv.poe(poeLinha, ids[k]);
        if (AL.cheia()) { lv.pinta(); await AL.segue(); }
      }
      lv.pinta();
      marca('al:tronco');
      await AL.segue();
      D.principais.forEach(a => principal(a).addTo(map));
      let c = contaMapa();
      D.trechos.forEach(t => { if (t.tipo !== 'fusivel' && visivel[classeDe(t.nome)] && !rotulos[t.nome]) rotulo(t, c); });
      // até aqui tudo saiu em sequência, na frente dos scripts seguintes; o quadro que vem agora (pedido no começo deste
      // script, por isso também na frente deles) mostra o tronco. Daqui em diante, um pouco por quadro
      await AL.cede();
      // rótulos de T3: os mesmos que rotulosT3() põe (escolhido, com NAE, ou de perto e na tela)
      let perto, b;
      const estado = () => { c = contaMapa(); perto = map.getZoom() >= 15.5; b = map.getBounds().pad(0.2); };
      estado();
      for (const t of D.trechos) {
        if (t.tipo !== 'fusivel') continue;
        if (visivel.T3 && !rotulos[t.nome] && (escolhido(t.nome) || c[t.nome] || extraRot(t.nome) || rotFixo(t.nome) || (perto && b.contains(t.rotulo)))) rotulo(t, c);
        if (AL.cheia()) { await AL.cede(); estado(); }
      }
      await comeco(AL.cede);
      feito();
      for (; k < ids.length; k++) {
        lv.poe(poeLinha, ids[k]);
        if (AL.cheia()) { lv.pinta(); await AL.cede(); }
      }
      lv.fim();
      marca('al:linhas');
    } finally { feito(); fimLinhas(); document.dispatchEvent(new Event('al:linhas')); }
  }
  // pontos dos fusíveis: depois que todos os scripts da página rodaram. Com a Faixa ligada (o padrão) eles só aparecem de
  // perto e a limpeza.js já tirou o grupo do mapa: os ~2.000 pontos ficam prontos sem entrar nele (antes entravam e saíam)
  async function montaFusiveis(antes) {
    await antes; await AL.dom; await AL.cede();
    const lv = leva();
    while (iFus < D.fusiveis.length) {
      lv.poe(poeFusivel);
      if (AL.cheia()) { lv.pinta(); await AL.cede(); }
    }
    lv.fim();
  }
  // longe: rótulos de T3 e fusíveis só de perto (15,5); eq-longe: sem DJ e religador (abaixo do 7, visão do estado; os pontos dos
  // fusíveis também não, fusLonge); eq-sem-num: DJ e religador só com a caixinha do tipo, sem o número operativo (abaixo do 15)
  const zoomClasse = () => {
    const z = map.getZoom(), c = $('map').classList;
    c.toggle('longe', z < 15.5); c.toggle('eq-longe', z < Z_EQ_LONGE); c.toggle('eq-sem-num', z < Z_NUM);
    fusLonge = z < Z_EQ_LONGE;                               // (o canvas é refeito no fim do zoom, logo depois deste aviso)
  };
  map.on('zoomend', zoomClasse); zoomClasse();
  map.on('moveend', rotulosT3);
  const p1 = montaRede().catch(e => console.error(e));
  AL.espera(essencial);                                   // o painel só aparece com o tronco da rede, os rótulos e o resumo prontos
  montaFusiveis(p1).catch(e => console.error(e)).then(() => { marca('al:rede'); fimRede(); document.dispatchEvent(new Event('al:rede')); });
  $('classes').innerHTML = [['T1', COR_Z[1]], ['T2', COR_Z[2]], ['T3', COR_Z[3]]]
    .map(([c, cor]) => `<button type="button" data-c="${c}" aria-pressed="true" style="--c:${cor}" title="Mostrar ou esconder ${c}">${c}</button>`).join('');
  $('classes').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    L.DomEvent.stopPropagation(e);
    visivel[b.dataset.c] = !visivel[b.dataset.c];
    b.setAttribute('aria-pressed', visivel[b.dataset.c]);
    mostraClasses();
  });
  L.DomEvent.disableClickPropagation($('classes'));
  map.on('click', e => { if (!comCtrl(e.originalEvent)) limpar(); });   // Ctrl + clique fora da rede não desfaz a seleção
  menuDoPonto();
  arranjoNumeros();
}

// ---------- menu do ponto: clique direito (PC) ou toque longo (celular) em qualquer ponto do mapa ----------
// "Abrir no Google Maps" e "Abrir no Google Earth" do ponto, a coordenada em graus decimais e em UTM (SIRGAS 2000), cada
// uma com o botão de copiar. O menu fica na caixa do mapa (.mapbox), fora do #map: clicar nele não é clicar no mapa (o modo
// Limpeza de faixa toma os cliques do #map). Toque longo: 500 ms parado (até 10 px), um dedo só; o 2º dedo (pinça), o
// arrasto ou soltar antes cancelam, e o clique que o navegador manda ao soltar é engolido (não escolhe trecho nem abre
// balão). Fecham o menu: Esc, clique ou toque fora (só fecha: esse clique não chega ao mapa), mexer no mapa e escolher.
// No link, botão, campo ou balão o clique direito é o do navegador, como sempre.
function menuDoPonto() {
  const mc = map.getContainer(), caixa = mc.parentElement || mc;
  const ICO = d => `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">${d}</svg>`;
  const PINO = ICO('<path d="M8 14.5s4.5-4.2 4.5-7.8a4.5 4.5 0 0 0-9 0c0 3.6 4.5 7.8 4.5 7.8z"/><circle cx="8" cy="6.7" r="1.6"/>');
  const GLOBO = ICO('<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c1.8 1.7 2.6 3.7 2.6 6S9.8 12.3 8 14C6.2 12.3 5.4 10.3 5.4 8S6.2 3.7 8 2z"/>');
  const COPIA = ICO('<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.5a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h.5"/>');
  let menu = null, alvo = null, aberto = false, engole = false, quando = 0, toque = null;
  const fora = t => !!(t && t.closest && t.closest('.leaflet-control, .leaflet-popup, a, button, input, select, textarea, label, .fx-alca'));
  const copia = txt => navigator.clipboard && window.isSecureContext ? navigator.clipboard.writeText(txt) : new Promise((ok, erro) => {
    const t = document.createElement('textarea');           // (sem a área de transferência do navegador: o jeito antigo)
    t.value = txt; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
    document.body.append(t); t.select();
    try { if (document.execCommand('copy')) ok(); else erro(); } catch (e) { erro(e); } finally { t.remove(); }
  });
  function cria() {
    menu = L.DomUtil.create('div', 'geo-menu', caixa);
    menu.setAttribute('role', 'dialog');
    menu.hidden = true;
    alvo = L.DomUtil.create('div', 'geo-alvo', caixa);
    alvo.hidden = true;
    L.DomEvent.disableClickPropagation(menu); L.DomEvent.disableScrollPropagation(menu);
    menu.addEventListener('click', e => {
      const b = e.target.closest('.geo-cp');
      if (b) {
        const s = b.querySelector('span'), voz = menu.querySelector('[aria-live]'), v = b.dataset.c;
        copia(v).then(() => { s.textContent = 'Copiado'; voz.textContent = 'Copiado: ' + v; }, () => { s.textContent = 'Não copiou'; })
          .then(() => setTimeout(() => { if (s.isConnected) s.textContent = 'Copiar'; }, 1600));
      } else if (e.target.closest('a.geo-op')) setTimeout(() => fecha(false), 0);   // a aba nova abriu: o menu sai
    });
  }
  // x, y: o ponto no #map (px); deToque: o clique que o navegador manda ao soltar o dedo é engolido
  function abre(x, y, deToque) {
    if (toque) { clearTimeout(toque.t); toque = null; }
    if (!menu) cria();
    const ll = map.containerPointToLatLng([x, y]), la = ll.lat, lo = L.Util.wrapNum(ll.lng, [-180, 180], true);
    const dec = `${GEO.c6(la)}, ${GEO.c6(lo)}`, u = GEO.utm(la, lo).txt;
    menu.setAttribute('aria-label', 'Ponto do mapa ' + dec);
    menu.innerHTML = `<a class="geo-op" href="${GEO.maps(la, lo)}" target="_blank" rel="noopener">${PINO}Abrir no Google Maps</a>` +
      `<a class="geo-op" href="${GEO.earth(la, lo)}" target="_blank" rel="noopener">${GLOBO}Abrir no Google Earth</a>` +
      `<div class="geo-co"><span><small>Graus decimais</small>${dec}</span><button type="button" class="geo-cp" data-c="${dec}" aria-label="Copiar ${dec}">${COPIA}<span>Copiar</span></button></div>` +
      `<div class="geo-co"><span><small>UTM · SIRGAS 2000</small>${u}</span><button type="button" class="geo-cp" data-c="${u}" aria-label="Copiar UTM ${u}">${COPIA}<span>Copiar</span></button></div>` +
      '<span class="vh" aria-live="polite"></span>';
    menu.hidden = false;
    // abaixo e à direita do ponto; sem espaço, do outro lado (sempre dentro da caixa do mapa)
    const cr = caixa.getBoundingClientRect(), mr = mc.getBoundingClientRect(), px = x + mr.left - cr.left, py = y + mr.top - cr.top;
    const w = menu.offsetWidth, h = menu.offsetHeight, W = caixa.clientWidth, H = caixa.clientHeight;
    let l = px + 12, t = py + 12;
    if (l + w > W - 8) l = px - 12 - w;
    if (t + h > H - 8) t = py - 12 - h;
    menu.style.left = Math.max(8, Math.min(l, W - w - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(t, H - h - 8)) + 'px';
    alvo.style.left = px + 'px'; alvo.style.top = py + 'px';
    alvo.hidden = false;
    aberto = true; quando = performance.now(); engole = !!deToque;
    menu.querySelector('a').focus({preventScroll: true});  // teclado: Tab segue pelo menu; Esc fecha
  }
  function fecha(volta) {
    if (!aberto) return;
    aberto = false;
    const tinha = menu.contains(document.activeElement);
    menu.hidden = true; alvo.hidden = true;
    if (tinha && volta !== false) mc.focus({preventScroll: true});
  }
  mc.addEventListener('contextmenu', e => {
    if (fora(e.target)) return;
    e.preventDefault();
    if (performance.now() - quando < 800) return;        // o toque longo daqui já abriu (o do navegador vem depois)
    const r = mc.getBoundingClientRect(), tecla = !e.clientX && !e.clientY;   // tecla de menu (Shift+F10): o centro do mapa
    const deToque = e.pointerType ? e.pointerType !== 'mouse' : !!(e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents);
    abre(tecla ? r.width / 2 : e.clientX - r.left, tecla ? r.height / 2 : e.clientY - r.top, !tecla && deToque);
  }, true);
  // toque longo (dedo ou caneta; o mouse usa o botão direito)
  const solta = e => { if (toque && (!e || e.pointerId === toque.id)) { clearTimeout(toque.t); toque = null; } };
  mc.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    if (toque) { solta(); return; }                        // 2º dedo: é pinça
    if (!e.isPrimary || fora(e.target)) return;
    const x = e.clientX, y = e.clientY;
    toque = {id: e.pointerId, x, y, t: setTimeout(() => {
      toque = null;
      if (map.dragging && map.dragging.moving()) return;
      const r = mc.getBoundingClientRect();
      abre(x - r.left, y - r.top, true);
    }, 500)};
  }, true);
  mc.addEventListener('pointermove', e => { if (toque && e.pointerId === toque.id && Math.hypot(e.clientX - toque.x, e.clientY - toque.y) > 10) solta(); }, true);
  mc.addEventListener('pointerup', solta, true);
  mc.addEventListener('pointercancel', solta, true);
  // o clique de quem abriu o menu pelo toque longo (no mapa ou, perto da borda, no próprio menu), ou de quem tocou no mapa
  // fora do menu para fechá-lo: não chega a ninguém (mapa, marcadores, linhas, modo Limpeza de faixa, links do menu)
  document.addEventListener('click', e => { if (engole) { engole = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  document.addEventListener('pointerdown', e => {
    if (aberto && !menu.contains(e.target)) { fecha(false); engole = mc.contains(e.target) && !fora(e.target) && e.button === 0; }   // (controle, balão: o clique vale)
    else engole = false;                                    // gesto novo: o que sobrou do toque longo não vale mais
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && aberto) { e.stopPropagation(); e.preventDefault(); fecha(); } }, true);
  map.on('movestart zoomstart', () => { solta(); fecha(false); });
  addEventListener('resize', () => fecha(false));
  window.__menuPonto = {aberto: () => aberto, abre, fecha};   // para os testes
}

// ---------- números dos ativos: nenhum embaixo de outro (pedido do usuário: "afastar com linha") ----------
// Os números escritos ao lado dos ativos — DJ e religador (aqui, do zoom 15), chaves 88/faca (chaves.js, do 17),
// transformadores, outros equipamentos e postes (ativos-zoom.js, do 18,5) — são .num-at, com a prioridade em data-np
// (0 DJ, 1 religador, 2 fusível e trip saver, 3 chave, 4 transformador, 5 outros, 6 poste) e o símbolo do ativo em
// [data-ns] (sem ele: o ponto do marcador e o raio data-nr do círculo no canvas). Na ordem da prioridade, cada número fica
// no lugar natural (à direita) se ele estiver livre; senão, colado ao ativo à esquerda, em cima, embaixo ou nas
// diagonais; sem nenhum livre, um pouco mais longe (5 voltas, até 100 px) com uma linha fina até o ativo. Livre: sem cobrir outro
// número, o que está nos marcadores do mapa (nomes dos trechos .lb, datas .limp-tag, NAE .nae-at, pinos .ie…), o símbolo
// ou o ponto de outro ativo (fusíveis, postes e transformadores no canvas) nem os controles por cima do mapa, e inteiro
// na tela se o ativo está nela. Nenhum some: sem lugar livre, fica onde cobre menos.
// Refeito quando o mapa para (fim do zoom e do arrasto: nunca a cada quadro) e quando os marcadores ou as classes que os
// mostram mudam; ativos-zoom.js chama window.__numAtivos.ja() logo depois de pôr os códigos dele (no mesmo quadro: os
// números nunca aparecem um sobre o outro). Uma leitura do layout, a conta e uma escrita (translate e as variáveis da
// linha: atributos, que os observadores dos marcadores, este e o de selecionados.js, não acompanham).
function arranjoNumeros() {
  const mc = map.getContainer(), raiz = map.getPanes().mapPane;
  const VOLTAS = [0, 14, 30, 50, 75, 100];                 // px a mais em cada volta (0: colado, como o lugar natural)
  const DIRS = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];   // direita, esquerda, cima, baixo e diagonais
  const FOLGA = 3, M = 1, PANES = ['markerPane', 'chaves', 'sel-rotulos'];
  const med = {vezes: 0, ms: 0, maxMs: 0, nums: 0, longe: 0, semLugar: 0};
  let pedido = 0;
  const pede = () => { if (!pedido) pedido = requestAnimationFrame(() => {
    pedido = 0;
    const AZ = window.__ativosZoom;
    if (AZ && AZ.pendente && AZ.pendente()) return;        // ativos-zoom.js desenha neste quadro e chama ja() em seguida
    ja();
  }); };
  // classes que mostram ou escondem números e nomes (#map: zoom, NAE, chaves; body: camadas): o resto (a mãozinha do mouse,
  // o arrasto do Leaflet) não pede o arranjo
  const assina = el => String(el.className).split(/\s+/).filter(c => c && !c.startsWith('leaflet-') && !c.endsWith('-mao')).sort().join(' ');
  const ass = new Map();
  const mudou = el => { const a = assina(el); if (ass.get(el) === a) return false; ass.set(el, a); return true; };
  const obs = new MutationObserver(ms => { if (ms.some(m => m.type !== 'attributes' || mudou(m.target))) pede(); });
  [mc, document.body].forEach(el => { ass.set(el, assina(el)); obs.observe(el, {attributes: true, attributeFilter: ['class']}); });
  const vistos = new Set();
  const observa = () => PANES.forEach(n => { const p = map.getPane(n); if (p && !vistos.has(p)) { vistos.add(p); obs.observe(p, {childList: true, subtree: true, characterData: true}); } });
  observa();
  map.on('moveend', pede);
  const cobre = (a, b) => Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const visto = el => !el.checkVisibility || el.checkVisibility({visibilityProperty: true, opacityProperty: true});
  function candidatos(n) {
    const [a0, b0, a1, b1] = n.sim, cx = (a0 + a1) / 2, cy = (b0 + b1) / 2, w = n.w, h = n.h, l = [{r: n.nat, v: 0}];
    VOLTAS.forEach((d, v) => DIRS.forEach(([dx, dy]) => {
      if (!v && dx === 1 && !dy) return;                    // colado à direita: é o lugar natural
      const x = dx > 0 ? a1 + FOLGA + d : dx < 0 ? a0 - FOLGA - d - w : cx - w / 2;
      const y = dy > 0 ? b1 + FOLGA + d : dy < 0 ? b0 - FOLGA - d - h : cy - h / 2;
      l.push({r: [x, y, x + w, y + h], v});
    }));
    return l;
  }
  function solta(el) { el.style.translate = ''; el.classList.remove('num-longe'); el._nx = el._ny = 0; el._nl = ''; }
  // a linha de um número afastado: do ponto da borda dele mais perto do ativo até a borda do símbolo ([x1, y1, x2, y2]; null
  // se ficaria com menos de 3 px)
  function linhaDe(R, sim) {
    const [a0, b0, a1, b1] = sim, cx = (a0 + a1) / 2, cy = (b0 + b1) / 2;
    const qx = Math.max(R[0], Math.min(cx, R[2])), qy = Math.max(R[1], Math.min(cy, R[3])), vx = qx - cx, vy = qy - cy, d = Math.hypot(vx, vy) || 1;
    const ux = vx / d, uy = vy / d, t = Math.min(ux ? (a1 - a0) / 2 / Math.abs(ux) : Infinity, uy ? (b1 - b0) / 2 / Math.abs(uy) : Infinity) + 1.5;
    return d - t > 3 ? [qx, qy, cx + ux * t, cy + uy * t] : null;
  }
  // o segmento s passa pelo retângulo r? (Liang–Barsky)
  function corta(s, r) {
    let t0 = 0, t1 = 1;
    const dx = s[2] - s[0], dy = s[3] - s[1], ps = [-dx, dx, -dy, dy], qs = [s[0] - r[0], r[2] - s[0], s[1] - r[1], r[3] - s[1]];
    for (let i = 0; i < 4; i++) {
      const p = ps[i], q = qs[i];
      if (!p) { if (q < 0) return false; continue; }
      const t = q / p;
      if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
    return t1 - t0 > 0.02;
  }
  // os segmentos a e b se cruzam (no meio: encostar na ponta, como duas linhas que chegam no mesmo ativo, não conta)?
  const lado = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  function cruzam(a, b) {
    const p1 = [a[0], a[1]], p2 = [a[2], a[3]], q1 = [b[0], b[1]], q2 = [b[2], b[3]];
    return lado(p1, p2, q1) * lado(p1, p2, q2) < -1 && lado(q1, q2, p1) * lado(q1, q2, p2) < -1;
  }
  function ja() {
    if (pedido) { cancelAnimationFrame(pedido); pedido = 0; }
    obs.takeRecords();
    if (map._animatingZoom || (map.dragging && map.dragging.moving()) || map.getZoom() < Z_NUM) return;   // (abaixo do 15, nenhum número)
    observa();
    const els = mc.querySelectorAll('.num-at');
    if (!els.length) return;
    const t0 = performance.now(), cr = mc.getBoundingClientRect(), X = cr.left, Y = cr.top, W = cr.width, H = cr.height;
    const rr = q => [q.left - X, q.top - Y, q.right - X, q.bottom - Y];
    // 1) leitura: os números à vista (o lugar natural: o de agora menos o translate daqui), o símbolo de cada um e o que
    // eles não podem cobrir: duros (outros marcadores), moles (símbolos e pontos dos ativos) e os controles do mapa
    const nums = [], icNum = new Set(), duros = [], moles = [], tampa = [];
    for (const el of els) {
      const q = el.getBoundingClientRect();
      if (!q.width) { if (el._nx || el._ny || el._nl) solta(el); continue; }
      const dx = el._nx || 0, dy = el._ny || 0, nat = [q.left - X - dx, q.top - Y - dy, q.right - X - dx, q.bottom - Y - dy];
      if (nat[2] < -150 || nat[0] > W + 150 || nat[3] < -150 || nat[1] > H + 150) continue;   // longe da tela: fica como está
      const ic = el.closest('.leaflet-marker-icon'), s = ic && ic.querySelector('[data-ns]');
      let sim;
      if (s) sim = rr(s.getBoundingClientRect());
      else { const p = (ic || el).getBoundingClientRect(), r = +el.dataset.nr || 4; sim = [p.left - X - r, p.top - Y - r, p.left - X + r, p.top - Y + r]; }
      nums.push({el, nat, w: nat[2] - nat[0], h: nat[3] - nat[1], sim, p: +el.dataset.np || 0, bl: el.clientLeft, bt: el.clientTop});
      moles.push(sim);
      if (ic) icNum.add(ic);
    }
    if (!nums.length) return;
    for (const ic of raiz.querySelectorAll('.leaflet-marker-icon')) {
      const lp = ic._leaflet_pos;                           // o ponto do marcador (sem ler o layout): longe da tela, nem olha
      if (lp) { const c = map.layerPointToContainerPoint(lp); if (c.x < -450 || c.x > W + 250 || c.y < -200 || c.y > H + 250) continue; }
      if (icNum.has(ic)) continue;
      if (ic.querySelector('.num-at')) {                   // número escondido (zoom): o símbolo dele continua no mapa
        for (const s of ic.querySelectorAll('[data-ns]')) { const q = s.getBoundingClientRect(); if (q.width) moles.push(rr(q)); }
        continue;
      }
      for (const ch of ic.children) { const q = ch.getBoundingClientRect(); if (q.width && q.height && visto(ch)) duros.push(rr(q)); }
    }
    const ponto = (lat, lon, r) => { const c = map.latLngToContainerPoint([lat, lon]); if (c.x > -60 && c.y > -60 && c.x < W + 60 && c.y < H + 60) moles.push([c.x - r, c.y - r, c.x + r, c.y + r]); };
    if (fusMarcas && map.hasLayer(fusMarcas) && !fusLonge) {
      const b = map.getBounds().pad(0.1), s = b.getSouth(), n = b.getNorth(), o = b.getWest(), l = b.getEast();
      for (const a of D.fusiveis) if (a.lat >= s && a.lat <= n && a.lon >= o && a.lon <= l) ponto(a.lat, a.lon, 5.5);
    }
    const AZ = window.__ativosZoom;
    if (AZ && AZ.pontos) for (const [lat, lon, r] of AZ.pontos()) ponto(lat, lon, r + 1);
    const sobre = [...mc.querySelectorAll('.leaflet-control')];
    if (mc.parentElement) for (const el of mc.parentElement.children) if (el !== mc && !el.classList.contains('geo-menu') && !el.classList.contains('geo-alvo')) sobre.push(el, ...el.children);
    for (const el of sobre) { const q = el.getBoundingClientRect(); if (q.width && q.height) tampa.push(rr(q)); }
    // 2) a conta: na ordem da prioridade (a ordenação é estável: empate fica na ordem da página)
    nums.sort((a, b) => a.p - b.p);
    const fora = r => r[2] - r[0] < 0 ? 0 : (r[2] - r[0]) * (r[3] - r[1]) - cobre(r, [0, 0, W, H]);
    const postos = [], linhas = [];
    let longe = 0, sem = 0;
    for (const n of nums) {
      const R = VOLTAS[VOLTAS.length - 1] + FOLGA + n.w + n.h + 4, [s0, s1, s2, s3] = n.sim;
      const perto = o => o[0] < s2 + R && o[2] > s0 - R && o[1] < s3 + R && o[3] > s1 - R;
      // fora da tela: o ativo à vista quer o número inteiro à vista (o lugar natural cortado pela borda não está livre)
      const du = duros.filter(perto), mo = moles.filter(o => o !== n.sim && perto(o)), ta = tampa.filter(perto), po = postos.filter(perto);
      const f0 = s0 >= 0 && s1 >= 0 && s2 <= W && s3 <= H ? 0 : fora(n.nat);
      // custo de cada lugar: cobrir (px²) outro número ou marcador vale 10, um símbolo ou controle 4; a linha passar por
      // outro número, marcador ou linha 60, por outro ativo 20; sair da tela 2 (px²); cada volta 30. O 1º sem nada disso (na
      // ordem: natural, colado, voltas) fica; senão, o de menor custo (o lugar livre cuja linha passa por um ativo ganha
      // de cobrir alguma coisa)
      let melhor = null, menor = Infinity, livre = false;
      for (const c of candidatos(n)) {
        const r = [c.r[0] - M, c.r[1] - M, c.r[2] + M, c.r[3] + M], li = c.v ? linhaDe(c.r, n.sim) : null;
        let d = 0, m = 0, x = 0;
        for (const o of po) { d += cobre(r, o); if (li && corta(li, o)) x += 60; }
        for (const o of du) { d += cobre(r, o); if (li && corta(li, o)) x += 60; }
        for (const o of mo) { m += cobre(r, o); if (li && corta(li, o)) x += 20; }
        for (const o of ta) m += cobre(r, o);
        for (const l of linhas) { if (corta(l, r)) d += 30; if (li && cruzam(l, li)) x += 60; }
        const f = Math.max(0, fora(c.r) - f0 - 0.5);
        if (!d && !m && !x && !f) { melhor = c; livre = true; break; }
        const custo = d * 10 + m * 4 + x + f * 2 + c.v * 30;
        if (custo < menor) { menor = custo; melhor = c; livre = !d && !m && !f; }
      }
      if (!livre) sem++;
      n.esc = melhor;
      postos.push(melhor.r);
      const li = melhor.v && linhaDe(melhor.r, n.sim);
      if (li) linhas.push(li);
    }
    // 3) escrita: o deslocamento de cada número e a linha dos afastados (do ponto da borda do número mais perto do ativo
    // até a borda do símbolo)
    for (const n of nums) {
      const el = n.el, c = n.esc, dx = Math.round(c.r[0] - n.nat[0]), dy = Math.round(c.r[1] - n.nat[1]);
      if (dx !== (el._nx || 0) || dy !== (el._ny || 0)) { el.style.translate = dx || dy ? `${dx}px ${dy}px` : ''; el._nx = dx; el._ny = dy; }
      let linha = '';
      const R = [n.nat[0] + dx, n.nat[1] + dy, n.nat[2] + dx, n.nat[3] + dy], li = c.v && linhaDe(R, n.sim);
      if (li) linha = `${(li[0] - R[0] - n.bl).toFixed(1)}|${(li[1] - R[1] - n.bt).toFixed(1)}|${Math.hypot(li[2] - li[0], li[3] - li[1]).toFixed(1)}|` +
        (Math.atan2(li[3] - li[1], li[2] - li[0]) * 180 / Math.PI).toFixed(1);
      if (linha !== (el._nl || '')) {
        el._nl = linha;
        if (linha) {
          const [lx, ly, ll, la] = linha.split('|');
          el.style.setProperty('--lx', lx + 'px'); el.style.setProperty('--ly', ly + 'px'); el.style.setProperty('--ll', ll + 'px'); el.style.setProperty('--la', la + 'deg');
        }
        el.classList.toggle('num-longe', !!linha);
      }
      if (linha) longe++;
    }
    const ms = performance.now() - t0;
    Object.assign(med, {vezes: med.vezes + 1, ms: med.ms + ms, maxMs: Math.max(med.maxMs, ms), nums: nums.length, longe, semLugar: sem});
  }
  window.__numAtivos = {ja, med: () => Object.assign({}, med)};   // ja: ativos-zoom.js; med: os testes e as medidas
}

$('busca').addEventListener('input', e => {
  const q = e.target.value.trim();
  desenhaLista(q);
  const qq = q.toLowerCase();
  if (!qq) return;
  if (TR[q.toUpperCase()]) return selecionar(q.toUpperCase(), true);
  const at = D.trechos.find(t => t.inicio.toLowerCase() === qq);
  if (at) return selecionar(at.nome, true);
  const v = D.vaos.find(v => String(v[6]).toLowerCase() === qq || String(v[7]).toLowerCase() === qq);
  if (v) { selecionar(D.trechos[v[4]].nome, false, v); if (map) map.setView([v[2], v[3]], Math.max(map.getZoom(), 17)); }
});
// até 980 px o mapa fica fixo no alto da tela: o foco do teclado que cai embaixo dele (Shift+Tab, setas) desce para a vista.
// (scroll-padding no html faria o mesmo, mas aí focar um controle do próprio mapa rolava a página para cima.)
document.addEventListener('focusin', () => requestAnimationFrame(() => {   // depois da rolagem que o próprio navegador faz ao focar
  const el = document.activeElement, mb = document.querySelector('.mapbox');
  if (!el || !mb || mb.contains(el) || !matchMedia('(max-width:980px)').matches || document.body.classList.contains('tela-cheia')) return;
  if (!(mb.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) || !el.matches(':focus-visible')) return;
  const fundo = mb.getBoundingClientRect().bottom + 8, r = el.getBoundingClientRect();
  if (r.top < fundo) window.scrollBy(0, r.top - fundo);
}));
window.__sel = selecionar;
window.__periodoNae = () => NAE ? periodo() : '';         // lupa-painel.js: o período junto da NAE da lista suspensa
window.__clique = clique;
window.__selecao = () => multi.length ? multi.slice() : sel ? [sel] : [];   // trechos escolhidos (croqui da faixa)
window.__limpar = limpar;
// O que os alimentadores selecionados (assets/selecionados.js) usam daqui para ficar iguais a este no mapa e no painel:
// as mesmas funções, com o alimentador (cx, os dados d, a NAE N, os trechos T) como argumento; o padrão de todas é este
window.__alKit = {EU, prepara, rotNae, papelDe, cadeias, vaoPerto, htmlRotulo, zRot, pinosDe, camadaNae, principal, contagem, doTrecho,
  periodo, detalhe, detalheVarios, mostraDet, naeMapa: () => naeMapa, comCtrl, COR_Z, TIPO, esc, km, fimTxt, Z_EQUIP, Z_NUM, Z_EQ_LONGE};
// Sem o mapa (Leaflet não carregou) a rede já "está pronta": só o resumo e a lista
if (!map) { AL.espera(comeco(AL.cede).catch(e => console.error(e))); fimLinhas(); fimRede(); document.dispatchEvent(new Event('al:linhas')); document.dispatchEvent(new Event('al:rede')); }
AL.rede.then(listaAosPoucos);
