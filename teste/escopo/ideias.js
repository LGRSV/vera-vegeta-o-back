/* Aba Ideias do Escopo: ideias, melhorias e erros da equipe. Aberta: qualquer pessoa vê, cadastra e comenta só com o nome
   (o nome fica guardado neste navegador). Só o dono do projeto, com login, muda a situação.
   Supabase: argos_ideias_publica (lista com os comentários), argos_ideia_cria_publica, argos_ideia_comenta_publica,
   argos_ideias_dono (confere o login do dono) e argos_ideia_situacao (muda a situação, com login). */
(function () {
  'use strict';
  const API = 'https://uabpevnjfcwidbjscowq.supabase.co/rest/v1/rpc/';
  const CHAVE = 'sb_publishable_SHH7EV0MT5grOTdCFM-V-w_FqPrtzPh';
  const GUARDA_NOME = 'argos-ideias-nome', GUARDA_DONO = 'argos-escopo-dono';
  const TIPOS = ['Ideia', 'Melhoria', 'Erro'];
  const SITS = ['Nova', 'Em análise', 'Aprovada', 'Feita', 'Descartada'];
  const CL_SIT = { 'Nova': '', 'Em análise': 'and', 'Aprovada': 'bloq', 'Feita': 'ok', 'Descartada': 'nok' };
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const quando = t => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const MODULOS = ((window.ARGOS_ESCOPO && window.ARGOS_ESCOPO.frentes) || []).map(f => f.nome).concat('Outro');
  const guarda = {
    le(k) { try { return localStorage.getItem(k) || ''; } catch (x) { return ''; } },
    poe(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (x) {} },
    leS(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (x) { return null; } },
    poeS(k, v) { try { v ? sessionStorage.setItem(k, JSON.stringify(v)) : sessionStorage.removeItem(k); } catch (x) {} },
  };

  const raiz = $('ideias');
  if (!raiz) return;
  let ideias = [], aberta = null, dono = guarda.leS(GUARDA_DONO), entrandoDono = false;
  const F = { sit: '', modulo: '', q: '' };

  async function rpc(fn, corpo) {
    const r = await fetch(API + fn, { method: 'POST', headers: { apikey: CHAVE, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) });
    const t = await r.text();
    if (!r.ok) {
      if (t.includes('login inválido')) throw new Error('Login ou senha inválidos.');
      if (t.includes('dono do projeto')) throw new Error('Só o dono do projeto muda a situação.');
      if (t.includes('informe seu nome')) throw new Error('Escreva seu nome (2 letras ou mais).');
      if (t.includes('muitas mensagens')) throw new Error('Muitas mensagens agora. Tente de novo em alguns minutos.');
      if (t.includes('check constraint')) throw new Error('Confira o título (3 a 140 letras) e o tamanho do texto.');
      throw new Error('Falha ao falar com o servidor. Tente de novo.');
    }
    return t ? JSON.parse(t) : null;
  }
  async function carrega() {
    ideias = ((await rpc('argos_ideias_publica')) || {}).ideias || [];
  }
  const nome = () => guarda.le(GUARDA_NOME);
  function lembraNome(n) { guarda.poe(GUARDA_NOME, n.trim().slice(0, 60)); }

  // ---------- lista
  function filtradas() {
    const q = semAcento(F.q);
    return ideias.filter(i => (!F.sit || i.situacao === F.sit) && (!F.modulo || i.modulo === F.modulo) &&
      (!q || semAcento(`${i.titulo} ${i.descricao} ${i.nome} ${i.modulo}`).includes(q)));
  }
  function desenha() {
    const n = s => ideias.filter(i => !s || i.situacao === s).length;
    const opt = (l, v) => l.map(x => `<option value="${esc(x)}"${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
    raiz.innerHTML = `
      <div class="id-topo"><span>${dono ? `Dono do projeto: <b>${esc(dono.nome)}</b> (muda a situação das ideias)` : 'Qualquer pessoa pode cadastrar e comentar: basta escrever o nome.'}</span>
        ${dono ? '<button type="button" class="id-link" data-acao="sair">Sair</button>' : '<button type="button" class="id-link" data-acao="dono">Entrar como dono do projeto</button>'}</div>
      ${entrandoDono && !dono ? `<form class="id-login" autocomplete="on"><h2>Dono do projeto</h2>
        <p>Login de quem acompanha a situação das ideias.</p>
        <input name="u" placeholder="Login" autocomplete="username" required aria-label="Login">
        <input name="s" type="password" placeholder="Senha" autocomplete="current-password" required aria-label="Senha">
        <p class="id-erro" role="alert"></p><div class="id-2"><button class="bt p" type="submit">Entrar</button>
        <button class="bt" type="button" data-acao="cancela">Cancelar</button></div></form>` : ''}
      <details class="id-nova"${ideias.length ? '' : ' open'}><summary class="bt p">+ Nova ideia ou melhoria</summary>
        <form class="id-form">
          <label>Seu nome<input name="nome" maxlength="60" required placeholder="Nome e área (ex.: Maria · Polo Gurupi)" value="${esc(nome())}"></label>
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
        <span class="cont" role="status">${filtradas().length} de ${ideias.length}</span></div>
      <div class="id-lista">${lista()}</div>`;
    liga();
  }
  function lista() {
    const l = filtradas();
    if (!ideias.length) return '<p class="vazio">Nenhuma ideia cadastrada ainda. Seja o primeiro.</p>';
    if (!l.length) return '<p class="vazio">Nenhuma ideia com esse filtro.</p>';
    return l.map(i => {
      const cs = i.comentarios || [], ab = aberta === i.id;
      return `<article class="id-card${ab ? ' on' : ''}" data-id="${i.id}">
        <button type="button" class="id-cab" data-acao="abre" aria-expanded="${ab}">
          <span class="tg ${CL_SIT[i.situacao] || ''}">${esc(i.situacao)}</span>
          <b>${esc(i.titulo)}</b>
          <small>${esc(i.tipo)} · ${esc(i.modulo)} · ${esc(i.nome)} · ${esc(quando(i.criado_em))}${cs.length ? ` · ${cs.length} comentário${cs.length > 1 ? 's' : ''}` : ''}</small></button>
        ${ab ? detalhe(i, cs) : ''}</article>`;
    }).join('');
  }
  function detalhe(i, cs) {
    const principais = cs.filter(c => !c.resposta_de), resp = id => cs.filter(c => c.resposta_de === id);
    const com = c => `<div class="id-com${c.resposta_de ? ' rp' : ''}"><small><b>${esc(c.nome)}</b> · ${esc(quando(c.criado_em))}</small><p>${esc(c.texto)}</p>
      ${c.resposta_de ? '' : `<button type="button" class="id-link" data-acao="responde" data-c="${c.id}">Responder</button>`}</div>` +
      resp(c.id).map(com).join('');
    return `<div class="id-det">
      ${i.descricao ? `<p class="id-desc">${esc(i.descricao)}</p>` : ''}
      ${dono ? `<label class="id-sitsel">Situação <select data-acao="situacao">${SITS.map(s => `<option${s === i.situacao ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></label>` : ''}
      <h3>Comentários</h3>
      ${principais.length ? principais.map(com).join('') : '<p class="vazio">Sem comentários.</p>'}
      <form class="id-cform" data-resp=""><small class="id-respo" hidden></small>
        <input name="nome" maxlength="60" required placeholder="Seu nome" aria-label="Seu nome" value="${esc(nome())}">
        <textarea name="texto" rows="2" maxlength="2000" required placeholder="Comente ou sugira um detalhe" aria-label="Comentário"></textarea>
        <p class="id-erro" role="alert"></p><button class="bt" type="submit">Comentar</button></form></div>`;
  }
  async function recarrega() { await carrega(); desenha(); }

  // ---------- ações
  function liga() {
    raiz.querySelector('.id-form').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, erro = f.querySelector('.id-erro'), bt = f.querySelector('button[type=submit]');
      bt.disabled = true; erro.textContent = 'Gravando...';
      try {
        const id = await rpc('argos_ideia_cria_publica', { p_nome: f.nome.value.trim(), p_titulo: f.titulo.value.trim(),
          p_descricao: f.descricao.value.trim(), p_modulo: f.modulo.value, p_tipo: f.tipo.value });
        lembraNome(f.nome.value);
        aberta = id; F.sit = ''; F.modulo = ''; F.q = '';
        await recarrega();
      } catch (x) { erro.textContent = x.message; bt.disabled = false; }
    });
    const lg = raiz.querySelector('.id-login');
    if (lg) lg.addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target, erro = f.querySelector('.id-erro');
      erro.textContent = 'Conferindo...';
      try {
        const n = await rpc('argos_ideias_dono', { p_login: f.u.value.trim(), p_senha: f.s.value });
        if (!n) throw new Error('Login ou senha inválidos (ou sem permissão de dono do projeto).');
        dono = { u: f.u.value.trim(), s: f.s.value, nome: n }; guarda.poeS(GUARDA_DONO, dono); entrandoDono = false;
        desenha();
      } catch (x) { erro.textContent = x.message; }
    });
    $('id-sit').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { F.sit = b.dataset.s; desenha(); } });
    $('id-mod').addEventListener('change', e => { F.modulo = e.target.value; desenha(); });
    $('id-q').addEventListener('input', e => {
      F.q = e.target.value;
      raiz.querySelector('.id-lista').innerHTML = lista();
      raiz.querySelector('.cont').textContent = `${filtradas().length} de ${ideias.length}`;
    });
  }
  raiz.addEventListener('click', e => {
    const a = e.target.closest('[data-acao]');
    if (!a || a.tagName === 'SELECT') return;
    const card = a.closest('.id-card'), id = card && +card.dataset.id;
    const acao = a.dataset.acao;
    if (acao === 'dono') { entrandoDono = true; desenha(); const u = raiz.querySelector('.id-login input'); if (u) u.focus(); }
    else if (acao === 'cancela') { entrandoDono = false; desenha(); }
    else if (acao === 'sair') { dono = null; guarda.poeS(GUARDA_DONO, null); desenha(); }
    else if (acao === 'abre') { aberta = aberta === id ? null : id; raiz.querySelector('.id-lista').innerHTML = lista(); }
    else if (acao === 'responde') {
      const f = card.querySelector('.id-cform'), c = (ideias.find(x => x.id === id).comentarios || []).find(x => x.id === +a.dataset.c);
      f.dataset.resp = a.dataset.c;
      const r = f.querySelector('.id-respo'); r.hidden = false; r.textContent = `Respondendo a ${c ? c.nome : ''}`;
      f.texto.focus();
    }
  });
  raiz.addEventListener('change', async e => {
    const s = e.target.closest('[data-acao="situacao"]');
    if (!s || !dono) return;
    const id = +s.closest('.id-card').dataset.id;
    s.disabled = true;
    try { await rpc('argos_ideia_situacao', { p_login: dono.u, p_senha: dono.s, p_id: id, p_situacao: s.value }); await recarrega(); }
    catch (x) { alert(x.message); s.disabled = false; }
  });
  raiz.addEventListener('submit', async e => {
    const f = e.target.closest('.id-cform');
    if (!f) return;
    e.preventDefault();
    const id = +f.closest('.id-card').dataset.id, erro = f.querySelector('.id-erro'), bt = f.querySelector('button');
    bt.disabled = true; erro.textContent = 'Gravando...';
    try {
      await rpc('argos_ideia_comenta_publica', { p_nome: f.nome.value.trim(), p_ideia: id, p_texto: f.texto.value.trim(),
        p_resposta_de: f.dataset.resp ? +f.dataset.resp : null });
      lembraNome(f.nome.value);
      await recarrega();
    } catch (x) { erro.textContent = x.message; bt.disabled = false; }
  });

  // ---------- início
  raiz.innerHTML = '<p class="vazio">Carregando ideias...</p>';
  carrega().then(desenha).catch(() => { raiz.innerHTML = '<p class="vazio">Não foi possível carregar as ideias agora. Recarregue a página.</p>'; });
})();
