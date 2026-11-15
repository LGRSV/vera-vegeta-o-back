// OS de manutenção EXECUTADAS nos ativos do alimentador (roda depois de manutencao.js, com window.D e window.EXECUTADAS
// de scripts/executadas.py: corretivas MC e preventivas MP; inspeção, manobra e construção ficaram de fora).
// "Manutenção" no menu Camadas do mapa, com o "Insp→manut": um losango por ativo manutencionado (poste, transformador ou
// chave), na cor do ano da execução mais recente (as mesmas cores de ano da Faixa); o número é a quantidade de OS.
// Filtro do mapa: ano (legenda do mapa e painel); o mapa mostra todos os tipos de serviço. Liga junto com o Insp→manut
// (no mesmo poste, o losango da Manutenção fica um pouco deslocado; manutencao.js).
// Posição: o poste da ESTRUTURA da OS; sem ele no mapa, o ativo da ESTRUTURA ou o
// ELEMENTO (o trafo ou a chave que atende o local). Usa o visual do cartão da limpeza (classes limp-* do limpeza.js).
// Em "Dados" (Downloads, extras.js): a lista de tipos de serviço (vale só para o download) e "Baixar N OS (Excel)", o CSV
// das OS dos tipos marcados (todos os anos).
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
  // OS de cada ativo (já vêm da mais recente para a mais antiga)
  const DO_ATIVO = AT.map(() => []);
  OS.forEach((o, k) => { if (o[4] >= 0) DO_ATIVO[o[4]].push(k); });
  // postes de cada trecho (pontas dos vãos), para o detalhe do trecho
  const postesDoTrecho = {};
  D.vaos.forEach(v => { const n = D.trechos[v[4]].nome; (postesDoTrecho[n] = postesDoTrecho[n] || new Set()).add(v[6]); postesDoTrecho[n].add(v[7]); });

  const st = {
    ligado: guarda('exe-ligado') === '1',
    anos: new Set(ANOS),
    tipos: new Set(),        // tipos de serviço do download (índices em EX.tipos); vazio: todos
    tiposAberto: false,      // lista de marcar dos tipos aberta (em "Dados")
    foco: null,
    grupos: new Set(),       // anos abertos, com as OS embaixo
  };
  const doTipo = k => !st.tipos.size || st.tipos.has(OS[k][1]);   // só o download
  const passa = k => st.anos.has(anoDe(k));
  const contaAno = a => OS.reduce((n, o, k) => n + (anoDe(k) === a), 0);
  const N_TIPO = EX.tipos.map(() => 0);
  OS.forEach(o => { N_TIPO[o[1]]++; });
  const TIPOS_ORD = EX.tipos.map((t, i) => i).sort((a, b) => N_TIPO[b] - N_TIPO[a]);   // mais OS primeiro
  // texto curto do botão: "Todos os tipos", o tipo escolhido ou "3 tipos"
  const rotTipos = () => !st.tipos.size ? 'Todos os tipos' : st.tipos.size === 1 ? TIPO_TXT[[...st.tipos][0]] : `${st.tipos.size} tipos`;

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
/* tipos de serviço do download, em "Dados": o botão no visual do botão de meses do NAE; a lista abre embaixo dele, no painel */
.exe-tipos{flex:1 1 100%;min-width:0}   /* min-width:0: o nome longo do tipo não alarga o painel (sem rolagem lateral no celular) */
.exe-tipos-b{display:block;width:100%;min-height:var(--alvo);padding:0 32px 0 var(--s3);border:1px solid var(--line-forte,var(--line));border-radius:var(--r2);text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  background:var(--paper) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M2.5 4.5 6 8l3.5-3.5' fill='none' stroke='%238c948f' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 12px center/12px;
  color:var(--fg);font:var(--t-sm) var(--f-body);cursor:pointer}
.exe-tipos-b[aria-expanded=true]{border-color:var(--accent)}
.exe-tipos-b:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.mes-lista.exe-tipos-l{position:static;width:auto;min-width:0;max-width:none;margin-top:var(--s1);box-shadow:none}
.exe-tipos-l label{white-space:normal;font-size:var(--t-sm);line-height:1.25;padding-block:4px}
.exe-tipos-l label span{flex:1;min-width:0}
.exe-tipos-l small{font-family:var(--f-mono);white-space:nowrap}
.exe-pop .t{font:700 15px var(--f-display);margin-bottom:2px}
.exe-pop .t small{font:500 12px var(--f-body);color:#5a636a;margin-left:4px}
.exe-pop .onde{font-size:12px;color:#5a636a;margin-bottom:4px}
.exe-pop .lb-l{border-left:5px solid var(--c);padding:3px 0 3px 7px;margin:4px 0;font-size:12.5px;line-height:1.35}
.exe-pop .lb-l b{font-family:var(--f-mono);font-size:12.5px}
.exe-pop .lb-l small{display:block;color:#5a636a}
@media (prefers-reduced-motion:no-preference){.exe-os-b,.exe-lg button{transition:background-color var(--dur) var(--ease),border-color var(--dur) var(--ease)}}`;
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
  function focar(k, enquadrar, doPainel) {
    st.foco = st.foco === k ? null : k;
    if (st.foco !== null) {
      const o = OS[k];
      st.grupos.add(anoDe(k));                          // abre a linha do ano da OS
      if (o[4] >= 0) {
        if (!st.ligado) liga(true);
        st.anos.add(anoDe(k));
        if (enquadrar) enquadra([AT[o[4]][3], AT[o[4]][4]]);
      }
    }
    desenha(); pinta();
    if (!doPainel && window.__rolaPainel) window.__rolaPainel(card, st.foco);
  }
  function liga(on) {
    st.ligado = on; guarda('exe-ligado', on ? '1' : '0');
    if (!on) st.foco = null;
    desenha(); pinta();
  }
  function alternaAno(a) { st.anos.has(a) ? st.anos.delete(a) : st.anos.add(a); desenha(); pinta(); }

  // legenda (filtro por ano), criada depois dos outros controles da página; extras.js a põe na coluna da direita,
  // embaixo do menu Camadas
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

  // botão "Manutenção" no menu Camadas do mapa (extras.js), com "Faixa", "Inspeção" e "Insp→manut"
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
  // linha de um ano (o mesmo visual da Faixa): a cor liga/desliga no mapa, o resto abre as OS do ano logo abaixo; elas
  // só são montadas com a linha aberta (há alimentador com milhares de OS)
  function linha(a) {
    const n = contaAno(a), aberto = st.grupos.has(a) && n > 0, id = 'exe-g-' + a, on = st.anos.has(a);
    const i = `<i style="--c:${corAno(a)}"></i>`;
    const ks = aberto ? OS.map((o, k) => k).filter(k => anoDe(k) === a) : [];
    return `<div class="limp-ano-l${st.ligado && !on ? ' off' : ''}">` +
      (st.ligado ? `<button type="button" class="liga" data-a="${a}" data-foco="a${a}" aria-pressed="${on}" aria-label="${rotAno(a)} no mapa" title="Mostrar/esconder no mapa">${i}</button>`
        : `<span class="cor" aria-hidden="true">${i}</span>`) +
      `<button type="button" class="abre" data-g="${a}" data-foco="g${a}" aria-expanded="${aberto}" aria-controls="${id}"${n ? '' : ' disabled'}><span><b>${rotAno(a)}</b></span><em>${nf(n)} OS</em></button>` +
      `</div><div class="limp-oss" id="${id}" role="group" aria-label="OS de ${rotAno(a)}"${aberto ? '' : ' hidden'}>${ks.map(k => osBtn(k, true)).join('')}</div>`;
  }
  // ---------- Downloads (em "Dados", extras.js): tipos de serviço para marcar e a planilha das OS desses tipos ----------
  // CSV pelo window.__csv (BOM, ';', CRLF, dd/mm/aaaa, vírgula decimal, proteção contra fórmula); todos os anos
  const ONDE_CSV = { p: 'poste da ESTRUTURA', e: 'ativo da ESTRUTURA', l: 'ELEMENTO' };
  const COLS = ['Alimentador', 'OS', 'Tipo de serviço', 'Classe', 'Execução', 'Equipe', 'Criticidade', 'Ativo', 'Trecho',
    'Latitude', 'Longitude', 'Posição', 'Alimentador da OS', 'Descrição'];
  const AL = String((D.meta && D.meta.al) || 'alimentador');
  // OS dos tipos marcados, da mais recente para a mais antiga
  const osDoDownload = () => OS.map((o, k) => k).filter(doTipo).sort((a, b) => (OS[b][2] || '').localeCompare(OS[a][2] || ''));
  function baixaOs() {
    const C = window.__csv, ks = osDoDownload();
    if (!C || !ks.length) return;
    const linhas = ks.map(k => {
      const o = OS[k], t = EX.tipos[o[1]], a = o[4] >= 0 ? AT[o[4]] : null;
      return [AL, o[0], nomeTipo(t), classe(t), C.data(o[2]), o[3], o[6], a ? nomeAtivo(a) : '', a ? a[2] : '',
        a ? C.num(a[3]) : '', a ? C.num(a[4]) : '', a ? ONDE_CSV[a[5]] || '' : 'sem posição', o[7] && o[7] !== AL ? o[7] : '', o[5]];
    });
    const datas = ks.map(k => OS[k][2]).filter(Boolean), hoje = new Date().toISOString().slice(0, 10);
    const de = datas.length ? datas[datas.length - 1] : hoje, ate = datas.length ? datas[0] : hoje;
    C(`OS_manutencao_${C.arq(AL)}_${de}_a_${ate}.csv`, COLS, linhas);
  }

  // tipos de serviço: botão com a lista de marcar (um, vários ou todos), no jeito do NAE dos meses (mapa_trechos.html);
  // a lista abre embaixo do botão, dentro de "Dados"
  let dlx = null, dlBtn = null;
  if (OS.length && window.__baixar && window.__csv) {
    dlx = window.__baixar('exe');
    const t = document.createElement('div');
    t.className = 'exe-tipos';
    t.innerHTML = `<button type="button" class="exe-tipos-b" aria-expanded="false" aria-controls="exe-tipos-l"></button>` +
      `<div class="mes-lista exe-tipos-l" id="exe-tipos-l" role="group" aria-label="Tipos de serviço do download" hidden>` +
      `<label class="mes-tds"><input type="checkbox" value=""> Todos <small>${nf(OS.length)} OS</small></label>` +
      TIPOS_ORD.map(i => `<label><input type="checkbox" value="${i}"> <span>${esc(TIPO_TXT[i])}</span> <small>${nf(N_TIPO[i])}</small></label>`).join('') +
      '</div>';
    dlx.append(t);
    dlBtn = window.__baixar.botao('exe', '', baixaOs);
    dlBtn.classList.add('exe-baixa');
  }
  function pintaDl() {
    if (!dlx) return;
    const b = dlx.querySelector('.exe-tipos-b'), nv = OS.reduce((c, o, k) => c + doTipo(k), 0);
    b.textContent = rotTipos();
    b.setAttribute('aria-label', `Tipos de serviço do download: ${rotTipos()}`);
    dlx.querySelectorAll('.exe-tipos-l input').forEach(i => { i.checked = i.value ? st.tipos.has(+i.value) : !st.tipos.size; });
    dlBtn.querySelector('.dl-t').textContent = `Baixar ${nf(nv)} OS (Excel)`;
    dlBtn.title = `Planilha (CSV para o Excel) com as ${nf(nv)} OS de manutenção executadas ${st.tipos.size ? 'dos tipos marcados' : 'de todos os tipos'}`;
    dlBtn.setAttribute('aria-disabled', String(!nv));
  }
  function abreTipos(sim, foco) {
    st.tiposAberto = sim;
    if (!dlx) return;
    const l = dlx.querySelector('.exe-tipos-l'), b = dlx.querySelector('.exe-tipos-b');
    l.hidden = !sim;
    b.setAttribute('aria-expanded', String(sim));
    if (sim && foco) (l.querySelector('input:checked') || l.querySelector('input')).focus();
  }
  if (dlx) {
    // marcar "Todos" volta a todos; marcar um tipo a partir de todos fica só ele; todos marcados um a um = todos
    dlx.addEventListener('change', e => {
      if (!e.target.closest('.exe-tipos-l')) return;
      const v = e.target.value;
      if (!v) st.tipos.clear(); else if (e.target.checked) st.tipos.add(+v); else st.tipos.delete(+v);
      if (st.tipos.size === EX.tipos.length) st.tipos.clear();
      pintaDl();
    });
    dlx.addEventListener('click', e => { if (e.target.closest('.exe-tipos-b')) abreTipos(!st.tiposAberto, true); });
    // abre e fecha: botão, Esc (só a lista, antes do Esc da tela cheia), clique fora ou Tab para fora; ↑ ↓ Home End andam na lista
    dlx.addEventListener('keydown', e => {
      if (e.target.matches('.exe-tipos-b') && e.key === 'ArrowDown' && !st.tiposAberto) { e.preventDefault(); return abreTipos(true, true); }
      const is = e.target.closest('.exe-tipos-l') ? [...dlx.querySelectorAll('.exe-tipos-l input')] : [], i = is.indexOf(e.target);
      const passo = { ArrowDown: 1, ArrowUp: -1, Home: -Infinity, End: Infinity }[e.key];
      if (i < 0 || passo === undefined) return;
      e.preventDefault();
      is[Math.max(0, Math.min(is.length - 1, i + passo))].focus();
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !st.tiposAberto) return;
      e.stopPropagation();
      const volta = dlx.querySelector('.exe-tipos-l').contains(document.activeElement);
      abreTipos(false);
      if (volta) dlx.querySelector('.exe-tipos-b').focus();
    }, true);
    document.addEventListener('pointerdown', e => { if (st.tiposAberto && !e.target.closest('.exe-tipos')) abreTipos(false); }, true);
    dlx.addEventListener('focusout', e => { if (st.tiposAberto && e.target.closest('.exe-tipos') && e.relatedTarget && !e.relatedTarget.closest('.exe-tipos')) abreTipos(false); });
    pintaDl();
  }

  function pinta() {
    const f = document.activeElement;
    const chave = card.contains(f) ? (f.dataset.k !== undefined ? `[data-k="${f.dataset.k}"]` : f.dataset.foco ? `[data-foco="${f.dataset.foco}"]` : null) : null;
    const n = OS.length;
    const noMapa = AT.length;
    const sub = n ? `${nf(n)} OS executadas · ${nf(noMapa)} ativos` : 'Nenhuma OS de manutenção executada';
    card.hidden = !st.ligado && !!btn;                    // bloco da Manutenção só com ela ligada no mapa
    card.innerHTML = `<div class="limp-top"><h2>Manutenção<small>${sub}</small></h2></div>
      ${n ? `<div class="limp-anos">${ANOS.map(linha).join('')}</div>` : ''}`;
    if (chave) card.querySelector(chave)?.focus({ preventScroll: true });
    if (btn) btn.setAttribute('aria-pressed', String(st.ligado));
    if (lg) {
      lg.hidden = !st.ligado || !n;
      lg.innerHTML = '<span>Manutenção</span>' +
        ANOS.map(a => `<button type="button" data-a="${a}" aria-pressed="${st.anos.has(a)}" title="Mostrar/esconder ${rotAno(a)}"><i style="--c:${corAno(a)}"></i><span class="nm">${rotAno(a)}</span><em>${nf(contaAno(a))}</em></button>`).join('');
    }
    if (det) det.querySelectorAll('.exe-os-b').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.k === st.foco)));
  }
  card.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.k !== undefined) return focar(+b.dataset.k, true, true);
    if (b.classList.contains('abre')) { const a = +b.dataset.g; st.grupos.has(a) ? st.grupos.delete(a) : st.grupos.add(a); return pinta(); }   // monta as OS do ano aberto
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
      ${ks.length > MAX_TRECHO ? `<p class="limp-nota">As ${MAX_TRECHO} mais recentes.</p>` : ''}</section>`;
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
