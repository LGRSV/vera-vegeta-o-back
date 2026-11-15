/* ARGOS · página fechada com login e comentários (estilo artifact).
   Login conferido no Supabase (argos_login); os dados da página vêm cifrados (dados.enc.js)
   e só abrem com a senha. Comentários gravados em argos_comentarios pelas funções argos_*. */
(function () {
  const API = 'https://uabpevnjfcwidbjscowq.supabase.co/rest/v1/rpc/';
  const CHAVE = 'sb_publishable_SHH7EV0MT5grOTdCFM-V-w_FqPrtzPh';
  const PAGINA = document.documentElement.dataset.pagina;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let sess = null, lista = [], filtroAlvo = null, aberto = false, novoAlvo = null;

  async function rpc(fn, corpo) {
    const r = await fetch(API + fn, { method: 'POST', headers: { apikey: CHAVE, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const t = await r.text();
    if (!r.ok) throw new Error(t.includes('login inválido') ? 'Login ou senha inválidos.' : 'Falha ao falar com o servidor.');
    return t ? JSON.parse(t) : null;
  }
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  async function abre(senha) {
    const E = window.PROG_ENC;
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64(E.s), iterations: E.i, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(E.n) }, key, b64(E.c));
    return JSON.parse(new TextDecoder().decode(pt));
  }

  /* ---------- tela de login ---------- */
  const css = document.createElement('style');
  css.textContent = `
  .lg{position:fixed;inset:0;z-index:50;display:grid;place-items:center;background:var(--bg);padding:16px}
  .lg form{width:min(360px,100%);border:1px solid var(--line);border-radius:var(--r2);padding:24px;background:var(--paper);display:grid;gap:12px}
  .lg h2{margin:0;font:700 var(--t-xl) var(--f-display)}.lg p{margin:0;color:var(--muted);font-size:var(--t-sm)}
  .lg input{font:500 var(--t-base) var(--f-body);color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:var(--r1);padding:10px}
  .lg .erro{color:var(--alerta);min-height:1.2em}
  .cm{font:600 11px var(--f-mono);color:var(--muted);background:none;border:1px solid transparent;border-radius:var(--rp);padding:1px 7px;margin-left:6px;cursor:pointer;vertical-align:middle}
  .cm:hover{border-color:var(--line);color:var(--fg)}.cm.tem{color:var(--aviso);border-color:var(--aviso)}
  .cm-fab{position:fixed;right:16px;bottom:16px;z-index:40;font:600 var(--t-sm) var(--f-body);color:var(--fg);background:var(--paper);border:1px solid var(--accent);border-radius:var(--rp);padding:10px 16px;cursor:pointer;box-shadow:0 4px 18px rgba(0,0,0,.35)}
  .cm-pn{position:fixed;top:0;right:0;bottom:0;z-index:45;width:min(400px,100%);background:var(--paper);border-left:1px solid var(--line);display:flex;flex-direction:column;transform:translateX(100%);transition:transform .2s}
  .cm-pn.on{transform:none}
  .cm-cab{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line)}
  .cm-cab b{font:700 var(--t-lg) var(--f-display)}.cm-cab button{background:none;border:0;color:var(--muted);font-size:20px;cursor:pointer}
  .cm-fl{padding:8px 16px;font-size:var(--t-sm);color:var(--muted);border-bottom:1px solid var(--line)}
  .cm-fl a{color:var(--accent);cursor:pointer;margin-left:6px}
  .cm-ls{flex:1;overflow:auto;padding:8px 16px}
  .cm-th{border:1px solid var(--line);border-radius:var(--r2);padding:10px 12px;margin:8px 0}
  .cm-th.res{opacity:.55}
  .cm-alvo{font:600 var(--t-xs) var(--f-mono);color:var(--accent);cursor:pointer;display:block;margin-bottom:6px}
  .cm-it{margin:6px 0}.cm-it small{color:var(--muted)}.cm-it p{margin:2px 0 0;white-space:pre-wrap;font-size:var(--t-sm)}
  .cm-it.rp{margin-left:14px;padding-left:10px;border-left:2px solid var(--line)}
  .cm-ac{display:flex;gap:10px;margin-top:6px}.cm-ac a{font-size:var(--t-xs);color:var(--muted);cursor:pointer}.cm-ac a:hover{color:var(--fg)}
  .cm-nv{border-top:1px solid var(--line);padding:12px 16px;display:grid;gap:8px}
  .cm-nv small{color:var(--muted)}
  .cm-nv textarea{font:500 var(--t-sm) var(--f-body);color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:var(--r1);padding:8px;min-height:70px;resize:vertical}
  .cm-nv button{justify-self:end}`;
  document.head.appendChild(css);

  const lg = document.createElement('div');
  lg.className = 'lg';
  lg.innerHTML = `<form><h2>ARGOS · acesso restrito</h2><p>Página em esboço. Entre com seu login para ver e comentar.</p>
    <input name="u" placeholder="Login" autocomplete="username" required>
    <input name="s" type="password" placeholder="Senha" autocomplete="current-password" required>
    <div class="erro"></div><button class="btn" type="submit">Entrar</button></form>`;
  document.body.appendChild(lg);
  const form = lg.querySelector('form'), erro = lg.querySelector('.erro');

  async function entrar(u, s, lembrado) {
    erro.textContent = 'Conferindo...';
    try {
      const nome = await rpc('argos_login', { p_login: u, p_senha: s, p_pagina: PAGINA });
      if (!nome) throw new Error('Login ou senha inválidos.');
      window.PROG = await abre(s);
      sess = { u: u.trim().toLowerCase(), s, nome };
      try { sessionStorage.setItem('argos-' + PAGINA, JSON.stringify({ u, s })); } catch (e) {}
      lg.remove();
      window.iniciar();
      montaComentarios();
    } catch (e) {
      erro.textContent = e.message || 'Não foi possível abrir.';
      if (lembrado) try { sessionStorage.removeItem('argos-' + PAGINA); } catch (x) {}
    }
  }
  form.onsubmit = ev => { ev.preventDefault(); entrar(form.u.value, form.s.value); };
  try { const m = JSON.parse(sessionStorage.getItem('argos-' + PAGINA) || 'null'); if (m) entrar(m.u, m.s, true); } catch (e) {}

  /* ---------- comentários ---------- */
  let pn, ls, nvTxt, nvRot, fl;
  function montaComentarios() {
    const fab = document.createElement('button');
    fab.className = 'cm-fab'; fab.id = 'cm-fab';
    fab.onclick = () => painel(!aberto);
    pn = document.createElement('aside'); pn.className = 'cm-pn';
    pn.innerHTML = `<div class="cm-cab"><b>Comentários</b><button title="Fechar">×</button></div>
      <div class="cm-fl"></div><div class="cm-ls"></div>
      <div class="cm-nv"><small></small><textarea placeholder="Escreva um comentário"></textarea><button class="btn">Comentar</button></div>`;
    document.body.append(fab, pn);
    ls = pn.querySelector('.cm-ls'); nvTxt = pn.querySelector('textarea'); nvRot = pn.querySelector('.cm-nv small'); fl = pn.querySelector('.cm-fl');
    pn.querySelector('.cm-cab button').onclick = () => painel(false);
    pn.querySelector('.cm-nv button').onclick = enviar;
    nvTxt.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviar(); };
    document.addEventListener('click', e => {
      const b = e.target.closest('.cm[data-alvo]'); if (!b) return;
      e.stopPropagation(); e.preventDefault();
      comentarSobre(b.dataset.alvo, b.dataset.rot);
    }, true);
    carrega(); setInterval(carrega, 30000);
  }
  function painel(on) { aberto = on; pn.classList.toggle('on', on); if (on) desenha(); }
  function comentarSobre(alvo, rot) { filtroAlvo = alvo; novoAlvo = { alvo, rot, resp: null }; painel(true); nvTxt.focus(); }
  async function carrega() {
    try { lista = await rpc('argos_comentarios_lista', { p_login: sess.u, p_senha: sess.s, p_pagina: PAGINA }) || []; } catch (e) { return; }
    marcar(); if (aberto) desenha();
  }
  function marcar() {
    const n = {}; lista.filter(c => !c.resolvido && !c.resposta_de).forEach(c => n[c.alvo] = (n[c.alvo] || 0) + 1);
    document.querySelectorAll('.cm[data-alvo]').forEach(b => { const k = n[b.dataset.alvo] || 0; b.textContent = k ? 'comentários ' + k : 'comentar'; b.classList.toggle('tem', !!k); });
    const abertos = lista.filter(c => !c.resolvido && !c.resposta_de).length;
    const f = document.getElementById('cm-fab'); if (f) f.textContent = 'Comentários' + (abertos ? ' · ' + abertos + ' abertos' : '');
  }
  window.ARGOS_CM = { marcar };
  const quando = d => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  function desenha() {
    const raiz = lista.filter(c => !c.resposta_de && (!filtroAlvo || c.alvo === filtroAlvo)).sort((a, b) => a.resolvido - b.resolvido || new Date(b.criado_em) - new Date(a.criado_em));
    fl.innerHTML = filtroAlvo ? `Mostrando: ${esc(novoAlvo && novoAlvo.alvo === filtroAlvo ? novoAlvo.rot : filtroAlvo)} <a data-x="todos">ver todos</a>` : 'Todos os comentários da página';
    const fa = fl.querySelector('[data-x=todos]'); if (fa) fa.onclick = () => { filtroAlvo = null; novoAlvo = null; desenha(); };
    ls.innerHTML = raiz.length ? raiz.map(c => {
      const resp = lista.filter(r => r.resposta_de === c.id);
      return `<div class="cm-th${c.resolvido ? ' res' : ''}"><span class="cm-alvo" data-a="${esc(c.alvo)}" data-r="${esc(c.alvo_rotulo || '')}">${esc(c.alvo_rotulo || 'Página inteira')}</span>
        <div class="cm-it"><small><b>${esc(c.nome)}</b> · ${quando(c.criado_em)}</small><p>${esc(c.texto)}</p></div>
        ${resp.map(r => `<div class="cm-it rp"><small><b>${esc(r.nome)}</b> · ${quando(r.criado_em)}</small><p>${esc(r.texto)}</p></div>`).join('')}
        <div class="cm-ac"><a data-resp="${c.id}">Responder</a><a data-res="${c.id}" data-v="${!c.resolvido}">${c.resolvido ? 'Reabrir' : 'Resolver'}</a></div></div>`;
    }).join('') : '<p class="nota">Nenhum comentário ainda.</p>';
    ls.querySelectorAll('[data-resp]').forEach(a => a.onclick = () => { const c = lista.find(x => x.id == a.dataset.resp); novoAlvo = { alvo: c.alvo, rot: c.alvo_rotulo, resp: c.id }; rotulo(); nvTxt.focus(); });
    ls.querySelectorAll('[data-res]').forEach(a => a.onclick = async () => { await rpc('argos_comentario_resolve', { p_login: sess.u, p_senha: sess.s, p_pagina: PAGINA, p_id: +a.dataset.res, p_resolvido: a.dataset.v === 'true' }); carrega(); });
    ls.querySelectorAll('.cm-alvo').forEach(a => a.onclick = () => { filtroAlvo = a.dataset.a; novoAlvo = { alvo: a.dataset.a, rot: a.dataset.r, resp: null }; desenha(); });
    rotulo();
  }
  function rotulo() {
    nvRot.textContent = novoAlvo ? (novoAlvo.resp ? 'Respondendo em: ' : 'Comentar sobre: ') + (novoAlvo.rot || 'Página inteira') : 'Comentar sobre: página inteira';
  }
  async function enviar() {
    const t = nvTxt.value.trim(); if (!t) return;
    const a = novoAlvo || { alvo: 'pagina', rot: 'Página inteira', resp: null };
    try {
      await rpc('argos_comenta', { p_login: sess.u, p_senha: sess.s, p_pagina: PAGINA, p_alvo: a.alvo, p_alvo_rotulo: a.rot || 'Página inteira', p_texto: t, p_resposta_de: a.resp });
      nvTxt.value = ''; if (a.resp) novoAlvo = { ...a, resp: null };
      carrega();
    } catch (e) { nvRot.textContent = e.message; }
  }
})();
