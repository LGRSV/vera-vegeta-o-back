// Escopo e acompanhamento do ARGOS: a fonte única da página escopo/, do Excel e do Word.
// Como atualizar: editar este arquivo (situação "st" e datas dos itens, itens novos) e rodar
//   python scripts/escopo.py <pasta teste/ do site>     (repositório smartled)
// que refaz dados/escopo-gerado.js (bases e histórico), escopo/ARGOS_acompanhamento.xlsx e escopo/ARGOS_escopo.docx.
// Situação do item: "ok" concluído (d = data da conclusão) · "and" em andamento · "pend" a fazer · "bloq" aguardando
// (decisão ou insumo; "desde" = quando ficou aguardando). Item aberto tem "prazo" e "resp" (proj = dono do projeto,
// dev = desenvolvimento). Datas em AAAA-MM-DD. Depois do "=" o conteúdo é JSON puro (o script lê com json.loads).
window.ARGOS_ESCOPO = {
 "versao": "1.5",
 "atualizado": "2026-11-10",
 "nota_prazos": "Os prazos dos itens abertos foram propostos em 09/11/2026 e 10/11/2026 e precisam da confirmação do dono do projeto.",
 "projeto": {
  "nome": "ARGOS · Manutenção",
  "resumo": "Plataforma web que reúne rede, ocorrências e ordens de serviço em um mapa para decidir onde a manutenção age primeiro.",
  "objetivos": [
   "Mostrar a rede de média tensão do Tocantins dividida em trechos (T1, T2, T3), do estado até o trecho.",
   "Localizar em cada trecho as ocorrências de vegetação (NAE) e as OS de limpeza de faixa, inspeção, manutenção e poda.",
   "Indicar onde agir primeiro: ranking de NAE, nota de 0 a 100 por trecho e situação da poda por quadra.",
   "Acompanhar contratos, metas e orçamento da manutenção em um só lugar.",
   "Reduzir o trabalho manual de campo e escritório, como o croqui de limpeza de faixa."
  ],
  "publico": "Gestão e equipes de manutenção da Energisa Tocantins (regionais, polos e DCMD).",
  "entra": [
   "Rede de média tensão do GIS: 322 alimentadores divididos em trechos, com municípios, polos e regionais.",
   "NAE de vegetação por trecho e por mês, a partir da base Crítica.",
   "Limpeza de faixa: OS no mapa, vencimento por trecho, croqui e KMZ.",
   "Inspeção visual e manutenção (OS geradas pela inspeção e OS executadas) no mapa do alimentador.",
   "Priorizador de trechos, Carteira de faixa por empreiteira, Painel gerencial de metas, Mapa de podas e Insights de orçamento.",
   "Atualização das bases por envio de arquivo (menu Atualizar bases) e acompanhamento do escopo nesta página."
  ],
  "nao_entra": [
   "Alterar dados nos sistemas de origem: o ARGOS só lê as exportações (GIS, Crítica, OS status, BI, planilhas).",
   "Dado em tempo real: cada base vale até a data da última carga, mostrada na aba Bases.",
   "Rede de baixa tensão e ramais de ligação.",
   "Login e perfis de acesso: hoje o site é público para quem tem o endereço (ver riscos).",
   "Mapa de podas fora de Palmas, Araguaína e Gurupi (novas cidades estão nos próximos passos)."
  ],
  "riscos": [
   {"t": "Bases desatualizadas mudam a leitura do mapa e dos rankings.", "acao": "Calendário mensal de cargas e aba Bases com a situação de cada uma."},
   {"t": "As cargas dependem do envio manual de arquivos.", "acao": "Envio pelo menu Atualizar bases, com processamento automático; responsável e dia definidos por base."},
   {"t": "O site é público, sem login: quem tem o endereço vê a rede e as OS.", "acao": "Decidir se continua assim ou se passa a ter controle de acesso."},
   {"t": "A rede vem de uma exportação do GIS (03/10/2026): obras novas não aparecem até a próxima exportação.", "acao": "Definir a rotina de atualização do cadastro."},
   {"t": "O consumidor·hora das ocorrências usa a maior duração do evento e fica cerca de 2 vezes acima do real quando o religamento é por etapas (mai/2026: 191 mil contra 91 mil).", "acao": "Cálculo por passo de manobra pronto (10/11/2026); reprocessar quando chegarem as Críticas de jan a out/2026. Até lá, não usar o valor absoluto para dimensionar poda."},
   {"t": "Alimentador reclassificado aparece na Crítica com código novo e a NAE dele fica fora do site (caso do PS01112193).", "acao": "Regra de/para no script da Crítica (PS01112193 entra no LD03105019); reprocessar quando chegarem as Críticas."},
   {"t": "O ponto da OS e da ocorrência no mapa é aproximado quando o ativo não tem posição no cadastro.", "acao": "A regra usada fica registrada em cada ocorrência; os casos sem posição ficam listados à parte."},
   {"t": "A publicação depende do GitHub Pages, que na noite de 09 para 10/11/2026 deixou de concluir 6 de 9 publicações (paradas na sincronização dos arquivos, sem incidente declarado).", "acao": "Conferir sempre o site no ar depois de publicar e repetir com um commit novo quando falhar; se continuar, trocar para um fluxo de publicação próprio, com prazo maior."}
  ]
 },
 "responsaveis": {"proj": "Dono do projeto", "dev": "Desenvolvimento"},
 "situacoes": {"ok": "Concluído", "and": "Em andamento", "pend": "A fazer", "bloq": "Aguardando"},
 "frentes": [
  {"id": "rede", "nome": "Rede e trechos", "pagina": "index.html", "objetivo": "Rede do GIS dividida em trechos T1, T2 e T3 por alimentador e município."},
  {"id": "mapa", "nome": "Mapa da rede", "pagina": "index.html", "objetivo": "Mapa do estado até o alimentador, com busca única e visões por tema."},
  {"id": "nae", "nome": "NAE de vegetação", "pagina": "index.html", "objetivo": "Ocorrências de árvore e eucalipto da Crítica por trecho, mês e ranking."},
  {"id": "faixa", "nome": "Limpeza de faixa", "pagina": "index.html", "objetivo": "OS de limpeza no mapa, vencimento por trecho e croqui pronto para baixar."},
  {"id": "insp", "nome": "Inspeção e manutenção", "pagina": "index.html", "objetivo": "Inspeções executadas, OS geradas por elas e manutenções feitas em cada ativo."},
  {"id": "prio", "nome": "Priorizador", "pagina": "priorizacao/", "objetivo": "Nota de 0 a 100 por trecho e faixas P1 a P4 para ordenar a limpeza."},
  {"id": "carteira", "nome": "Carteira de faixa", "pagina": "carteira/", "objetivo": "Contratos, medições e avanço das obras por empreiteira, polo e regional."},
  {"id": "painel", "nome": "Painel gerencial", "pagina": "painel/", "objetivo": "Metas e realizado de inspeção, estruturas, para-raio, linha viva e melhoria."},
  {"id": "podas", "nome": "Mapa de podas", "pagina": "podas/", "objetivo": "Situação da poda por quadra em Palmas, Araguaína e Gurupi."},
  {"id": "orcamento", "nome": "Insights orçamento", "pagina": "insights-orcamento/", "objetivo": "Orçado 2027 e realizado por SIGCO (DCMD), com curva mensal e Capex."},
  {"id": "plataforma", "nome": "Plataforma", "pagina": "central/", "objetivo": "Tela inicial, menu, tema, atualização das bases, publicação e documentação."},
  {"id": "qualidade", "nome": "Qualidade e melhorias", "pagina": "escopo/", "objetivo": "Pontos de melhoria de usabilidade e de correção técnica dos números, com as correções planejadas."}
 ],
 "classifica": [
  ["orcamento", "orçamento|sigco|capex|projeção de nov|backtest"],
  ["podas", "poda|quadra"],
  ["painel", "painel gerencial|briefing"],
  ["carteira", "carteira|empreiteira"],
  ["prio", "priorização|priorizador"],
  ["qualidade", "pontos de melhoria|usabilidade"],
  ["plataforma", "escopo|tela inicial|central/|shift\\+k|versão anterior|escolha da versão|apresentação|atualiza(r|ção)( automática)? d[ae]s? bases|atualização automática|bases\\.json|ferramentas|raiz abre|cópia congelada|design novo|script kml|para rodar no computador|cache do python|validador"],
  ["faixa", "croqui"],
  ["rede", "trafos do gis|acervo gis|kmz_google_earth2|fusível|religador|mapa de trechos"],
  ["mapa", "mapa inicial|página inicial|busca|lupa|olho|legenda|bandeirinha|raio-x|polos|regiona|satélite|voo fluido|rótulos|índice com mapa|cartão preto|^tela cheia|painel do alimentador|município abre|visão do município|filtro de município"],
  ["faixa", "limpeza|faixa"],
  ["insp", "inspe|insp→|manuten|executadas"],
  ["nae", "nae|crítica|critica|ranking"],
  ["rede", "."]
 ],
 "marcos": [
  {"d": "2026-10-01", "t": "Primeiro mapa de trechos publicado (AL04010004)."},
  {"d": "2026-10-04", "t": "Rede completa do GIS: 322 alimentadores divididos em trechos."},
  {"d": "2026-10-07", "t": "Revisão completa do site, croqui da faixa e trafos do GIS nos trechos."},
  {"d": "2026-10-13", "t": "Inspeção e manutenção no mapa; atualização das bases pelo menu."},
  {"d": "2026-10-15", "t": "ARGOS Manutenção: página inicial nova, busca única, visões do mapa, Priorização e apresentação."},
  {"d": "2026-10-23", "t": "Croqui de limpeza de faixa disponível nos 322 alimentadores."},
  {"d": "2026-10-26", "t": "O endereço principal do site passa a abrir o ARGOS."},
  {"d": "2026-10-27", "t": "Painel gerencial de metas e realizado."},
  {"d": "2026-10-28", "t": "Carteira de faixa por empreiteira e nota de 0 a 100 no Priorizador."},
  {"d": "2026-10-29", "t": "Bases lidas do OS status (.parquet) e Mapa de podas."},
  {"d": "2026-10-30", "t": "Tela inicial nova, com os módulos em cartões e o dock."},
  {"d": "2026-11-04", "t": "Insights orçamento e card por quadra no Mapa de podas."},
  {"d": "2026-11-09", "t": "Escopo e acompanhamento do projeto (página, Excel e Word)."},
  {"d": "2026-11-09", "t": "Levantamento de qualidade por agentes: 111 pontos de melhoria; DEC e FEC do Mapa de podas corrigidos."},
  {"d": "2026-11-10", "t": "Rodada de correções em 11 módulos: 75 pontos de melhoria trabalhados, 41 corrigidos e conferidos, 20 parciais e 13 que dependem de base nova."}
 ],
 "entregas": [
  {"id": "1.1", "frente": "rede", "titulo": "Regras de divisão em trechos", "itens": [
   {"t": "T1 do disjuntor ao 1º religador e T2 de religador a religador (T2, T2-A, T2-B…)", "st": "ok", "d": "2026-10-01"},
   {"t": "Fusível no tronco não abre T3; só a 1ª chave fusível depois do religador segue como T2", "st": "ok", "d": "2026-10-02"},
   {"t": "1º fusível depois do religador abre T3 a partir de 300 m (190 trechos T3 novos, nomes mantidos)", "st": "ok", "d": "2026-10-07"}
  ]},
  {"id": "1.2", "frente": "rede", "titulo": "Rede completa do GIS", "itens": [
   {"t": "Conversão da exportação do GIS por camadas (KMZ_GOOGLE_EARTH2) para o gerador de trechos", "st": "ok", "d": "2026-10-02"},
   {"t": "Site refeito com o GIS completo e os 322 alimentadores processados", "st": "ok", "d": "2026-10-04"},
   {"t": "3 alimentadores sem chaves fechadas no GIS divididos por exceção aprovada (LD02424015, LD01414015, AL01102271)", "st": "ok", "d": "2026-10-16"},
   {"t": "Definir a rotina de atualização do cadastro (a rede atual é a exportação de 03/10/2026)", "st": "pend", "prazo": "2026-11-27", "resp": "proj"}
  ]},
  {"id": "1.3", "frente": "rede", "titulo": "Navegação município, alimentador e trecho", "itens": [
   {"t": "Páginas por município e alimentador, com a extensão de cada trecho por município (malha do IBGE)", "st": "ok", "d": "2026-10-02"},
   {"t": "Relatório de validação por município (trechos, NAE e avisos)", "st": "ok", "d": "2026-10-04"},
   {"t": "Transformadores do GIS nos trechos e na busca", "st": "ok", "d": "2026-10-06"},
   {"t": "Clientes por trecho pelas UCs ligadas de cada transformador", "st": "ok", "d": "2026-10-29"}
  ]},

  {"id": "2.1", "frente": "mapa", "titulo": "Página inicial do mapa", "itens": [
   {"t": "Mapa do Tocantins com a NAE por município e ranking", "st": "ok", "d": "2026-10-02"},
   {"t": "Regionais que abrem nos polos e polos que abrem nos municípios", "st": "ok", "d": "2026-10-14"},
   {"t": "Identidade ARGOS Manutenção: cards Norte, Centro e Sul, legenda de NAE e rótulos dos municípios", "st": "ok", "d": "2026-10-15"},
   {"t": "Mapa mais leve, com voo fluido entre os níveis", "st": "ok", "d": "2026-10-15"}
  ]},
  {"id": "2.2", "frente": "mapa", "titulo": "Busca única", "itens": [
   {"t": "Busca de ativo e de transformador", "st": "ok", "d": "2026-10-06"},
   {"t": "Uma busca só (olho do ARGOS) para ativo, município, alimentador e OS", "st": "ok", "d": "2026-10-15"},
   {"t": "Colar uma lista de códigos e buscar de uma vez", "st": "ok", "d": "2026-10-21"},
   {"t": "Busca por UC", "st": "ok", "d": "2026-10-26"},
   {"t": "Busca de ativo: parte do código com Enter abre o ativo ou a lista (antes respondia \"não foi encontrado\"), o disjuntor aparece nas sugestões, o nome do tipo (religador, fusível, transformador…) é entendido e, dentro do alimentador, todo transformador é achado por parte do código", "st": "ok", "d": "2026-11-10"},
   {"t": "Enviar a camada de reguladores de tensão do GIS (e a de bancos de capacitor, se quiser) para entrarem na busca e no mapa", "st": "bloq", "desde": "2026-11-10", "prazo": "2026-11-17", "resp": "proj", "obs": "O site tem 0 regulador e 0 capacitor nos dados: só as camadas de chaves e de transformadores foram carregadas. Serve o KMZ da mesma exportação ou uma planilha com código, alimentador e coordenada ou poste."}
  ]},
  {"id": "2.3", "frente": "mapa", "titulo": "Visões e painel do alimentador", "itens": [
   {"t": "Tela cheia do mapa do alimentador", "st": "ok", "d": "2026-10-13"},
   {"t": "Visões do mapa inicial: Manutenção, Inspeção, Insp→manut e Limpeza de faixa", "st": "ok", "d": "2026-10-15"},
   {"t": "Painel do alimentador com divisas dos municípios, ativos de perto e filtro de município", "st": "ok", "d": "2026-10-15"},
   {"t": "Raio-X da rede com a NAE do alimentador", "st": "ok", "d": "2026-10-21"}
  ]},
  {"id": "2.4", "frente": "mapa", "titulo": "Imagem de satélite", "itens": [
   {"t": "Satélite sem falhas de imagem ao aproximar", "st": "ok", "d": "2026-10-07"},
   {"t": "Data das fotos de satélite na legenda", "st": "ok", "d": "2026-10-23"},
   {"t": "Habilitar a Map Tiles API no projeto da chave do Google (a chave enviada responde 404)", "st": "bloq", "desde": "2026-10-30", "prazo": "2026-11-13", "resp": "proj"},
   {"t": "Inserir a chave do Google, testar e publicar o satélite de melhor qualidade", "st": "pend", "prazo": "2026-11-17", "resp": "dev", "obs": "Depende do item anterior."}
  ]},

  {"id": "3.1", "frente": "nae", "titulo": "NAE por trecho a partir da Crítica", "itens": [
   {"t": "Filtro de vegetação: causa Meio Ambiente e subcausa Árvore ou Eucalipto, pelo mês de competência", "st": "ok", "d": "2026-10-02"},
   {"t": "Crítica de jan a ago/2026 carregada", "st": "ok", "d": "2026-10-04"},
   {"t": "NAE do trecho soma todos os ativos e segue o ativo para o alimentador onde ele está hoje", "st": "ok", "d": "2026-10-08"},
   {"t": "Crítica nova entra só com os dados do site, sem refazer a rede", "st": "ok", "d": "2026-10-07"}
  ]},
  {"id": "3.2", "frente": "nae", "titulo": "Rankings de NAE", "itens": [
   {"t": "Ranking por polo, regional e ETO, com NAE por 100 km", "st": "ok", "d": "2026-10-06"},
   {"t": "Ranking por polo batendo com o mapa (NAE sem trecho no polo de maior rede)", "st": "ok", "d": "2026-10-15"}
  ]},
  {"id": "3.3", "frente": "nae", "titulo": "Crítica em dia", "itens": [
   {"t": "Enviar os arquivos da Crítica de set e out/2026 (o site vai até ago/2026)", "st": "pend", "prazo": "2026-11-13", "resp": "proj"},
   {"t": "Processar e publicar a NAE de set e out/2026", "st": "pend", "prazo": "2026-11-17", "resp": "dev", "obs": "Depende do item anterior."},
   {"t": "Regra do alimentador reclassificado no script da Crítica: o PS01112193 (Campos Lindos) entra no LD03105019, sem trecho", "st": "ok", "d": "2026-11-09"},
   {"t": "Enviar as Críticas de jan a out/2026 para reprocessar a NAE: alimentador reclassificado (5 NAE de mai/2026 fora do site) e consumidor·hora por passo de manobra", "st": "bloq", "desde": "2026-11-09", "prazo": "2026-11-13", "resp": "proj", "obs": "Decisão de 09/11: aplicar em todos os meses de uma vez, quando os arquivos chegarem."},
   {"t": "Rotina mensal: Crítica do mês anterior carregada até o dia 10 (primeira: nov/2026)", "st": "pend", "prazo": "2026-12-10", "resp": "proj"}
  ]},

  {"id": "4.1", "frente": "faixa", "titulo": "OS de limpeza de faixa no mapa", "itens": [
   {"t": "OS por trecho com vencimento (T1 3 anos, T2 4 e T3 5) e mapa por ano de execução", "st": "ok", "d": "2026-10-02"},
   {"t": "OS não executadas separadas em Criadas e Pendentes", "st": "ok", "d": "2026-10-13"},
   {"t": "OS parcial ligada à OS mãe, com o km contado uma vez", "st": "ok", "d": "2026-10-29"},
   {"t": "Leitura direta do OS status (.parquet), RD e LD", "st": "ok", "d": "2026-10-29"}
  ]},
  {"id": "4.2", "frente": "faixa", "titulo": "Croqui de limpeza de faixa", "itens": [
   {"t": "Croqui da faixa no modelo da Energisa, preenchido com os dados do trecho", "st": "ok", "d": "2026-10-07"},
   {"t": "Modo Limpeza de faixa: escolher trechos e pintar leve ou pesada, com o km ao vivo", "st": "ok", "d": "2026-10-15"},
   {"t": "Croqui nos 322 alimentadores, com início e fim em qualquer ponto da linha", "st": "ok", "d": "2026-10-23"},
   {"t": "KMZ do croqui e do trecho selecionado", "st": "ok", "d": "2026-10-26"},
   {"t": "Deslocamento calculado pela rota até a base do polo", "st": "ok", "d": "2026-10-29"}
  ]},

  {"id": "5.1", "frente": "insp", "titulo": "Inspeção visual no mapa", "itens": [
   {"t": "Card Inspeção com as inspeções executadas e os vãos cobertos", "st": "ok", "d": "2026-10-13"},
   {"t": "Bloco inspecionado a partir do ELEMENTO, com início e fim marcados", "st": "ok", "d": "2026-10-13"}
  ]},
  {"id": "5.2", "frente": "insp", "titulo": "Manutenção no mapa", "itens": [
   {"t": "Insp→manut: OS geradas pela inspeção no poste da estrutura", "st": "ok", "d": "2026-10-13"},
   {"t": "Card Manutenção: OS executadas (MC e MP) no ativo onde foram feitas", "st": "ok", "d": "2026-10-14"},
   {"t": "Insp→manut com a OS de inspeção que gerou cada serviço", "st": "ok", "d": "2026-10-15"},
   {"t": "Executadas e situação da manutenção lidas do OS status (.parquet)", "st": "ok", "d": "2026-10-29"}
  ]},

  {"id": "6.1", "frente": "prio", "titulo": "Priorizador de trechos", "itens": [
   {"t": "Página de Priorização: ranking de alimentadores e trechos P1 a P4", "st": "ok", "d": "2026-10-15"},
   {"t": "Nota de 0 a 100 pela soma de pontos de cada critério", "st": "ok", "d": "2026-10-28"},
   {"t": "Clientes pelas UCs ligadas e OS de limpeza pelo OS status de 29/10", "st": "ok", "d": "2026-10-29"}
  ]},
  {"id": "6.2", "frente": "prio", "titulo": "Validação e atualização", "itens": [
   {"t": "Atualizar as ocorrências do Priorizador (referência de 07/10/2026) com a Crítica nova", "st": "pend", "prazo": "2026-11-20", "resp": "dev", "obs": "Depende da Crítica de set e out/2026."},
   {"t": "Validar a tabela de pontos e o ranking com os polos", "st": "pend", "prazo": "2026-12-11", "resp": "proj"}
  ]},

  {"id": "7.1", "frente": "carteira", "titulo": "Carteira por empreiteira", "itens": [
   {"t": "Km e valor contratado e medido, OS executadas e pendentes por empreiteira", "st": "ok", "d": "2026-10-28"},
   {"t": "Obras de cada empreiteira com linha do tempo (OS mãe e parciais)", "st": "ok", "d": "2026-10-29"},
   {"t": "Carteira cruzada com todas as OS do mapa", "st": "ok", "d": "2026-10-29"},
   {"t": "Km medido acumulado em 2026 e avanço das obras por empreiteira, polo ou regional", "st": "ok", "d": "2026-10-29"}
  ]},
  {"id": "7.2", "frente": "carteira", "titulo": "Carteira em dia", "itens": [
   {"t": "Enviar as planilhas de medição e de acompanhamento de nov/2026 (as atuais são de 27/10/2026)", "st": "pend", "prazo": "2026-11-27", "resp": "proj"},
   {"t": "Atualizar a carteira com as planilhas novas", "st": "pend", "prazo": "2026-12-01", "resp": "dev", "obs": "Depende do item anterior."}
  ]},

  {"id": "8.1", "frente": "painel", "titulo": "Painel de metas e realizado", "itens": [
   {"t": "Painel por ano, regional e polo: inspeção, estruturas, para-raio, linha viva e melhoria", "st": "ok", "d": "2026-10-27"},
   {"t": "Percentual em destaque e realizado / meta embaixo", "st": "ok", "d": "2026-11-05"},
   {"t": "Limpar a seleção ao clicar fora do mapa ou de novo no mesmo polo", "st": "ok", "d": "2026-11-09"}
  ]},
  {"id": "8.2", "frente": "painel", "titulo": "Realizado atualizado", "itens": [
   {"t": "Decidir a fonte do realizado: exportações do BI Manutenção ou seção de OS executadas do OS status", "st": "bloq", "desde": "2026-11-05", "prazo": "2026-11-13", "resp": "proj"},
   {"t": "Atualizar o realizado do painel (hoje vai até mai/2026)", "st": "pend", "prazo": "2026-11-27", "resp": "dev", "obs": "Depende do item anterior."},
   {"t": "Painel lendo direto do BI Manutenção, sem exportar à mão", "st": "pend", "prazo": "2026-12-18", "resp": "dev"}
  ]},

  {"id": "9.1", "frente": "podas", "titulo": "Situação da poda por quadra", "itens": [
   {"t": "Quadras de Palmas, Araguaína e Gurupi como executada, pendente, crítica ou sem poda recente", "st": "ok", "d": "2026-10-29"},
   {"t": "Ponto de cada OS no poste da estrutura e ocorrências NAE no perímetro urbano", "st": "ok", "d": "2026-10-30"},
   {"t": "Camadas selecionáveis (Áreas, OS e NAE), tela cheia e atalhos para Street View e Google Earth", "st": "ok", "d": "2026-10-30"},
   {"t": "Quadras de Palmas com nome (405 Sul) e contorno oficial do GeoPalmas", "st": "ok", "d": "2026-10-30"},
   {"t": "Card por quadra: linha viva, OS executadas / total e NAE, DEC e FEC de 6 meses", "st": "ok", "d": "2026-11-04"},
   {"t": "DEC e FEC da quadra pela definição da ANEEL (contribuição ao conjunto elétrico), com consumidor·hora e consumidores no painel", "st": "ok", "d": "2026-11-09"},
   {"t": "Desligamento de disjuntor ou religador fora da conta da quadra (o defeito pode estar em qualquer ponto do alimentador) e motivo do Crítico no card", "st": "ok", "d": "2026-11-09"}
  ]},
  {"id": "9.2", "frente": "podas", "titulo": "Próximas cidades e ajustes", "itens": [
   {"t": "Marca de linha viva e DEC/FEC da ANEEL juntados ao gerador (PR #10 do repositório smartled aprovado)", "st": "ok", "d": "2026-11-09"},
   {"t": "Definir as próximas cidades do Mapa de podas", "st": "pend", "prazo": "2026-11-27", "resp": "proj"},
   {"t": "Obter os limites oficiais dos bairros (Aurenys, Araguaína e Gurupi) para agrupar por bairro", "st": "pend", "prazo": "2026-12-04", "resp": "proj"},
   {"t": "Publicar a primeira cidade nova", "st": "pend", "prazo": "2026-12-11", "resp": "dev", "obs": "Depende da definição das cidades."}
  ]},

  {"id": "10.1", "frente": "orcamento", "titulo": "Orçado 2027 e realizado por SIGCO", "itens": [
   {"t": "Página com a curva mensal de 2027 por SIGCO (só DCMD) e o realizado de 2023 a 2026", "st": "ok", "d": "2026-11-04"},
   {"t": "Edição mês a mês em R$ ou %, a partir do orçado da planilha", "st": "ok", "d": "2026-11-04"},
   {"t": "Realizado de todos os responsáveis, igual à tabela dinâmica do Excel", "st": "ok", "d": "2026-11-05"},
   {"t": "SIGCO 20497 fora do orçado e do realizado; senha para alterar valores", "st": "ok", "d": "2026-11-05"},
   {"t": "Capex 2027 a 2029 por SIGCO e seleção de vários SIGCOs", "st": "ok", "d": "2026-11-05"}
  ]},

  {"id": "11.1", "frente": "plataforma", "titulo": "Identidade e navegação", "itens": [
   {"t": "Revisão completa do site com o design novo", "st": "ok", "d": "2026-10-07"},
   {"t": "Marca ARGOS Manutenção e tema escuro ou claro (Shift+K)", "st": "ok", "d": "2026-10-15"},
   {"t": "Apresentação do ARGOS no menu", "st": "ok", "d": "2026-10-15"},
   {"t": "Tela inicial nova, com os módulos em cartões e o dock", "st": "ok", "d": "2026-10-30"},
   {"t": "Tela inicial nova como única versão; Shift+K também nela", "st": "ok", "d": "2026-11-09"}
  ]},
  {"id": "11.2", "frente": "plataforma", "titulo": "Atualização das bases", "itens": [
   {"t": "Envio de arquivo pelo menu Atualizar bases, com processamento automático", "st": "ok", "d": "2026-10-13"},
   {"t": "Visões do mapa inicial refeitas na atualização automática", "st": "ok", "d": "2026-10-15"},
   {"t": "Executadas, manutenção, limpeza e podas pelo OS status (.parquet)", "st": "ok", "d": "2026-10-29"},
   {"t": "Definir o calendário mensal de cargas (dia e responsável por base)", "st": "pend", "prazo": "2026-11-20", "resp": "proj"},
   {"t": "Carga do OS status de nov/2026 (o atual é de 29/10/2026)", "st": "pend", "prazo": "2026-11-30", "resp": "proj"}
  ]},
  {"id": "11.3", "frente": "plataforma", "titulo": "Publicação e uso", "itens": [
   {"t": "ARGOS para rodar no computador, sem internet (pacote local)", "st": "ok", "d": "2026-10-21"},
   {"t": "Endereço principal do site abre o ARGOS", "st": "ok", "d": "2026-10-26"},
   {"t": "Regra de publicação: tudo passa por teste antes de ir ao ar", "st": "ok", "d": "2026-10-29"},
   {"t": "Decidir se o site continua público ou passa a ter controle de acesso", "st": "pend", "prazo": "2026-11-27", "resp": "proj"}
  ]},
  {"id": "11.4", "frente": "plataforma", "titulo": "Escopo e acompanhamento", "itens": [
   {"t": "Página de escopo com andamento, bases e histórico de mudanças", "st": "ok", "d": "2026-11-09"},
   {"t": "Excel de acompanhamento e Word do escopo gerados da mesma fonte", "st": "ok", "d": "2026-11-09"},
   {"t": "Regra de atualizar o escopo a cada publicação (script e instrução no repositório)", "st": "ok", "d": "2026-11-09"},
   {"t": "Confirmar os prazos propostos dos itens abertos", "st": "pend", "prazo": "2026-11-13", "resp": "proj"}
  ]},

  {"id": "12.1", "frente": "qualidade", "titulo": "Levantamento de qualidade", "itens": [
   {"t": "Teste de usabilidade ao vivo por agentes, no PC e no celular: 47 pontos, 8 graves", "st": "ok", "d": "2026-11-09"},
   {"t": "Números do site contra a ANEEL, a Energisa e a Crítica: 25 divergências e 12 conferências que batem", "st": "ok", "d": "2026-11-09"},
   {"t": "Revisão técnica de cada aba (definições, unidades e fórmulas): 39 pontos", "st": "ok", "d": "2026-11-09"},
   {"t": "Planilha com os 111 pontos de melhoria publicada nesta página", "st": "ok", "d": "2026-11-09"}
  ]},
  {"id": "12.2", "frente": "qualidade", "titulo": "Correções dos números", "itens": [
   {"t": "Cálculo do consumidor·hora por passo de manobra pronto no processamento da Crítica, com as marcas de interrupção momentânea, dia crítico e acima de 24 h (mai/2026: 90.644 em vez de 191.170)", "st": "ok", "d": "2026-11-10"},
   {"t": "Reprocessar a Crítica de jan a out/2026 com o consumidor·hora por passo de manobra (hoje o site usa a maior duração e fica 2,1 vezes acima)", "st": "pend", "prazo": "2026-11-20", "resp": "dev", "obs": "O cálculo ficou pronto em 10/11; falta receber as Críticas de jan a out/2026."},
   {"t": "Priorizador e Ranking por polo chamam de CHI (consumidor·hora) e CI (consumidores interrompidos) o que aparecia como DEC, FEC ou Consumidores", "st": "ok", "d": "2026-11-10"},
   {"t": "Período da Crítica e data das bases escritos nas telas (Painel, Mapa, Alimentador, Priorizador, Ranking e Mapa de podas)", "st": "ok", "d": "2026-11-10"},
   {"t": "Mapa de podas: Crítico é OS urgente pendente, ou NAE dentro da quadra sem poda em 6 meses; o NAE alto do alimentador virou informação do painel e exige 5 ocorrências (Palmas: de 97 para 73 quadras críticas)", "st": "ok", "d": "2026-11-10"},
   {"t": "Limpeza de faixa: trecho sem registro conta como pendência e a situação do trecho é a do pior pedaço relevante (mais de 10% ou 300 m)", "st": "ok", "d": "2026-11-10"},
   {"t": "Ocorrências de disjuntor e religador marcadas como local do defeito desconhecido no Alimentador e no Priorizador, e fora da conta da quadra no Mapa de podas", "st": "ok", "d": "2026-11-10"},
   {"t": "Painel: Estruturas = linha morta DCMD + linha viva escrito no cartão, realizado sem polo no total, data de corte dos dados e meta zero como \"sem meta\"", "st": "ok", "d": "2026-11-10"},
   {"t": "Carteira: um só km contratado (1.786,6 km), medido sem comparação com o contratado e filtro de regional em todos os cartões", "st": "ok", "d": "2026-11-10"},
   {"t": "Insights orçamento: fonte e conciliação do orçado na tela, maior aumento e maior corte só com histórico completo e SIGCO 68733 contado uma vez", "st": "ok", "d": "2026-11-10"},
   {"t": "Apresentação com os números de hoje (322 alimentadores, 94.155 km, 5.760 NAE) e relatório de validação com os 3 alimentadores divididos por exceção em destaque", "st": "ok", "d": "2026-11-10"},
   {"t": "Ranking por polo: \"% no prazo\" só sobre km com data de limpeza e \"% sem registro\" à parte", "st": "ok", "d": "2026-11-10"},
   {"t": "Mapa de podas: executadas (6 meses) e pendentes separadas, OS vencidas pelo prazo e linha viva só pela equipe da OS, com as sem equipe à parte", "st": "ok", "d": "2026-11-10"},
   {"t": "Trocar as imagens dos slides da Apresentação, que ainda mostram números antigos", "st": "pend", "prazo": "2026-12-04", "resp": "dev"},
   {"t": "Lista de alimentadores do município com a NAE de dentro do município (hoje a tela avisa que o número é do alimentador inteiro)", "st": "pend", "prazo": "2026-11-27", "resp": "dev", "obs": "Precisa regerar os dados do mapa."}
  ]},
  {"id": "12.3", "frente": "qualidade", "titulo": "Correções de usabilidade", "itens": [
   {"t": "A roda do mouse não troca mais de módulo na tela inicial; o gesto de toque continua e não troca com o menu aberto", "st": "ok", "d": "2026-11-10"},
   {"t": "Priorizador: \"Exibindo N de M trechos\" e botão \"Carregar mais\"", "st": "ok", "d": "2026-11-10"},
   {"t": "Mapa: endereço por nível (regional, polo e município) e Voltar do navegador subindo um nível por vez", "st": "ok", "d": "2026-11-10"},
   {"t": "Alimentador: camadas (Faixa, Inspeção, Insp→manut e Manutenção) sempre à vista no mapa e aba Trechos no painel", "st": "ok", "d": "2026-11-10"},
   {"t": "Clique na LD no mapa: aviso na hora, dados baixando com o mapa fluido e página do alimentador abrindo já carregada", "st": "ok", "d": "2026-11-10"},
   {"t": "Página do alimentador abre em fases, sem travada longa: LD03010004 pronta em 4,0 s do clique na LD (antes das correções 6,6 s) com maior travada de 0,05 s (antes 0,83 s); em aparelho 4 vezes mais lento, 5,4 s (antes 14,0 s) e 0,18 s (antes 3,8 s)", "st": "ok", "d": "2026-11-10"},
   {"t": "Zoom e arrasto do mapa do alimentador e Priorizador em aparelho lento", "st": "pend", "prazo": "2026-11-20", "resp": "dev", "obs": "Em aparelho 4 vezes mais lento o zoom do mapa do LD03010004 ainda trava de 0,4 a 0,6 s por quadro (antes 0,6 a 0,7 s; meta 0,25 s) e a soma das travadas na abertura é de 1,9 s (meta 1,5 s). Nesse aparelho, ao desligar a Faixa durante a carga, nomes de município ficam atrás dos rótulos dos trechos por cerca de 9 s."},
   {"t": "Demais pontos médios e baixos da planilha de melhorias", "st": "pend", "prazo": "2026-12-18", "resp": "dev"}
  ]},
  {"id": "12.4", "frente": "qualidade", "titulo": "Regras a confirmar depois das correções", "itens": [
   {"t": "Mapa de podas: como contar a linha viva das OS sem equipe informada", "st": "pend", "prazo": "2026-11-20", "resp": "proj", "obs": "Hoje aparecem à parte (\"sem equipe\"). O prefixo LV do número da OS só coincide com equipe de linha viva em 65% a 70% dos casos conferíveis."},
   {"t": "Priorizador: peso do trecho sem registro de limpeza (10 dos 20 pontos; 8 de 15 no Plano climático)", "st": "pend", "prazo": "2026-11-20", "resp": "proj", "obs": "Com esse peso, P1 passou de 204 para 43 trechos e P2 de 1.274 para 565."},
   {"t": "Priorizador: mesmo evento contando em NAE, CHI e CI, piso de 5 km e interrupções de menos de 3 min", "st": "pend", "prazo": "2026-11-20", "resp": "proj"},
   {"t": "Ocorrências acima de 24 h (553 de jan a ago/2026): limitar a duração, tirar do consumidor·hora ou só avisar", "st": "pend", "prazo": "2026-11-20", "resp": "proj"},
   {"t": "NAE com ou sem as interrupções momentâneas e as de dia crítico (as marcas já ficam gravadas no reprocessamento)", "st": "pend", "prazo": "2026-11-20", "resp": "proj"},
   {"t": "Ocorrência em religador ou disjuntor: ratear pela zona protegida ou só rotular como zona do equipamento", "st": "pend", "prazo": "2026-11-20", "resp": "proj"},
   {"t": "Carteira: \"OS executadas\" sem as não encontradas e as impedidas (62 de 146) e vermelho abaixo da parte do ano já passada", "st": "pend", "prazo": "2026-11-20", "resp": "proj"},
   {"t": "Insights orçamento: pisos de R$ 100 mil por ano para variação e maior aumento ou corte, e atingimento de quantidades de jan a out contra jan a out", "st": "pend", "prazo": "2026-11-20", "resp": "proj", "obs": "LPT passou de 45% para 51% e BT Rural de 178% para 156%."},
   {"t": "Painel: cartão Linha morta só com DCMD ou com o total, meta do mês parcial e realizado sem polo no total", "st": "pend", "prazo": "2026-11-20", "resp": "proj", "obs": "Com o sem polo, Inspeção 2026 passou de 135% para 138%."},
   {"t": "Mapa: faixas da visão NAE por 100 km (até 3, 3 a 6, 6 a 12, 12 a 25 e 25 ou mais) e mínimo de 50 km de rede", "st": "pend", "prazo": "2026-11-20", "resp": "proj"},
   {"t": "Mapa de podas: OS vencida pelo prazo original da OS (658 das 893 pendentes em 29/10/2026)", "st": "pend", "prazo": "2026-11-20", "resp": "proj"},
   {"t": "Alimentador: cor do \"sem registro (pendente)\" na vista Vencimento, selo de situação na lista de trechos e fusíveis só de perto com a Faixa ligada", "st": "pend", "prazo": "2026-11-20", "resp": "proj"}
  ]}
 ],
 "bases": [
  {"id": "gis", "nome": "Cadastro da rede (GIS)", "origem": "Exportação do GIS por camadas (KMZ_GOOGLE_EARTH2)", "usa": ["rede", "mapa", "nae", "faixa", "insp", "prio"], "ritmo": "demanda", "como": "Nova exportação do GIS e reprocessamento dos alimentadores."},
  {"id": "critica", "nome": "Crítica (NAE)", "origem": "Arquivos Critica*.txt, um por mês", "usa": ["nae", "mapa", "prio", "podas"], "ritmo": "mensal", "como": "Menu Atualizar bases, pasta bases/critica/."},
  {"id": "limpeza", "nome": "OS de limpeza de faixa (OS status)", "origem": "1 - OS_STATUS.parquet (RD e LD)", "usa": ["faixa", "prio", "carteira"], "ritmo": "mensal", "como": "Menu Atualizar bases, arquivo do OS status."},
  {"id": "executadas", "nome": "OS de manutenção executadas (OS status)", "origem": "1 - OS_STATUS.parquet", "usa": ["insp"], "ritmo": "mensal", "como": "Menu Atualizar bases, arquivo do OS status."},
  {"id": "manutencao", "nome": "OS de manutenção geradas pela inspeção", "origem": "OS GERADAS PELA INSPEÇÃO.xlsx, com a situação do OS status", "usa": ["insp"], "ritmo": "mensal", "como": "Menu Atualizar bases, pasta bases/manutencao/."},
  {"id": "inspecao", "nome": "Base de inspeção", "origem": "BASE INSPEÇÃO.xlsx", "usa": ["insp", "mapa"], "ritmo": "mensal", "como": "Menu Atualizar bases, pasta bases/inspecao/."},
  {"id": "podas", "nome": "OS de poda de árvore (OS status)", "origem": "1 - OS_STATUS.parquet, esquema MC - Poda de árvore", "usa": ["podas"], "ritmo": "mensal", "como": "Script mapa_podas.py com o OS status novo."},
  {"id": "ucs", "nome": "UCs ligadas por transformador", "origem": "uc_por_trafo.csv", "usa": ["prio", "rede"], "ritmo": "demanda", "como": "Script ucs_trechos.py com a planilha nova."},
  {"id": "prio", "nome": "Dados do Priorizador", "origem": "Rede do GIS, Crítica, OS de limpeza e inspeções", "usa": ["prio"], "ritmo": "mensal", "como": "Refeito depois de cada Crítica nova."},
  {"id": "carteira", "nome": "Medições e acompanhamento da carteira", "origem": "Base medição.xlsx e ACOMPANHAMENTO DE LIMPEZA DE FAIXA 2026.xlsx", "usa": ["carteira"], "ritmo": "mensal", "como": "Envio das duas planilhas para reprocessar a página."},
  {"id": "painel", "nome": "Realizado do Painel gerencial", "origem": "Exportações do BI Manutenção", "usa": ["painel"], "ritmo": "mensal", "como": "Exportação do BI e reprocessamento da página (fonte em decisão)."},
  {"id": "orcamento", "nome": "Orçamento e realizado por SIGCO", "origem": "curva.xlsx, Capex 2027 a 2029 e Qtd_2026.xlsx", "usa": ["orcamento"], "ritmo": "mensal", "como": "Planilhas novas e reprocessamento da página."},
  {"id": "conjuntos", "nome": "Consumidores por conjunto elétrico", "origem": "Calculado da Crítica (consumidores interrompidos / FEC do conjunto)", "usa": ["podas"], "ritmo": "demanda", "como": "Script conjuntos.py com uma Crítica mais nova."},
  {"id": "quadras", "nome": "Quadras e setores (podas)", "origem": "GeoPalmas e IBGE, censo 2022", "usa": ["podas"], "ritmo": "fixa", "como": "Só muda com arquivo oficial novo."},
  {"id": "ibge", "nome": "Malha dos municípios", "origem": "IBGE, API de malhas", "usa": ["rede", "mapa"], "ritmo": "fixa", "como": "Só muda se o IBGE publicar malha nova."}
 ],
 "ritmos": {
  "mensal": {"nome": "Mensal", "em_dia": 45, "atencao": 75, "regra": "Em dia até 45 dias depois da data dos dados; atenção até 75 dias; depois disso, atrasada."},
  "demanda": {"nome": "Sob demanda", "regra": "Sem prazo fixo: atualiza quando chega uma exportação nova."},
  "fixa": {"nome": "Fixa", "regra": "Base de referência, não muda com o tempo."}
 },
 "tecnica": {
  "arquitetura": [
   "Site estático no GitHub Pages (repositório público LGRSV/vera-vegeta-o-back, ramo gh-pages). Não há servidor nem banco de dados; a única exceção é a senha de edição do Insights orçamento, conferida no Supabase.",
   "O conteúdo publicado fica na pasta teste/ e o endereço principal do site abre essa pasta.",
   "Os scripts que transformam as bases em dados do site ficam no repositório privado LGRSV/smartled (Python).",
   "Fluxo: arquivo da base, script, arquivo de dados do site (.js ou .json), página. Cada alimentador tem um JSON próprio em dados/alimentadores/, de onde saem o mapa, os trechos e a NAE.",
   "Atualização automática: o menu Atualizar bases leva ao envio do arquivo na pasta bases/ do repositório; o GitHub Actions roda atualiza_bases.py e publica. Se algo falha, nada é publicado."
  ],
  "scripts": [
   ["gis_para_daimon.py", "Converte a exportação do GIS por camadas para o formato lido pelo gerador", "KMZ_GOOGLE_EARTH2", "KML por subestação"],
   ["gera_trechos.py", "Divide os alimentadores em trechos, cruza com municípios e gera páginas, KMZ e relatório", "KML da rede, Crítica, malha do IBGE", "dados/alimentadores/*.json e páginas"],
   ["refaz_trechos.py", "Refaz a divisão em trechos só com o JSON do site depois de mudar uma regra", "JSON do site", "JSON e páginas"],
   ["atualiza_critica.py", "Coloca a Crítica nova nos trechos sem refazer a rede", "Critica*.txt", "NAE nos JSON e busca por UC"],
   ["atualiza_bases.py", "Roteia o arquivo enviado para o script certo (é o que a automação roda)", "Pasta bases/", "Dados do site e bases.json"],
   ["limpeza_faixa.py", "Liga cada OS de limpeza aos vãos do trecho e calcula o vencimento", "OS status (.parquet)", "alimentadores/<AL>/limpeza.js"],
   ["carteira_parciais.py", "Agrupa as OS parciais na OS mãe para a carteira", "limpeza.js dos alimentadores", "Obras da carteira"],
   ["inspecao.py", "Inspeções executadas e os vãos cobertos por cada uma", "BASE INSPEÇÃO.xlsx", "alimentadores/<AL>/inspecao.js"],
   ["manutencao.py", "OS geradas pela inspeção no poste da estrutura", "OS GERADAS PELA INSPEÇÃO.xlsx", "alimentadores/<AL>/manutencao.js"],
   ["executadas.py", "OS de manutenção executadas (MC e MP) por ativo", "OS status", "alimentadores/<AL>/executadas.js"],
   ["ativos_gis.py", "Transformadores do GIS nos trechos e NAE que estava sem trecho", "Transformadores.kmz", "Trafos e NAE nos JSON"],
   ["ucs_trechos.py", "UCs ligadas por trecho", "uc_por_trafo.csv", "dados/ucs-trechos.js"],
   ["priorizacao_os.py", "Troca as OS de limpeza do Priorizador pelas do mapa", "limpeza.js dos alimentadores", "assets/priorizacao-dados.js"],
   ["conjuntos.py", "Consumidores de cada conjunto elétrico e conjunto de cada alimentador (denominador do DEC e do FEC)", "Uma Crítica", "dados/conjuntos.json"],
   ["mapa_podas.py", "Situação da poda por quadra, pontos das OS e NAE no perímetro urbano", "OS status, setores do IBGE, Crítica", "dados/podas.js"],
   ["gera_visoes.js", "Visões do mapa inicial (Manutenção, Inspeção, Insp→manut, Limpeza)", "Dados dos alimentadores", "assets/mapa-municipios-visoes.js"],
   ["planilha_trechos.py", "Planilha Excel com trechos e NAE para tabelas dinâmicas", "JSON do site", "Excel"],
   ["escopo.py", "Refaz os dados desta página, o Excel de acompanhamento e o Word do escopo", "dados/escopo.js e histórico do site", "dados/escopo-gerado.js, .xlsx e .docx"]
  ],
  "regras": [
   {"titulo": "Trechos", "itens": [
    "T1: do disjuntor até o 1º religador.",
    "T2: de religador a religador ao longo do tronco (T2, T2-A, T2-B…).",
    "T3: cada ramal aberto por fusível (T3-A, T3-B…); fusível dentro de fusível também é T3 (não existe T4); o 1º fusível da linha principal a menos de 300 m depois de um religador não abre T3.",
    "Fusível no tronco não abre trecho. Cada trecho guarda a chave de início e a de fim."
   ]},
   {"titulo": "NAE de vegetação", "itens": [
    "Entra a ocorrência da Crítica com causa Meio Ambiente e subcausa que começa com Árvore ou Eucalipto.",
    "Ficam fora árvore no ramal (outra causa) e poda de árvores.",
    "O mês é o da competência; passo repetido em dois arquivos conta uma vez, pelo arquivo do mês da competência.",
    "A ocorrência cai no trecho pelo ativo: disjuntor no T1, chave que abre trecho no próprio trecho, demais ativos no vão mais próximo; subestação fica à parte.",
    "Ocorrência de disjuntor ou de religador fica marcada como \"local do defeito desconhecido\": o defeito pode estar em qualquer ponto do alimentador ou da zona do religador.",
    "CHI é o consumidor·hora interrompido e CI os consumidores interrompidos das ocorrências; DEC e FEC só quando divididos pelos consumidores do conjunto elétrico (PRODIST Módulo 8)."
   ]},
   {"titulo": "Limpeza de faixa", "itens": [
    "Vencimento da limpeza por classe do trecho: T1 3 anos, T2 4 anos e T3 5 anos, contados da última limpeza de cada vão.",
    "Vão sem OS de limpeza desde 2022 é \"sem registro\" e conta como pendência.",
    "Situação do trecho: a pior entre as que ocupam mais de 10% ou mais de 300 m do trecho; \"próxima até\" é o vencimento mais cedo entre os vãos.",
    "A OS mãe descreve a obra toda; as parciais não contam km nem OS de novo.",
    "No croqui, limpeza leve é a Expedita e pesada é a Convencional."
   ]},
   {"titulo": "Priorizador", "itens": [
    "A nota do trecho vai de 0 a 100 e é a soma dos pontos de cada critério: NAE, CHI e CI por 100 km, clientes (UCs ligadas), cliente do Grupo A, hierarquia do trecho e limpeza de faixa.",
    "CHI e CI são o consumidor·hora e os consumidores interrompidos das ocorrências do trecho, não o DEC e o FEC da ANEEL.",
    "Faixas pela nota: P1 com 70 ou mais, P2 com 50 ou mais, P3 com 30 ou mais e P4 abaixo disso.",
    "Pisos: T1 com evento em 3 meses ou mais do período, ou 2 ou mais nos últimos 90 dias, é no mínimo P1 (F1); trecho com cliente do Grupo A é no mínimo P2 (F2); evento em 4 meses ou mais é no mínimo P2 (F4).",
    "Trecho em plano climático aprovado soma 8 pontos à nota (parâmetro). Há três tabelas de pontos: Padrão, Pré-chuva e Plano climático.",
    "Trecho sem registro de limpeza leva 10 dos 20 pontos do critério no perfil Padrão (editável nas Premissas), menos que o vencido.",
    "As ocorrências contam no período que a Crítica cobre (hoje jan a ago/2026) e só as posteriores à última limpeza efetiva do trecho."
   ]},
   {"titulo": "Mapa de podas", "itens": [
    "Situação da quadra: crítica (OS de poda urgente ou emergencial pendente, ou NAE dentro da quadra nos últimos 6 meses da Crítica sem poda executada em 6 meses), pendente (OS de poda aberta), executada (poda nos últimos 6 meses) ou sem poda recente.",
    "O ponto da OS é o poste da estrutura; sem ele, qualquer ativo da OS.",
    "A NAE mostrada é só a de dentro do perímetro urbano de cada cidade.",
    "Desligamento de disjuntor ou de religador não entra na conta da quadra: o defeito pode estar em qualquer ponto do alimentador; o ponto continua no mapa.",
    "DEC e FEC da quadra: quanto as ocorrências de vegetação registradas nos ativos da quadra somaram ao DEC e ao FEC do conjunto elétrico do alimentador (consumidor·hora e consumidores interrompidos divididos pelos consumidores do conjunto).",
    "O NAE alto do alimentador (quinto mais alto por 100 km da cidade, com pelo menos 5 ocorrências) é informação do painel e não pinta a quadra.",
    "Linha viva: só a equipe executora da OS decide; OS sem equipe informada aparece à parte.",
    "OS pendente é vencida quando o prazo da OS é anterior à data da base."
   ]},
   {"titulo": "Painel gerencial", "itens": [
    "Realizado e meta por mês, regional e polo; os meses depois da data de corte dos dados aparecem como \"sem dado\".",
    "Estruturas = linha morta DCMD + linha viva (desde 2026); o realizado de localidades sem polo entra no total e não tem meta.",
    "Meta zero aparece como \"sem meta\"; acima de 150% a barra pede para verificar a meta."
   ]},
   {"titulo": "Carteira de faixa", "itens": [
    "Km contratado: soma do km das OS mãe da contratação, uma vez por obra.",
    "OS executadas: sobre as OS da contratação, sem as não encontradas e as impedidas.",
    "O valor medido é da base de medição (todas as obras do ano) e não se compara com o orçado da contratação."
   ]}
  ],
  "publicacao": [
   "Toda mudança é testada e publicada primeiro na pasta teste/ do site.",
   "Mudança no repositório dos scripts (smartled) entra por pull request e só é juntada com confirmação do dono do projeto.",
   "Nunca sobrescrever alimentadores completos com recortes municipais.",
   "Não alterar dados de produção só para a interface funcionar.",
   "A cada publicação, atualizar a situação dos itens em dados/escopo.js e rodar scripts/escopo.py."
  ]
 }
};
