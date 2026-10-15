// Menu do site: botão de três barras no canto superior esquerdo de todas as páginas.
// "Atualização de dados" abre um diálogo: arrastar (ou escolher) o arquivo → a base sai do nome do arquivo (ou da lista)
// → envio direto ao GitHub (PUT /contents em bases/<tipo>/ do gh-pages, com a chave colada uma vez e guardada só neste
// navegador) → acompanha a automação .github/workflows/atualiza-bases.yml daquele commit → relê dados/bases.json.
// Cada base mostra a data da última atualização (dados/bases.json, de scripts/atualiza_bases.py).
// Fora do github.io o repositório não é conhecido: mostra tudo, mas não envia (window.__repoSite = {dono, repo, ramo,
// pasta} simula o site publicado nos testes). A chave só vai para https://api.github.com.
// O caminho dos arquivos sai do endereço deste script (assets/menu.js), então funciona em qualquer nível de página.
(function () {
  const eu = document.currentScript && document.currentScript.src;
  const wrap = document.querySelector('.wrap');
  if (!eu || !wrap) return;
  const raiz = eu.replace(/assets\/menu\.js(\?.*)?$/, '');
  const repoPg = location.hostname.endsWith('.github.io') && location.pathname.split('/')[1];
  const gh = window.__repoSite || (repoPg ? { dono: location.hostname.split('.')[0], repo: repoPg, ramo: 'gh-pages' } : null);
  // pasta do site dentro do repositório (teste/): o que vem depois de /<repo>/ no endereço
  const pasta = gh ? gh.pasta ?? new URL(raiz).pathname.split('/').slice(2).join('/') : '';
  // a ordem não importa: os padrões não se cruzam (a manutenção também tem "inspeção" no nome)
  const BASES = [
    { tipo: 'critica', nome: 'Crítica (NAE)', re: /critica/ },
    { tipo: 'limpeza', nome: 'OS de limpeza de faixa', re: /limpeza|faixa/ },
    { tipo: 'inspecao', nome: 'Base de inspeção', re: /^(?!.*gerad).*inspec/ },
    { tipo: 'manutencao', nome: 'OS de manutenção da inspeção', re: /gerad/ },
    { tipo: 'executadas', nome: 'OS de manutenção executadas', re: /executad/ },
  ];
  const LIMITE = 50e6;                                   // o maior arquivo real (executadas .zip) tem 23 MB
  const API = 'https://api.github.com', CHAVE = 'menu.chaveGitHub';
  const toque = matchMedia('(pointer: coarse)').matches;   // celular: não há o que arrastar
  const svg = (d, cls) => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
  const ICONE = {
    barras: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    enviar: '<path d="M12 16V5"/><path d="m7 10 5-5 5 5"/><path d="M5 20h14"/>',
    baixar: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
    lua: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  };
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const mes = m => MESES[+m.slice(5, 7) - 1] + '/' + m.slice(0, 4);
  const br = d => d.slice(0, 10).split('-').reverse().join('/');
  const nf = n => Number(n).toLocaleString('pt-BR');
  const sem = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const reconhece = nome => (BASES.find(b => b.re.test(sem(nome))) || {}).tipo || '';
  // o que o site tem de cada base: a data mais recente (envio pelo menu ou processamento) e o período curto
  const ultima = b => [b.enviado, b.processado].filter(Boolean).sort().pop();
  const resumo = (t, b) => b.meses ? `${mes(b.meses[0])} a ${mes(b.meses[1])}` : b.os == null ? '' :
    `${nf(b.os)} ${t === 'inspecao' ? 'inspeções' : 'OS'}${b.ate ? ' até ' + br(b.ate) : ''}`;

  const css = document.createElement('style');
  css.textContent =
    '.mnu{position:relative;display:flex;align-items:center;min-height:40px;margin-bottom:calc(var(--s2,8px) * -1)}' +
    '.mnu-btn,.mnu-x{width:40px;height:40px;display:grid;place-items:center;flex:none;padding:0;border:1px solid var(--line-forte,#8c948f);' +
    'border-radius:var(--r2,10px);background:var(--paper,#fbfbf9);color:var(--fg,#1b2024);cursor:pointer}' +
    '.mnu-btn:hover,.mnu-btn[aria-expanded="true"],.mnu-x:hover{border-color:var(--accent,#b8431f)}' +
    '.mnu svg,.mnu-dlg svg{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.8;width:20px;height:20px}' +
    '.mnu-lista{position:absolute;top:calc(100% + 6px);left:0;z-index:2000;width:min(320px,calc(100vw - 32px));margin:0;' +
    'padding:6px;list-style:none;background:var(--paper,#fbfbf9);border:1px solid var(--line,#d6dad6);' +
    'border-radius:var(--r2,10px);box-shadow:var(--sh2,0 12px 32px -12px rgb(0 0 0 / .28))}' +
    '.mnu-lista a,.mnu-lista button{display:flex;align-items:center;gap:12px;width:100%;min-height:40px;padding:8px 10px;border:0;' +
    'border-radius:calc(var(--r2,10px) - 2px);background:none;color:var(--fg,#1b2024);text-align:left;text-decoration:none;' +
    'font:600 var(--t-base,15px)/1.3 var(--f-body,system-ui);cursor:pointer}' +
    '.mnu-lista a{font-weight:400;font-size:var(--t-sm,13px);color:var(--muted,#5a636a)}' +
    '.mnu-lista button svg{color:var(--accent,#b8431f)}' +
    '.mnu-lista a:hover,.mnu-lista button:hover,.mnu-lista :focus-visible{background:var(--hover,rgb(0 0 0 / .05));outline:none}' +
    '.mnu-lista :focus-visible{box-shadow:inset 0 0 0 2px var(--accent,#b8431f)}' +
    '.mnu-sep{height:1px;margin:6px 4px;background:var(--line,#d6dad6)}' +
    '.mnu-tema span{flex:1}.mnu-tema kbd{font:600 11px/1 var(--f-mono,monospace);padding:4px 6px;border:1px solid var(--line,#d6dad6);border-radius:6px;color:var(--muted,#5a636a)}' +
    '.mnu-sw{position:relative;flex:none;width:32px;height:18px;border-radius:9px;background:var(--line-forte,#8c948f);transition:background .15s}' +
    '.mnu-sw::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left .15s}' +
    '.mnu-tema[aria-pressed="true"] .mnu-sw{background:var(--accent,#b8431f)}.mnu-tema[aria-pressed="true"] .mnu-sw::after{left:16px}' +
    '.mnu-dlg{width:min(440px,calc(100vw - 32px));max-height:calc(100dvh - 32px);padding:16px;border:1px solid var(--line,#d6dad6);' +
    'border-radius:var(--r3,14px);background:var(--paper,#fbfbf9);color:var(--fg,#1b2024);box-shadow:var(--sh2);' +
    'font:var(--t-md,14px)/1.4 var(--f-body,system-ui)}' +
    '.mnu-dlg[open]{display:grid;gap:12px}.mnu-dlg [hidden]{display:none!important}.mnu-dlg::backdrop{background:rgb(0 0 0 / .45)}' +
    '.mnu-cab{display:flex;align-items:center;justify-content:space-between;gap:12px}' +
    '.mnu-cab h2{margin:0;font:600 var(--t-xl,20px)/1.2 var(--f-display,system-ui)}' +
    '.mnu-dlg :focus-visible{outline:2px solid var(--accent,#b8431f);outline-offset:2px}' +
    '.mnu-dlg input,.mnu-dlg select,.mnu-dlg button{min-height:40px;border-radius:var(--r2,10px);font:inherit}' +
    '.mnu-dlg input,.mnu-dlg select{min-width:0;padding:0 10px;border:1px solid var(--line-forte,#8c948f);' +
    'background:var(--paper,#fbfbf9);color:var(--fg,#1b2024)}' +
    '.mnu-ok{padding:0 16px;border:0;background:var(--accent,#b8431f);color:var(--on-accent,#fff);font-weight:600!important;cursor:pointer}' +
    '.mnu-ok:disabled{opacity:.45;cursor:default}' +
    '.mnu-chave{display:grid;gap:6px}.mnu-chave label{font-weight:600}' +
    '.mnu-linha{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}' +
    '.mnu-dlg small{color:var(--muted,#5a636a);font-size:var(--t-xs,12px)}.mnu-dlg a{color:var(--accent,#b8431f)}' +
    '.mnu-zona{display:grid;place-items:center;gap:2px;min-height:112px;padding:12px;border:2px dashed var(--line-forte,#8c948f);' +
    'background:none;color:var(--fg,#1b2024);cursor:pointer}' +
    '.mnu-zona svg{color:var(--accent,#b8431f);width:24px;height:24px}' +
    '.mnu-zona:hover,.mnu-zona.sobre{border-color:var(--accent,#b8431f);background:var(--sel,#f4e6df)}' +
    '.mnu-zona:disabled{opacity:.5;cursor:default}' +
    '.mnu-arq{grid-column:1/-1;overflow-wrap:anywhere;font-weight:600}' +
    '.mnu-st{margin:0}.mnu-st:empty{display:none}.mnu-st[data-erro]{color:var(--alerta,#b91c1c)}' +
    '.mnu-leg{display:flex;justify-content:space-between;gap:12px;margin:4px 0 -4px}' +
    '.mnu-bases{display:grid;margin:0;padding:0;list-style:none}' +
    '.mnu-bases li{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;padding:8px 0;border-top:1px solid var(--line,#d6dad6)}' +
    '.mnu-bases b{font-weight:600}.mnu-bases span{font-variant-numeric:tabular-nums}' +
    '.mnu-bases small{grid-column:1/-1}.mnu-bases small:empty{display:none}' +
    '.mnu-esq{justify-self:start;padding:0 4px;border:0;background:none;color:var(--muted,#5a636a);' +
    'font-size:var(--t-xs,12px)!important;text-decoration:underline;cursor:pointer}';
  document.head.append(css);

  const box = document.createElement('nav');
  box.className = 'mnu';
  box.setAttribute('aria-label', 'Menu');
  box.innerHTML = `<button type="button" class="mnu-btn" aria-expanded="false" aria-controls="mnu-lista" aria-label="Menu">${svg(ICONE.barras, '')}</button>` +
    `<ul class="mnu-lista" id="mnu-lista" hidden>` +
    `<li><button type="button" aria-haspopup="dialog">${svg(ICONE.enviar, '')}Atualização de dados</button></li>` +
    `<li><button type="button" class="mnu-tema" aria-pressed="true">${svg(ICONE.lua, '')}<span>Night shift</span><kbd>Shift K</kbd><i class="mnu-sw" aria-hidden="true"></i></button></li>` +
    `<li class="mnu-sep" aria-hidden="true"></li>` +
    `<li><a href="${raiz}assets/scripts/trechos-kml.zip" download>${svg(ICONE.baixar, '')}Script KML → trechos (.zip)</a></li></ul>`;
  wrap.prepend(box);

  const dlg = document.createElement('dialog');
  dlg.className = 'mnu-dlg';
  dlg.setAttribute('aria-labelledby', 'mnu-tit');
  dlg.innerHTML = `<div class="mnu-cab"><h2 id="mnu-tit">Atualização de dados</h2>` +
    `<button type="button" class="mnu-x" aria-label="Fechar">${svg(ICONE.fechar, '')}</button></div>` +
    (gh ? `<form class="mnu-chave" hidden><label for="mnu-chave">Chave do GitHub</label>` +
      `<div class="mnu-linha"><input id="mnu-chave" type="password" autocomplete="off" spellcheck="false" required>` +
      `<button class="mnu-ok">Salvar</button></div>` +
      `<small><a href="https://github.com/settings/personal-access-tokens/new?name=Atualiza%C3%A7%C3%A3o%20de%20dados&target_name=${encodeURIComponent(gh.dono)}&contents=write&actions=read" ` +
      `target="_blank" rel="noopener">Criar chave</a>: só o repositório ${esc(gh.repo)}; Contents: Read and write; Actions: Read.</small></form>` : '') +
    `<button type="button" class="mnu-zona">${svg(ICONE.enviar, '')}` + (toque ? '<b>Toque para escolher o arquivo</b>' :
      '<b>Arraste o arquivo aqui</b><small>ou clique para escolher</small>') + `</button>` +
    `<input type="file" hidden>` +
    `<div class="mnu-linha mnu-envio" hidden><span class="mnu-arq"></span><select aria-label="Base"><option value="">Escolha a base…</option>` +
    BASES.map(b => `<option value="${b.tipo}">${b.nome}</option>`).join('') + `</select>` +
    `<button type="button" class="mnu-ok mnu-env">Enviar</button></div>` +
    `<p class="mnu-st" role="status" aria-live="polite"></p>` +
    `<small class="mnu-leg"><span>Base</span><span>Última atualização</span></small>` +
    `<ul class="mnu-bases">` + BASES.map(b => `<li data-b="${b.tipo}"><b>${b.nome}</b><span>—</span><small></small></li>`).join('') + `</ul>` +
    (gh ? `<button type="button" class="mnu-esq" hidden>Esquecer chave</button>` : '');
  document.body.append(dlg);

  const $ = s => dlg.querySelector(s);
  const btn = box.querySelector('.mnu-btn'), lista = box.querySelector('.mnu-lista');
  const form = $('.mnu-chave'), inChave = $('#mnu-chave'), zona = $('.mnu-zona'), inArq = $('input[type=file]');
  const linha = $('.mnu-envio'), sel = $('select'), env = $('.mnu-env'), st = $('.mnu-st'), esq = $('.mnu-esq');

  const lerChave = () => { try { return localStorage.getItem(CHAVE) || ''; } catch { return ''; } };
  let chave = gh ? lerChave() : '', arquivo = null, ocupado = false, fresco = false;
  const poeChave = v => {
    chave = v;
    try { v ? localStorage.setItem(CHAVE, v) : localStorage.removeItem(CHAVE); } catch { /* sem armazenamento: vale só nesta aba */ }
    if (form) { form.hidden = !!v; esq.hidden = !v; inChave.value = ''; }
  };
  const diz = (texto, erro, link) => {
    st.textContent = texto;
    st.toggleAttribute('data-erro', !!erro);
    if (link) st.insertAdjacentHTML('beforeend', ` <a href="${esc(link)}" target="_blank" rel="noopener">Ver no GitHub</a>`);
  };
  const atualizaEnvio = () => { env.disabled = ocupado || !sel.value || !arquivo || arquivo.size > LIMITE; zona.disabled = sel.disabled = ocupado; };

  // ---- GitHub (só https://api.github.com recebe a chave)
  const rep = () => `/repos/${encodeURIComponent(gh.dono)}/${encodeURIComponent(gh.repo)}`;
  const caminho = c => c.split('/').map(encodeURIComponent).join('/');
  const api = (c, op = {}) => fetch(API + c, { ...op, headers: { Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + chave, ...op.headers } });
  const erroApi = async r => {
    if (r.status === 401) { poeChave(''); return new Error('chave inválida ou vencida. Cole outra.'); }
    if (r.status === 403 || r.status === 404) return new Error('a chave não tem permissão (Contents: Read and write; Actions: Read).');
    let m = ''; try { m = (await r.json()).message || ''; } catch { /* sem corpo */ }
    return new Error(`${r.status} ${m}`.trim());
  };
  const base64 = f => new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] || '');
    r.onerror = () => falha(new Error('não consegui ler o arquivo.'));
    r.readAsDataURL(f);
  });
  const espera = ms => new Promise(ok => setTimeout(ok, ms));
  // a execução de atualiza-bases.yml daquele commit, até terminar (aparece alguns segundos depois do envio)
  const acompanha = async sha => {
    for (let i = 0; i < 180; i++) {                    // checa a cada 10 s, até 30 min
      await espera(10000);
      const r = await api(`${rep()}/actions/runs?head_sha=${sha}`);
      if (!r.ok) throw await erroApi(r);
      const run = ((await r.json()).workflow_runs || []).find(w => /atualiza-bases/.test(w.path || w.name || ''));
      if (run && run.status === 'completed') return run;
      if (!run && i >= 17) throw Object.assign(new Error('a automação não começou.'), { link: `https://github.com/${gh.dono}/${gh.repo}/actions` });
    }
    throw Object.assign(new Error('demorou demais.'), { link: `https://github.com/${gh.dono}/${gh.repo}/actions` });
  };

  // ---- dados/bases.json: do site; depois de uma atualização, direto do repositório (o site publica 1–2 min depois)
  const poeBases = async (doRepo) => {
    let est = {};
    try {
      const r = doRepo ? await api(`${rep()}/contents/${caminho(pasta + 'dados/bases.json')}?ref=${encodeURIComponent(gh.ramo)}`,
        { headers: { Accept: 'application/vnd.github.raw+json' } }) : await fetch(raiz + 'dados/bases.json', { cache: 'no-cache' });
      if (r.ok) est = await r.json();
    } catch { /* fica o que já está na tela */ return; }
    dlg.querySelectorAll('.mnu-bases li').forEach(li => {
      const b = est[li.dataset.b] || {}, d = ultima(b);
      li.querySelector('span').textContent = d ? br(d) : '—';
      li.querySelector('small').textContent = resumo(li.dataset.b, b);
    });
  };

  const envia = async () => {
    if (!gh) return diz('O envio só funciona no site publicado.', true);
    if (!chave) { diz('Cole a chave do GitHub.', true); return inChave.focus(); }
    const f = arquivo, t = sel.value;
    ocupado = true; atualizaEnvio();
    try {
      diz(`Enviando ${f.name}…`);
      const pastaBase = `bases/${t}`, ref = encodeURIComponent(gh.ramo);
      const ls = await api(`${rep()}/contents/${pastaBase}?ref=${ref}`);     // sha do arquivo de mesmo nome, se já existe
      if (!ls.ok && ls.status !== 404) throw await erroApi(ls);
      const lst = ls.ok ? await ls.json() : [];
      const sha = Array.isArray(lst) ? (lst.find(x => x.name === f.name) || {}).sha : undefined;
      const content = await base64(f);
      const r = await api(`${rep()}/contents/${caminho(pastaBase + '/' + f.name)}`, { method: 'PUT',
        body: JSON.stringify({ message: `Atualização de dados: ${t} (${f.name})`, content, branch: gh.ramo, sha }) });
      if (!r.ok) throw await erroApi(r);
      const commit = (await r.json()).commit.sha;
      diz('Processando no GitHub… (uns 5 min)');
      const run = await acompanha(commit);
      if (run.conclusion !== 'success') throw Object.assign(new Error('o processamento falhou.'), { link: run.html_url });
      await poeBases(fresco = true);
      diz('Pronto. O site mostra os dados novos em 1–2 min.');
      arquivo = null; linha.hidden = true;
    } catch (e) {
      diz('Erro: ' + (e instanceof TypeError ? 'sem conexão com o GitHub.' : e.message), true, e.link);
    } finally {
      ocupado = false; atualizaEnvio();
    }
  };

  const tam = n => n < 1e6 ? `${Math.max(1, Math.round(n / 1e3))} KB` : `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  const escolhe = (f, n = 1) => {
    if (!f || ocupado) return;
    arquivo = f;
    $('.mnu-arq').textContent = `${f.name} · ${tam(f.size)}`;
    sel.value = reconhece(f.name);
    linha.hidden = false;
    if (f.size > LIMITE) diz('Arquivo grande demais (máx. 50 MB).', true);
    else if (!sel.value) diz('Não reconheci a base pelo nome: escolha na lista.');
    else diz(n > 1 ? 'Um arquivo por vez: vale só o primeiro.' : '');
    atualizaEnvio();
    (sel.value ? env : sel).focus();
  };

  // ---- eventos
  if (form) {
    poeChave(chave);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = inChave.value.trim();
      if (!v) return;
      diz('Conferindo a chave…');
      try {
        const r = await fetch(API + rep(), { headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + v } });
        if (!r.ok) return diz(r.status === 401 ? 'Chave inválida.' : `Chave sem acesso ao repositório ${gh.repo}.`, true);
        poeChave(v);
        diz('Chave salva neste navegador.');
        zona.focus();
      } catch { diz('Erro: sem conexão com o GitHub.', true); }
    });
    esq.addEventListener('click', () => { poeChave(''); diz('Chave esquecida.'); inChave.focus(); });
  }
  zona.addEventListener('click', () => inArq.click());
  inArq.addEventListener('change', () => { escolhe(inArq.files[0], inArq.files.length); inArq.value = ''; });
  sel.addEventListener('change', () => { if (sel.value && !st.hasAttribute('data-erro')) diz(''); atualizaEnvio(); });
  env.addEventListener('click', envia);
  // o diálogo inteiro (e o fundo dele) recebe o arquivo arrastado
  dlg.addEventListener('dragover', e => { e.preventDefault(); zona.classList.add('sobre'); });
  dlg.addEventListener('dragleave', e => { if (!dlg.contains(e.relatedTarget)) zona.classList.remove('sobre'); });
  dlg.addEventListener('drop', e => { e.preventDefault(); zona.classList.remove('sobre'); escolhe(e.dataTransfer.files[0], e.dataTransfer.files.length); });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });     // toque fora da caixa
  $('.mnu-x').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => btn.focus());

  const abre = sim => {
    lista.hidden = !sim;
    btn.setAttribute('aria-expanded', String(sim));
    if (sim) lista.querySelector('button').focus();
  };
  btn.addEventListener('click', () => abre(lista.hidden));
  box.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !lista.hidden) { e.preventDefault(); abre(false); btn.focus(); }
  });
  lista.querySelector('button').addEventListener('click', () => {
    abre(false);
    dlg.showModal();
    poeBases(fresco);
    (form && !form.hidden ? inChave : zona).focus();
  });
  lista.querySelector('a').addEventListener('click', () => abre(false));
  // Night shift: ligado = tema escuro (fundo preto, o padrão); desligado = claro. Guarda a escolha neste navegador e vale
  // para todas as páginas (o <head> de cada página lê "tema" antes do CSS). Atalho: Shift+K fora dos campos de texto.
  const btTema = lista.querySelector('.mnu-tema');
  const mostraTema = () => btTema.setAttribute('aria-pressed', String(document.documentElement.dataset.theme !== 'light'));
  const trocaTema = () => {
    const claro = document.documentElement.dataset.theme !== 'light';
    document.documentElement.dataset.theme = claro ? 'light' : 'dark';
    try { localStorage.setItem('tema', claro ? 'claro' : 'escuro'); } catch { /* sem armazenamento: vale só nesta página */ }
    mostraTema();
  };
  mostraTema();
  btTema.addEventListener('click', trocaTema);
  document.addEventListener('keydown', e => {
    if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.code !== 'KeyK') return;
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    e.preventDefault();
    trocaTema();
  });
  document.addEventListener('pointerdown', e => { if (!lista.hidden && !box.contains(e.target)) abre(false); });
})();
