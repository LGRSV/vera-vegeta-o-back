// Painel do alimentador: a lupa do ARGOS (como na página inicial) no lugar da busca solta, dos botões T1 T2 T3 e do "Menu"
// das camadas em cima do mapa. A barra fica DENTRO do mapa, no canto de cima: de primeira só o olho do ARGOS; tocar no olho
// abre olho · campo "Trecho, ativo ou poste" · botão Filtros, com a lista das classes. Tocar de novo no olho (campo vazio),
// Esc ou clicar fora (campo vazio) fecha e fica só o olho. Escolher um trecho ou um resultado também fecha.
// - Olho (ou o campo vazio com foco): lista suspensa com as classes T1, T2 e T3 (trechos, km e NAE no período). Tocar na
//   classe abre os trechos dela (maior NAE primeiro); tocar num trecho escolhe ele no mapa. O olho de cada classe mostra ou
//   esconde a classe no mapa. Embaixo, as camadas do Menu (Faixa, Inspeção, Insp→manut, Manutenção).
//   Classes e camadas usam os próprios botões de alimentador.js e extras.js (que ficam escondidos): a lógica é a mesma.
// - Filtros: menu suspenso com o município e os meses do NAE (os mesmos controles de extras.js e alimentador.js, só mudam de
//   lugar); o número no botão diz quantos filtros estão ligados.
// - Ao digitar: outra lista suspensa, com os resultados em grupos (como a busca da página inicial): trechos (nome ou
//   chave de início, fim ou passagem), chaves e ativos do alimentador, postes e OS das camadas. Marcar (setas ou mouse)
//   acende no mapa sem mudar a seleção; escolher (clique ou Enter) seleciona e enquadra. Esc fecha. O filtro da lista do
//   painel (alimentador.js) continua por trás.
// - Tela cheia: igual (pedido do usuário): a barra fica dentro do mapa, só o olho, e os botões antigos T1 T2 T3 / Menu
//   não voltam. O painel lateral (a gaveta de telacheia.js, que abria pelo item "Painel" do Menu) abre pelo item
//   "Painel" no alto da lista do olho.
(function () {
  const barra = document.querySelector('.barra-busca'), linha = barra && barra.querySelector('.barra-linha'), q = document.getElementById('busca');
  if (!barra || !linha || !q || barra.querySelector('.lp-lupa')) return;   // sem a barra (mapa não carregou): fica como antes
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pasta = ((document.currentScript && document.currentScript.src) || '').replace(/[^/]*$/, '');   // a pasta assets/
  const D = window.D || { trechos: [] };
  const mil = n => Number(n).toLocaleString('pt-BR');
  const km = m => m < 1000 ? Math.round(m) + ' m' : (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' km';
  const classe = n => n.split('-')[0];
  const CLS = ['T1', 'T2', 'T3'];
  const btCls = c => document.querySelector(`#classes button[data-c="${c}"]`);
  const visivel = c => (window.__visivel || {})[c] !== false;

  // ---------- barra: olho · campo · Filtros ----------
  linha.classList.add('lp-linha');
  q.placeholder = 'Trecho, ativo ou poste';              // cabe no celular ao lado do olho e do Filtros
  const lupa = document.createElement('button');
  lupa.type = 'button';
  lupa.className = 'lp-lupa';
  lupa.setAttribute('aria-expanded', 'false');
  lupa.innerHTML = `<img src="${esc(pasta)}argos.png" alt="" width="34" height="23"><b class="lp-ln" hidden></b>`;   // lp-ln: filtros ligados (barra fechada)
  linha.prepend(lupa);

  const filtros = linha.querySelector('.filtros'), ctrl = document.getElementById('ctrl');
  const temFiltro = !!((filtros && filtros.querySelector('select')) || (ctrl && !ctrl.hidden));
  const bf = document.createElement('button');
  bf.type = 'button';
  bf.className = 'lp-fbt';
  bf.id = 'lp-fbt';
  bf.setAttribute('aria-expanded', 'false');
  bf.setAttribute('aria-controls', 'lp-fdrop');
  bf.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 5h17l-6.5 8v5.5l-4 2V13z"/></svg><span class="lp-ftxt">Filtros</span><b class="lp-fn" hidden></b>';
  bf.hidden = !temFiltro;
  q.after(bf);

  const drop = document.createElement('div');
  drop.className = 'lp-drop';
  drop.id = 'lp-drop';
  drop.hidden = true;
  const fdrop = document.createElement('div');
  fdrop.className = 'lp-fdrop';
  fdrop.id = 'lp-fdrop';
  fdrop.setAttribute('role', 'group');
  fdrop.setAttribute('aria-label', 'Filtros: município e meses do NAE');
  fdrop.hidden = true;
  fdrop.innerHTML = '<p class="lp-t">Filtros</p>';
  if (filtros) fdrop.append(filtros);                    // município (extras.js): o ouvinte vai junto com o elemento
  if (ctrl) fdrop.append(ctrl);                          // meses do NAE e "Contar individuais" (alimentador.js)
  linha.after(drop, fdrop);

  // ---------- Filtros: quantos estão ligados (município escolhido, meses diferentes de todos) ----------
  const fmun = document.getElementById('f-mun');
  function contaFiltros() {
    const tds = document.querySelector('#mes-lista .mes-tds input');
    const partes = [];
    if (fmun && fmun.value) partes.push(fmun.selectedOptions[0].textContent.replace(/\s*\(.*\)$/, ''));
    if (tds && !tds.checked) partes.push((document.querySelector('#mes .mes-txt') || {}).textContent || 'meses');
    const n = bf.querySelector('.lp-fn');
    n.hidden = !partes.length;
    n.textContent = partes.length;
    bf.title = partes.length ? 'Filtros: ' + partes.join(' · ') : 'Filtros: todos os municípios e meses';
    bf.setAttribute('aria-label', partes.length ? `Filtros, ${partes.length} ligado${partes.length > 1 ? 's' : ''}: ${partes.join(', ')}` : 'Filtros: nenhum ligado');
    const ln = lupa.querySelector('.lp-ln');             // com a barra fechada, o olho mostra quantos filtros estão ligados
    ln.hidden = !partes.length;
    ln.textContent = partes.length;
    filtrosTxt = partes.length ? ` (${partes.length} filtro${partes.length > 1 ? 's' : ''} ligado${partes.length > 1 ? 's' : ''})` : '';
    rotuloOlho();
  }
  let filtrosTxt = '';
  fdrop.addEventListener('change', () => setTimeout(contaFiltros, 0));   // depois do ouvinte de alimentador.js
  const mesTxt = document.querySelector('#mes .mes-txt');
  if (mesTxt) new MutationObserver(contaFiltros).observe(mesTxt, { childList: true, characterData: true, subtree: true });
  contaFiltros();

  // ---------- lista suspensa do olho: classes (com os trechos) e camadas ----------
  let aberta = null;                                     // classe aberta na lista (T1, T2, T3) ou null
  const LOTE = 150;                                      // trechos por vez (alimentador grande tem quase 2.000 T3)
  let limite = LOTE;
  // uma passada pela lista do painel: a NAE de cada trecho no período (o número da própria lista) e as linhas escondidas
  function leLista() {
    const nae = {}, escondida = new Set();
    let tem = false;
    document.querySelectorAll('#lista .row').forEach(r => {
      const s = r.querySelector('strong.nae');
      if (s) { tem = true; nae[r.dataset.t] = parseInt(s.textContent, 10) || 0; }
      if (r.hidden) escondida.add(r.dataset.t);
    });
    return { nae: tem ? nae : null, escondida };
  }
  // com a classe à vista, uma linha escondida na lista é filtro de município: o trecho sai daqui também
  const OLHO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="o" d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle class="o" cx="12" cy="12" r="2.8"/><path class="x" d="M4 4l16 16"/></svg>';
  // painel lateral da tela cheia (telacheia.js): o item "Painel" que ele põe no Menu do mapa (escondido) ou o "☰ Painel"
  const botaoPainel = () => document.querySelector('.tc-painel-m') || document.querySelector('.tc-ctl .tc-painel');
  const ICO_PN = '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M14.5 4.5v15M17 9h1M17 12h1"/></svg>';
  const pill = n => n == null ? '' : `<i class="lp-n${n ? '' : ' zero'}">${mil(n)}<span class="vh"> NAE</span></i>`;
  function desenha() {
    const { nae, escondida } = leLista(), cor = c => { const b = btCls(c); return b ? b.style.getPropertyValue('--c') : ''; };
    const doCls = c => D.trechos.filter(t => classe(t.nome) === c && (!visivel(c) || !escondida.has(t.nome)));
    let html = '';
    if (!aberta) {
      if (document.body.classList.contains('tela-cheia') && botaoPainel()) html +=
        `<button type="button" class="lp-op lp-pn" aria-pressed="${document.body.classList.contains('tc-gaveta')}"><span class="lp-pi" aria-hidden="true">${ICO_PN}</span>` +
        '<span class="lp-x"><b>Painel</b><small>Resumo, lista dos trechos e detalhe</small></span><span class="lp-seta" aria-hidden="true">›</span></button>';
      html += '<p class="lp-t">Classes</p>' + CLS.filter(btCls).map(c => {
        const ts = doCls(c), m = ts.reduce((s, t) => s + t.ext, 0), n = nae ? ts.reduce((s, t) => s + (nae[t.nome] || 0), 0) : null, v = visivel(c);
        return `<div class="lp-cls${v ? '' : ' off'}" style="--c:${esc(cor(c))}">` +
          `<button type="button" class="lp-op lp-abre" data-c="${c}"><span class="lp-bar" aria-hidden="true"></span>` +
          `<span class="lp-x"><b>${c}</b><small>${mil(ts.length)} trecho${ts.length === 1 ? '' : 's'} · ${km(m)}${v ? '' : ' · escondida no mapa'}</small></span>${pill(n)}` +
          '<span class="lp-seta" aria-hidden="true">›</span></button>' +
          `<button type="button" class="lp-olho" data-c="${c}" aria-pressed="${v}" title="${v ? 'Esconder' : 'Mostrar'} ${c} no mapa" aria-label="Mostrar ${c} no mapa">${OLHO}</button></div>`;
      }).join('');
      const cams = [...document.querySelectorAll('#ctl-camadas .ctl-card > button:not(.tc-painel-m)')];
      if (cams.length) html += '<p class="lp-t">Camadas</p>' + cams.map((b, i) =>
        `<button type="button" class="lp-op lp-cam" data-i="${i}" aria-pressed="${b.getAttribute('aria-pressed') === 'true'}"><span class="lp-chk" aria-hidden="true"></span>` +
        `<span class="lp-x"><b>${esc(b.textContent.trim())}</b></span></button>`).join('');
    } else {
      const ts = doCls(aberta).sort((a, b) => nae ? (nae[b.nome] || 0) - (nae[a.nome] || 0) : 0);
      html += `<button type="button" class="lp-op lp-volta"><span class="lp-seta" aria-hidden="true">‹</span><span class="lp-x"><b>Classes</b></span></button>` +
        `<p class="lp-t">${aberta} · ${mil(ts.length)} trecho${ts.length === 1 ? '' : 's'}${nae ? ' · maior NAE primeiro' : ''}</p>` +
        ts.slice(0, limite).map(t => `<button type="button" class="lp-op lp-tr" data-t="${esc(t.nome)}" style="--c:${esc(t.cor)}"><span class="lp-bol" aria-hidden="true"></span>` +
          `<span class="lp-x"><b>${esc(t.nome)}</b><small>${esc(t.inicio)} → ${esc(t.fim.join(' / ').replace('fim de linha · poste ', 'fim '))} · ${km(t.ext)}</small></span>${pill(nae ? nae[t.nome] || 0 : null)}</button>`).join('') ||
        '<p class="lp-vazio">Nenhum trecho com o filtro de município.</p>';
      if (ts.length > limite) html += `<button type="button" class="lp-op lp-mais"><span class="lp-x"><b>Mostrar mais ${mil(Math.min(LOTE, ts.length - limite))}</b>` +
        `<small>faltam ${mil(ts.length - limite)}; ou digite o nome do trecho no campo</small></span></button>`;
    }
    drop.innerHTML = html;
  }
  const abreDrop = (sim, foco) => {
    if (sim === !drop.hidden) return;
    if (sim) { abreF(false); fechaSug(); aberta = null; desenha(); }
    drop.hidden = !sim;
    if (sim) medeMax();
    if (!noMapa()) lupa.setAttribute('aria-expanded', String(sim));   // no mapa, o olho diz se a barra está aberta
    if (sim && foco) { const b = drop.querySelector('.lp-op'); if (b) b.focus(); }
  };
  const abreF = sim => {
    if (sim === !fdrop.hidden) return;
    if (sim) { abreDrop(false); fechaSug(); medeMax(); }
    fdrop.hidden = !sim;
    bf.setAttribute('aria-expanded', String(sim));
  };
  // olho: no mapa abre e fecha a barra; na gaveta da tela cheia abre e fecha a lista das classes (teclado: o foco entra nela)
  lupa.addEventListener('click', e => {
    if (!noMapa()) { abreDrop(drop.hidden, e.detail === 0); return; }
    if (fechada()) {
      abreBarra(true);
      const toque = e.pointerType ? e.pointerType !== 'mouse' : matchMedia('(pointer:coarse)').matches;
      if (e.detail === 0) abreDrop(true, true);          // teclado: o foco vai para a 1ª classe
      else if (toque) abreDrop(true);                    // toque: sem o teclado do celular; tocar no campo para digitar
      else q.focus();                                    // mouse: o foco no campo (vazio: a lista das classes abre)
    } else if (q.value.trim()) { q.focus(); sugere(); }  // com texto: volta aos resultados
    else abreBarra(false);
  });
  bf.addEventListener('click', () => abreF(fdrop.hidden));
  q.addEventListener('focus', () => { if (!q.value.trim()) abreDrop(true); });
  q.addEventListener('input', () => abreDrop(!q.value.trim() && document.activeElement === q));
  drop.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });   // o campo não perde o foco
  drop.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    e.stopPropagation();
    if (b.classList.contains('lp-pn')) {                 // tela cheia: abre (ou fecha) o painel lateral
      abreDrop(false);
      if (noMapa()) abreBarra(false);
      const o = botaoPainel();
      if (o) o.click();
      return;
    }
    if (b.classList.contains('lp-olho')) { const o = btCls(b.dataset.c); if (o) o.click(); desenha(); drop.querySelector(`.lp-olho[data-c="${b.dataset.c}"]`).focus(); return; }
    if (b.classList.contains('lp-mais')) {
      const y = drop.scrollTop, i = limite;
      limite += LOTE;
      desenha();
      drop.scrollTop = y;
      const n = drop.querySelectorAll('.lp-tr')[i];
      if (n && e.detail === 0) n.focus();
      return;
    }
    if (b.classList.contains('lp-abre')) { aberta = b.dataset.c; limite = LOTE; desenha(); drop.scrollTop = 0; const f = drop.querySelector('.lp-tr, .lp-volta'); if (f && e.detail === 0) f.focus(); return; }
    if (b.classList.contains('lp-volta')) { const era = aberta; aberta = null; desenha(); if (e.detail === 0) drop.querySelector(`.lp-abre[data-c="${era}"]`).focus(); return; }
    if (b.classList.contains('lp-cam')) {
      const o = document.querySelectorAll('#ctl-camadas .ctl-card > button:not(.tc-painel-m)')[+b.dataset.i];
      if (o) o.click();
      desenha();
      const n = drop.querySelector(`.lp-cam[data-i="${b.dataset.i}"]`);
      if (n && e.detail === 0) n.focus();
      return;
    }
    if (b.classList.contains('lp-tr')) {                 // trecho: liga a classe se estiver escondida e escolhe no mapa
      const nome = b.dataset.t, c = classe(nome);
      if (!visivel(c) && btCls(c)) btCls(c).click();
      abreDrop(false);
      if (document.activeElement === q) q.blur();
      if (noMapa()) abreBarra(false);
      if (window.__sel) window.__sel(nome, true);
    }
  });
  // fecha: Esc (o foco volta ao olho ou ao botão Filtros), clique fora ou o foco saindo da barra
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || e.cancelBubble) return;    // Esc já usado (lista dos meses, menu do mapa): não fecha mais nada
    // resultados da busca: fecha só a lista; o texto fica (sem o preventDefault o campo de busca se apagaria)
    if (!sugBox.hidden) {
      e.stopPropagation(); e.preventDefault();
      const v = vistaAntes;
      fechaSug();
      if (v && comMapa) map.setView(v[0], v[1], { animate: false });   // a prévia tinha levado o mapa: volta
      return;
    }
    if (!drop.hidden) { e.stopPropagation(); const f = drop.contains(document.activeElement); abreDrop(false); if (f) lupa.focus(); }
    else if (!fdrop.hidden) { e.stopPropagation(); const f = fdrop.contains(document.activeElement); abreF(false); if (f) bf.focus(); }
    else if (noMapa() && !fechada()) { e.stopPropagation(); e.preventDefault(); abreBarra(false, true, true); }   // fecha a barra, limpa o campo e o foco volta ao olho
  }, true);
  document.addEventListener('pointerdown', e => {
    if (!drop.hidden && !drop.contains(e.target) && !lupa.contains(e.target) && e.target !== q) abreDrop(false);
    if (!fdrop.hidden && !fdrop.contains(e.target) && !bf.contains(e.target)) abreF(false);
    if (!sugBox.hidden && !sugBox.contains(e.target) && e.target !== q) fechaSug();
    if (noMapa() && !fechada() && !barra.contains(e.target) && !q.value.trim()) abreBarra(false);
  });
  barra.addEventListener('focusout', e => {
    if (!e.relatedTarget) return;
    if (!drop.contains(e.relatedTarget) && e.relatedTarget !== lupa && e.relatedTarget !== q) abreDrop(false);
    if (!fdrop.contains(e.relatedTarget) && e.relatedTarget !== bf) abreF(false);
    if (!sugBox.contains(e.relatedTarget) && e.relatedTarget !== q) fechaSug();
    if (noMapa() && !fechada() && !barra.contains(e.relatedTarget) && !q.value.trim()) abreBarra(false);
  });
  // botões T1/T2/T3 do mapa (tela cheia) ou camada ligada por outro lugar: a lista aberta acompanha
  const cls = document.getElementById('classes');
  if (cls) cls.addEventListener('click', () => { if (!drop.hidden) setTimeout(desenha, 0); });

  // ---------- busca ao digitar: resultados em grupos, ligados ao mapa (como a busca da página inicial) ----------
  // Só dados da página, indexados uma vez (no tempo livre depois de carregar, ou ao digitar):
  // - trechos: nome (T2-A, T3-BC…) e as chaves de início, fim e passagem;
  // - chaves e ativos: início/fim dos trechos, D.principais (DJ, religadores), D.fusiveis, window.CHAVES, os ativos das
  //   OS executadas e das NAE; com o código completo (4+ caracteres), também o índice dados/ativos (o mesmo do extras.js);
  // - postes: as pontas dos vãos (D.vaos, colunas 6 e 7), com os trechos dos vãos;
  // - OS das camadas: LIMPEZA (Faixa), INSPECAO, MANUTENCAO (Insp→manut) e EXECUTADAS (Manutenção).
  // Marcar (setas ou mouse) acende no mapa numa camada temporária; escolher seleciona (window.__sel) e enquadra.
  const map = window.__map, comMapa = !!(map && window.L);
  const AL = (D.meta || {}).al || '';
  const semAcento = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const alnum = s => String(s ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  const br = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
  const cap = s => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).toLowerCase() : '';
  const H = new Date(), HOJE = `${H.getFullYear()}-${String(H.getMonth() + 1).padStart(2, '0')}-${String(H.getDate()).padStart(2, '0')}`;
  const TIPO = { DJ: 'Disjuntor', '79': 'Religador', '03': 'Fusível 03', '33': 'Fusível 33', '02': 'Chave 02', '88': 'Chave faca 88',
    '40': 'Trip saver 40', '41': 'Trip saver 41', SEC: 'Fusível (seccionamento)', FTR: 'Fusível no tronco', TR: 'Transformador',
    ET: 'Transformador', EP: 'Transformador particular', Capacitor: 'Banco de capacitor', Regulador: 'Regulador de tensão',
    Chave: 'Chave', ChaveNA: 'Chave NA', RL: 'Religador', 'CH FUS': 'Fusível', 'CH FUS REL': 'Fusível religador',
    'CH FACA': 'Chave faca', 'CH BYPASS': 'Chave bypass', CH: 'Chave' };
  const tipoTxt = t => TIPO[t] || (t && String(t).length <= 3 ? 'Chave ' + t : 'Chave');
  const PESO = ['DJ', '79', 'RL', '03', '33', 'CH FUS', '02', '40', '41', 'SEC', 'FTR', '88', 'TR', 'ET', 'EP'];
  const peso = t => { const i = PESO.indexOf(t); return i < 0 ? PESO.length : i; };
  const ICO = {
    at: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
    po: '<path d="M12 3v18M6.5 6.5h11M8 10.5h8M9 21h6"/>',
    os: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM8.5 11h7M8.5 15h5"/>'
  };
  const CAM = {                                          // camada de cada OS: o rótulo do Menu, o bloco no painel e o botão do Menu
    faixa: { rot: 'Faixa', card: '.limp-card:not(.insp-card):not(.mnt-card):not(.exe-card)', bt: '.ctl-faixa' },
    insp: { rot: 'Inspeção', card: '.insp-card', bt: '.ctl-insp' },
    mnt: { rot: 'Insp→manut', card: '.mnt-card', bt: '.ctl-mnt' },
    exe: { rot: 'Manutenção', card: '.exe-card', bt: '.ctl-exe' }
  };

  // ---------- índice (uma vez) ----------
  let I = null;
  function indice() {
    if (I) return I;
    const t0 = performance.now(), TS = D.trechos || [], VS = D.vaos || [];
    const iT = new Map(TS.map((t, i) => [t.nome, i]));
    const tk = TS.map((t, i) => ({ t, i, nu: t.nome.toUpperCase(), nk: alnum(t.nome) }));
    // vãos de cada trecho (prévia) e postes: número → vãos que chegam nele
    const vaosT = TS.map(() => []), postes = new Map();
    VS.forEach((v, i) => {
      if (vaosT[v[4]]) vaosT[v[4]].push(v);
      for (const p of [v[6], v[7]]) {
        if (p == null || p === '') continue;
        const k = String(p), l = postes.get(k);
        if (!l) postes.set(k, [i]); else if (l[l.length - 1] !== i) l.push(i);
      }
    });
    // postes em ordem (minúsculas): o começo digitado acha a faixa por busca binária
    const minus = new Map();
    postes.forEach((l, k) => minus.set(k.toLowerCase(), k));
    const ordP = [...minus.keys()].sort();
    // chaves e ativos: código → tipo, ponto, trecho e papéis (início, fim ou passagem de trechos)
    const at = new Map();
    const poe = (cod, tipo, ll, tr, rel) => {
      if (cod == null || cod === '' || /^fim de linha/.test(cod)) return;
      cod = String(cod);
      let a = at.get(cod);
      if (!a) at.set(cod, a = { cod, k: alnum(cod), tipo: null, ll: null, tr: null, rel: [] });
      if (!a.tipo && tipo) a.tipo = String(tipo);
      if (!a.ll && ll && isFinite(ll[0]) && isFinite(ll[1]) && ll[0] !== null) a.ll = [+ll[0], +ll[1]];
      if (!a.tr && tr) a.tr = tr;
      if (rel) a.rel.push(rel);
    };
    TS.forEach(t => poe(t.inicio, t.inicio_tipo, [t.inicio_lat, t.inicio_lon], t.nome, ['ini', t.nome]));   // o trecho que a chave abre vem primeiro
    TS.forEach(t => (t.fim || []).forEach((f, i) => poe(f, null, (t.fim_pts || [])[i], null, ['fim', t.nome])));
    TS.forEach(t => (t.passa || []).forEach(c => poe(c, null, null, null, ['passa', t.nome])));
    (D.principais || []).forEach(a => poe(a.nome, a.t, [a.lat, a.lon]));
    (D.fusiveis || []).forEach(a => poe(a.nome, a.t, [a.lat, a.lon], a.trecho));
    (window.CHAVES || []).forEach(c => poe(c[0], c[1], [c[2], c[3]]));
    const EX = window.EXECUTADAS;
    if (EX && EX.ativos) EX.ativos.forEach(a => { if (a[1] !== 'poste') poe(a[0], a[1], [a[3], a[4]], a[2]); });
    if (D.nae) [...(D.nae.oc || []), ...(D.nae.ext || [])].forEach(o => poe(o.ativo, o.abr, o.lonlat && [o.lonlat[1], o.lonlat[0]], o.trecho));
    at.forEach(a => { if (!a.tr && a.rel.length) a.tr = a.rel[0][1]; });
    I = { TS, VS, iT, tk, vaosT, postes, minus, ordP, at, ats: [...at.values()], ms: performance.now() - t0 };
    sugBox.dataset.indice = I.ms.toFixed(1);             // tempo para montar o índice (testes)
    return I;
  }
  // OS das camadas: só o número e a camada (o resto, em detOS, para as que aparecem na lista)
  let IO = null;
  function indiceOS() {
    if (IO) return IO;
    const t0 = performance.now(), os = [];
    const poe = (cam, k, comp, num, data) => {
      comp = String(comp || num || '');
      num = String(num || comp.slice(comp.lastIndexOf(' ') + 1));
      const j = num.indexOf('/'), n = j < 0 ? num : num.slice(0, j), ano = j < 0 ? '' : num.slice(j + 1);
      os.push({ cam, k, comp, num, ck: alnum(comp), n0: n.replace(/^0+/, ''), kos: ano ? `${+n}/${ano}` : '', data: data || '' });
    };
    const LP = window.LIMPEZA, IN = window.INSPECAO, MN = window.MANUTENCAO, EX = window.EXECUTADAS;
    if (LP && LP.os) LP.os.forEach((o, k) => poe('faixa', k, o.os_completa, o.os, o.data || o.criada));
    if (IN && IN.os) IN.os.forEach((o, k) => poe('insp', k, o.os_completa, o.os, o.data));
    if (MN && MN.os) MN.os.forEach((o, k) => poe('mnt', k, o.os_completa, o.os, o.criada));
    if (EX && EX.os) EX.os.forEach((o, k) => poe('exe', k, o[0], null, o[2]));
    IO = { os, ms: performance.now() - t0 };
    sugBox.dataset.indiceOs = IO.ms.toFixed(1);
    return IO;
  }
  // detalhe de uma OS: contexto curto, vãos ou ponto no mapa e o trecho onde ela fica
  const vdCache = {};
  const vaosDas = (cam, m, n) => vdCache[cam] || (vdCache[cam] = (() => {
    const vaoId = vdCache.id || (vdCache.id = new Map((D.vaos || []).map(v => [v[5], v]))), r = Array.from({ length: n }, () => []);
    Object.entries(m || {}).forEach(([id, ks]) => { const v = vaoId.get(id); if (v) ks.forEach(k => { if (r[k]) r[k].push(v); }); });
    return r;
  })());
  const maisM = vs => { const m = {}; vs.forEach(v => { const n = D.trechos[v[4]].nome; m[n] = (m[n] || 0) + v[8]; }); return Object.keys(m).sort((a, b) => m[b] - m[a])[0] || null; };
  const doPoste = p => { const X = indice(), l = X.postes.get(String(p)); return l ? X.TS[X.VS[l[0]][4]].nome : null; };
  function detOS(e) {
    if (e.det) return e.det;
    let ctx = '', vs = null, ll = null, tr = null;
    if (e.cam === 'faixa') {
      const LP = window.LIMPEZA, o = LP.os[e.k];
      vs = vaosDas('faixa', LP.vaos, LP.os.length)[e.k];
      ctx = `Faixa · ${o.data ? 'executada ' + br(o.data) : String(o.sit || '').toLowerCase() + ' · criada ' + br(o.criada)} · ${vs.length ? km(o.m || 0) : 'sem localização'}`;
    } else if (e.cam === 'insp') {
      const IN = window.INSPECAO, o = IN.os[e.k];
      vs = vaosDas('insp', IN.vaos, IN.os.length)[e.k];
      ll = o.pe || o.pt || o.pa;
      ctx = `Inspeção · ${br(o.data)} · bloco do ${o.elem || '—'}`;
    } else if (e.cam === 'mnt') {
      const o = window.MANUTENCAO.os[e.k];
      ll = o.ll;
      tr = o.ll ? doPoste(o.poste) : null;
      ctx = `Insp→manut · ${cap(o.tipo)} · ${o.sit === 'EXECUTADA' ? 'executada ' + br(o.exec) : o.limite && o.limite < HOJE ? 'venceu ' + br(o.limite) : 'prazo ' + br(o.limite)}${o.poste ? ' · poste ' + o.poste : ''}`;
    } else {
      const EX = window.EXECUTADAS, o = EX.os[e.k], a = o[4] >= 0 ? EX.ativos[o[4]] : null;
      if (a) { ll = [a[3], a[4]]; tr = a[2] || (a[1] === 'poste' ? doPoste(a[0]) : null); }
      ctx = `Manutenção · ${cap(String((EX.tipos || [])[o[1]] || '').replace(/^M[CP] - /, ''))} · ${br(o[2])}` +
        (a ? ` · ${a[1] === 'poste' ? 'poste' : tipoTxt(a[1]).toLowerCase()} ${a[0]}` : ' · sem posição');
    }
    vs = vs && vs.length ? vs : null;
    ll = ll && isFinite(ll[0]) && ll[0] !== null ? ll : null;
    return (e.det = { ctx, vs, ll, tr: tr || (vs ? maisM(vs) : null) });
  }
  // no tempo livre depois de carregar: primeiro os trechos, chaves e postes; depois as OS (cada um numa tarefa)
  const livre = f => window.requestIdleCallback ? requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 1500);
  const aquece = () => {                                // vãos das OS da Faixa e da Inspeção e a grade do vão mais perto
    const LP = window.LIMPEZA, IN = window.INSPECAO;
    if (LP && LP.os) vaosDas('faixa', LP.vaos, LP.os.length);
    if (IN && IN.os) vaosDas('insp', IN.vaos, IN.os.length);
    montaGrade();
  };
  livre(() => { indice(); livre(() => { indiceOS(); livre(aquece); }); });

  // vão mais perto de um ponto (chave solta, sem trecho nos dados): o trecho dela. Grade de ~1 km com os vãos de cada
  // quadrado; olha o quadrado do ponto e os vizinhos (sem nada perto, todos os vãos)
  let grade = null;
  const CEL = 0.01, cel = (a, b) => (a + 20000) * 40000 + b + 20000;
  const poeNaGrade = (c, v) => { const l = grade.get(c); if (!l) grade.set(c, [v]); else if (l[l.length - 1] !== v) l.push(v); };
  function montaGrade() {
    if (grade) return;
    grade = new Map();
    for (const v of D.vaos || []) {
      poeNaGrade(cel(Math.floor(v[0] / CEL), Math.floor(v[1] / CEL)), v);
      poeNaGrade(cel(Math.floor(v[2] / CEL), Math.floor(v[3] / CEL)), v);
    }
  }
  function vaoPerto(ll) {
    montaGrade();
    const a = Math.floor(ll[0] / CEL), b = Math.floor(ll[1] / CEL), perto = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const l = grade.get(cel(a + i, b + j)); if (l) perto.push(...l); }
    const k = Math.cos(ll[0] * Math.PI / 180), px = ll[1] * k, py = ll[0];
    let melhor = null, dmin = Infinity;
    for (const v of perto.length ? perto : D.vaos || []) {
      const ax = v[1] * k, ay = v[0], dx = v[3] * k - ax, dy = v[2] - ay, l2 = dx * dx + dy * dy;
      const f = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      const d = (ax + f * dx - px) ** 2 + (ay + f * dy - py) ** 2;
      if (d < dmin) { dmin = d; melhor = v; }
    }
    return melhor;
  }
  const trDoAtivo = a => a.tr || (a.ll ? (a.perto !== undefined ? a.perto : (a.perto = (v => v ? D.trechos[v[4]].nome : null)(vaoPerto(a.ll)))) : null);
  // ponto do poste num vão (a ponta certa)
  const pontaDo = (v, p) => String(v[6]) === p ? [v[0], v[1]] : [v[2], v[3]];

  // ---------- NAE no período (os meses e "Contar individuais" de alimentador.js) ----------
  // A da lista do painel vale primeiro (o número de cada linha, como em leLista()); sem a linha (lista filtrada), a mesma
  // conta feita aqui com os mesmos filtros.
  function naeConta() {
    if (!D.nae) return null;
    const tds = document.querySelector('#mes-lista .mes-tds input'), ind = document.getElementById('ind');
    const todos = !tds || tds.checked, cInd = !ind || ind.checked, meses = new Set();
    if (!todos) document.querySelectorAll('#mes-lista input:not(#ind)').forEach(i => { if (i.value && i.checked) meses.add(i.value); });
    const tr = {}, at = {};
    [...(D.nae.oc || []), ...(D.nae.ext || [])].forEach(o => {
      if ((!todos && !meses.has(o.mes)) || (!o.col && !cInd)) return;
      if (o.trecho) tr[o.trecho] = (tr[o.trecho] || 0) + 1;
      if (o.ativo) at[o.ativo] = (at[o.ativo] || 0) + 1;
    });
    return { tr, at };
  }
  const naeLista = nome => {
    const s = document.querySelector(`#lista .row[data-t="${window.CSS && CSS.escape ? CSS.escape(nome) : nome}"] strong.nae`);
    return s ? parseInt(s.textContent, 10) || 0 : null;
  };

  // ---------- procura ----------
  const LIM = { tr: 6, at: 6, po: 5, os: 5 };          // por grupo (o título diz quantos há ao todo)
  let extra = null;                                     // achados do índice dados/ativos para o texto atual
  function procura(txt) {
    const X = indice(), TU = txt.toUpperCase().replace(/\s+/g, ''), K = alnum(txt), lo = semAcento(txt).replace(/\s+/g, '');
    // trechos pelo nome: igual, começa com, contém (sem o traço só quando se digita sem ele: "T2A" acha o T2-A)
    const tr = [], semTraco = TU === K;
    if (K) X.tk.forEach(e => {
      const r = e.nu === TU || (semTraco && e.nk === K) ? 0 : e.nu.startsWith(TU) || (semTraco && e.nk.startsWith(K)) ? 1 : TU.length >= 2 && e.nu.includes(TU) ? 2 : -1;
      if (r >= 0) tr.push({ r, e });
    });
    tr.sort((a, b) => a.r - b.r || a.e.t.nome.length - b.e.t.nome.length || a.e.i - b.e.i);
    // chaves e ativos pelo código (3+ caracteres): igual, começa com ou (4+) contém
    const at = [];
    if (K.length >= 3) X.ats.forEach(a => {
      const r = a.k === K ? 0 : a.k.startsWith(K) ? 1 : K.length >= 4 && a.k.includes(K) ? 2 : -1;
      if (r >= 0) at.push({ r, a });
    });
    if (extra && extra.txt === txt) extra.hits.forEach(a => { if (!at.some(x => chaveIdx(x.a.cod) === chaveIdx(a.cod))) at.push({ r: 0, a }); });
    at.sort((x, y) => x.r - y.r || peso(x.a.tipo) - peso(y.a.tipo) || x.a.cod.length - y.a.cod.length || (x.a.cod < y.a.cod ? -1 : 1));
    // trechos pela chave: os que começam, terminam ou passam nas chaves achadas
    const ja = new Set(tr.map(x => x.e.t.nome)), viaChave = [];
    at.slice(0, LIM.at).forEach(({ a }) => a.rel.forEach(([papel, nome]) => {
      if (ja.has(nome) || !X.iT.has(nome)) return;
      ja.add(nome);
      viaChave.push({ e: X.tk[X.iT.get(nome)], papel, cod: a.cod });
    }));
    // postes: igual (2+) ou começa com (3+)
    const po = [];
    if (lo.length >= 2) {
      const P = X.ordP;
      let a = 0, b = P.length;
      while (a < b) { const m = (a + b) >> 1; if (P[m] < lo) a = m + 1; else b = m; }
      for (let i = a; i < P.length && P[i].startsWith(lo); i++) if (lo.length >= 3 || P[i] === lo) po.push(X.minus.get(P[i]));
      po.sort((x, y) => (y.toLowerCase() === lo) - (x.toLowerCase() === lo) || x.length - y.length || (x < y ? -1 : 1));
    }
    // OS: número/ano (2375/2026, com ou sem a equipe), número (3+ dígitos) ou equipe com número (INPA03)
    const os = [];
    if (K.length >= 3 && /\d/.test(K)) {
      const m = txt.match(/(\d{1,7})\s*\/\s*(\d{4})(?!\d)/), kos = m ? `${+m[1]}/${m[2]}` : '';
      const letras = alnum(txt.replace(/\d{1,7}\s*\/\s*\d{4}.*$/, '')).replace(/\d+$/, ''), soDig = /^\d+$/.test(K), K0 = K.replace(/^0+/, '');
      indiceOS().os.forEach(o => {
        let r = -1;
        if (kos) { if (o.kos === kos) r = !letras || o.ck.startsWith(letras) ? 0 : 1; }
        else if (soDig) r = o.n0 === K0 ? 0 : K0.length >= 3 && o.n0.startsWith(K0) ? 1 : -1;
        else if (K.length >= 4 && o.ck.includes(K)) r = 2;
        if (r >= 0) os.push({ r, o });
      });
      os.sort((a, b) => a.r - b.r || (b.o.data < a.o.data ? -1 : b.o.data > a.o.data ? 1 : 0));
    }
    return { tr: tr.map(x => ({ t: x.e.t })), trc: viaChave.map(v => ({ t: v.e.t, papel: v.papel, cod: v.cod })), at: at.map(x => x.a), po, os: os.map(x => x.o) };
  }

  // ---------- lista suspensa dos resultados ----------
  const sugBox = document.createElement('div');
  sugBox.className = 'lp-sug';
  sugBox.id = 'lp-sug';
  sugBox.hidden = true;
  const sugSt = document.createElement('p');            // quantos resultados (leitor de tela)
  sugSt.className = 'vh';
  sugSt.setAttribute('role', 'status');
  fdrop.after(sugBox, sugSt);
  q.setAttribute('role', 'combobox');
  q.setAttribute('aria-autocomplete', 'list');
  q.setAttribute('aria-controls', 'lp-sug');
  q.setAttribute('aria-expanded', 'false');
  let sug = [], marcado = -1, pedido = 0, espera = 0;
  const realce = (txt, n) => {                           // destaca o que se digitou (sem acento e sem caixa)
    txt = String(txt ?? '');
    const s = semAcento(txt), i = n ? s.indexOf(n) : -1;
    if (i < 0 || s.length !== txt.length) return esc(txt);
    return esc(txt.slice(0, i)) + '<mark>' + esc(txt.slice(i, i + n.length)) + '</mark>' + esc(txt.slice(i + n.length));
  };
  const fimCurto = t => t.fim.join(' / ').replace(/fim de linha · poste /g, 'fim ');
  const PAPEL = { ini: 'começa em', fim: 'termina em', passa: 'passa por' };
  const PAPEL_AT = { ini: 'início do', fim: 'fim do', passa: 'passa no' };
  function linhaHtml(r, n, N) {
    const ico = r.tipo === 'tr' ? `<span class="lp-bol" style="--c:${esc(r.t.cor)}" aria-hidden="true"></span>`
      : `<svg class="lp-si" viewBox="0 0 24 24" aria-hidden="true">${ICO[r.tipo]}</svg>`;
    let b = '', c = '', nae = null;
    if (r.tipo === 'tr') {
      const t = r.t;
      b = realce(t.nome, n);
      c = r.papel ? `${PAPEL[r.papel]} ${realce(r.cod, n)} · ${km(t.ext)}` : `${esc(t.inicio)} → ${esc(fimCurto(t))} · ${km(t.ext)}`;
      if (!visivel(classe(t.nome))) c += ` · ${classe(t.nome)} escondido no mapa`;
      if (N) { const l = naeLista(t.nome); nae = l != null ? l : N.tr[t.nome] || 0; }
    } else if (r.tipo === 'at') {
      const a = r.a, tr = trDoAtivo(a);
      b = realce(a.cod, n);
      const pap = a.rel.slice(0, 3).map(([p, nome]) => `${PAPEL_AT[p]} ${nome}`).join(' · ');
      c = `${esc(tipoTxt(a.tipo))} · ${esc(a.papel || pap || (tr ? 'no ' + tr : 'sem trecho'))}${a.idx ? ' · índice de ativos' : ''}`;
      if (N && N.at[a.cod]) nae = N.at[a.cod];
    } else if (r.tipo === 'po') {
      b = realce('Poste ' + r.p, n);
      const pap = [];
      D.trechos.forEach(t => {
        if (String(t.inicio_poste) === r.p) pap.push(`${t.inicio} (início do ${t.nome})`);
        if (t.fim.includes('fim de linha · poste ' + r.p)) pap.push(`fim de linha do ${t.nome}`);
      });
      c = esc((r.trs.length > 1 ? 'Trechos ' : 'Trecho ') + r.trs.join(' · ') + (pap.length ? ' · ' + pap.slice(0, 2).join(' · ') : ''));
    } else {
      const o = r.o;
      b = 'OS ' + realce(o.num, n);
      const d = detOS(o);
      c = esc(d.ctx + (d.tr ? ' · ' + d.tr : ''));
    }
    return ico + `<span class="lp-x"><b>${b}</b><small>${c}</small></span>` +
      (nae == null ? '' : `<i class="lp-n${nae ? '' : ' zero'}">${mil(nae)}<span class="vh"> NAE</span></i>`);
  }
  const idDe = r => r.tipo + ':' + (r.tipo === 'tr' ? r.t.nome : r.tipo === 'at' ? r.a.cod : r.tipo === 'po' ? r.p : r.o.cam + r.o.k);
  function mostra(txt, manter) {
    const t0 = performance.now(), X = indice(), R = procura(txt), N = naeConta(), n = semAcento(txt);
    const antes = manter && sug[marcado] ? idDe(sug[marcado]) : null;
    sug = [];
    let html = '', i = 0, total = 0, cortou = false;
    const grupo = (tit, lista, lim, faz) => {
      if (!lista.length) return;
      total += lista.length;
      if (lista.length > lim) cortou = true;
      html += `<li class="lp-st" role="presentation">${tit}${lista.length > lim ? `<span> · ${mil(lim)} de ${mil(lista.length)}</span>` : ''}</li>` +
        lista.slice(0, lim).map(x => {
          const r = faz(x);
          sug.push(r);
          return `<li class="lp-so so-${r.tipo}" role="option" id="lp-sug-${i}" data-i="${i++}" aria-selected="false">${linhaHtml(r, n, N)}</li>`;
        }).join('');
    };
    // ordem: trechos pelo nome, chaves e ativos, os trechos dessas chaves (começam, terminam ou passam nelas), postes e OS
    const trecho = e => ({ tipo: 'tr', t: e.t, papel: e.papel, cod: e.cod });
    grupo('Trechos', R.tr, LIM.tr, trecho);
    grupo('Chaves e ativos', R.at, LIM.at, a => ({ tipo: 'at', a }));
    grupo(R.at.length === 1 ? 'Trechos da chave' : 'Trechos das chaves', R.trc, LIM.tr, trecho);
    grupo('Postes', R.po, LIM.po, p => {
      const vs = X.postes.get(p) || [], trs2 = [...new Set(vs.map(i => X.TS[X.VS[i][4]].nome))];
      return { tipo: 'po', p, v: X.VS[vs[0]], trs: trs2 };
    });
    grupo('OS das camadas', R.os, LIM.os, o => ({ tipo: 'os', o }));
    if (!sug.length) {
      fechaLista();
      // código completo ainda a caminho do índice de ativos: avisa que está procurando (sugere() refaz a lista na volta)
      const procurando = chaveIdx(txt).length >= 4 && !(extra && extra.txt === txt);
      if (n.length >= 2) {
        abreLista();
        sugBox.innerHTML = procurando ? `<p class="lp-vazio">Procurando <b>${esc(txt)}</b> no índice de ativos…</p>`
          : `<p class="lp-vazio">Nada encontrado para <b>${esc(txt)}</b>. Trecho (T2-A), código da chave, número do poste ou da OS.</p>`;
      }
      sugSt.textContent = n.length < 2 ? '' : procurando ? 'Procurando' : 'Nada encontrado';
      sugBox.dataset.ms = (performance.now() - t0).toFixed(1);
      return;
    }
    const fino = matchMedia('(hover:hover) and (pointer:fine)').matches;
    sugBox.innerHTML = `<ul role="listbox" aria-label="Resultados da busca">${html}</ul>` +
      (fino || cortou ? `<p class="lp-sug-pe">${fino ? '<span>↑ ↓ mostram no mapa · Enter escolhe · Esc fecha</span>' : ''}${cortou ? '<span>Continue digitando para afinar</span>' : ''}</p>` : '');
    abreLista();
    sugSt.textContent = `${mil(total)} resultado${total === 1 ? '' : 's'}`;
    const j = antes ? sug.findIndex(r => idDe(r) === antes) : -1;
    marca(j, false);
    sugBox.dataset.ms = (performance.now() - t0).toFixed(1);   // tempo da procura e da lista (testes)
  }
  function abreLista() {
    if (sugBox.hidden) medeMax();
    sugBox.hidden = false;
    q.setAttribute('aria-expanded', 'true');
    barra.classList.add('lp-sugindo');                   // os achados antigos do extras.js (.ativo-hit) ficam escondidos
  }
  function fechaLista() {
    sug = []; marcado = -1;
    sugBox.hidden = true;
    sugBox.innerHTML = '';
    q.setAttribute('aria-expanded', 'false');
    q.removeAttribute('aria-activedescendant');
    barra.classList.remove('lp-sugindo');
    acende(null);
    clearTimeout(anda);
  }
  function fechaSug() {                                  // fecha e esquece o que estava a caminho (índice de ativos, vista de antes)
    pedido++;
    clearTimeout(espera);
    vistaAntes = null;
    if (!sugBox.hidden || sug.length) fechaLista();
  }
  function marca(i, rola) {
    marcado = i;
    sugBox.querySelectorAll('.lp-so').forEach((o, k) => { o.classList.toggle('marcado', k === i); o.setAttribute('aria-selected', String(k === i)); });
    const o = i >= 0 && sugBox.querySelector('#lp-sug-' + i);
    if (o) { q.setAttribute('aria-activedescendant', o.id); if (rola) o.scrollIntoView({ block: 'nearest' }); } else q.removeAttribute('aria-activedescendant');
    acende(sug[i] || null);
  }
  // índice dados/ativos (o mesmo do extras.js): com o código completo, acha o ativo que não está nos dados da página
  const chaveIdx = s => { const k = alnum(s); return /^\d+$/.test(k) ? (k.replace(/^0+/, '') || '0') : k; };
  const fatia = k => { let h = 0; for (let i = 0; i < k.length; i++) h = (Math.imul(h, 31) + k.charCodeAt(i)) >>> 0; return (h % 256).toString(16).padStart(2, '0'); };
  const raizDados = pasta ? pasta + '../dados/' : '../../dados/';
  const cacheIdx = {};
  const baixaIdx = f => cacheIdx[f] || (cacheIdx[f] = fetch(`${raizDados}ativos/${f}.json`).then(r => r.ok ? r.json() : {}).catch(() => { delete cacheIdx[f]; return {}; }));
  function sugere() {
    const txt = q.value.trim(), meu = ++pedido;
    clearTimeout(espera);
    if (!txt) { fechaLista(); return; }
    mostra(txt);
    const k = chaveIdx(txt);
    if (k.length < 4 || (extra && extra.txt === txt)) return;
    espera = setTimeout(async () => {
      const d = await baixaIdx(fatia(k));
      if (meu !== pedido || q.value.trim() !== txt) return;   // o texto mudou enquanto baixava
      const hits = ((d || {})[k] || []).filter(h => h[0] === AL && h[1] !== 'poste');   // poste: a lista de postes já acha
      extra = { txt, hits: hits.map(([, tipo, t, papel, lat, lon]) => ({ cod: txt.toUpperCase(), k: alnum(txt), tipo, ll: isFinite(lat) && lat !== null ? [+lat, +lon] : null,
        tr: t && D.trechos.some(x => x.nome === t) ? t : null, rel: [], papel: papel || '', idx: true })) };
      if (!sugBox.hidden) mostra(txt, true);              // com os achados, ou o "Nada encontrado" no lugar do "Procurando"
    }, 200);
  }
  q.addEventListener('input', () => { if (q.value.trim() && document.activeElement === q) sugere(); else fechaSug(); });
  q.addEventListener('focus', () => { if (q.value.trim()) sugere(); });
  q.addEventListener('click', () => { if (q.value.trim() && sugBox.hidden) sugere(); });   // depois do Esc, tocar no campo reabre
  q.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' && sugBox.hidden && q.value.trim()) { e.preventDefault(); sugere(); if (sug.length) marca(0, true); return; }
    if (sugBox.hidden || !sug.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      marca(e.key === 'ArrowDown' ? Math.min(sug.length - 1, marcado + 1) : Math.max(0, marcado - 1), true);
    } else if (e.key === 'Enter') { e.preventDefault(); escolhe(marcado >= 0 ? marcado : 0, true); }   // Enter sem marcar: o primeiro
  });
  sugBox.addEventListener('mousedown', e => { if (e.target.closest('.lp-so')) e.preventDefault(); });   // o campo não perde o foco
  sugBox.addEventListener('mouseover', e => { const o = e.target.closest('.lp-so'); if (o && +o.dataset.i !== marcado) marca(+o.dataset.i, false); });
  sugBox.addEventListener('click', e => { const o = e.target.closest('.lp-so'); if (o) escolhe(+o.dataset.i, e.detail === 0); });

  // ---------- prévia no mapa: camada temporária, sem mexer na seleção (some ao fechar ou ao trocar) ----------
  let luz = null;
  const segs = vs => vs.map(v => [[v[0], v[1]], [v[2], v[3]]]);
  const SEM = { interactive: false, lineCap: 'round', lineJoin: 'round', className: 'lp-previa' };   // className: só marca (o mapa desenha em canvas)
  // brilho na cor de destaque (a da opção marcada na lista), diferente do halo branco da seleção
  const destaque = () => (getComputedStyle(document.documentElement).getPropertyValue('--accent') || '').trim() || '#f08a5d';
  const brilho = (vs, cor, peso, fino) => !vs || !vs.length ? [] : [
    L.polyline(segs(vs), { ...SEM, color: '#0b0f14', weight: fino ? 13 : 18, opacity: .55 }),
    L.polyline(segs(vs), { ...SEM, color: destaque(), weight: fino ? 8 : 12, opacity: 1 }),
    L.polyline(segs(vs), { ...SEM, color: cor || '#fff', weight: peso || 4, opacity: 1 })];
  const ponto = ll => !ll ? [] : [
    L.circleMarker(ll, { ...SEM, radius: 14, color: '#0b0f14', weight: 7, opacity: .55, fill: false }),
    L.circleMarker(ll, { ...SEM, radius: 14, color: destaque(), weight: 4, fillColor: destaque(), fillOpacity: .25 })];
  const rotuloPrev = t => t.rotulo ? [L.marker(t.rotulo, { interactive: false, keyboard: false, zIndexOffset: 1500,
    icon: L.divIcon({ className: '', iconSize: null, html: `<div class="lp-lb" style="--c:${esc(t.cor)}">${esc(t.nome)}</div>` }) })] : [];
  function acende(r) {
    clearTimeout(anda);
    if (luz) { luz.remove(); luz = null; }
    if (!r || !comMapa) return;
    const X = indice(), vsDe = nome => X.iT.has(nome) ? X.vaosT[X.iT.get(nome)] : [], tDe = nome => X.TS[X.iT.get(nome)];
    const pts = vs => vs.flatMap(v => [[v[0], v[1]], [v[2], v[3]]]);
    let ls = [], foco = [], pt = false;                  // foco: o que a prévia precisa mostrar (pontos), pt: é um ponto só
    if (r.tipo === 'tr') { ls = [...brilho(vsDe(r.t.nome), r.t.cor, r.t.peso), ...rotuloPrev(r.t)]; foco = pts(vsDe(r.t.nome)); }
    else if (r.tipo === 'at') {
      const tr = trDoAtivo(r.a), t = tr && tDe(tr);
      ls = [...(t ? brilho(vsDe(tr), t.cor, t.peso, true) : []), ...ponto(r.a.ll)];
      if (r.a.ll) { foco = [r.a.ll]; pt = true; } else if (t) foco = pts(vsDe(tr));
    } else if (r.tipo === 'po') {
      r.trs.forEach(nome => { const t = tDe(nome); ls.push(...brilho(vsDe(nome), t.cor, t.peso, true)); });
      ls.push(...ponto(pontaDo(r.v, r.p)));
      foco = [pontaDo(r.v, r.p)]; pt = true;
    } else {
      const d = detOS(r.o);
      ls = d.vs ? brilho(d.vs) : ponto(d.ll);
      if (d.vs) foco = pts(d.vs); else if (d.ll) { foco = [d.ll]; pt = true; }
    }
    if (ls.length) luz = L.layerGroup(ls).addTo(map);
    traz(foco, pt);
  }
  // a prévia fora da parte livre do mapa (fora da vista, ou embaixo da lista ou da gaveta da tela cheia): o mapa vai até
  // ela, na parte livre. Esc devolve a vista de antes; escolher ou fechar de outro jeito deixa onde está.
  // No celular a lista cobre a largura do mapa: aí o mapa não se mexe.
  let vistaAntes = null, anda = 0;
  function traz(lls, pt) {
    clearTimeout(anda);
    if (!comMapa || !lls.length) return;
    anda = setTimeout(() => {
      if (sugBox.hidden) return;
      const mr = map.getContainer().getBoundingClientRect();
      if (mr.width < 200 || mr.height < 200 || mr.bottom < 0 || mr.top > innerHeight) return;
      const cobre = [sugBox.getBoundingClientRect(), linha.getBoundingClientRect()];
      if (document.body.classList.contains('tc-gaveta')) { const pn = document.querySelector('.panel'); if (pn) cobre.push(pn.getBoundingClientRect()); }
      const em = cobre.filter(c => c.right > mr.left && c.left < mr.right && c.bottom > mr.top && c.top < mr.bottom)
        .map(c => ({ l: Math.max(c.left, mr.left) - mr.left, r: Math.min(c.right, mr.right) - mr.left, t: Math.max(c.top, mr.top) - mr.top, b: Math.min(c.bottom, mr.bottom) - mr.top }));
      // já aparece: 60% ou mais dos pontos (até ~400, um a cada tanto) na parte do mapa à vista e fora da lista
      const alto = Math.min(mr.height, innerHeight - mr.top), passo = Math.max(1, Math.floor(lls.length / 400));
      let vistos = 0, n = 0;
      for (let i = 0; i < lls.length; i += passo) {
        const c = map.latLngToContainerPoint(lls[i]);
        n++;
        if (c.x >= 8 && c.x <= mr.width - 8 && c.y >= Math.max(8, -mr.top) && c.y <= alto - 8 && !em.some(e => c.x >= e.l && c.x <= e.r && c.y >= e.t && c.y <= e.b)) vistos++;
      }
      if (vistos >= n * 0.6) return;
      const B = L.latLngBounds(lls);
      const cl = em.length ? Math.min(...em.map(c => c.l)) : mr.width, cr = em.length ? Math.max(...em.map(c => c.r)) : 0;
      const dir = mr.width - cr, esq = cl;               // largura livre à direita e à esquerda do que cobre o mapa
      if (Math.max(dir, esq) < 200) return;
      if (!vistaAntes) vistaAntes = [map.getCenter(), map.getZoom()];
      // o mapa pode passar da altura da janela (ou começar acima dela): a parte escondida entra na folga
      const cima = Math.max(0, -mr.top) + 48, baixo = Math.max(0, mr.height - alto) + 24;
      map.fitBounds(B, { paddingTopLeft: [dir >= esq ? cr + 24 : 24, cima], paddingBottomRight: [dir >= esq ? 24 : mr.width - cl + 24, baixo], maxZoom: pt ? 17 : 16 });
    }, 140);
  }

  // ---------- escolher: seleciona e enquadra ----------
  let pino = null;                                       // marcador da chave, ativo ou poste escolhido (sai no próximo ou ao tocar no mapa)
  const tiraPino = () => { if (pino) { pino.remove(); pino = null; } };
  if (comMapa) map.on('click', tiraPino);
  function vaiPonto(ll, tag, cod) {
    tiraPino();
    if (!comMapa || !ll) return;
    pino = L.marker(ll, { interactive: false, keyboard: false, zIndexOffset: 1000,
      icon: L.divIcon({ className: '', iconSize: null, html: `<div class="ie ativo"><em>${esc(tag)}</em>${esc(cod)}</div>` }) }).addTo(map);
    map.setView(ll, Math.max(map.getZoom(), 17));
  }
  const ligaClasse = nome => { const c = classe(nome); if (!visivel(c) && btCls(c)) btCls(c).click(); };
  const sel = (nome, enq, vao) => { if (!nome || !window.__sel || !D.trechos.some(t => t.nome === nome)) return false; ligaClasse(nome); window.__sel(nome, enq, vao); return true; };
  // OS: liga a camada (o botão do Menu) e foca a OS nela, como um toque no bloco do painel. Inspeção pela função dela
  // (window.__focaInspecao); as outras por um botão [data-k] solto no bloco da camada (o ouvinte do bloco faz o resto).
  // Focar de novo a OS em foco a desliga: confere e repete uma vez.
  function focaOS(o) {
    const c = CAM[o.cam], bt = document.querySelector(c.bt), card = document.querySelector(c.card);
    if (bt && bt.getAttribute('aria-pressed') !== 'true') bt.click();
    if (o.cam === 'insp' && window.__focaInspecao && window.__focaInspecao(o.comp)) return;
    if (!card) return;
    const emFoco = () => card.querySelector(`[data-k="${o.k}"][aria-pressed="true"]`);
    for (let i = 0; i < 2 && !emFoco(); i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.hidden = true; b.dataset.k = o.k;
      card.append(b); b.click(); b.remove();
    }
    if (window.__rolaPainel) window.__rolaPainel(card, o.k);
    // sem posição no mapa, no celular: a página desce até a OS no bloco (embaixo do mapa fixo)
    const f = emFoco();
    if (f && !detOS(o).vs && !detOS(o).ll && matchMedia('(max-width:980px)').matches && !document.body.classList.contains('tela-cheia')) {
      const mb = document.querySelector('.mapbox'), topo = mb ? Math.max(0, mb.getBoundingClientRect().bottom) : 0;
      window.scrollBy(0, f.getBoundingClientRect().top - topo - 8);
    }
  }
  function escolhe(i, teclado) {
    const r = sug[i];
    if (!r) return;
    fechaSug();
    // o campo volta vazio (como na página inicial): a lista do painel volta inteira e o teclado do celular fecha
    q.blur();
    q.value = '';
    q.dispatchEvent(new Event('input', { bubbles: true }));
    if (noMapa()) abreBarra(false);
    tiraPino();
    let tr = null;
    if (r.tipo === 'tr') { tr = r.t.nome; sel(tr, true); }
    else if (r.tipo === 'at') {
      tr = trDoAtivo(r.a);
      sel(tr, !r.a.ll);                                  // sem o ponto da chave: enquadra o trecho
      vaiPonto(r.a.ll, 'ATIVO', r.a.cod);
    } else if (r.tipo === 'po') {
      tr = D.trechos[r.v[4]].nome;
      sel(tr, false, r.v);
      vaiPonto(pontaDo(r.v, r.p), 'POSTE', r.p);
    } else {
      tr = detOS(r.o).tr;
      sel(tr, false);
      focaOS(r.o);
    }
    // teclado: o foco vai para o detalhe do trecho escolhido (o leitor de tela lê o que mudou)
    if (teclado && tr && r.tipo !== 'os') { const h = document.querySelector('#det h2'); if (h) h.focus({ preventScroll: true }); }
    // tela cheia no celular: a gaveta fecha para mostrar o mapa (como ao tocar num trecho da lista)
    if (document.body.classList.contains('tc-gaveta') && innerWidth <= 700) {
      const f = document.querySelector('.tc-fecha-gaveta');
      if (f) setTimeout(() => f.click(), 50);
    }
  }

  // ---------- a barra dentro do mapa: de primeira só o olho (também na tela cheia) ----------
  function noMapa() { const p = barra.parentElement; return !!p && p.classList.contains('mapbox'); }
  function fechada() { return barra.classList.contains('lp-fechada'); }
  function rotuloOlho() {
    if (noMapa()) {
      const aberta = !fechada();
      lupa.setAttribute('aria-expanded', String(aberta));
      lupa.setAttribute('aria-controls', 'busca lp-fbt');
      lupa.setAttribute('aria-label', aberta ? 'Fechar a busca' : 'Abrir a busca: trecho, ativo, poste ou OS, classes T1, T2, T3 e filtros' + filtrosTxt);
      lupa.title = aberta ? 'Fechar a busca' : 'Buscar no mapa' + filtrosTxt;
    } else {                                             // gaveta da tela cheia: o olho abre a lista das classes
      lupa.setAttribute('aria-expanded', String(!drop.hidden));
      lupa.setAttribute('aria-controls', 'lp-drop');
      lupa.setAttribute('aria-label', 'Classes T1, T2, T3 e camadas do mapa');
      lupa.removeAttribute('title');
    }
  }
  // as listas suspensas cabem no mapa (ele corta o que passa da borda): altura até o pé do mapa ou da janela.
  // Mede no quadro seguinte, antes de pintar: ao digitar, alimentador.js acabou de refazer a lista do painel e medir na
  // hora forçaria o leiaute dela ali mesmo
  let medindo = 0;
  function medeMax() {
    if (medindo) return;
    medindo = requestAnimationFrame(() => {
      medindo = 0;
      if (!noMapa()) { barra.style.removeProperty('--lp-max'); return; }
      const mb = barra.parentElement.getBoundingClientRect(), l = linha.getBoundingClientRect();
      barra.style.setProperty('--lp-max', Math.max(160, Math.round(Math.min(mb.bottom, innerHeight) - 12 - l.bottom - 6)) + 'px');
    });
  }
  // texto de ajuda do campo na medida dele (no celular de 360 px o campo é estreito)
  function ajustaDica() {
    const w = q.clientWidth;
    if (w) q.placeholder = w >= 330 ? 'Trecho, ativo, poste ou OS' : w >= 215 ? 'Trecho, ativo ou poste' : 'Trecho ou ativo';
  }
  // abre (só o olho → olho · campo · Filtros) ou fecha; limpa: fecha também a busca digitada; foco: o foco volta ao olho
  function abreBarra(sim, limpa, foco) {
    if (!noMapa()) return;
    if (sim) { barra.classList.remove('lp-fechada'); rotuloOlho(); medeMax(); ajustaDica(); return; }
    // antes de limpar o campo: o foco que estava na barra vai para o olho (Esc, teclado) ou sai do campo (clique fora)
    const a = document.activeElement;
    if (a && a !== lupa && barra.contains(a)) { if (foco || a !== q) lupa.focus(); else q.blur(); }
    fechaSug(); abreDrop(false); abreF(false);
    const ml = document.getElementById('mes-lista');
    if (ml && !ml.hidden && document.getElementById('mes')) document.getElementById('mes').click();   // a lista dos meses também
    if (limpa && q.value) { q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); }
    barra.classList.add('lp-fechada');
    rotuloOlho();
  }
  const caixaMapa = document.querySelector('.stage .mapbox') || document.querySelector('.mapbox');
  if (caixaMapa) {
    caixaMapa.append(barra);                             // a barra de extras.js sai de cima do mapa e entra nele
    barra.classList.add('lp-fechada');
  }
  rotuloOlho();
  // tela cheia: telacheia.js leva a barra para a gaveta e, ao sair, para cima do mapa; aqui ela volta para dentro do mapa
  // na mesma hora (antes de pintar), como estava, e quem digitava continua no campo
  let gavetaAntes = false;
  if (caixaMapa) new MutationObserver(() => {
    if (barra.parentElement !== caixaMapa) {
      const f = barra.contains(document.activeElement) ? document.activeElement : null;
      caixaMapa.append(barra);
      if (f) f.focus({ preventScroll: true });
    }
    rotuloOlho(); ajustaDica();
    if (!drop.hidden) desenha();                         // o item "Painel" entra e sai com a tela cheia e marca a gaveta
    // gaveta fechada (✕ ou Esc) com o foco perdido: volta ao olho (telacheia.js o mandaria para o Menu, que fica escondido)
    const gav = document.body.classList.contains('tc-gaveta');
    if (gavetaAntes && !gav && (!document.activeElement || document.activeElement === document.body)) lupa.focus({ preventScroll: true });
    gavetaAntes = gav;
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  // balão do mapa: abre abaixo da barra (o olho ou a barra aberta), como já fazia abaixo do T1 T2 T3 / Menu
  const folga0 = window.__folgaBalao;
  window.__folgaBalao = () => {
    const r = folga0 ? folga0() : [20, 20], m = document.getElementById('map');
    if (!noMapa() || !m) return r;
    const b = (fechada() ? lupa : linha).getBoundingClientRect();
    return [r[0], Math.max(r[1], Math.round(b.bottom - m.getBoundingClientRect().top) + 12)];
  };
  addEventListener('resize', () => { if (noMapa() && !fechada()) medeMax(); ajustaDica(); });

  const s = document.createElement('style');
  s.textContent =
    // T1 T2 T3 e o Menu saem do mapa (estão na lupa), também na tela cheia
    '.ctl-dir>.ctl-topo{display:none}' +
    '.lp-pi{flex:none;display:grid;place-items:center;width:22px}.lp-pi svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
    '.lp-pn .lp-x b{font-family:var(--f-body)}.lp-pn[aria-pressed=true] .lp-x b{color:var(--accent)}' +
    '.barra-busca .barra-linha.lp-linha,body.tela-cheia .panel .barra-linha.lp-linha{display:flex;flex-wrap:nowrap;align-items:center;gap:var(--s2)}' +
    '.barra-busca .lp-linha>.busca{flex:1 1 auto;width:auto;min-width:0;min-height:44px}' +
    '@media (min-width:861px){.barra-busca .lp-linha>.busca{min-height:40px}}' +
    '.lp-lupa,.lp-fbt{flex:none;display:inline-flex;align-items:center;justify-content:center;min-height:44px;border:1px solid var(--line);background:var(--paper);color:var(--fg);cursor:pointer;box-shadow:var(--sh1)}' +
    '@media (min-width:861px){.lp-lupa,.lp-fbt{min-height:40px}}' +
    '.lp-lupa{width:48px;padding:0;border-radius:999px}.lp-lupa img{display:block;width:34px;height:auto;pointer-events:none}' +
    ':root[data-theme="light"] .lp-lupa img{filter:invert(1)}' +
    '.lp-fbt{gap:6px;padding:0 var(--s3);border-color:var(--line-forte);border-radius:var(--r2);font:600 var(--t-sm) var(--f-body)}' +
    '.lp-fbt svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round}' +
    '.lp-fn{min-width:20px;padding:1px 6px;border-radius:999px;background:var(--accent);color:var(--on-accent);font:700 var(--t-xs)/1.4 var(--f-mono);text-align:center}' +
    '@media (max-width:640px){.lp-ftxt{display:none}.lp-fbt{width:48px;padding:0}}' +
    '.lp-lupa:hover,.lp-fbt:hover{background:var(--hover)}' +
    '.lp-lupa[aria-expanded=true],.lp-fbt[aria-expanded=true]{border-color:var(--accent);color:var(--accent)}' +
    '.lp-lupa:focus-visible,.lp-fbt:focus-visible,.lp-drop button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}' +
    // listas suspensas presas à barra (por cima do mapa, sem empurrar nada)
    '.lp-drop,.lp-fdrop{position:absolute;top:calc(100% + 6px);z-index:1000;max-height:min(70vh,600px);overflow:auto;overscroll-behavior:contain;' +
    'padding:var(--s1);border-radius:var(--r3);background:var(--paper);box-shadow:var(--sh2);border:1px solid var(--line)}' +
    '.lp-drop{left:0;width:min(100%,460px)}.lp-fdrop{right:0;width:min(100%,340px);display:grid;gap:var(--s2);padding:var(--s2) var(--s3) var(--s3)}' +
    '.lp-drop[hidden],.lp-fdrop[hidden]{display:none}' +
    '.lp-t{margin:0;padding:var(--s2) var(--s3) 2px;font:700 var(--t-xs)/1.4 var(--f-body);letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}' +
    '.lp-fdrop .lp-t{padding:0}.lp-fdrop select{width:100%}.lp-fdrop #ctrl{display:grid;gap:var(--s2)}.lp-fdrop .mes,.lp-fdrop #mes{width:100%}' +
    '.lp-fdrop .mes-lista{position:static;width:auto;min-width:0;max-width:none;margin-top:var(--s1);box-shadow:none}' +
    '.lp-op{display:flex;align-items:center;gap:var(--s2);width:100%;min-height:48px;padding:var(--s2) var(--s3);border:0;border-radius:var(--r1);' +
    'background:none;color:var(--fg);font:inherit;text-align:left;cursor:pointer}' +
    '.lp-op:hover{background:var(--hover)}.lp-op:hover b{color:var(--accent)}' +
    '.lp-x{flex:1;min-width:0;display:grid;gap:1px}.lp-x b{font:600 var(--t-base)/1.3 var(--f-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.lp-x small{font-size:var(--t-xs);line-height:1.35;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '.lp-n{flex:none;font:700 var(--t-xs)/1.2 var(--f-mono);font-style:normal;padding:2px 7px;border-radius:5px;background:#b8431f;color:#fff;font-variant-numeric:tabular-nums}' +
    '.lp-n.zero{background:none;color:var(--muted);padding-inline:0}' +
    '.lp-seta{flex:none;color:var(--muted);font:400 var(--t-lg)/1 var(--f-body)}' +
    '.lp-cls{display:flex;align-items:stretch;gap:2px}.lp-cls>.lp-abre{flex:1;min-width:0}' +
    '.lp-bar{flex:none;width:6px;align-self:stretch;margin-block:6px;border-radius:3px;background:var(--c)}' +
    '.lp-cls.off .lp-bar{background:none;box-shadow:inset 0 0 0 1.5px var(--c)}.lp-cls.off .lp-x b{color:var(--muted)}' +
    '.lp-olho{flex:none;display:grid;place-items:center;width:48px;border:0;border-radius:var(--r1);background:none;color:var(--fg);cursor:pointer}' +
    '.lp-olho:hover{background:var(--hover)}.lp-olho svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}' +
    '.lp-olho .x{display:none}.lp-olho[aria-pressed=false]{color:var(--muted)}.lp-olho[aria-pressed=false] .x{display:inline}' +
    '.lp-bol{flex:none;width:10px;height:10px;border-radius:50%;background:var(--c)}' +
    '.lp-chk{flex:none;width:18px;height:18px;border:1.5px solid var(--line-forte);border-radius:4px;display:grid;place-items:center;font:700 12px/1 var(--f-body)}' +
    '.lp-cam[aria-pressed=true] .lp-chk{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}.lp-cam[aria-pressed=true] .lp-chk::before{content:"✓"}' +
    '.lp-cam .lp-x b{font-family:var(--f-body)}' +
    '.lp-volta .lp-x b{font-family:var(--f-body);color:var(--muted)}' +
    '.lp-vazio{margin:0;padding:var(--s3);color:var(--muted);font-size:var(--t-sm)}' +
    // resultados ao digitar (o visual da busca da página inicial): ícone do tipo, nome com o trecho digitado em destaque,
    // contexto numa linha e a NAE no selo vermelho; a opção marcada ganha o filete da cor de destaque
    '.lp-sug{position:absolute;top:calc(100% + 6px);left:0;z-index:1000;width:min(100%,540px);max-height:min(66vh,600px);overflow:auto;overscroll-behavior:contain;' +
    'padding:var(--s1);border-radius:var(--r3);background:var(--paper);box-shadow:var(--sh2);border:1px solid var(--line)}' +
    '.lp-sug[hidden]{display:none}.lp-sug ul{list-style:none;margin:0;padding:0}' +
    '.lp-st{padding:var(--s2) var(--s3) 2px;font:700 var(--t-xs)/1.4 var(--f-body);letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}' +
    '.lp-st span{font-weight:500;letter-spacing:0;text-transform:none}' +
    '.lp-so{display:flex;align-items:center;gap:var(--s2);min-height:48px;padding:var(--s2) var(--s3);border-radius:var(--r1);color:var(--fg);cursor:pointer}' +
    '@media (min-width:861px){.lp-so{min-height:44px}}' +
    '.lp-so:hover,.lp-so.marcado{background:var(--hover)}.lp-so.marcado{box-shadow:inset 3px 0 0 var(--accent)}' +
    '.lp-so:hover .lp-x b,.lp-so.marcado .lp-x b{color:var(--accent)}' +
    '.lp-si{flex:none;width:18px;height:18px;fill:none;stroke:var(--muted);stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}' +
    '.lp-so:hover .lp-si,.lp-so.marcado .lp-si{stroke:var(--accent)}.lp-so>.lp-bol{margin-inline:4px}' +
    '.lp-sug mark{background:none;color:var(--accent);font-weight:700;text-decoration:underline;text-underline-offset:2px}' +
    '.lp-sug-pe{display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px var(--s3);margin:var(--s1) 0 0;padding:var(--s2) var(--s3) var(--s1);' +
    'border-top:1px solid var(--line);font-size:var(--t-xs);color:var(--muted)}' +
    '.lp-sug .lp-vazio b{font-family:var(--f-mono);color:var(--fg)}' +
    '.barra-busca.lp-sugindo>.ativo-hit{display:none}' +   // a lista já mostra os achados do índice de ativos
    // nome do trecho na prévia do mapa (o visual do .lb de alimentador.css, sem a classe: a Faixa esconde os .lb de longe)
    '.lp-lb{font:700 13px/1 var(--f-display);color:#fff;background:rgba(0,0,0,.72);border-left:4px solid var(--c);padding:4px 7px;border-radius:3px;' +
    'white-space:nowrap;pointer-events:none;outline:2px solid var(--accent)}' +
    // barra dentro do mapa: flutua no canto de cima, à esquerda (onde ficavam T1 T2 T3 e o Menu); fechada, só o olho
    '.mapbox>.barra-busca{position:absolute;top:12px;left:12px;z-index:1001;display:block;width:min(560px,calc(100% - 24px));margin:0}' +
    '.mapbox>.barra-busca.lp-fechada{width:auto}' +
    '.mapbox>.barra-busca.lp-fechada>.lp-linha>:not(.lp-lupa),.mapbox>.barra-busca.lp-fechada>:not(.lp-linha){display:none!important}' +
    '.mapbox>.barra-busca>.ativo-hit{display:none}' +   // os achados do índice de ativos já vêm na lista dos resultados
    '.mapbox>.barra-busca .lp-lupa,.mapbox>.barra-busca .lp-fbt,.mapbox>.barra-busca .lp-linha>.busca{box-shadow:var(--sh-vidro)}' +
    // sobre o mapa o fundo do hover não pode ser transparente (no tema claro o olho preto sumia no mapa escuro)
    '.mapbox>.barra-busca .lp-lupa:hover,.mapbox>.barra-busca .lp-fbt:hover{background:color-mix(in srgb,var(--fg) 8%,var(--paper))}' +
    '.mapbox>.barra-busca :is(.lp-drop,.lp-fdrop,.lp-sug){max-height:var(--lp-max,min(66vh,600px))}' +
    // número de filtros ligados no olho (só com a barra fechada)
    '.lp-lupa{position:relative}.lp-ln{position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:9px;' +
    'background:var(--accent);color:var(--on-accent);font:700 11px/18px var(--f-mono);text-align:center;box-shadow:0 0 0 2px var(--paper)}' +
    '.barra-busca:not(.lp-fechada) .lp-ln{display:none}' +
    // sem a barra em cima do mapa, a folga que o modelo reserva para ela (até o fim da carga) não faz mais sentido
    '.al-site:not(.al-pronto) .wrap:not(:has(>.barra-busca))>.stage:has(.barra-busca){margin-top:0}' +
    '@media (prefers-reduced-motion:no-preference){.lp-drop:not([hidden]),.lp-fdrop:not([hidden]),.lp-sug:not([hidden]){animation:lp-entra var(--dur,160ms) ease-out}}' +
    '@keyframes lp-entra{from{opacity:0;transform:translateY(4px)}}';
  document.head.append(s);
})();

// Botão de voltar no começo do caminho (pedido do usuário, "que nem na página inicial"): só a seta, como o "←" do mapa da
// página inicial, e sobe um nível: para o município do caminho, se houver, senão para "Municípios". Fora do site
// publicado (cópia do Artifact) abre o site, em outra aba, como os outros links.
(function () {
  const poe = () => {
    const nav = document.querySelector('header .migalhas');
    if (!nav || nav.querySelector('.lp-voltar')) return !!nav;
    const SITE = 'https://lgrsv.github.io/vera-vegeta-o-back/teste/';
    const noSite = /(^|\.)github\.io$|^localhost$|^127\.0\.0\.1$/.test(location.hostname);
    const bt = document.createElement('button');
    bt.type = 'button';
    bt.className = 'lp-voltar';
    bt.innerHTML = '<span aria-hidden="true">←</span>';
    const alvo = () => { const as = nav.querySelectorAll('a[href]'); return as[as.length - 1]; };
    const marca = () => { const a = alvo(), t = a ? 'Voltar a ' + a.textContent.trim() : 'Voltar'; bt.title = t; bt.setAttribute('aria-label', t); bt.hidden = !a; };
    bt.addEventListener('click', () => {
      const a = alvo();
      if (!a) return;
      if (noSite) location.href = a.href;
      else window.open(SITE + a.getAttribute('href').replace(/^(\.\.\/)+/, ''), '_blank', 'noopener');
    });
    nav.prepend(bt);
    marca();
    new MutationObserver(marca).observe(nav, { childList: true, subtree: true });   // o município entra no caminho depois
    const css = document.createElement('style');
    css.textContent = '.migalhas .lp-voltar{display:inline-grid;place-items:center;width:32px;height:32px;margin-right:var(--s1,4px);padding:0;' +
      'border:1px solid var(--line,#d6dad6);border-radius:var(--r2,10px);background:var(--paper,#fbfbf9);color:var(--accent,#b8431f);' +
      'font:600 17px/1 var(--f-body,system-ui);cursor:pointer}' +
      '.migalhas .lp-voltar:hover{background:var(--hover,rgb(0 0 0 / .05))}.migalhas .lp-voltar[hidden]{display:none}' +
      '.migalhas .lp-voltar:focus-visible{outline:2px solid var(--accent,#b8431f);outline-offset:2px}' +
      '@media (pointer:coarse){.migalhas .lp-voltar{width:40px;height:40px}}';
    document.head.append(css);
    return true;
  };
  if (!poe()) addEventListener('DOMContentLoaded', poe, { once: true });
})();
