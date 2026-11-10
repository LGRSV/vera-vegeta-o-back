const D = window.D;
const COR_Z = {1:'#3b82f6', 2:'#22c55e', 3:'#facc15', 4:'#f97316', 5:'#ef4444'};
D.trechos.forEach(t => {
  t.cor = COR_Z[t.zona] || '#d946ef';                  // cor pela classe: T2, T2-A, T2-B… na mesma cor
  t.peso = t.tipo === 'principal' ? 6 : t.tipo === 'ramal' ? 4.5 : 3;
});
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
const leg = [['T1', COR_Z[1], ''], [nRamal > 1 ? 'T2, T2-A, T2-B…' : nRamal ? 'T2, T2-A' : 'T2', COR_Z[2], '']];
[3, 4, 5].forEach(z => { if (D.trechos.some(t => t.zona === z)) leg.push([`T${z}-…`, COR_Z[z], 'fino']); });
if (D.trechos.some(t => t.zona > 5)) leg.push(['T6+', '#d946ef', 'fino']);
$('legenda').innerHTML = leg.map(([n, c, k]) => `<span><i class="${k}" style="--c:${c}"></i>${esc(n)}</span>`).join('');

// interrupções (NAE): coletiva = atuou DJ, religador, fusível ou trafo; individual = um consumidor
const NAE = D.nae || null;
const ROT_NAE = ((D.meta || {}).origem || {}).nae_filtro === 'arvore' ? 'NAE - vegetação' : 'NAE';   // NAE só de árvore/eucalipto
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotMes1 = m => `${MESES[+m.slice(5, 7) - 1]}/${m.slice(0, 4)}`;
// meses escolhidos (botão #mes, lista de marcar): vazio = todos
const mesSel = new Set();
const noPeriodo = m => !mesSel.size || mesSel.has(m);
const escolhidos = () => NAE.meses.filter(noPeriodo);
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
function periodo() {
  const ms = escolhidos();
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
const doMes = () => NAE ? filtra(NAE.oc) : [];            // NAE deste alimentador (Crítica): o total do alimentador
const doExt = () => NAE ? filtra(NAE.ext) : [];           // NAE de outro alimentador cujo ativo hoje está num trecho daqui
const doTrecho = () => [...doMes(), ...doExt()];          // bloco do trecho: soma a NAE de todos os ativos do trecho
function contagem() { const c = {}; doTrecho().forEach(o => { if (o.trecho) c[o.trecho] = (c[o.trecho] || 0) + 1; }); return c; }
function chiTrecho() { const c = {}; doTrecho().forEach(o => { if (o.trecho) c[o.trecho] = (c[o.trecho] || 0) + chiOc(o); }); return c; }
const raizAl = location.pathname.includes('/alimentadores/') ? '../' : null;   // no site: link para o outro alimentador
function listaOc(os, comTrecho) {
  return `<ul class="oc">${os.map(o => `<li class="${o.col ? 'col' : ''}"><span class="q">${comTrecho ? `<b>${esc(o.trecho)}</b> · ` : ''}${esc(o.dia)} · ${!o.col ? '1 consumidor · trafo ' + esc(o.ativo) : esc(ABR[o.abr] || o.abr) + ' ' + esc(o.prob || o.ativo) + (o.prob && o.prob !== o.ativo ? ' · trafo ' + esc(o.ativo) : '')}</span><br>` +
    `${esc(o.sub || o.causa)}${o.prog ? ' · <b>programada</b>' : ''} · ${o.cons} cons. · ${o.dur} min` +
    (o.lonlat && map ? ` · <button type="button" class="ir" data-ll="${o.lonlat[1]},${o.lonlat[0]}">ver no mapa</button>` : '') +
    // DJ e religador: o ativo é a proteção que abriu, não o ponto do defeito (regra aprovada: marca, não tira da conta)
    (o.abr === 'DJ' ? '<br><b>atuou o disjuntor</b>: o defeito está em algum ponto depois dele' : o.abr === 'RL' ? '<br><b>atuou o religador</b>: o defeito está em algum ponto depois dele' : '') +
    (o.de ? `<br><b>registrada no ${raizAl ? `<a href="${raizAl}${encodeURIComponent(o.de)}/">${esc(o.de)}</a>` : esc(o.de)}</b> (a Crítica conta lá; o ativo hoje fica aqui)` : '') +
    (o.hoje ? `<br>ativo hoje no ${raizAl && o.hoje[1] ? `<a href="${raizAl}${encodeURIComponent(o.hoje[0])}/?t=${encodeURIComponent(o.hoje[1])}">${esc(o.hoje[0])} · ${esc(o.hoje[1])}</a>` : esc(o.hoje[0]) + (o.hoje[1] ? ' · ' + esc(o.hoje[1]) : '')}${o.hoje[1] ? ' (conta também lá)' : ''}` : '') +
    `</li>`).join('')}</ul>`;
}
function blocoNae(nome, l) {
  const os = doTrecho().filter(o => (l || [nome]).includes(o.trecho)), col = os.filter(o => o.col).length, ext = os.filter(o => o.de).length;
  const ind = $('ind').checked ? ` · ${os.length - col} individua${os.length - col === 1 ? 'l' : 'is'}` : '';
  const tip = tiposOc(os);
  return `<dt class="nae">${ROT_NAE}</dt><dd class="nae"><b>${os.length}</b> · ${periodo()} (${col} coletiva${col === 1 ? '' : 's'}${ind}${ext ? ` · ${ext} registrada${ext === 1 ? '' : 's'} em outro alimentador` : ''})` +
    `${tip ? `<br><small>${tip}${os.length ? ` · ${chiTxt(chi(os), chiEst(os))}` : ''}</small>` : ''}${os.length ? listaOc(os, !!l) : ''}</dd>`;
}
function atualizaNae() {
  desenhaLista($('busca').value);
  multi.length ? detalheVarios(multi) : sel ? detalhe(TR[sel]) : resumo();
  marcaNae(multi.length ? multi : sel ? [sel] : null);
  const c = contagem();
  Object.entries(rotulos).forEach(([n, m]) => { const el = m.getElement(); if (el) { el.firstChild.innerHTML = esc(n) + (c[n] ? `<span class="n">${c[n]}</span>` : ''); el.firstChild.classList.toggle('oc', !!c[n]); } });
  rotulosT3();
}
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
const GRUPOS = [['principal', 'T1 e T2'], ['ramal', 'T2-A, T2-B… (um por religador)'], ['fusivel', 'Depois de fusível']];
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
  if (document.activeElement === $('busca')) return;   // digitando na busca: o campo fica onde está
  const det = $('det').getBoundingClientRect().top;
  if (p) { if (det < v.top || det > v.top + (v.bottom - v.top) / 2) rolaPara(p, p.scrollTop + det - v.top - 8); }   // painel: o detalhe vai para o alto
  else if (det < v.top) rolaPara(null, scrollY + det - v.top - 8);   // página (celular): só desce o detalhe que ficou escondido sob o mapa
}

// UCs ligadas por trecho (planilha UC por trafo): dados/ucs/<AL>.json, lido uma vez; sem o arquivo a linha "Clientes" não aparece
const UCS_P = fetch(`../../dados/ucs/${encodeURIComponent((D.meta || {}).al || '')}.json`).then(r => r.ok ? r.json() : {}).catch(() => ({}));
function poeUc(u, nomes) {
  const dd = $('uc-dd'), dt = $('uc-dt');
  if (!dd || dd.dataset.t !== nomes.join('|') || !Object.keys(u).length) return;      // outro trecho já foi aberto, ou sem arquivo
  const e = nomes.map(n => u[n] || [0, 0, 0]), dir = e.reduce((s, x) => s + x[0], 0), tr = e.reduce((s, x) => s + x[2], 0);
  const fmt = n => n.toLocaleString('pt-BR'), trafos = ` · ${tr} trafo${tr === 1 ? '' : 's'}`;
  dd.innerHTML = nomes.length === 1
    ? `<b>${fmt(e[0][1])}</b> UC${e[0][1] === 1 ? '' : 's'} ligada${e[0][1] === 1 ? '' : 's'} (trecho e a jusante)${e[0][1] !== dir ? ` · ${fmt(dir)} nos trafos do próprio trecho` : ''}${trafos}`
    : `<b>${fmt(dir)}</b> UC${dir === 1 ? '' : 's'} ligada${dir === 1 ? '' : 's'} nos trafos dos trechos${trafos}`;
  dt.style.display = dd.style.display = '';
}
const LINHA_UC = nomes => `<dt id="uc-dt" style="display:none">Clientes</dt><dd id="uc-dd" style="display:none" data-t="${nomes.map(esc).join('|')}"></dd>`;
// detalhe
function detalhe(t, vao) {
  const chip = n => `<button class="chip" data-t="${esc(n)}">${esc(n)}</button>`;
  const chips = l => l.length ? `<div class="chips">${l.slice(0, 8).map(chip).join('')}` +   // muitos: os 8 primeiros e o resto ao pedir
    (l.length > 8 ? `<details class="mais"><summary>mais ${l.length - 8}</summary><div class="chips">${l.slice(8).map(chip).join('')}</div></details>` : '') + '</div>' : '—';
  const tipoTxt = {principal: t.zona === 1 ? 'tronco T1' : 'tronco T2', ramal: t.tronco ? 'T2 · tronco' : 'T2 · ramal', fusivel: `depois de fusível · T${t.zona}`}[t.tipo];
  $('det').innerHTML = `<h2 tabindex="-1"><i style="--c:${t.cor}"></i>${esc(t.nome)} <small>${tipoTxt}</small></h2>${FECHA}<dl>
    <dt>Início</dt><dd><span class="mono">${esc(t.inicio)}</span> · ${TIPO[t.inicio_tipo] || t.inicio_tipo} · poste ${esc(t.inicio_poste)}</dd>
    ${t.passa.length ? `<dt>Passa por</dt><dd class="mono">${t.passa.map(esc).join(', ')}</dd>` : ''}
    <dt>Fim</dt><dd class="mono">${t.fim.map(esc).join('<br>')}</dd>
    <dt>Extensão</dt><dd>${km(t.ext)} · ${nv(t.qtd)}</dd>
    ${t.fase ? `<dt>Fases</dt><dd>${esc(t.fase)}${t.fases && Object.keys(t.fases).length > 1 ? ' · ' + Object.entries(t.fases).map(([f, m]) => `${esc(f)} ${km(m)}`).join(' · ') : ''}</dd>` : ''}
    <dt>Vem de</dt><dd>${t.pai ? chips([t.pai]) : '—'}</dd>
    <dt>Derivações</dt><dd>${chips(t.derivacoes)}</dd>
    ${LINHA_UC([t.nome])}
    ${NAE ? blocoNae(t.nome) : ''}
    ${vao ? `<dt>Vão</dt><dd class="mono">${esc(vao[5])} · poste ${esc(vao[6])} → ${esc(vao[7])} · ${Math.round(vao[8])} m</dd>` : ''}
  </dl>`;
  UCS_P.then(u => poeUc(u, [t.nome]));
}
// vários trechos (Ctrl ou ⌘ + clique): soma de extensão e NAE, e cada trecho com o seu
function detalheVarios(l) {
  const ts = l.map(n => TR[n]), ext = ts.reduce((s, t) => s + t.ext, 0), c = NAE ? contagem() : {};
  const nae = NAE ? blocoNae(null, l) : '';
  $('det').innerHTML = `<h2 tabindex="-1">${l.length} trechos <small>${km(ext)} · ${nv(ts.reduce((s, t) => s + t.qtd, 0))}</small></h2>${FECHA}
    <div class="varios">${ts.map(t => `<div><button class="chip" data-t="${esc(t.nome)}">${esc(t.nome)}</button><span>${km(t.ext)}</span>` +
      `${NAE ? `<span><b>${c[t.nome] || 0}</b> NAE</span>` : ''}<small class="mono">${esc(t.inicio)} → ${esc(fimTxt(t).replace('fim de linha · poste ', 'fim '))}</small></div>`).join('')}</div><dl>
    <dt>Extensão</dt><dd>${km(ext)} somados</dd>
    ${LINHA_UC(l)}
    ${nae}
  </dl><p class="lede so-mouse">Ctrl (⌘ no Mac) + clique põe ou tira um trecho. Clique sem Ctrl volta a um trecho só.</p>`;
  UCS_P.then(u => poeUc(u, l));
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
  $('det').innerHTML = `${tabela}
  ${NAE ? `<dl>${resumoNae()}</dl>` : ''}`;
}
$('det').addEventListener('click', e => {
  const v = e.target.closest('[data-ll]');               // ocorrência da lista: vai até o ativo no mapa
  if (v) {
    if (!map) return;
    map.setView(v.dataset.ll.split(',').map(Number), 18);
    const r = $('map').getBoundingClientRect();          // o mapa fica fixo no alto: só rola se ele estiver fora da tela
    if (r.bottom < 0 || r.top > innerHeight) $('map').scrollIntoView({block: 'nearest'});
    return;
  }
  const b = e.target.closest('.chip, #todos'); if (!b) return;
  const tinhaFoco = b.contains(document.activeElement);  // o detalhe é refeito: o foco do teclado volta ao título dele (não cai no body)
  b.id === 'todos' ? limpar() : clique(b.dataset.t, e, true);
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
const classeDe = nome => nome.split('-')[0];          // nome do trecho → [polyline com todos os vãos, vãos]; rótulos no mapa
let halo = null, marcas = null;
let fimDe = null, iniDe = null;                            // índices (sem eles cada um dos ~2.000 fusíveis varria todos os trechos), montados no 1º balão
const papel = nome => {
  if (!fimDe) {
    fimDe = {}; iniDe = {};
    D.trechos.forEach(t => { t.fim.forEach(f => (fimDe[f] = fimDe[f] || []).push(t.nome)); (iniDe[t.inicio] = iniDe[t.inicio] || []).push(t.nome); });
  }
  return [...(iniDe[nome] || []).map(n => 'início do ' + n), ...(fimDe[nome] || []).map(n => 'fim do ' + n)].join(' · ');
};
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
  const pino = (pt, cls, tag, txt) => L.marker(pt, {interactive: false, zIndexOffset: 900, icon: L.divIcon({className: '', iconSize: null, html: `<div class="ie ${cls}"><em>${tag}</em>${esc(txt)}</div>`})});
  const t = TR[nomes[0]];
  marcas = L.layerGroup(nomes.length > 1 ? nomes.map(n => pino([TR[n].inicio_lat, TR[n].inicio_lon], 'ini', esc(n), TR[n].inicio))
    : [pino([t.inicio_lat, t.inicio_lon], 'ini', 'INÍCIO', t.inicio),
      ...t.fim.map((f, i) => pino(t.fim_pts[i], 'fim', 'FIM', f.replace('fim de linha · poste ', 'poste ') + (f.startsWith('fim de linha') ? ' (fim de linha)' : '')))]).addTo(map);
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
function avisaSel(nomes) { const f = window.__onSel; if (f) f(nomes); }
// ativos com NAE nos trechos escolhidos: um marcador vermelho por ativo, com quantas NAE teve (mês e filtro da tela)
let naeMarcas = null;
function marcaNae(nomes) {
  if (naeMarcas) { naeMarcas.remove(); naeMarcas = null; }
  if (!map || !NAE || !nomes) return;
  const g = {};
  doTrecho().forEach(o => { if (o.lonlat && nomes.includes(o.trecho)) { const k = o.ativo + '|' + o.trecho; (g[k] = g[k] || {o, n: 0, de: new Set()}).n++; if (o.de) g[k].de.add(o.de); } });
  naeMarcas = L.layerGroup(Object.values(g).map(({o, n, de}) => L.marker([o.lonlat[1], o.lonlat[0]], {zIndexOffset: 950, keyboard: false,
    icon: L.divIcon({className: '', iconSize: null, html: `<div class="nae-at">${n}</div>`})})
    .bindTooltip(`${esc(ABR[o.abr] || o.abr)} ${esc(o.ativo)} · ${n} NAE · ${esc(o.trecho)}${de.size ? ' · registrada no ' + esc([...de].join(', ')) : ''}`, {direction: 'top'})
    .on('click', e => { L.DomEvent.stopPropagation(e); map.setView(e.latlng, Math.max(map.getZoom(), 17)); }))).addTo(map);
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
// rótulos: T1/T2 sempre; T3 só de perto e só os que estão na tela (mais leve em alimentador grande)
function rotulo(t, c) {
  const m = L.marker(t.rotulo, {icon: L.divIcon({className: '', iconSize: null, html: `<div class="lb ${t.tipo === 'fusivel' ? 'fus' : ''}${escolhido(t.nome) ? ' sel' : ''}${c && c[t.nome] ? ' oc' : ''}" style="--c:${t.cor}">${esc(t.nome)}${c && c[t.nome] ? `<span class="n">${c[t.nome]}</span>` : ''}</div>`}), zIndexOffset: t.tipo === 'fusivel' ? 0 : 400})
    .bindTooltip(`${esc(t.inicio)} → ${esc(fimTxt(t))}`, {direction: 'top'})
    .on('click', e => { L.DomEvent.stopPropagation(e); clique(t.nome, e.originalEvent, false); }).addTo(map);
  rotulos[t.nome] = m;
}
function mostraClasses() {
  if (!map) return;
  Object.entries(linhas).forEach(([n, [l]]) => { const v = visivel[classeDe(n)]; if (v && !map.hasLayer(l)) l.addTo(map); else if (!v && map.hasLayer(l)) l.remove(); });
  D.trechos.forEach(t => { if (t.tipo === 'fusivel') return;
    const v = visivel[classeDe(t.nome)];
    if (v && !rotulos[t.nome]) rotulo(t, contagem()); else if (!v && rotulos[t.nome]) { rotulos[t.nome].remove(); delete rotulos[t.nome]; } });
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
  const perto = map.getZoom() >= 15.5, b = map.getBounds().pad(0.2), c = contagem();
  D.trechos.forEach(t => {
    if (t.tipo !== 'fusivel') return;
    const ver = visivel.T3 && (escolhido(t.nome) || c[t.nome] || (perto && b.contains(t.rotulo)));
    if (ver && !rotulos[t.nome]) rotulo(t, c);
    else if (!ver && rotulos[t.nome]) { rotulos[t.nome].remove(); delete rotulos[t.nome]; }
  });
}

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
  const Satelite = L.TileLayer.extend({
    getTileUrl: c => `${SAT}${c.z}/${c.y}/${c.x}?blankTile=false`,
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
  const ren = map.options.renderer;                       // o canvas da rede
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
    const m = e.layer;
    if (!m.getTooltip()) balaoF(m, e);
    L.DomEvent.stopPropagation(e);
    if (m._al.trecho) clique(m._al.trecho, e.originalEvent, false);
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
  function poeFusivel() {
    const a = D.fusiveis[iFus++];
    const m = L.circleMarker([a.lat, a.lon], {radius: 4, color: '#111', weight: 1.5, fillColor: a.t === 'SEC' || a.t === 'FTR' ? '#9ca3af' : '#fff', fillOpacity: 1});
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
      D.principais.forEach(a => {
        L.marker([a.lat, a.lon], {icon: L.divIcon({className: '', iconSize: null, html: `<div class="at"><b>${a.t === 'DJ' ? 'DJ' : '79'}</b><span>${esc(a.nome)}</span></div>`}), zIndexOffset: 500})
          .bindTooltip(`${esc(a.nome)} · ${esc(TIPO[a.t])} · poste ${esc(a.poste)}${papel(a.nome) ? ' · ' + esc(papel(a.nome)) : ''}`, {direction: 'top'}).addTo(map);
      });
      let c = contagem();
      D.trechos.forEach(t => { if (t.tipo !== 'fusivel' && visivel[classeDe(t.nome)] && !rotulos[t.nome]) rotulo(t, c); });
      // até aqui tudo saiu em sequência, na frente dos scripts seguintes; o quadro que vem agora (pedido no começo deste
      // script, por isso também na frente deles) mostra o tronco. Daqui em diante, um pouco por quadro
      await AL.cede();
      // rótulos de T3: os mesmos que rotulosT3() põe (escolhido, com NAE, ou de perto e na tela)
      let perto, b;
      const estado = () => { c = contagem(); perto = map.getZoom() >= 15.5; b = map.getBounds().pad(0.2); };
      estado();
      for (const t of D.trechos) {
        if (t.tipo !== 'fusivel') continue;
        if (visivel.T3 && !rotulos[t.nome] && (escolhido(t.nome) || c[t.nome] || (perto && b.contains(t.rotulo)))) rotulo(t, c);
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
  const zoomClasse = () => $('map').classList.toggle('longe', map.getZoom() < 15.5);
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
// Sem o mapa (Leaflet não carregou) a rede já "está pronta": só o resumo e a lista
if (!map) { AL.espera(comeco(AL.cede).catch(e => console.error(e))); fimLinhas(); fimRede(); document.dispatchEvent(new Event('al:linhas')); document.dispatchEvent(new Event('al:rede')); }
AL.rede.then(listaAosPoucos);
