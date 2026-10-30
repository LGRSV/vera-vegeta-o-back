// Módulos do ARGOS na tela inicial nova (central/): uma lista só, para a grade, o dock e a ordem da rolagem.
// href: a partir da pasta do site (teste/). dock: rótulo curto no dock (vazio = fica fora do dock). grade: aparece na grade.
// Página nova no site: acrescentar aqui (e no menu ☰, assets/menu.js).
window.ARGOS_MODULOS = [
  {id: 'mapa', titulo: 'Mapa da rede', desc: 'Municípios, alimentadores e ativos', href: 'index.html', dock: 'Mapa', grade: true,
    icone: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Z"/><path d="M9 3v16M15 5v16"/><circle cx="15" cy="10" r="2.4"/>'},
  {id: 'painel', titulo: 'Painel gerencial', desc: 'Metas e realizado por regional e polo', href: 'painel/', dock: 'Painel', grade: true,
    icone: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12M13 17v-3M17 17v-5"/>'},
  {id: 'priorizacao', titulo: 'Priorizador', desc: 'Criticidade dos trechos e ranking', href: 'priorizacao/', dock: 'Priorizador', grade: true,
    icone: '<path d="M8 5h13M8 12h10M8 19h7M3 3v4M1 5h4"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="19" r="1"/>'},
  {id: 'carteira', titulo: 'Carteira de faixa', desc: 'Contratos, medições e serviços', href: 'carteira/', dock: 'Faixa', grade: true,
    icone: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M8 17l2-5 2 5M9 15h2M16 11v7"/>'},
  {id: 'podas', titulo: 'Mapa de podas', desc: 'Quadras, perímetro urbano e situação da poda', href: 'podas/', dock: 'Podas', grade: true,
    icone: '<path d="M12 21v-8m0 4 4-4M12 13C5 14 3 7 5 3c6-1 13 1 12 7-1 4-5 3-5 3ZM8 7l4 6M17 17l4-4m-3-1 4 4"/>'},
  {id: 'apresentacao', titulo: 'Apresentação', desc: 'Visão geral do ARGOS', href: 'apresentacao/', dock: '', grade: true,
    icone: '<path d="M3 3h18M5 3v13h14V3M12 16v4m-4 2 4-2 4 2"/><path d="m10 7 5 3-5 3Z"/>'},
  {id: 'relatorio', titulo: 'Relatório de validação', desc: 'Trechos, NAE e avisos por município', href: 'relatorio.html', dock: '', grade: false,
    icone: '<path d="M6 3h8l4 4v14H6ZM14 3v5h4M9 12h6M9 16h6"/>'}
];
