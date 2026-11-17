/* Aba Ideias do Escopo: ideias e melhorias da equipe, com login (o mesmo da Programação de obras).
   Tudo fica no Supabase e passa pelas funções com login: argos_ideias_lista, argos_ideia_cria, argos_ideia_situacao
   (só o dono do projeto muda a situação) e, nos comentários de cada ideia, argos_comenta e argos_comentarios_lista
   (página "escopo", alvo "ideia:<id>"). O login fica guardado só até fechar a aba (sessionStorage). */
(function () {
  'use strict';
  const API = 'https://uabpevnjfcwidbjscowq.supabase.co/rest/v1/rpc/';
  const CHAVE = 'sb_publishable_SHH7EV0MT5grOTdCFM-V-w_FqPrtzPh';
  const PAGINA = 'escopo', GUARDA = 'argos-escopo-ideias';
  const TIPOS = ['Ideia', 'Melhoria', 'Erro'];
  const SITS = ['Nova', 'Em análise', 'Aprovada', 'Feita', 'Descartada'];
  const CL_SIT = { 'Nova': '', 'Em análise': 'and', 'Aprovada': 'bloq', 'Feita': 'ok', 'Descartada': 'nok' };
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const quando = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const MODULOS = ((window.ARGOS_ESCOPO && window.ARGOS_ESCOPO.frentes) || []).map(f => f.nome).concat('Outro');

  const raiz = $('ideias');
  if (!raiz) return;
  let sess = null, dados = null, coments = [], aberta = null;
  const F = { sit: '', modulo: '', q: '' };

  async function rpc(fn, corpo) {
    const r = await fetch(API + fn, { method: 'POST', headers: { apikey: CHAVE, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const t = await r.text();
    if (!r.ok) {
      if (t.includes('login inválido')) throw new Error('Login ou senha inválidos.');
      if (t.includes('dono do projeto')) throw new Error('Só o dono do projeto muda a situação.');
      if (t.includes('check constraint')) throw new Error('Confira o título (3 a 140 letras) e a descrição (até 4.000).');
      throw new Error('Falha ao falar com o servidor. Tente de novo.');
    }
    return t ? JSON.parse(t) : null;
  }

  // ---------- login
  function telaLogin(msg) {
    raiz.innerHTML = `<form class="id-login" autocomplete="on">
      <h2>Entre para ver e cadastrar ideias</h2>
      <p>Use o mesmo login da Programação de obras. Quem ainda não tem login pede ao dono do projeto.</p>
      <input name="u" placeholder="Login" autocomplete="username" required aria-label="Login">
      <input name="s" type="password" placeholder="Senha" autocomplete="current-password" required aria-label="Senha">
      <p class="id-erro" role="alert">${esc(msg || '')}</p>
      <button class="bt p" type="submit">Entrar</button></form>`;
    raiz.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target;
      entrar(f.u.value.trim(), f.s.value);
    });
  }
  async function entrar(u, s, lembrado) {
    const erro = raiz.querySelector('.id-erro');
    if (erro) erro.textContent = 'Conferindo...';
    try {
      const d = await rpc('argos_ideias_lista', { p_login: u, p_senha: s });
      sess = { u, s };
      try { sessionStorage.setItem(GUARDA, JSON.stringify(sess)); } catch (x) {}
      dados = d;
      await carregaComentarios();
      desenha();
    } catch (e) {
      sess = null;
      if (lembrado) { try { sessionStorage.removeItem(GUARDA); } catch (x) {} telaLogin(''); return; }
      telaLogin(e.message);
    }
  }
  function sair() {
    sess = null; dados = null; coments = []; aberta = null;
    try { sessionStorage.removeItem(GUARDA); } catch (x) {}
    telaLogin('');
  }
  async function recarrega() {
    dados = await rpc('argos_ideias_lista', { p_login: sess.u, p_senha: sess.s });
    await carregaComentarios();
    desenha();
  }
  async function carregaComentarios() {
    coments = (await rpc('argos_comentarios_lista', { p_login: sess.u, p_senha: sess.s, p_pagina: PAGINA })) || [];
  }

  // ---------- lista
  function filtradas() {
    const q = F.q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return dados.ideias.filter(i => (!F.sit || i.situacao === F.sit) && (!F.modulo || i.modulo === F.modulo) &&
      (!q || `${i.titulo} ${i.descricao} ${i.nome} ${i.modulo}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q)));
  }
  function desenha() {
    const n = s => dados.ideias.filter(i => !s || i.situacao === s).length;
    const opt = (l, v) => l.map(x => `<option value="${esc(x)}"${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
    raiz.innerHTML = `
      <div class="id-topo"><span>Conectado como <b>${esc(dados.nome)}</b>${dados.admin ? ' · dono do projeto' : ''}</span>
        <button type="button" class="id-link" data-acao="sair">Sair</button></div>
      <details class="id-nova"${dados.ideias.length ? '' : ' open'}><summary class="bt p">+ Nova ideia ou melhoria</summary>
        <form class="id-form">
          <label>Título<input name="titulo" maxlength="140" required placeholder="Em uma frase: o que mudar ou criar"></label>
          <div class="id-2"><label>Tipo<select name="tipo">${opt(TIPOS, 'Ideia')}</select></label>
            <label>Módulo do ARGOS<select name="modulo">${opt(MODULOS, '')}</select></label></div>
          <label>Descrição<textarea name="descricao" maxlength="4000" rows="4" placeholder="Onde, o que acontece hoje e o que você espera"></textarea></label>
          <p class="id-erro" role="alert"></p>
          <button class="bt p" type="submit">Cadastrar</button></form></details>
      <div class="filtros">
        <div class="seg" id="id-sit" role="group" aria-label="Situação">${[''].concat(SITS).map(s =>
          `<button type="button" data-s="${esc(s)}" aria-pressed="${F.sit === s}">${esc(s || 'Todas')} <span class="id-n">${n(s)}</span></button>`).join('')}</div>
        <select id="id-mod" aria-label="Módulo"><option value="">Todos os módulos</option>${opt(MODULOS, F.modulo)}</select>
        <input class="busca" type="search" id="id-q" placeholder="Buscar ideia" aria-label="Buscar ideia" value="${esc(F.q)}" autocomplete="off">
        <span class="cont" role="status">${filtradas().length} de ${dados.ideias.length}</span></div>
      <div class="id-lista">${lista()}</div>`;
    liga();
  }
  function lista() {
    const l = filtradas();
    if (!dados.ideias.length) return '<p class="vazio">Nenhuma ideia cadastrada ainda. Seja o primeiro.</p>';
    if (!l.length) return '<p class="vazio">Nenhuma ideia com esse filtro.</p>';
    return l.map(i => {
      const cs = coments.filter(c => c.alvo === 'ideia:' + i.id);
      const ab = aberta === i.id;
      return `<article class="id-card${ab ? ' on' : ''}" data-id="${i.id}">
        <button type="button" class="id-cab" data-acao="abre" aria-expanded="${ab}">
          <span class="tg ${CL_SIT[i.situacao] || ''}">${esc(i.situacao)}</span>
          <b>${esc(i.titulo)}</b>
          <small>${esc(i.tipo)} · ${esc(i.modulo)} · ${esc(i.nome)} · ${esc(quando(i.criado_em))}${cs.length ? ` · ${cs.length} comentário${cs.length > 1 ? 's' : ''}` : ''}</small></button>
        ${ab ? detalhe(i, cs) : ''}</article>`;
    }).join('');
  }
  function detalhe(i, cs) {
    const raiz_ = cs.filter(c => !c.resposta_de), resp = id => cs.filter(c => c.resposta_de === id);
    const com = c => `<div class="id-com${c.resposta_de ? ' rp' : ''}"><small><b>${esc(c.nome)}</b> · ${esc(quando(c.criado_em))}</small><p>${esc(c.texto)}</p>
      ${c.resposta_de ? '' : `<button type="button" class="id-link" data-acao="responde" data-c="${c.id}">Responder</button>`}</div>` +
      resp(c.id).map(com).join('');
    return `<div class="id-det">
      ${i.descricao ? `<p class="id-desc">${esc(i.descricao)}</p>` : ''}
      ${dados.admin ? `<label class="id-sitsel">Situação <select data-acao="situacao">${SITS.map(s => `<option${s === i.situacao ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>` : ''}
      <h3>Comentários</h3>
      ${raiz_.length ? raiz_.map(com).join('') : '<p class="vazio">Sem comentários.</p>'}
      <form class="id-cform" data-resp=""><small class="id-respo" hidden></small>
        <textarea name="texto" rows="2" maxlength="2000" required placeholder="Comente ou sugira um detalhe" aria-label="Comentário"></textarea>
        <p class="id-erro" role="alert"></p><button class="bt" type="submit">Comentar</button></form></div>`;
  }

  // ---------- ações
  function liga() {
    const form = raiz.querySelector('.id-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, erro = f.querySelector('.id-erro'), bt = f.querySelector('button');
      bt.disabled = true; erro.textContent = 'Gravando...';
      try {
        const id = await rpc('argos_ideia_cria', { p_login: sess.u, p_senha: sess.s, p_titulo: f.titulo.value.trim(),
          p_descricao: f.descricao.value.trim(), p_modulo: f.modulo.value, p_tipo: f.tipo.value });
        aberta = id; F.sit = ''; F.modulo = ''; F.q = '';
        await recarrega();
      } catch (x) { erro.textContent = x.message; bt.disabled = false; }
    });
    $('id-sit').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { F.sit = b.dataset.s; desenha(); } });
    $('id-mod').addEventListener('change', e => { F.modulo = e.target.value; desenha(); });
    $('id-q').addEventListener('input', e => {
      F.q = e.target.value;
      raiz.querySelector('.id-lista').innerHTML = lista();
      raiz.querySelector('.cont').textContent = `${filtradas().length} de ${dados.ideias.length}`;
    });
  }
  raiz.addEventListener('click', e => {
    const a = e.target.closest('[data-acao]');
    if (!a || !sess) return;
    const card = a.closest('.id-card'), id = card && +card.dataset.id;
    if (a.dataset.acao === 'sair') sair();
    else if (a.dataset.acao === 'abre') { aberta = aberta === id ? null : id; raiz.querySelector('.id-lista').innerHTML = lista(); }
    else if (a.dataset.acao === 'responde') {
      const f = card.querySelector('.id-cform'), c = coments.find(x => x.id === +a.dataset.c);
      f.dataset.resp = a.dataset.c;
      const r = f.querySelector('.id-respo'); r.hidden = false; r.textContent = `Respondendo a ${c ? c.nome : ''}`;
      f.texto.focus();
    }
  });
  raiz.addEventListener('change', async e => {
    const s = e.target.closest('[data-acao="situacao"]');
    if (!s) return;
    const id = +s.closest('.id-card').dataset.id;
    s.disabled = true;
    try { await rpc('argos_ideia_situacao', { p_login: sess.u, p_senha: sess.s, p_id: id, p_situacao: s.value }); await recarrega(); }
    catch (x) { alert(x.message); s.disabled = false; }
  });
  raiz.addEventListener('submit', async e => {
    const f = e.target.closest('.id-cform');
    if (!f) return;
    e.preventDefault();
    const card = f.closest('.id-card'), i = dados.ideias.find(x => x.id === +card.dataset.id), erro = f.querySelector('.id-erro'), bt = f.querySelector('button');
    bt.disabled = true; erro.textContent = 'Gravando...';
    try {
      await rpc('argos_comenta', { p_login: sess.u, p_senha: sess.s, p_pagina: PAGINA, p_alvo: 'ideia:' + i.id, p_alvo_rotulo: i.titulo,
        p_texto: f.texto.value.trim(), p_resposta_de: f.dataset.resp ? +f.dataset.resp : null });
      await recarrega();
    } catch (x) { erro.textContent = x.message; bt.disabled = false; }
  });

  // ---------- início: login guardado na aba
  let g = null;
  try { g = JSON.parse(sessionStorage.getItem(GUARDA) || 'null'); } catch (x) {}
  if (g && g.u) { raiz.innerHTML = '<p class="vazio">Carregando ideias...</p>'; entrar(g.u, g.s, true); } else telaLogin('');
})();
