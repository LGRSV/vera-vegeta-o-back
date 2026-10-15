// Página inicial: busca única na barra em cima do mapa — regional, polo, município, alimentador, ativo (chave,
// transformador, poste) ou OS — ligada ao mapa (mapa-municipios.js expõe window.ARGOS_MAPA).
// Campo vazio: a lista mostra o próximo nível do mapa (regionais › polos › municípios › alimentadores), com a NAE, e os
// alimentadores com mais NAE do que está aberto. Ao digitar: regionais, polos, municípios e alimentadores (código ou
// subestação) dos dados do mapa (window.MUN), primeiro os de dentro do que está aberto; com 3 caracteres ou mais também
// os ativos cujo código começa assim (dados/ativos-pref/<2 primeiros>.json).
// Marcar uma opção (setas ou mouse) acende ela no mapa; escolher leva o mapa até lá sem sair da página: regional e polo
// abrem como no clique, município abre com a rede dos alimentadores, alimentador dá zoom na rede dele.
// Ativo (ou Enter) busca no índice dados/ativos/<fatia>.json (gerados por scripts/gera_trechos.py), que diz o alimentador
// e o trecho. OS: com número/ano (ex.: 002507/2026, com ou sem a equipe na frente) aparece "Buscar a OS…", que procura em
// dados/os/<fatia>.json. Cada resultado abre a página do alimentador ou mostra o alimentador no mapa.
// Fechada, só o olho do ARGOS aparece; tocar nele abre o campo. A lista e o resultado abrem presos ao olho (não empurram
// o mapa); fecham com Esc ou clicando fora. "/" abre a busca.
(function () {
  const form = document.getElementById('ativo');
  if (!form) return;
  const q = document.getElementById('ativo-q'), res = document.getElementById('ativo-res');
  const barra = document.querySelector('.mt-barra');     // página de versão antiga, com o formulário fora da barra
  if (barra && !barra.contains(form)) barra.prepend(form);
  // fechada, só o olho do ARGOS aparece; tocar nele abre o campo (e a lista). Página antiga, sem o olho: campo sempre à vista
  const lupa = document.getElementById('lupa');
  if (!lupa) q.hidden = false;
  window.ARGOS_BUSCA = true;                            // mapa-municipios.js: a lista do município aberto fica aqui, embaixo da logo
  const mapa = () => window.ARGOS_MAPA || null;
  const P = window.ARGOS_PAG || { url: p => p, alvo: '', abre: p => { location.href = p; } };
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TIPO = { DJ: 'Disjuntor', '79': 'Religador', '03': 'Fusível 03', '33': 'Fusível 33', '02': 'Chave 02', '88': 'Chave faca 88',
    '40': 'Trip saver 40', '41': 'Trip saver 41', SEC: 'Fusível (seccionamento)', FTR: 'Fusível no tronco', poste: 'Poste',
    TR: 'Transformador', ET: 'Transformador', EP: 'Transformador particular', Capacitor: 'Banco de capacitor', Regulador: 'Regulador de tensão',
    Chave: 'Chave', ChaveNA: 'Chave NA' };
  const semAcento = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const nf = n => (n || 0).toLocaleString('pt-BR');
  const kmTxt = m => (m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' km';
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

  // ---------- índice dos dados do mapa: regionais e polos (NAE = soma dos municípios, como nos cartões do mapa) e
  // alimentadores (NAE do alimentador, km somados nos municípios por onde ele passa) ----------
  const MUN = window.MUN || {};
  const muns = (MUN.muns || []).filter(m => m.slug);
  const porCod = Object.fromEntries(muns.map(m => [m.cod, m]));
  const REG = {}, POL = {}, AL = {};
  muns.forEach(m => {
    const r = REG[m.reg] || (REG[m.reg] = { nome: m.reg, nae: 0, polos: new Set(), n: 0 });
    r.nae += m.nae || 0; r.polos.add(m.polo); r.n++;
    const p = POL[m.polo] || (POL[m.polo] = { nome: m.polo, reg: m.reg, nae: 0, muns: [] });
    p.nae += m.nae || 0; p.muns.push(m);
    (m.als || []).forEach(a => {
      const x = AL[a.cod] || (AL[a.cod] = { cod: a.cod, se: a.se, nae: a.n || 0, m: 0, muns: [] });
      x.m += a.m; x.muns.push(m);
    });
  });
  const ordemReg = Object.keys(MUN.regs || REG).filter(r => REG[r]);
  const regs = ordemReg.map(r => REG[r]), polos = Object.values(POL), als = Object.values(AL);
  // visão do mapa (mapa-municipios.js: NAE, Manutenção, Inspeção…): os números e a ordem da lista seguem a métrica escolhida;
  // na NAE (visao() = null) ficam os de antes. Regional, polo e alimentador: soma dos municípios (como nos cartões do mapa)
  const vis = () => (mapa() && mapa().visao ? mapa().visao() : null);
  const valor = x => {
    const v = vis();
    if (!v) return x.nae || 0;
    const ms = x.slug !== undefined ? [x] : x.polos ? muns.filter(m => m.reg === x.nome) : x.se !== undefined ? null : x.muns;
    return ms ? ms.reduce((s, m) => s + v.mun(m.cod), 0) : x.muns.reduce((s, m) => s + v.al(x.cod, m.cod), 0);
  };
  const porNae = (a, b) => valor(b) - valor(a);
  const mais = () => (vis() ? vis().mais : 'NAE');

  // o que está aberto no mapa (regional, polo, município) vem primeiro na lista
  const nivel = () => (mapa() ? mapa().nivel() : {});
  const munDentro = (m, nv) => nv.mun ? m.cod === nv.mun : nv.pol ? m.polo === nv.pol : nv.reg ? m.reg === nv.reg : true;
  const fora = {
    polo: (p, nv) => +!!(nv.reg && p.reg !== nv.reg),
    mun: (m, nv) => +!munDentro(m, nv),
    al: (a, nv) => +!a.muns.some(m => munDentro(m, nv))
  };

  // ---------- linhas da lista: ícone do tipo, nome (com o trecho digitado em destaque), contexto e a NAE ----------
  const ICO = {
    reg: '<path d="M3 6.5 8.5 4l7 2.5L21 4v13.5L15.5 20l-7-2.5L3 20z"/><path d="M8.5 4v13.5M15.5 6.5V20"/>',
    polo: '<path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.3"/>',
    mun: '<path d="M3 20h18M5 20V9.5L12 5l7 4.5V20"/><path d="M10 20v-5h4v5"/>',
    al: '<path d="M2.5 17.5 7 9l4 6.5 4.5-10 6 12"/><circle cx="7" cy="9" r="1.3"/><circle cx="15.5" cy="5.5" r="1.3"/>',
    ativo: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
    os: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9zM8.5 11h7M8.5 15h5"/>'
  };
  const realce = (txt, n) => {                    // destaca o que se digitou (sem acento e sem caixa)
    const s = semAcento(txt), i = n ? s.indexOf(n) : -1;
    if (i < 0 || s.length !== txt.length) return esc(txt);
    return esc(txt.slice(0, i)) + '<mark>' + esc(txt.slice(i, i + n.length)) + '</mark>' + esc(txt.slice(i + n.length));
  };
  const item = {
    reg: (r, n) => ({ s: { reg: r.nome }, tipo: 'reg', t: realce(r.nome, n), c: `${plural(r.polos.size, 'polo', 'polos')} · ${r.n} municípios`, nae: valor(r) }),
    polo: (p, n) => ({ s: { polo: p.nome }, tipo: 'polo', t: realce(p.nome, n), c: `Regional ${esc(p.reg)} · ${plural(p.muns.length, 'município', 'municípios')}`, nae: valor(p) }),
    mun: (m, n) => ({ s: { cod: m.cod }, tipo: 'mun', t: realce(m.nome, n), c: `Polo ${esc(m.polo)} · ${esc(m.reg)} · ${plural(m.als.length, 'alimentador', 'alimentadores')}`, nae: valor(m) }),
    al: (a, n, k) => ({ s: { al: a.cod }, tipo: 'al', t: realce(a.cod, k), c: `${realce(a.se, n)} · ${plural(a.muns.length, 'município', 'municípios')} · ${kmTxt(a.m)}`, nae: valor(a) }),
    // alimentador do município aberto (a lista que ficava ao lado do mapa): miniatura da rede, código e NAE (sem km e SE,
    // pedido do usuário); o que está em foco no mapa fica marcado
    almun: (a, m, foco) => ({ s: { almun: a.cod }, tipo: 'al', mini: a.cod, foco, t: esc(a.cod), nae: vis() ? vis().al(a.cod, m.cod) : a.n || 0, c: foco ? 'Em foco no mapa' : '' }),
    ativo: ([c, tipo], k) => ({ s: { ativo: c }, tipo: 'ativo', t: realce(c, k), c: esc(TIPO[tipo] || 'Chave ' + tipo) }),
    os: txt => ({ s: { os: txt }, tipo: 'os', t: `OS ${esc(txt)}`, c: 'buscar nas bases de faixa, inspeção, manutenção e executadas' })
  };
  let sug = [], marcado = -1, pedido = 0;
  function mostra(blocos, rodape = '', classe = '') {
    let i = 0;
    sug = [];
    const html = blocos.filter(([, itens]) => itens.length).map(([titulo, itens]) =>
      `<li class="sug-t" role="presentation">${esc(titulo)}</li>` + itens.map(it => {
        sug.push(it.s);
        return `<li class="sug-op so-${it.tipo}${it.foco ? ' foco' : ''}" role="option" id="ativo-sug-${i}" data-i="${i++}">` +
          (it.mini ? `<span class="so-mini" data-al="${esc(it.mini)}" aria-hidden="true"></span>` :
            `<svg class="so-i" viewBox="0 0 24 24" aria-hidden="true">${ICO[it.tipo]}</svg>`) +
          `<span class="so-x"><b>${it.t}</b>${it.c ? `<small>${it.c}</small>` : ''}</span>` +
          (it.nae != null ? `<i class="so-n">${vis() ? vis().num(it.nae) : nf(it.nae)}<span class="vh"> ${vis() ? vis().un : 'NAE'}</span></i>` : '') + '</li>';
      }).join('')).join('');
    res.className = classe;
    res.innerHTML = `<ul class="sug" role="listbox" aria-label="Resultados">${html}</ul>${rodape}`;
    q.setAttribute('aria-expanded', 'true');
    marca(-1);
    // miniatura da rede de cada alimentador (a mesma que o mapa desenha, dados/redes/)
    if (mapa() && mapa().rede) res.querySelectorAll('.so-mini').forEach(el => mapa().rede(el.dataset.al).then(r => {
      if (!r || !el.isConnected) return;
      const [x0, y0, x1, y1] = r.b, w = Math.max(x1 - x0, .05), h = Math.max(y1 - y0, .05), f = Math.max(w, h) * .08;
      el.innerHTML = `<svg viewBox="${x0 - f} ${y0 - f} ${w + 2 * f} ${h + 2 * f}"><path d="${esc(r.d)}"/></svg>`;
    }));
  }

  q.setAttribute('role', 'combobox');
  q.setAttribute('aria-autocomplete', 'list');
  q.setAttribute('aria-controls', 'ativo-res');
  q.setAttribute('aria-expanded', 'false');
  const alvoMapa = s => s && (s.reg ? { reg: s.reg } : s.polo ? { polo: s.polo } : s.cod ? { cod: s.cod } : (s.al || s.almun) && AL[s.al || s.almun] ? { al: s.al || s.almun } : null);
  const previa = a => { if (mapa()) mapa().previa(a); };
  const realceAl = al => { if (mapa() && mapa().realceAl) mapa().realceAl(al); };
  const fechaSug = () => {
    sug = []; marcado = -1;
    q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant');
    previa(null); realceAl(null);
  };
  const fecha = () => { res.innerHTML = ''; res.className = ''; fechaSug(); };
  const marca = i => {
    marcado = i;
    res.querySelectorAll('.sug-op').forEach((o, k) => o.classList.toggle('marcado', k === i));
    const o = res.querySelector(`#ativo-sug-${i}`);
    if (o) { q.setAttribute('aria-activedescendant', o.id); o.scrollIntoView({ block: 'nearest' }); } else q.removeAttribute('aria-activedescendant');
    const s = sug[i];
    if (s && s.almun) { previa(null); realceAl(s.almun); }   // alimentador do município aberto: a rede dele acende no mapa
    else { realceAl(null); previa(alvoMapa(s)); }
  };

  // ---------- campo vazio: o próximo nível do mapa ----------
  const topAls = filtro => als.filter(a => a.muns.some(filtro)).sort(porNae).slice(0, 5).map(a => item.al(a));
  function atalhos() {
    pedido++;
    const nv = nivel(), m = porCod[nv.mun];
    if (m) mostra([[`Alimentadores de ${m.nome} · ${m.als.length}`, m.als.slice().sort((a, b) => b.m - a.m)
      .map(a => item.almun({ ...a, se: (AL[a.cod] || {}).se || a.se }, m, a.cod === nv.al))]], '', 'lista-mun');
    else if (nv.pol && POL[nv.pol]) mostra([[`Municípios do polo ${nv.pol}`, POL[nv.pol].muns.slice().sort(porNae).map(x => item.mun(x))],
      [`Alimentadores com mais ${mais()} no polo ${nv.pol}`, topAls(x => x.polo === nv.pol)]]);
    else if (nv.reg && REG[nv.reg]) mostra([[`Polos da Regional ${nv.reg}`, polos.filter(p => p.reg === nv.reg).sort(porNae).map(p => item.polo(p))],
      [`Alimentadores com mais ${mais()} na Regional ${nv.reg}`, topAls(x => x.reg === nv.reg)]]);
    else mostra([['Regionais', regs.map(r => item.reg(r))], [`Alimentadores com mais ${mais()}`, topAls(() => true)]]);
  }

  // ---------- ao digitar ----------
  const chave = s => { const k = String(s).toUpperCase().replace(/[^0-9A-Z]/g, ''); return /^\d+$/.test(k) ? (k.replace(/^0+/, '') || '0') : k; };
  const hash = k => { let h = 0; for (let i = 0; i < k.length; i++) h = (Math.imul(h, 31) + k.charCodeAt(i)) >>> 0; return h; };
  const fatia = k => (hash(k) % 256).toString(16).padStart(2, '0');
  const fatiaOS = k => (hash(k) % 64).toString(16).padStart(2, '0');      // FATIAS_OS de scripts/gera_trechos.py
  const chaveOS = s => { const m = String(s).match(/(\d{1,7})\s*\/\s*(\d{4})(?!\d)/); return m ? `${+m[1]}/${m[2]}` : null; };
  const BASE_OS = { f: 'Limpeza de faixa', i: 'Inspeção', m: 'Manutenção (gerada pela inspeção)', e: 'Executada' };
  const cache = {};
  const baixa = f => cache[f] || (cache[f] = fetch(`dados/${f}.json`).then(r => r.ok ? r.json() : {}).catch(() => { delete cache[f]; return null; }));
  const ORDEM = ['DJ', '79', '03', '33', '02', '40', '41', 'SEC', 'FTR', '88', 'TR', 'ET', 'EP', 'poste'];
  const peso = t => { const i = ORDEM.indexOf(t); return i < 0 ? ORDEM.length - 1.5 : i; };
  // regional e polo: pelo nome, ou pela palavra "regional"/"polo" (ex.: "reg" lista as três regionais)
  const bateNome = (kw, nome, n) => n.length >= 2 && (semAcento(nome).includes(n) || (n.length >= 3 && kw.startsWith(n)) || semAcento(kw + ' ' + nome).startsWith(n));
  async function sugere() {
    const txt = q.value.trim(), k = chave(txt), meu = ++pedido, n = semAcento(txt), K = txt.toUpperCase().replace(/[^0-9A-Z]/g, ''), kl = K.toLowerCase();
    if (!txt) { if (document.activeElement === q) atalhos(); else fecha(); return; }
    const nv = nivel();
    const rs = regs.filter(r => bateNome('regional', r.nome, n));
    const ps = polos.filter(p => bateNome('polo', p.nome, n))
      .sort((a, b) => fora.polo(a, nv) - fora.polo(b, nv) || semAcento(a.nome).indexOf(n) - semAcento(b.nome).indexOf(n) || porNae(a, b)).slice(0, 4);
    const ms = n.length >= 2 ? muns.filter(m => m.busca.includes(n))
      .sort((a, b) => fora.mun(a, nv) - fora.mun(b, nv) || a.busca.indexOf(n) - b.busca.indexOf(n) || a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, 5) : [];
    const pos = a => { const i = K.length >= 2 ? a.cod.indexOf(K) : -1; return i < 0 ? 99 : i; };
    const as = als.filter(a => (K.length >= 2 && a.cod.includes(K)) || (n.length >= 3 && semAcento(a.se).includes(n)))
      .sort((a, b) => fora.al(a, nv) - fora.al(b, nv) || pos(a) - pos(b) || porNae(a, b) || a.cod.localeCompare(b.cod)).slice(0, 5);
    let achados = [];
    if (k.length >= 3) {
      const d = await baixa('ativos-pref/' + k.slice(0, 2));
      if (meu !== pedido) return;                   // já digitaram outra coisa
      if (d) Object.entries(d).forEach(([tipo, lista]) => lista.split(' ').forEach(c => { if (chave(c).startsWith(k)) achados.push([c, tipo]); }));
      achados.sort((a, b) => (chave(b[0]) === k) - (chave(a[0]) === k) || peso(a[1]) - peso(b[1]) || a[0].length - b[0].length || a[0].localeCompare(b[0]));
    }
    if (meu !== pedido) return;
    const kOS = chaveOS(txt);
    const at = achados.slice(0, rs.length || ps.length || ms.length || as.length ? 6 : 12);
    if (!kOS && !rs.length && !ps.length && !ms.length && !as.length && !at.length) {
      fechaSug();
      res.innerHTML = n.length < 2 ? '' : `<p>Nada encontrado para <b>${esc(txt)}</b>.</p>`;
      return;
    }
    mostra([['OS', kOS ? [item.os(txt)] : []], ['Regionais', rs.map(r => item.reg(r, n))], ['Polos', ps.map(p => item.polo(p, n))],
      ['Municípios', ms.map(m => item.mun(m, n))], ['Alimentadores', as.map(a => item.al(a, n, kl))], ['Ativos', at.map(a => item.ativo(a, kl))]],
    achados.length > at.length ? `<p class="sug-mais">e mais ${(achados.length - at.length).toLocaleString('pt-BR')} ativos: continue digitando</p>` : '');
  }
  let espera = 0;
  q.addEventListener('input', () => { res.classList.remove('lista-mun'); clearTimeout(espera); espera = setTimeout(sugere, 120); });
  q.addEventListener('focus', () => { if (!q.value.trim() && !res.innerHTML) atalhos(); });
  q.addEventListener('keydown', e => {
    if (!sug.length || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter')) return;
    if (e.key === 'Enter') {
      if (!q.value.trim() && marcado < 0) { e.preventDefault(); return; }   // campo vazio: Enter não abre nada sozinho
      // Enter sem escolher: OS, ou o primeiro da lista se não vier ativo; senão busca o ativo digitado
      const i = marcado >= 0 ? marcado : sug[0] && sug[0].os ? 0 : sug.some(o => o.ativo) ? -1 : 0;
      if (i >= 0) { e.preventDefault(); escolhe(i); }
      return;
    }
    e.preventDefault();
    marca(e.key === 'ArrowDown' ? Math.min(sug.length - 1, marcado + 1) : Math.max(0, marcado - 1));
  });
  res.addEventListener('mousedown', e => { if (e.target.closest('.sug-op, .ir-mapa')) e.preventDefault(); });   // o campo não perde o foco
  res.addEventListener('mouseover', e => { const o = e.target.closest('.sug-op'); if (o && +o.dataset.i !== marcado) marca(+o.dataset.i); });
  res.addEventListener('click', e => {
    const o = e.target.closest('.sug-op');
    if (o) { escolhe(+o.dataset.i); return; }
    const b = e.target.closest('.ir-mapa');
    if (b) vaiNoMapa({ al: b.dataset.al });
  });
  let indoAl = null;                                     // a caminho de um alimentador: a lista do município não abre no meio
  function vaiNoMapa(alvo) {
    q.value = '';
    fecha();
    if (lupa) { q.hidden = true; lupa.setAttribute('aria-expanded', 'false'); }   // escolheu: o campo fecha, fica o olho
    q.blur();
    indoAl = alvo.al || null;
    Promise.resolve(mapa().vai(alvo)).finally(() => { indoAl = null; });
  }
  function escolhe(i) {
    const s = sug[i];
    if (!s) return;
    if (s.os) { buscaOS(s.os); return; }
    // alimentador do município aberto: 1 toque abre o painel dele (passar o mouse ou marcar com as setas acende a rede)
    if (s.almun) { fecha(); P.abre(`alimentadores/${encodeURIComponent(s.almun)}/`); return; }
    if (s.ativo) {
      q.value = s.ativo;
      fechaSug();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
      return;
    }
    const alvo = alvoMapa(s);
    if (mapa() && alvo) { vaiNoMapa(alvo); return; }
    // página sem o mapa: abre a página, como antes
    if (s.cod) P.abre(`municipios/${porCod[s.cod].slug}/`);
    else if (s.al) P.abre(`alimentadores/${encodeURIComponent(s.al)}/`);
    else if (s.reg || s.polo) P.abre('polos/');
  }
  const botaoMapa = al => mapa() && AL[al] ? `<button type="button" class="ir-mapa" data-al="${esc(al)}">Ver no mapa</button>` : '';

  // OS: todas as que têm esse número/ano; com a equipe digitada (ex.: ETO-RD-PO 002507/2026) fica só a dela
  async function buscaOS(txt) {
    clearTimeout(espera); pedido++; fechaSug();
    const k = chaveOS(txt);
    res.innerHTML = '<p>Buscando a OS…</p>';
    const d = await baixa('os/' + fatiaOS(k));
    if (d === null) { res.innerHTML = '<p>Não foi possível carregar o índice de OS. Confira a internet e tente de novo.</p>'; return; }
    const equipe = s => String(s).replace(/\d{1,7}\s*\/\s*\d{4}.*$/, '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    const todas = d[k] || [], eq = equipe(txt), comEquipe = /[A-Z]/.test(eq);
    const daEquipe = comEquipe ? todas.filter(h => equipe(h[0]).includes(eq)) : [];
    const hits = daEquipe.length ? daEquipe : todas;
    if (!hits.length) { res.innerHTML = `<p>A OS <b>${esc(txt)}</b> não está nas bases de faixa, inspeção, manutenção nem executadas.</p>`; return; }
    const lista = hits.slice(0, 40);
    res.innerHTML = `<p>${hits.length === 1 ? '1 OS' : hits.length + ' OS'} com o número <b>${esc(k)}</b>${comEquipe && !daEquipe.length ? ' (nenhuma da equipe digitada; mostrando todas)' : ''}:</p><ul>` +
      lista.map(([os, al, base, info, lat, lon]) =>
        `<li class="res-li"><a href="${esc(P.url(`alimentadores/${encodeURIComponent(al)}/${lat != null ? `?a=${encodeURIComponent(os)}&ll=${lat},${lon}` : ''}`))}"${P.alvo}>` +
        `<b>${esc(os)}</b><span>${esc(BASE_OS[base] || base)}${info ? ' · ' + esc(info) : ''}</span><span>${esc(al)}${AL[al] ? ' · ' + esc(AL[al].se) : ''}</span>` +
        '<span class="ir">Abrir no mapa do alimentador →</span></a>' + botaoMapa(al) + '</li>').join('') + '</ul>' +
      (hits.length > lista.length ? `<p class="sug-mais">e mais ${hits.length - lista.length}: digite a equipe junto (ex.: ETO-RD-PO ${esc(k)})</p>` : '');
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    clearTimeout(espera); pedido++; fechaSug();
    const txt = q.value.trim(), k = chave(txt);
    if (chaveOS(txt)) { buscaOS(txt); return; }
    if (!k) { res.innerHTML = ''; return; }
    res.innerHTML = '<p>Buscando…</p>';
    const d = await baixa('ativos/' + fatia(k));
    if (d === null) { res.innerHTML = '<p>Não foi possível carregar o índice. Confira a internet e tente de novo.</p>'; return; }
    const hits = d[k] || [];
    if (!hits.length) {
      res.innerHTML = `<p><b>${esc(txt)}</b> não foi encontrado. Confira o código: a busca é pelo código completo da chave, do transformador ` +
        'ou pelo número do poste. Postes sem número no cadastro não entram.</p>';
      return;
    }
    res.innerHTML = `<p>${hits.length === 1 ? '1 resultado' : hits.length + ' resultados'} para <b>${esc(txt)}</b>:</p><ul>` +
      hits.map(([al, tipo, t, papel, lat, lon]) => {
        const onde = tipo === 'poste' ? (papel ? 'Trechos ' + esc(papel) : 'Trecho ' + esc(t)) : esc(papel[0] ? papel[0].toUpperCase() + papel.slice(1) : '');
        return `<li class="res-li"><a href="${esc(P.url(`alimentadores/${encodeURIComponent(al)}/?${t ? 't=' + encodeURIComponent(t) + '&' : ''}a=${encodeURIComponent(txt)}&ll=${lat},${lon}`))}"${P.alvo}>` +
          `<b>${t ? esc(t) + ' · ' : ''}${esc(al)}</b><span>${esc(TIPO[tipo] || 'Chave ' + tipo)} ${esc(txt)}${AL[al] ? ' · ' + esc(AL[al].se) : ''}</span>` +
          (onde ? `<span>${onde}</span>` : '') + '<span class="ir">Abrir no mapa do alimentador →</span></a>' + botaoMapa(al) + '</li>';
      }).join('') + '</ul>';
  });

  // olho: abre o campo (e a lista com o próximo nível do mapa); com o campo vazio, tocar de novo fecha
  const abreCampo = sim => {
    if (!lupa) { if (sim) q.focus(); return; }
    q.hidden = !sim;
    lupa.setAttribute('aria-expanded', String(sim));
    if (sim) { q.focus(); if (!q.value.trim()) atalhos(); }
    else { q.value = ''; fecha(); }
  };
  if (lupa) {
    lupa.setAttribute('aria-expanded', String(!q.hidden));
    lupa.setAttribute('aria-label', 'Abrir a busca: regional, polo, município, alimentador, ativo ou OS');
    lupa.addEventListener('click', () => { if (q.hidden) abreCampo(true); else if (!q.value.trim()) abreCampo(false); else q.focus(); });
    // saiu do campo vazio, sem lista aberta: fecha e fica só o olho
    q.addEventListener('blur', () => setTimeout(() => {
      if (!q.hidden && !q.value.trim() && !form.contains(document.activeElement) && !res.innerHTML) abreCampo(false);
    }, 150));
  }
  // "/" abre a busca (fora de campos de texto)
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    e.preventDefault();
    abreCampo(true);
  });
  // a lista acompanha o mapa: abrir um município abre embaixo da logo a lista dos alimentadores dele (no lugar da caixa que
  // ficava ao lado do mapa); ao dar zoom num alimentador ela fecha para mostrar o mapa; com o campo em uso, só atualiza
  let munAberto = null;
  document.addEventListener('argos-nivel', e => {
    const d = e.detail || {}, livre = !q.value.trim(), usando = document.activeElement === q;
    if (d.mun && d.mun !== munAberto && !d.al) { munAberto = d.mun; if (livre && !indoAl) atalhos(); return; }
    if (!d.mun) munAberto = null;
    if (!livre) return;
    if (usando && sug.length) atalhos();
    else if (res.classList.contains('lista-mun') && (d.al || !d.mun)) fecha();
  });
  // visão do mapa trocada: a lista aberta (sem resultado de ativo ou OS) refaz os números
  document.addEventListener('argos-visao', () => { if (!sug.length || sug.some(s => s.os || s.ativo)) return; if (q.value.trim()) sugere(); else atalhos(); });
  // fecha a lista: Esc (no campo ou na lista; o foco volta ao campo), clique fora do formulário ou o foco saindo dele
  form.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!res.innerHTML) {                         // sem lista: o Esc fecha o campo (e o foco volta ao olho)
      if (lupa && !q.hidden) { e.preventDefault(); abreCampo(false); lupa.focus(); }
      return;
    }
    e.preventDefault();                           // sem isto o Esc também apagaria o texto do campo e subiria um nível no mapa
    fecha();
    if (!q.hidden) q.focus();
  });
  // (só a lista que já estava aberta quando o foco saiu: a do município abre logo depois de escolher, com o campo sem foco)
  form.addEventListener('focusout', () => { if (!sug.length) return; const era = res.firstChild; setTimeout(() => { if (!form.contains(document.activeElement) && sug.length && res.firstChild === era) fecha(); }, 0); });
  document.addEventListener('pointerdown', e => { if (res.innerHTML && !form.contains(e.target)) fecha(); });
})();
