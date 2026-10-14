// OS de manutenção EXECUTADAS nos ativos do alimentador (roda depois de manutencao.js, com window.D e window.EXECUTADAS
// de scripts/executadas.py: corretivas MC e preventivas MP; inspeção, manobra e construção ficaram de fora).
// Card "Manutenção" no mapa, ao lado do "Insp→manut": um losango por ativo manutencionado (poste, transformador ou
// chave), na cor do ano da execução mais recente (as mesmas cores de ano da Faixa); o número é a quantidade de OS.
// Filtros: ano (legenda do mapa e painel) e tipo de serviço (painel). Ligar a Manutenção desliga o Insp→manut e
// vice-versa (os dois são losangos). Posição: o poste da ESTRUTURA da OS; sem ele no mapa, o ativo da ESTRUTURA ou o
// ELEMENTO (o trafo ou a chave que atende o local). Usa o visual do cartão da limpeza (classes limp-* do limpeza.js).
(function () {
  const EX = window.EXECUTADAS;
  if (!EX || !window.D) return;
  const map = window.__map;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const br = d => d ? d.split('-').reverse().join('/') : '—';
  const nf = n => n.toLocaleString('pt-BR');
  const guarda = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } return null; };
  const celular = () => matchMedia('(max-width:980px)').matches;
  const telaCheia = () => document.body.classList.contains('tela-cheia');

  // OS: [número, tipo (em EX.tipos), data de execução, equipe, ativo (em EX.ativos ou -1), descrição, criticidade,
  //      alimentador da OS quando é outro]; ativo: [código, tipo no índice, trecho, lat, lon, de onde veio (p, e, l)]
  const OS = EX.os, AT = EX.ativos;
  const COR_ANO = { 2021: '#a78bfa', 2022: '#60a5fa', 2023: '#22d3ee', 2024: '#4ade80', 2025: '#facc15', 2026: '#fb923c', 2027: '#f87171', 2028: '#f472b6' };
  const corAno = a => COR_ANO[a] || (a < 2021 ? '#c4b5fd' : '#fb7185');
  const anoDe = k => +(OS[k][2] || '').slice(0, 4) || 0;
  const ANOS = [...new Set(OS.map((o, k) => anoDe(k)))].sort((a, b) => b - a);
  const rotAno = a => a ? String(a) : 'Sem data';
  const classe = t => t.startsWith('MP') ? 'preventiva' : 'corretiva';
  const nomeTipo = t => { const s = t.replace(/^M[CP] - /, ''); return s.charAt(0) + s.slice(1).toLowerCase(); };
  const TIPO_TXT = EX.tipos.map(t => `${nomeTipo(t)} (${classe(t)})`);
  const NOME_AT = { poste: 'Poste', TR: 'Transformador', DJ: 'Disjuntor', 79: 'Religador', 40: 'Trip saver', 41: 'Trip saver' };
  const nomeAtivo = a => `${NOME_AT[a[1]] || 'Chave'} ${a[0]}`;
  const COMO = { p: 'poste da ESTRUTURA da OS', e: 'ativo da ESTRUTURA da OS',
    l: 'ELEMENTO da OS (o poste da OS não está no mapa: é o trafo ou a chave que atende o local)' };
  const SEM_POS = OS.filter(o => o[4] < 0).length;
  const OUTRO_AL = OS.filter(o => o[7]).length;
  // OS de cada ativo (já vêm da mais recente para a mais antiga)
  const DO_ATIVO = AT.map(() => []);
  OS.forEach((o, k) => { if (o[4] >= 0) DO_ATIVO[o[4]].push(k); });
  // postes de cada trecho (pontas dos vãos), para o detalhe do trecho
  const postesDoTrecho = {};
  D.vaos.forEach(v => { const n = D.trechos[v[4]].nome; (postesDoTrecho[n] = postesDoTrecho[n] || new Set()).add(v[6]); postesDoTrecho[n].add(v[7]); });

  const st = {
    ligado: guarda('exe-ligado') === '1',
    anos: new Set(ANOS),
    tipo: -1,                                         // -1: todos os tipos de serviço
    foco: null,
    mais: guarda('exe-mais') === '1',
    lista: false,
    grupos: new Set(),
  };
  const passa = k => st.anos.has(anoDe(k)) && (st.tipo < 0 || OS[k][1] === st.tipo);
  const contaAno = a => OS.reduce((n, o, k) => n + (anoDe(k) === a && (st.tipo < 0 || o[1] === st.tipo)), 0);

  const css = document.createElement('style');
  css.textContent = `
.ctl-card .ctl-exe{background-image:linear-gradient(90deg,${ANOS.slice().reverse().map(corAno).join(',')}${ANOS.length < 2 ? ',' + corAno(ANOS[0]) : ''});background-repeat:no-repeat;background-size:100% 3px;background-position:0 100%}
.ctl-card .ctl-exe[aria-pressed=false]{opacity:.6;text-decoration:line-through;background-image:none;box-shadow:inset 0 -3px 0 #5a636a}
.exe-m{position:relative;width:0;height:0;cursor:pointer}
.exe-m i{position:absolute;left:-7px;top:-7px;width:14px;height:14px;box-sizing:border-box;transform:rotate(45deg);border-radius:2px;background:var(--c);
  border:2px solid #fff;box-shadow:0 0 0 1.5px #0b0f14,0 1px 4px #0008}
.exe-m b{position:absolute;left:6px;top:-18px;min-width:16px;height:16px;padding:0 4px;box-sizing:border-box;border-radius:8px;background:#0b0f14;
  color:#fff;font:700 10.5px/16px var(--f-mono);text-align:center;box-shadow:0 0 0 1.5px #fff}
.exe-m.foco i{left:-11px;top:-11px;width:22px;height:22px;border-width:3px;box-shadow:0 0 0 3px #fde047,0 2px 8px #000a}
.exe-m.apaga{opacity:.35}
.exe-m.grupo i{left:-9px;top:-9px;width:18px;height:18px;box-shadow:0 0 0 1.5px #0b0f14,3px 3px 0 0 #fff,3px 3px 0 1.5px #0b0f14,0 1px 4px #0008}   /* grupo: losango empilhado */
.exe-m.grupo b{left:8px;top:-21px}
.exe-lg{display:grid;gap:0;padding:var(--s1);background:var(--vidro);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:var(--vidro-fg);
  border:1px solid var(--vidro-borda);border-radius:var(--r2);box-shadow:var(--sh-vidro);font:var(--t-xs)/1.2 var(--f-body)}
.exe-lg[hidden]{display:none}
.exe-lg>span{padding:4px var(--s2) 2px;font-weight:700}
.exe-lg>span small{display:block;font-weight:500;opacity:.8;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.exe-lg button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:var(--s2);min-height:30px;padding:0 var(--s2);border-radius:var(--r1)}
.exe-lg button:hover{background:var(--vidro-hover)}
.exe-lg button:focus-visible{outline:2px solid var(--foco-mapa);outline-offset:-2px}
.exe-lg button[aria-pressed=false]{opacity:.55;text-decoration:line-through}
.exe-lg i{width:9px;height:9px;transform:rotate(45deg);background:var(--c);border:1.5px solid #fff;border-radius:1px;flex:none;margin:0 2px}
.exe-lg em{font:600 var(--t-xs) var(--f-mono);font-style:normal;margin-left:auto;padding-left:var(--s2);opacity:.85}
@media (pointer:coarse){.exe-lg button{min-height:40px}}
@media (max-width:640px){.exe-lg>span,.exe-lg button .nm{display:none}.exe-lg button{gap:6px;padding:0 8px}.exe-lg em{padding-left:0}}   /* celular: só o losango e o número */
.exe-os-b{display:grid;gap:2px;text-align:left;width:100%;min-height:var(--alvo);padding:var(--s2) var(--s3);border:0;border-left:3px solid var(--c);border-radius:0 var(--r1) var(--r1) 0;
  background:color-mix(in srgb,var(--fg) 4%,transparent);color:var(--fg);cursor:pointer;font:var(--t-sm) var(--f-body)}
.exe-os-b:hover{background:color-mix(in srgb,var(--fg) 8%,transparent)}
.exe-os-b[aria-pressed=true]{background:var(--sel)}
.exe-os-b:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.exe-os-b .q{font:600 var(--t-xs) var(--f-mono);font-variant-numeric:tabular-nums}
.exe-os-b .s{color:var(--muted);font-size:var(--t-xs)}
.exe-tipo{display:grid;gap:var(--s1);font:600 var(--t-xs) var(--f-body);color:var(--muted)}
.exe-tipo select{font:var(--t-sm) var(--f-body);color:var(--fg);background:var(--paper,transparent);border:1px solid var(--line);border-radius:var(--r1);min-height:var(--alvo);padding:0 var(--s2);max-width:100%}
.exe-tipo select:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.exe-pop .t{font:700 15px var(--f-display);margin-bottom:2px}
.exe-pop .t small{font:500 12px var(--f-body);color:#5a636a;margin-left:4px}
.exe-pop .onde{font-size:12px;color:#5a636a;margin-bottom:4px}
.exe-pop .lb-l{border-left:5px solid var(--c);padding:3px 0 3px 7px;margin:4px 0;font-size:12.5px;line-height:1.35}
.exe-pop .lb-l b{font-family:var(--f-mono);font-size:12.5px}
.exe-pop .lb-l small{display:block;color:#5a636a}
@media (prefers-reduced-motion:no-preference){.exe-os-b,.exe-lg button{transition:background-color var(--dur) var(--ease)}}`;
  document.head.append(css);

  // ---------- mapa ----------
  // Há alimentador com milhares de ativos manutencionados: só entra o que está na tela, e com o mapa afastado (zoom
  // abaixo de ZOOM_SOLTO) os ativos que caem na mesma célula de CELULA px viram um losango de grupo (soma das OS;
  // tocar aproxima). Redesenha a cada movimento do mapa.
  const ZOOM_SOLTO = 17, CELULA = 44;
  const camada = map ? L.layerGroup() : null;
  const visiveis = i => DO_ATIVO[i].filter(passa);
  const losango = (ll, cls, cor, n, titulo, z) => L.marker(ll, { keyboard: false, zIndexOffset: z, title: titulo,
    icon: L.divIcon({ className: '', iconSize: null, html: `<div class="exe-m${cls}" style="--c:${cor}"><i></i>${n > 1 ? `<b>${nf(n)}</b>` : ''}</div>` }) });
  const marcaAtivo = (i, ks, fa) => losango([AT[i][3], AT[i][4]], fa >= 0 ? (fa === i ? ' foco' : ' apaga') : '', corAno(Math.max(...ks.map(anoDe))), ks.length,
    `${nomeAtivo(AT[i])}: ${ks.length} OS de manutenção executadas`, fa === i ? 3000 : 1400).on('click', e => balao(e, i));
  function marcaGrupo(c, fa) {
    const lls = c.is.map(i => [AT[i][3], AT[i][4]]);
    const ll = [lls.reduce((s, p) => s + p[0], 0) / lls.length, lls.reduce((s, p) => s + p[1], 0) / lls.length];
    return losango(ll, ' grupo' + (fa >= 0 ? ' apaga' : ''), corAno(c.ano), c.n, `${nf(c.is.length)} ativos, ${nf(c.n)} OS: toque para aproximar`, 1300)
      .on('click', e => { L.DomEvent.stopPropagation(e); map.fitBounds(L.latLngBounds(lls), { padding: [60, 60], maxZoom: ZOOM_SOLTO }); });
  }
  function desenha() {
    if (!map) return;
    camada.clearLayers();
    if (!st.ligado) { camada.remove(); return; }
    if (!map.hasLayer(camada)) camada.addTo(map);
    const fa = st.foco !== null ? OS[st.foco][4] : -1;
    const z = map.getZoom(), tela = map.getBounds().pad(0.25), soltos = z >= ZOOM_SOLTO;
    const celulas = new Map();
    AT.forEach((a, i) => {
      if (i !== fa && !tela.contains([a[3], a[4]])) return;
      const ks = visiveis(i);
      if (!ks.length) return;
      if (soltos || i === fa) { camada.addLayer(marcaAtivo(i, ks, fa)); return; }
      const p = map.project([a[3], a[4]], z), chave = Math.floor(p.x / CELULA) + ',' + Math.floor(p.y / CELULA);
      if (!celulas.has(chave)) celulas.set(chave, { is: [], ks: [], n: 0, ano: 0 });
      const c = celulas.get(chave);
      c.is.push(i); c.ks = ks; c.n += ks.length; c.ano = Math.max(c.ano, ...ks.map(anoDe));
    });
    celulas.forEach(c => camada.addLayer(c.is.length === 1 ? marcaAtivo(c.is[0], c.ks, fa) : marcaGrupo(c, fa)));
  }
  if (map) map.on('moveend', () => { if (st.ligado) desenha(); });   // depois de arrastar e de mudar o zoom
  const linhaOs = k => {
    const o = OS[k];
    return `<div class="lb-l" style="--c:${corAno(anoDe(k))}"><b>${esc(nomeTipo(EX.tipos[o[1]]))}</b> · ${br(o[2])} · ${classe(EX.tipos[o[1]])}` +
      `${o[5] ? `<small>${esc(o[5])}</small>` : ''}<small>OS ${esc(o[0])} · ${esc(o[3])}${o[6] ? ' · ' + esc(o[6]) : ''}${o[7] ? ' · OS do alimentador ' + esc(o[7]) : ''}</small></div>`;
  };
  function balao(e, i) {
    L.DomEvent.stopPropagation(e);
    const a = AT[i], ks = visiveis(i);
    const html = `<div class="exe-pop"><div class="t">${esc(nomeAtivo(a))} <small>${ks.length} OS executada${ks.length > 1 ? 's' : ''}</small></div>` +
      `<div class="onde">${a[2] ? 'Trecho ' + esc(a[2]) + ' · ' : ''}posição: ${COMO[a[5]]}</div>${ks.map(linhaOs).join('')}</div>`;
    L.popup({ className: 'limp-popup', maxWidth: 320, maxHeight: 340, autoPanPadding: [20, 20], autoPanPaddingTopLeft: window.__folgaBalao ? window.__folgaBalao() : [20, 20] })
      .setLatLng([a[3], a[4]]).setContent(html).openOn(map);
  }

  function enquadra(ll) {
    if (!map) return;
    const mb = document.querySelector('.mapbox');
    if (celular() && !telaCheia() && getComputedStyle(mb).position !== 'sticky') mb.scrollIntoView({ block: 'start' });
    map.invalidateSize();
    map.setView(ll, Math.max(map.getZoom(), 17));
  }
  function focar(k, enquadrar) {
    st.foco = st.foco === k ? null : k;
    if (st.foco !== null) {
      const o = OS[k];
      st.grupos.add(anoDe(k));
      st.mais = true; st.lista = true;
      if (o[4] >= 0) {
        if (!st.ligado) liga(true);
        st.anos.add(anoDe(k));
        if (st.tipo >= 0 && st.tipo !== o[1]) st.tipo = -1;   // o filtro de tipo escondia a OS
        if (enquadrar) enquadra([AT[o[4]][3], AT[o[4]][4]]);
      }
    }
    desenha(); pinta();
  }
  function liga(on) {
    st.ligado = on; guarda('exe-ligado', on ? '1' : '0');
    if (on && window.__soEsteLosango) window.__soEsteLosango('exe');
    if (!on) st.foco = null;
    desenha(); pinta();
  }
  if (window.__losangos) window.__losangos.exe = { desliga: () => { if (st.ligado) liga(false); } };
  function alternaAno(a) { st.anos.has(a) ? st.anos.delete(a) : st.anos.add(a); desenha(); pinta(); }

  // legenda (filtro por ano) no canto de cima, embaixo do + e −; criada depois dos outros controles da página
  let lg = null;
  const poeLegenda = () => {
    if (!map || lg) return;
    const Leg = L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const d = L.DomUtil.create('div', 'exe-lg');
        d.setAttribute('role', 'group');
        d.setAttribute('aria-label', 'OS de manutenção executadas no mapa, por ano');
        L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
        d.addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (b) { e.stopPropagation(); alternaAno(+b.dataset.a); } });
        return d;
      },
    });
    lg = new Leg().addTo(map).getContainer();
    pinta();
  };

  // botão "Manutenção" no mapa, na linha do "Faixa", "Inspeção" e "Insp→manut"
  const l2 = map && window.__ctlMapa ? window.__ctlMapa() : null;
  let btn = null;
  if (l2) {
    const c = document.createElement('div');
    c.className = 'ctl-card';
    c.innerHTML = '<button type="button" class="ctl-exe" aria-pressed="false" title="Mostrar ou esconder as OS de manutenção executadas nos ativos">Manutenção</button>';
    l2.append(c);
    btn = c.querySelector('button');
    btn.addEventListener('click', () => liga(!st.ligado));
  }

  // ---------- cartão no painel ----------
  const card = document.createElement('section');
  card.className = 'limp-card exe-card';
  card.setAttribute('aria-label', 'OS de manutenção executadas');
  const depois = document.querySelector('.mnt-card') || document.querySelector('.insp-card') || document.querySelector('.limp-card') || $('det');
  if (depois) depois.after(card); else document.querySelector('.panel').append(card);

  const ondeTxt = o => o[4] >= 0 ? `${nomeAtivo(AT[o[4]])}${AT[o[4]][2] ? ' (trecho ' + esc(AT[o[4]][2]) + ')' : ''} · posição: ${COMO[AT[o[4]][5]]}`
    : 'sem posição no mapa: nem o poste da ESTRUTURA nem o ELEMENTO da OS estão no mapa';
  const focoHtml = k => {
    const o = OS[k];
    return `<div class="limp-foco"><span class="q">OS ${esc(o[0])} · ${esc(nomeTipo(EX.tipos[o[1]]))} (${classe(EX.tipos[o[1]])}) · executada ${br(o[2])}</span>
      ${o[5] ? `<span>${esc(o[5])}</span>` : ''}
      <span class="limp-nota">Equipe ${esc(o[3])}${o[6] ? ' · criticidade ' + esc(o[6]) : ''}${o[7] ? ' · OS do alimentador ' + esc(o[7]) + ' (o ativo hoje está neste)' : ''}</span>
      <span class="limp-nota">${ondeTxt(o)}</span></div>`;
  };
  const osBtn = (k, comFoco) => {
    const o = OS[k];
    return `<button type="button" class="exe-os-b" data-k="${k}" style="--c:${corAno(anoDe(k))}" aria-pressed="${st.foco === k}">` +
      `<span class="q">${esc(nomeTipo(EX.tipos[o[1]]))} · ${br(o[2])} · OS ${esc(o[0])}</span><span class="s">${esc(o[5].slice(0, 110))}${o[5].length > 110 ? '…' : ''}` +
      `${o[4] >= 0 ? (o[5] ? ' · ' : '') + esc(nomeAtivo(AT[o[4]])) : (o[5] ? ' · ' : '') + 'sem posição no mapa'}</span></button>` +
      (comFoco && st.foco === k ? focoHtml(k) : '');
  };
  // grupos da lista por ano: o conteúdo só é montado com o grupo aberto (há alimentador com milhares de OS)
  const grupo = a => {
    const ks = OS.map((o, k) => k).filter(k => anoDe(k) === a && (st.tipo < 0 || OS[k][1] === st.tipo));
    if (!ks.length) return '';
    const aberto = st.grupos.has(a);
    return `<details class="limp-grupo" data-g="${a}"${aberto ? ' open' : ''}><summary style="--c:${corAno(a)}"><i></i>${rotAno(a)} <span>${nf(ks.length)} OS</span></summary>` +
      `<div>${aberto ? ks.map(k => osBtn(k, true)).join('') : ''}</div></details>`;
  };
  const opcoesTipo = () => {
    const n = EX.tipos.map(() => 0);
    OS.forEach(o => { n[o[1]]++; });
    return `<option value="-1"${st.tipo < 0 ? ' selected' : ''}>Todos (${nf(OS.length)} OS)</option>` +
      EX.tipos.map((t, i) => [i, n[i]]).sort((a, b) => b[1] - a[1])
        .map(([i, c]) => `<option value="${i}"${st.tipo === i ? ' selected' : ''}>${esc(TIPO_TXT[i])} · ${nf(c)}</option>`).join('');
  };

  function pinta() {
    const f = document.activeElement;
    const chave = card.contains(f) ? (f.dataset.k !== undefined ? `[data-k="${f.dataset.k}"]` : f.dataset.foco ? `[data-foco="${f.dataset.foco}"]` : null) : null;
    const n = OS.length;
    const noMapa = AT.length;
    const sub = n ? `${nf(n)} OS de manutenção executadas (corretivas e preventivas) em ${nf(noMapa)} ativos no mapa` +
      (EX.de ? ` · execução de ${br(EX.de)} a ${br(EX.ate)}` : '') : 'Nenhuma OS de manutenção executada neste alimentador';
    const anos = `<div class="limp-anos">${ANOS.map(a => `<div class="limp-ano-l">
        <button type="button" class="liga" data-a="${a}" data-foco="a${a}" aria-pressed="${st.anos.has(a)}" title="Mostrar/esconder no mapa"><i style="--c:${corAno(a)}"></i><b>${rotAno(a)}</b><em>${nf(contaAno(a))} OS</em></button></div>`).join('')}</div>`;
    const tipo = `<label class="exe-tipo">Tipo de serviço<select data-foco="tipo">${opcoesTipo()}</select></label>`;
    const nota = `<p class="limp-nota">No mapa, um losango por ativo manutencionado, na cor do ano da OS mais recente; o número é a quantidade de OS. ` +
      `Posição: o poste da ESTRUTURA da OS; sem ele no mapa (rede BT), o ativo da ESTRUTURA ou o ELEMENTO (o trafo ou a chave que atende o local).` +
      `${OUTRO_AL ? ` ${nf(OUTRO_AL)} OS são de outro alimentador, mas o ativo hoje está neste.` : ''}${SEM_POS ? ` ${nf(SEM_POS)} OS sem posição: só na lista.` : ''}</p>`;
    const lista = `<details class="limp-lista"${st.lista ? ' open' : ''}><summary data-foco="lista">Ver as OS por ano</summary><div>${st.lista ? ANOS.map(grupo).join('') : ''}</div></details>`;
    card.innerHTML = `<div class="limp-top"><h2>Manutenção<small>${sub}</small></h2></div>
      ${!st.ligado && btn && n ? '<p class="limp-nota limp-desl">Desligada no mapa: toque em <b>Manutenção</b>, no canto do mapa, para ver os ativos manutencionados.</p>' : ''}
      ${n ? `<details class="limp-mais"${st.mais ? ' open' : ''}><summary data-foco="mais">Anos, tipos e OS</summary><div>${anos}${tipo}${nota}${lista}</div></details>` : ''}`;
    if (chave) card.querySelector(chave)?.focus({ preventScroll: true });
    if (btn) btn.setAttribute('aria-pressed', String(st.ligado));
    if (lg) {
      lg.hidden = !st.ligado || !n;
      lg.innerHTML = `<span>Manutenção${st.tipo >= 0 ? `<small title="${esc(TIPO_TXT[st.tipo])}">${esc(nomeTipo(EX.tipos[st.tipo]))}</small>` : ''}</span>` +
        ANOS.map(a => `<button type="button" data-a="${a}" aria-pressed="${st.anos.has(a)}" title="Mostrar/esconder ${rotAno(a)}"><i style="--c:${corAno(a)}"></i><span class="nm">${rotAno(a)}</span><em>${nf(contaAno(a))}</em></button>`).join('');
    }
    if (det) det.querySelectorAll('.exe-os-b').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.k === st.foco)));
  }
  card.addEventListener('toggle', e => {
    const d = e.target;
    if (d.classList.contains('limp-mais')) { st.mais = d.open; guarda('exe-mais', d.open ? '1' : '0'); }
    else if (d.classList.contains('limp-lista')) { if (st.lista !== d.open) { st.lista = d.open; if (d.open) pinta(); } }
    else if (d.dataset.g) {
      const a = +d.dataset.g;
      if (d.open === st.grupos.has(a)) return;
      d.open ? st.grupos.add(a) : st.grupos.delete(a);
      if (d.open) pinta();                            // monta as OS do ano aberto
    }
  }, true);
  card.addEventListener('change', e => {
    if (e.target.matches('.exe-tipo select')) { st.tipo = +e.target.value; st.foco = null; desenha(); pinta(); }
  });
  card.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k !== undefined) return focar(+b.dataset.k, true);
    if (b.classList.contains('liga') && b.dataset.a) return alternaAno(+b.dataset.a);
  });

  // ---------- detalhe do trecho: OS nos ativos dele ----------
  const det = $('det');
  const MAX_TRECHO = 60;
  function secTrecho(nome) {
    const ps = postesDoTrecho[nome] || new Set();
    const ks = OS.map((o, k) => k).filter(k => {
      const i = OS[k][4];
      return i >= 0 && (AT[i][1] === 'poste' ? ps.has(AT[i][0]) : AT[i][2] === nome);
    });
    if (!ks.length) return '';
    const porAno = ANOS.map(a => [a, ks.filter(k => anoDe(k) === a).length]).filter(([, c]) => c);
    return `<section class="limp-sec exe-sec" aria-live="off"><h3>Manutenção executada</h3>
      <dl><dt>OS</dt><dd>${nf(ks.length)} · ${porAno.map(([a, c]) => `${rotAno(a)}: ${nf(c)}`).join(' · ')}</dd></dl>
      ${ks.slice(0, MAX_TRECHO).map(k => osBtn(k, false)).join('')}
      ${ks.length > MAX_TRECHO ? `<p class="limp-nota">Mostrando as ${MAX_TRECHO} mais recentes; as outras estão no card Manutenção e nos losangos do mapa.</p>` : ''}</section>`;
  }
  function poeDetalhe() {
    if (!det || det.querySelector('.exe-sec')) return;
    const h2 = det.querySelector('h2');
    if (!h2) return;
    const nome = [...h2.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if (postesDoTrecho[nome]) det.insertAdjacentHTML('beforeend', secTrecho(nome));
  }
  if (det) {
    new MutationObserver(poeDetalhe).observe(det, { childList: true });
    det.addEventListener('click', e => { const b = e.target.closest('.exe-os-b'); if (b) focar(+b.dataset.k, true); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', poeLegenda); else poeLegenda();
  poeDetalhe();
  desenha();
  pinta();
})();
