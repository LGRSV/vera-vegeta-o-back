// Acréscimos da página do alimentador no site por município (roda depois de alimentador.js, com window.D):
// caminho Município › Alimentador › Trecho, barra acima do mapa com a busca e o filtro de município (a classe segue o T1/T2/T3 do mapa),
// resumo por classe, avisos, origem e, em "Dados", os downloads por bloco (window.__baixar, window.__csv).
(function () {
  const M = D.meta || {};
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const km = m => (m / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' km';
  const mil = x => x === '' || x == null ? '' : Number(x).toLocaleString('pt-BR');
  const muns = M.municipios || [];
  const mun = muns.find(x => x.slug === new URLSearchParams(location.search).get('m'));
  const css = document.createElement('style');
  // (o caminho .migalhas tem o CSS no alimentador.css: aparece já na 1ª pintura)
  css.textContent = '.ie.ativo{transform:translate(-50%,9px)}.ie.ativo em{background:#1d4ed8}' +
    '.dados>*+*{margin-top:var(--s3)}.dados>summary+*{margin-top:var(--s2)}.dados>summary .selo{margin-left:var(--s1);font:400 var(--t-xs) var(--f-body);font-style:normal;color:var(--muted);' +
    'border:1px solid var(--line);border-radius:var(--rp);padding:1px var(--s2);white-space:nowrap;display:inline-flex;align-items:center;gap:6px}' +
    '.dados>summary .selo::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--aviso)}' +
    '.aviso-dados{display:grid;gap:2px;border-left:2px solid var(--aviso);padding:var(--s2) var(--s3);font-size:var(--t-sm)}' +
    '.dados .regra>.lede{font-size:var(--t-sm);color:var(--muted)}' +   // "Como os trechos são divididos" em Dados, no tom do resto
    '#lista[hidden]{display:none}' +
    '.origem{font-size:var(--t-xs);color:var(--muted);overflow-wrap:anywhere}.dados .foot{overflow-wrap:anywhere}' +
    '.ativo-hit:empty{display:none}.ativo-hit{display:grid;gap:var(--s1);margin:var(--s2) 0}' +
    '.ativo-hit button{display:grid;gap:2px;text-align:left;width:100%;min-height:var(--alvo);padding:var(--s2) var(--s3);border:1px solid var(--line-forte);' +
    'border-radius:var(--r2);background:var(--paper);color:var(--fg);font:var(--t-sm) var(--f-body);cursor:pointer}' +
    '.ativo-hit button span{color:var(--muted);font-size:var(--t-xs)}.ativo-hit .ir{color:var(--accent)}' +
    '.ativo-hit button:hover{border-color:var(--accent)}.ativo-hit button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}';
  document.head.append(css);

  // título: o código do alimentador; a SE fica no sobretítulo. O HTML da página já sai assim (script no cabeçalho do modelo);
  // aqui só se completa o que faltar.
  const h1 = document.querySelector('h1'), eyebrow = document.querySelector('.eyebrow');
  if (M.al && h1 && h1.textContent !== M.al) {
    h1.textContent = M.al;
    if (eyebrow) eyebrow.textContent = eyebrow.textContent.replace(/\s*·\s*Alimentador\s+\S+\s*$/i, '');
    if (!h1.nextElementSibling?.classList.contains('sub')) h1.insertAdjacentHTML('afterend', '<p class="sub">Trechos por ativo</p>');
  }

  // caminho e volta para o município (o município só se sabe com os dados: entra no lugar reservado); sem o código do
  // alimentador, que já é o título logo abaixo
  const sep = '<span aria-hidden="true">›</span>';
  const linkMun = mun ? `${sep}<a href="../../municipios/${esc(mun.slug)}/">${esc(mun.nome)}</a>` : '';
  let nav = document.querySelector('header .migalhas');
  if (nav) { const lugar = nav.querySelector('.mig-mun'); if (lugar) lugar.innerHTML = linkMun; }
  else {
    nav = document.createElement('nav');
    nav.className = 'migalhas';
    nav.setAttribute('aria-label', 'Caminho');
    nav.innerHTML = `<a href="../../">Municípios</a>${linkMun}<span class="mig-t" id="mig-trecho"></span>`;
    document.querySelector('header').prepend(nav);
  }

  // barra acima do mapa (como a busca da página inicial): a busca sobe do painel (o ouvinte do modelo vai junto, pelo id) e,
  // ao lado dela, o município, os meses do NAE e "Contar individuais" (o #ctrl do modelo); no celular, a busca na linha toda,
  // município e meses lado a lado e a caixa embaixo. Os achados da busca de ativo entram logo abaixo (.ativo-hit).
  // Na tela cheia a barra vai para o alto da gaveta do painel (telacheia.js). Sem o .stage, tudo fica no painel como antes.
  // A classe vem dos botões T1/T2/T3 do mapa (window.__visivel, de alimentador.js): classe escondida no mapa também sai
  // da lista. A lista é refeita a cada busca: o filtro é reaplicado
  const lista = document.getElementById('lista');
  const f = document.createElement('div');
  f.className = 'filtros';
  f.innerHTML = (muns.length > 1 ? `<label for="f-mun" class="vh">Município</label><select id="f-mun"><option value="">Todos os municípios</option>${muns.map(x =>
      `<option value="${esc(x.cod)}"${mun && x.cod === mun.cod ? ' selected' : ''}>${esc(x.nome)} (${km(x.m)})</option>`).join('')}</select>` : '');
  const ferr = document.getElementById('ferramentas'), stage = document.querySelector('.wrap>.stage'), bus = document.getElementById('busca');
  let barra = null;
  if (stage && bus) {
    barra = document.createElement('div');
    barra.className = 'barra-busca';
    barra.setAttribute('role', 'search');
    barra.setAttribute('aria-label', 'Busca e filtros');
    const linha = document.createElement('div');
    linha.className = 'barra-linha';
    linha.append(bus, f);
    const ctrl = document.getElementById('ctrl');
    if (ctrl) linha.append(ctrl);                        // o #ferramentas do painel fica vazio e some (CSS do modelo)
    barra.append(linha);
    stage.before(barra);
  } else ferr ? ferr.prepend(f) : document.getElementById('busca').after(f);
  {
    const s = document.createElement('style');
    s.textContent = '.barra-busca{position:relative;display:grid;gap:var(--s2);min-width:0}' +
      '.barra-linha{display:flex;flex-wrap:wrap;align-items:center;gap:var(--s2) var(--s3);min-width:0}' +
      '.barra-linha>.busca{flex:1 1 200px;width:auto;min-width:0}' +
      '.barra-linha select{flex:0 1 260px;width:auto}' +   // o nome "Município" fica só para o leitor de tela (.vh)
      // botão dos meses na medida do texto, com lugar fixo para os meses: a busca não muda de largura ao trocar o mês
      '.barra-linha .mes{flex:0 1 auto}.barra-linha .mes-txt{display:inline-block;min-width:7.5em}.barra-linha label[for="ind"]{flex:none}' +
      // celular: busca na linha toda; município e meses lado a lado; a caixa embaixo
      '@media (max-width:640px){.barra-linha>.busca,.barra-linha label[for="ind"]{flex:1 1 100%}.barra-linha select,.barra-linha .mes{flex:1 1 40%}' +
      // botão dos meses estreito: o nome (Meses) em cima, pequeno, e os meses embaixo
      '.barra-linha #mes{display:grid;align-content:center;padding-block:2px;line-height:1.2}.barra-linha #mes>span{min-width:0;overflow:hidden;text-overflow:ellipsis}' +
      '.barra-linha .mes-rot{font-size:var(--t-xs);color:var(--muted)}.barra-linha .mes-sep{display:none}}' +
      '.barra-busca>.ativo-hit{margin:0;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))}';
    document.head.append(s);
  }
  const tm = M.trecho_mun || {};
  function aplica(mexeu) {
    const vis = window.__visivel || {}, fm = (document.getElementById('f-mun') || {}).value || '';
    let grp = null, n = 0;                               // título de grupo: conta só as linhas à vista; sem nenhuma, some junto
    const fechaGrp = () => {
      if (!grp) return;
      grp.hidden = !n;
      const tit = grp.dataset.tit ?? (grp.dataset.tit = grp.textContent.replace(/ · [\d.]+$/, ''));
      const txt = `${tit} · ${mil(n)}`;
      if (grp.textContent !== txt) grp.textContent = txt;
    };
    [...lista.children].forEach(r => {
      if (r.classList.contains('grp')) { fechaGrp(); grp = r; n = 0; return; }
      if (!r.classList.contains('row')) return;
      const t = r.dataset.t;
      r.hidden = !(vis[t.split('-')[0]] !== false && (!fm || (tm[t] || []).includes(fm)));
      n += r.hidden ? 0 : 1;
    });
    fechaGrp();
    if (window.__tabLista) window.__tabLista();          // a parada do Tab na lista passa para uma linha à vista
    const m = mexeu === true && lista.querySelector('.row[aria-current="true"]:not([hidden])');
    if (m) {                                             // filtro trocado: o trecho escolhido continua à vista na lista
      const q = lista.getBoundingClientRect(), r = m.getBoundingClientRect();
      if (r.top < q.top + 32 || r.bottom > q.bottom) lista.scrollTop += r.top - q.top - 40;
    }
  }
  f.addEventListener('change', () => aplica(true));
  const cls = document.getElementById('classes');      // o clique do mapa (alimentador.js) já trocou o __visivel
  if (cls) cls.addEventListener('click', e => { if (e.target.closest('button')) aplica(true); });
  new MutationObserver(ms => {
    if (ms.some(m => m.type === 'childList' && m.target === lista)) aplica();   // lista refeita (não a contagem dos títulos)
    const s = [...lista.querySelectorAll('.row[aria-current="true"]')].map(b => b.dataset.t);
    document.getElementById('mig-trecho').innerHTML = s.length ? sep + esc(s.join(' + ')) : '';
  }).observe(lista, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-current'] });
  aplica();


  // avisos de dados e origem: tudo em "Dados", fechado (a tabela por classe fica no resumo, no alto do painel)
  const v = M.validacao || { avisos: [] };
  const o = M.origem || {};
  const box = document.createElement('details');
  box.className = 'dados';
  box.innerHTML = `<summary>Dados${v.avisos.length ? '<em class="selo">com avisos</em>' : ''}</summary>` +
    `<p class="origem">Municípios: ${muns.map(x => `${esc(x.nome)} ${km(x.m)}`).join(' · ') || '—'}</p>` +
    `<p class="origem">Continuidades estimadas: ${(M.continuidades_estimadas || []).length || (o.observacao ? 'não contabilizadas (ver procedência)' : 'nenhuma (o processamento não cria ligações)')}</p>` +
    (v.avisos.length ? `<div class="aviso-dados"><b>Dados a conferir:</b>${v.avisos.map(a => `<span>${esc(a)}</span>`).join('')}</div>` : '') +
    `<p class="origem">Origem: ${esc(o.kml)} (${esc(o.data)})` +
    (o.observacao ? `</p><p class="origem"><b>Procedência:</b> ${esc(M.origem.observacao)}` : '') +
    `${o.postes ? ' · postes ' + esc(M.origem.postes) : ''}${o.critica ? ' · Crítica ' + esc(M.origem.critica.join(', ')) + (M.origem.nae_filtro === 'arvore' ? ' (só Meio Ambiente · Árvore/Eucalipto na rede)' : '') : ''}` +
    `${o.malha ? ' · municípios: ' + esc(M.origem.malha) : ''}</p>`;
  document.querySelector('.panel').append(box);

  // ---------- Downloads: no início de "Dados", um bloco por camada (Faixa, Inspeção, Insp→manut, Manutenção) e a Rede.
  // Cada script de camada põe os botões dele com window.__baixar(bloco) (só se tiver dados); o bloco aparece com o
  // 1º botão. window.__csv é a planilha de todos: CSV que o Excel em pt-BR abre direto (BOM, ';', CRLF, dd/mm/aaaa,
  // vírgula decimal, texto que viraria fórmula protegido); nomes de arquivo com o código do alimentador.
  const salva = (blob, nome) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nome;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  };
  const celCsv = v => {
    let s = String(v ?? '');
    if (/^[=+@\t\r]/.test(s) || /^-[^\d]/.test(s)) s = "'" + s;   // texto que o Excel leria como fórmula
    return /[";\r\n]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = window.__csv = (nome, cols, linhas) =>
    salva(new Blob(['﻿' + [cols, ...linhas].map(l => l.map(celCsv).join(';')).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }), nome);
  csv.salva = salva;
  csv.num = (x, casas) => typeof x === 'number' && isFinite(x) ? String(casas == null ? x : +x.toFixed(casas)).replace('.', ',') : '';
  csv.data = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '';
  csv.arq = s => String(s ?? '').replace(/[^\w.-]+/g, '_');
  csv.al = csv.arq(M.al || 'alimentador');
  // trecho(s) de um conjunto de vãos (ids do D.vaos), na ordem da lista
  const vaoTrecho = Object.fromEntries(D.vaos.map(x => [x[5], x[4]]));
  csv.trechos = ids => [...new Set(ids.map(i => vaoTrecho[i]).filter(i => i !== undefined))].sort((a, b) => a - b).map(i => D.trechos[i].nome).join(', ');
  // trecho(s) de um poste (pontas dos vãos)
  let tPoste = null;
  csv.trechosPoste = p => {
    if (!tPoste) { tPoste = {}; D.vaos.forEach(x => [x[6], x[7]].forEach(q => { (tPoste[q] = tPoste[q] || new Set()).add(x[4]); })); }
    return [...(tPoste[p] || [])].sort((a, b) => a - b).map(i => D.trechos[i].nome).join(', ');
  };

  const BLOCOS = { faixa: 'Faixa', insp: 'Inspeção', mnt: 'Insp→manut', exe: 'Manutenção', rede: 'Rede' };
  const dl = document.createElement('div');
  dl.className = 'dl';
  dl.setAttribute('role', 'group');
  dl.setAttribute('aria-labelledby', 'dl-tit');
  dl.innerHTML = '<h3 class="dl-tit" id="dl-tit">Downloads</h3>';
  box.querySelector('summary').after(dl);
  const ICONE_DL = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 11v2.5h11V11"/></svg>';
  const baixar = window.__baixar = id => {
    let b = dl.querySelector(`.dl-b[data-b="${id}"]`);
    if (!b) {
      b = document.createElement('div');
      b.className = 'dl-b'; b.dataset.b = id;
      b.setAttribute('role', 'group'); b.setAttribute('aria-labelledby', 'dl-n-' + id);
      b.innerHTML = `<span class="dl-n" id="dl-n-${id}">${esc(BLOCOS[id] || id)}</span><div class="dl-a"></div>`;
      const ids = Object.keys(BLOCOS), depois = [...dl.querySelectorAll('.dl-b')].find(x => ids.indexOf(x.dataset.b) > ids.indexOf(id));
      depois ? depois.before(b) : dl.append(b);
    }
    return b.querySelector('.dl-a');
  };
  // botão de baixar num bloco (rotulo em texto; acao: função, ou o endereço de um arquivo pronto)
  baixar.botao = (id, rotulo, acao, titulo) => {
    const b = document.createElement(typeof acao === 'string' ? 'a' : 'button');
    b.className = 'dl-btn';
    b.innerHTML = `${ICONE_DL}<span class="dl-t">${esc(rotulo)}</span>`;
    if (titulo) b.title = titulo;
    if (typeof acao === 'string') { b.href = acao; b.setAttribute('download', ''); }
    else { b.type = 'button'; b.addEventListener('click', e => { if (b.getAttribute('aria-disabled') !== 'true') acao(e); }); }
    baixar(id).append(b);
    return b;
  };
  baixar.botao('rede', 'KMZ (Google Earth)', `${encodeURIComponent(M.al || '')}-trechos.kmz`, 'Trechos do alimentador para o Google Earth');
  {
    const s = document.createElement('style');
    s.textContent = '.dl{display:grid;gap:0}.dl-tit{margin:0 0 var(--s1);font:700 var(--t-base) var(--f-display)}' +
      '.dl-b{display:grid;grid-template-columns:6.5em minmax(0,1fr);align-items:start;gap:var(--s2) var(--s3);padding:var(--s2) 0;border-top:1px solid var(--line)}' +
      '.dl-b:last-child{border-bottom:1px solid var(--line)}' +
      '.dl-n{display:flex;align-items:center;min-height:var(--alvo);font:600 var(--t-sm)/1.2 var(--f-body);color:var(--fg)}' +
      '.dl-a{display:flex;flex-wrap:wrap;gap:var(--s2);min-width:0}' +
      '.dl-btn{display:inline-flex;align-items:center;gap:var(--s2);max-width:100%;min-height:var(--alvo);padding:0 var(--s3) 0 10px;box-sizing:border-box;' +
      'border:1px solid var(--line-forte);border-radius:var(--r2);background:var(--paper);color:var(--fg);font:600 var(--t-sm)/1.2 var(--f-body);text-align:left;text-decoration:none;cursor:pointer}' +
      '.dl-btn svg{flex:none;width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;color:var(--accent)}' +
      '.dl-btn .dl-t{min-width:0;overflow-wrap:anywhere}.dl-btn small{font-weight:400;color:var(--muted)}' +
      '.dl-btn:hover{border-color:var(--accent);background:var(--hover)}.dl-btn:focus-visible{outline:2px solid var(--accent);outline-offset:2px}' +
      '.dl-btn[aria-disabled=true],.dl-btn:disabled{opacity:.55;cursor:not-allowed}.dl-btn[aria-disabled=true]:hover,.dl-btn:disabled:hover{border-color:var(--line-forte);background:var(--paper)}' +
      '@media (prefers-reduced-motion:no-preference){.dl-btn{transition:background-color var(--dur) var(--ease),border-color var(--dur) var(--ease)}}' +
      '@media (max-width:480px){.dl-b{grid-template-columns:minmax(0,1fr);gap:var(--s1)}.dl-n{min-height:0;padding-top:var(--s1)}}';   // celular: o nome em cima dos botões
    document.head.append(s);
  }
  const foot = document.querySelector('.foot');
  if (foot) box.append(foot);
  // "Como os trechos são divididos" também fica em "Dados", no fim (pedido do painel)
  const regra = document.querySelector('header .regra');
  if (regra) box.append(regra);

  // abre enquadrado na parte do município escolhido
  if (mun && window.__map && window.L) {
    const pts = [];
    D.vaos.forEach(x => { if ((tm[D.trechos[x[4]].nome] || []).includes(mun.cod)) pts.push([x[0], x[1]], [x[2], x[3]]); });
    if (pts.length) window.__map.fitBounds(L.latLngBounds(pts), { padding: [20, 20] });
  }

  // marcador de um ativo no mapa (busca da página inicial ou da lista): um só por vez
  let marcaAtivo = null;
  function poeAtivo(ll, cod) {
    const map = window.__map;
    if (!map || !window.L) return;
    if (marcaAtivo) marcaAtivo.remove();
    marcaAtivo = L.marker(ll, { interactive: false, zIndexOffset: 1000, icon: L.divIcon({ className: '', iconSize: null,
      html: `<div class="ie ativo"><em>ATIVO</em>${esc(cod)}</div>` }) }).addTo(map);
    map.setView(ll, Math.max(map.getZoom(), 16), { animate: false });
  }

  // busca da lista: código de transformador ou de chave que não abre nem fecha trecho (índice dados/ativos, o mesmo da
  // busca da página inicial; baixa só o pedaço do código). Achados deste alimentador aparecem acima da lista.
  const campo = document.getElementById('busca');
  if (campo && lista) {
    const TIPO = { DJ: 'Disjuntor', '79': 'Religador', '03': 'Fusível 03', '33': 'Fusível 33', '02': 'Chave 02', '88': 'Chave faca 88',
      '40': 'Trip saver 40', '41': 'Trip saver 41', SEC: 'Fusível (seccionamento)', FTR: 'Fusível no tronco', TR: 'Transformador',
      ET: 'Transformador', EP: 'Transformador particular', Capacitor: 'Banco de capacitor', Regulador: 'Regulador de tensão',
      Chave: 'Chave', ChaveNA: 'Chave NA' };
    const chave = s => { const k = String(s).toUpperCase().replace(/[^0-9A-Z]/g, ''); return /^\d+$/.test(k) ? (k.replace(/^0+/, '') || '0') : k; };
    const fatia = k => { let h = 0; for (let i = 0; i < k.length; i++) h = (Math.imul(h, 31) + k.charCodeAt(i)) >>> 0; return (h % 256).toString(16).padStart(2, '0'); };
    const cache = {};
    const baixa = x => cache[x] || (cache[x] = fetch(`../../dados/ativos/${x}.json`).then(r => r.ok ? r.json() : {}).catch(() => { delete cache[x]; return {}; }));
    const box = document.createElement('div');
    box.className = 'ativo-hit';
    box.setAttribute('aria-live', 'polite');
    barra ? barra.append(box) : lista.before(box);       // embaixo da barra de busca (na largura toda) ou acima da lista
    let pedido = 0, espera = null;
    campo.addEventListener('input', () => {
      clearTimeout(espera);
      box.innerHTML = '';
      const txt = campo.value.trim(), k = chave(txt), meu = ++pedido;
      if (k.length < 4) return;
      espera = setTimeout(async () => {
        const d = await baixa(fatia(k));
        if (meu !== pedido) return;                      // o texto mudou enquanto baixava
        const hits = (d[k] || []).filter(h => h[0] === M.al && h[1] !== 'poste');   // poste: a própria lista já acha
        box.innerHTML = hits.map(([, tipo, t, papel, lat, lon]) =>
          `<button type="button" data-t="${esc(t)}" data-ll="${lat},${lon}" data-a="${esc(txt)}"><b>${esc(TIPO[tipo] || 'Chave ' + tipo)} ${esc(txt)}</b>` +
          `<span>${esc(papel)}</span><span class="ir">${t ? 'Ver ' + esc(t) + ' no mapa' : 'Ver no mapa'} →</span></button>`).join('');
      }, 250);
    });
    box.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.t && window.__sel) window.__sel(b.dataset.t, false);
      poeAtivo(b.dataset.ll.split(',').map(Number), b.dataset.a);
    });
  }

  // sem os botões + e − do mapa (pedido do painel): o zoom fica no gesto de pinça, na roda do mouse e no duplo clique
  if (window.__map && window.__map.zoomControl) window.__map.removeControl(window.__map.zoomControl);

  // canto superior esquerdo do mapa: o card T1 T2 T3 e, à direita dele, o "Menu" das camadas (três barras) com Faixa
  // (limpeza.js), Inspeção (inspecao.js), Insp→manut (manutencao.js) e Manutenção (executadas.js). As legendas das camadas
  // ligadas ficam no canto inferior esquerdo (.ctl-lgs, no fim deste arquivo). Devolve a lista do menu (criada na 1ª chamada), onde cada camada
  // põe o seu card; sem o card das classes (mapa não carregou), devolve null.
  // O Tela cheia fica no canto inferior direito (telacheia.js), com o mesmo card (.ctl-card).
  window.__ctlMapa = function () {
    const cls = document.getElementById('classes');
    let dir = document.querySelector('.ctl-dir');
    if (!dir) {
      if (!cls) return null;
      dir = document.createElement('div');
      dir.className = 'ctl-dir';
      cls.before(dir);
      const cam = document.createElement('div');
      cam.className = 'ctl-cam';
      cam.hidden = true;                                   // aparece com a 1ª camada
      cam.innerHTML = '<div class="ctl-card"><button type="button" class="ctl-cam-b" aria-expanded="false" aria-controls="ctl-camadas" ' +
        'title="Menu" aria-label="Menu do mapa: 0 camadas ligadas"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<path d="M4 7h16M4 12h16M4 17h16"/></svg>Menu</button></div>' +
        '<div class="ctl-l ctl-l2" id="ctl-camadas" role="group" aria-label="Camadas do mapa" hidden></div>';
      const l = cam.querySelector('.ctl-l2'), b = cam.querySelector('.ctl-cam-b');
      if (window.L) L.DomEvent.disableClickPropagation(cam);
      cam.addEventListener('click', e => e.stopPropagation());   // clique no menu não chega ao mapa (que limparia a seleção)
      // o menu fica aberto ao ligar uma camada (dá para ligar várias); fecha no botão, no Esc, fora dele ou saindo com o Tab
      const abre = sim => { l.hidden = !sim; b.setAttribute('aria-expanded', String(sim)); };
      b.addEventListener('click', () => abre(l.hidden));
      document.addEventListener('keydown', e => {          // antes do Esc da tela cheia: fecha só o menu
        if (e.key !== 'Escape' || l.hidden) return;
        e.stopPropagation();
        if (cam.contains(document.activeElement)) b.focus();
        abre(false);
      }, true);
      document.addEventListener('pointerdown', e => { if (!l.hidden && !cam.contains(e.target)) abre(false); }, true);
      cam.addEventListener('focusout', e => { if (e.relatedTarget && !cam.contains(e.relatedTarget)) abre(false); });
      // o botão mostra só o ícone e "Menu": quantas camadas estão ligadas fica no nome dele (leitor de tela)
      const conta = () => {
        const n = l.querySelectorAll('button[aria-pressed="true"]:not(.tc-painel-m)').length;   // o "Painel" da tela cheia não é camada
        cam.hidden = !l.children.length;
        b.setAttribute('aria-label', `Menu do mapa: ${n} camada${n === 1 ? '' : 's'} ligada${n === 1 ? '' : 's'}`);
      };
      new MutationObserver(conta).observe(l, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
      const topo = document.createElement('div');        // T1 T2 T3 e o Menu numa linha só
      topo.className = 'ctl-topo';
      topo.append(cls, cam);
      dir.append(topo);
    }
    return dir.querySelector('.ctl-l2');
  };
  // balão do mapa: o Leaflet desenha os balões por baixo dos cards do canto (que ficam fora do mapa), então o balão
  // aberto perto do alto empurra o mapa até ficar abaixo deles (folga de cima = fim da linha do T1 T2 T3 e do Menu; com ele
  // aberto, até o fim dele). A coluna das legendas não entra: alta, ela jogaria o balão para o pé do mapa
  window.__folgaBalao = () => {
    const dir = document.querySelector('.ctl-dir'), m = document.getElementById('map');
    if (!dir || !m) return [20, 20];
    const l = dir.querySelector('.ctl-l2'), fim = Math.max(...[dir.querySelector('.classes'), dir.querySelector('.ctl-cam'), l]
      .map(x => x && !x.hidden ? x.getBoundingClientRect().bottom : 0));
    return [20, Math.max(20, Math.round(fim - m.getBoundingClientRect().top) + 12)];
  };
  // as camadas se combinam livremente (Faixa, Inspeção, Insp→manut e Manutenção, quantas quiser ao mesmo tempo)
  {
    const s = document.createElement('style');
    // a coluna do canto superior esquerdo (T1 T2 T3, Menu e a lista dele) cabe no mapa: para em cima do card Tela cheia e do chip da OS
    // (28 px do pé + 50 do card + folga)
    s.textContent = '.ctl-dir{position:absolute;left:12px;top:12px;z-index:810;display:flex;flex-direction:column;align-items:flex-start;gap:var(--s2);max-width:calc(100% - 76px);' +
      'max-height:calc(100% - 12px - 88px);pointer-events:none}.ctl-dir>*{pointer-events:auto}' +   // fora dos cards, o clique é do mapa
      '.ctl-dir>.ctl-topo{display:flex;align-items:flex-start;gap:var(--s1);flex:none;pointer-events:none}.ctl-topo>*{pointer-events:auto}' +
      '.ctl-topo>.classes{position:static}.ctl-topo>.classes,.ctl-topo>.ctl-cam{flex:none}' +
      '.ctl-l{display:flex;flex-wrap:wrap;justify-content:flex-start;gap:var(--s2)}.ctl-l:empty{display:none}' +
      '.ctl-card{display:flex;padding:var(--s1);background:var(--vidro);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);border:1px solid var(--vidro-borda);border-radius:var(--r2);box-shadow:var(--sh-vidro)}' +
      '.ctl-card button{display:inline-flex;align-items:center;gap:6px;font:600 var(--t-sm)/1 var(--f-mono);padding:0 var(--s3);border:0;border-radius:var(--r1);background-color:transparent;' +
      'color:var(--vidro-fg);cursor:pointer;min-width:40px;min-height:40px;white-space:nowrap}' +
      '.ctl-card button:hover{background-color:var(--vidro-hover)}.ctl-card button:focus-visible{outline:2px solid var(--foco-mapa);outline-offset:1px}' +
      '@media (prefers-reduced-motion:no-preference){.ctl-card button{transition:background-color var(--dur) var(--ease),opacity var(--dur) var(--ease)}}' +
      // Menu das camadas: o botão (três barras e "Menu") e, embaixo, a lista solta sobre o mapa (por cima das legendas: z-index)
      '.ctl-cam{position:relative;z-index:2;display:flex;flex-direction:column;align-items:flex-start}' +
      '.ctl-card .ctl-cam-b{gap:var(--s2);padding:0 var(--s3) 0 var(--s2)}.ctl-cam-b[aria-expanded=true]{background-color:var(--vidro-hover)}' +
      '.ctl-cam-b svg{flex:none;width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;pointer-events:none}' +
      '.ctl-l2{position:absolute;top:calc(100% + var(--s1));left:0;flex-direction:column;flex-wrap:nowrap;gap:2px;min-width:200px;max-width:calc(100vw - 24px);padding:var(--s1);' +
      'background:var(--vidro);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);border:1px solid var(--vidro-borda);border-radius:var(--r2);box-shadow:var(--sh-vidro)}' +
      '.ctl-l2>.ctl-card{display:block;padding:0;background:none;-webkit-backdrop-filter:none;backdrop-filter:none;border:0;border-radius:0;box-shadow:none}' +
      // cada camada é uma linha inteira: caixa de marcar à esquerda, o filete colorido embaixo do nome (o de cada camada)
      '.ctl-l2 .ctl-card button{width:100%;justify-content:flex-start;gap:var(--s2);padding:0 var(--s3) 0 var(--s2);background-size:calc(100% - 40px) 3px;background-position:32px 100%}' +
      '.ctl-l2 .ctl-card button[aria-pressed=false]{text-decoration:none;box-shadow:none}' +
      '.ctl-l2 .ctl-card button::before{content:"";flex:none;display:grid;place-items:center;width:16px;height:16px;box-sizing:border-box;border:1.5px solid currentColor;border-radius:4px;' +
      'font:700 12px/1 var(--f-body);color:inherit}' +
      '.ctl-l2 .ctl-card button[aria-pressed=true]::before{content:"✓";background:var(--vidro-fg);border-color:var(--vidro-fg);color:#0b0f14}' +
      // legendas no canto inferior esquerdo, uma sobre a outra, na largura da maior; cada uma no seu vidro (o das próprias
      // camadas), acima do crédito do mapa (28 px, como o Tela cheia). Alto: abaixo da linha T1 T2 T3/Menu (12 + 50 + folga);
      // o que não couber rola dentro delas
      '.ctl-lgs{position:absolute;left:12px;bottom:28px;z-index:800;display:flex;flex-direction:column;align-items:stretch;gap:var(--s1);max-height:calc(100% - 28px - 76px);' +
      'max-width:calc(100% - 24px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}' +
      // celular: o chip da OS em foco vai da esquerda até o Tela cheia (limpeza.js); as legendas sobem acima dele
      '@media (max-width:640px){.mapbox:has(>.limp-chip:not([hidden]))>.ctl-lgs{bottom:calc(28px + 56px);max-height:calc(100% - 84px - 76px)}}' +
      '.ctl-lgs:not(:has(>:not([hidden]))){display:none}' +
      '.ctl-lgs.sob-balao{visibility:hidden;opacity:0}' +
      '@media (prefers-reduced-motion:no-preference){.ctl-lgs{transition:opacity var(--dur) var(--ease),visibility 0s}.ctl-lgs.sob-balao{transition:opacity var(--dur) var(--ease),visibility 0s var(--dur)}}' +
      '.mapbox>.ctl-lgs>*{position:static;inset:auto;z-index:auto;flex:none;margin:0;max-width:none;float:none;clear:none}' +   // sem o canto antigo de cada uma
      '@media (max-width:640px){.mapbox>.ctl-lgs>.limp-maplg>:is(.lg-cab,.lg-info){display:none}}';   // celular: só o traço e o ano
    document.head.append(s);
  }

  // vindo da busca de ativo da página inicial (?t=trecho&a=código&ll=lat,lon): seleciona o trecho e marca o ativo.
  // Espera o load para a limpeza de faixa (scripts seguintes) também pintar a seleção.
  const pq = new URLSearchParams(location.search), tq = pq.get('t'), ll = (pq.get('ll') || '').split(',').map(Number);
  const temT = tq && window.__sel && D.trechos.some(t => t.nome === tq), temLL = ll.length === 2 && ll.every(Number.isFinite);
  if (temT || temLL) addEventListener('load', () => {    // ativo longe da rede: só o marcador
    if (temT) window.__sel(tq, !temLL);                  // com o ponto do ativo, o mapa vai até ele (sem animar até o trecho)
    if (temLL) poeAtivo(ll, pq.get('a') || '');
  });

  // ordem do painel: resumo (ou detalhe do trecho) primeiro, depois o mês do NAE, os blocos das camadas ligadas
  // (Faixa, Inspeção, Insp→manut, Manutenção) e só então a lista. Os blocos entram pelos scripts seguintes: arruma
  // quando todos já rodaram (DOMContentLoaded, na mesma volta que mostra o painel: a ordem antiga não chega a aparecer)
  const ordena = () => {
    const det = document.getElementById('det');
    if (!det || !lista) return;
    let ult = det;
    const poe = el => {                                  // só o que está no painel (busca e município ficam onde estão)
      if (!el || el.parentElement !== det.parentElement) return;
      if (el !== ult.nextElementSibling) ult.after(el);
      ult = el;
    };
    poe(document.getElementById('ferramentas'));
    const cards = [...document.querySelectorAll('.panel>.limp-card')];
    cards.forEach(poe);
    poe(lista);
    poe(document.getElementById('ord-lista'));          // a ordem da lista fica logo embaixo dela
    // com alguma camada do Menu ligada, a lista de trechos sai do painel (fica o bloco da camada); volta ao buscar
    const campo = document.getElementById('busca');
    const mostra = () => { lista.hidden = cards.some(c => !c.hidden) && !(campo && campo.value.trim()); };
    cards.forEach(c => new MutationObserver(mostra).observe(c, { attributes: true, attributeFilter: ['hidden'] }));
    if (campo) campo.addEventListener('input', mostra);
    mostra();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ordena); else ordena();

  // legendas das camadas no mapa: saem dos cantos de cada uma (Faixa e Inspeção no pé do mapa, limpeza.js e inspecao.js;
  // Insp→manut e Manutenção, controles do Leaflet que manutencao.js e executadas.js criam no DOMContentLoaded) e vão para a
  // coluna do canto inferior esquerdo do mapa, nesta ordem. O ouvinte fica na window: roda depois dos do document
  // (o evento sobe do document à window), com as quatro já criadas, e antes da 1ª pintura
  const legendas = () => {
    const dir = document.querySelector('.ctl-dir'), mb = document.querySelector('.mapbox');
    if (!dir || !mb) return;
    const box = mb.querySelector('.ctl-lgs') || mb.appendChild(Object.assign(document.createElement('div'), { className: 'ctl-lgs' }));
    if (window.L) { L.DomEvent.disableClickPropagation(box); L.DomEvent.disableScrollPropagation(box); }   // clique na legenda não é clique no mapa
    ['.limp-maplg:not(.insp-lg)', '.insp-lg', '.mnt-lg', '.exe-lg'].forEach(q => { const el = mb.querySelector(q); if (el) box.append(el); });
    // o balão do mapa fica por baixo dos cards (ver __folgaBalao): enquanto um balão aberto cruza a coluna (no celular, quase
    // sempre: o balão é quase da largura do mapa), as legendas saem da frente e voltam quando ele fecha
    const map = window.__map;
    if (!map || box.dataset.balao) return;
    box.dataset.balao = '1';
    const confere = () => {
      const pop = map.getContainer().querySelector('.leaflet-popup');
      let cruza = false;
      if (pop) {
        const a = pop.getBoundingClientRect(), b = box.getBoundingClientRect();
        cruza = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      }
      box.classList.toggle('sob-balao', cruza);
    };
    map.on('popupopen moveend zoomend', confere);
    map.on('popupclose', () => box.classList.remove('sob-balao'));
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', legendas); else legendas();
})();
