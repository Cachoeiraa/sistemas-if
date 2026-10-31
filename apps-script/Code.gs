// ============================================================
//  SISTEMAS IF — backend único (Apps Script)
//  Cuida de: Calendário, Achados e Perdidos, Agendamentos,
//  Manutenção e limpeza automática.
//
//  INSTALAÇÃO:
//  1. Cole este código substituindo o antigo e salve (Ctrl+S).
//  2. Rode a função instalar() UMA vez (botão Executar no
//     editor) e autorize as permissões.
//  3. Implantar > Gerenciar implantações > editar > Nova versão.
// ============================================================

const CALENDAR_ID = "e08a2e0b458f1e160be4e56aa8820316753da6ea031e66bef9a78d2b585e9dc5@group.calendar.google.com";

// A senha do admin fica FORA do código: em Projeto > Configurações >
// Propriedades do script > adicionar SENHA_ADMIN = sua senha.
// Se não existir lá, vale o padrão abaixo (troque o quanto antes).
function senhaAdmin() {
  return PropertiesService.getScriptProperties().getProperty("SENHA_ADMIN") || "admin123";
}

const DIAS_POST = 5;    // posts de achados/perdidos expiram em 5 dias
const DIAS_REPORT = 60; // reportadas de manutenção expiram em 60 dias
const DIAS_AVISO = 5;   // avisos fixados pelo admin expiram em 5 dias

const PROP_SS = "PLANILHA_ID";
const PROP_PASTA = "PASTA_FOTOS_ID";
const FUSO = "America/Sao_Paulo";

const CABECALHOS = {
  Posts: ["id", "tipo", "nome", "ondeAchou", "ondeDeixou", "descricao", "foto", "fotoId", "criadoEm"],
  Reports: ["id", "titulo", "descricao", "foto", "fotoId", "criadoEm", "tipo"],
  Agendamentos: ["id", "dia", "inicio", "fim", "servico", "nome", "turma", "status", "criadoEm"],
  Avisos: ["id", "pagina", "texto", "criadoEm"],
};

// ---------- infra: planilha + pasta de fotos ----------

function banco() {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  const id = props.getProperty(PROP_SS);
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) {} }
  if (!ss) {
    ss = SpreadsheetApp.create("IF-Sistemas (banco de dados)");
    props.setProperty(PROP_SS, ss.getId());
  }
  return ss;
}

function aba(nome) {
  const ss = banco();
  let sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    sh.getRange(1, 1, 1000, CABECALHOS[nome].length).setNumberFormat("@"); // trata tudo como texto
    sh.appendRow(CABECALHOS[nome]);
  } else {
    // garante colunas adicionadas depois (migração do cabeçalho)
    CABECALHOS[nome].forEach((h, i) => {
      const celula = sh.getRange(1, i + 1);
      if (!celula.getValue()) celula.setValue(h);
    });
  }
  return sh;
}

function pastaFotos() {
  const props = PropertiesService.getScriptProperties();
  let pasta = null;
  const id = props.getProperty(PROP_PASTA);
  if (id) { try { pasta = DriveApp.getFolderById(id); } catch (e) {} }
  if (!pasta) {
    pasta = DriveApp.createFolder("IF-Sistemas (fotos)");
    props.setProperty(PROP_PASTA, pasta.getId());
  }
  return pasta;
}

// Rode UMA vez: cria a planilha, a pasta e o gatilho diário de limpeza
function instalar() {
  banco();
  pastaFotos();
  const tem = ScriptApp.getProjectTriggers()
    .some(t => t.getHandlerFunction() === "limpezaDiaria");
  if (!tem) {
    ScriptApp.newTrigger("limpezaDiaria").timeBased().everyDays(1).create();
  }
}

// ---------- helpers de dados ----------

function txt(v) {
  if (v instanceof Date) {
    const formato = v.getFullYear() < 1970 ? "HH:mm" : "yyyy-MM-dd";
    return Utilities.formatDate(v, FUSO, formato);
  }
  return String(v);
}

function ler(nome) {
  const vals = aba(nome).getDataRange().getValues();
  if (vals.length < 2) return [];
  const head = vals[0];
  return vals.slice(1).map(r => {
    const o = {};
    head.forEach((h, i) => o[h] = r[i]);
    return o;
  });
}

function linhaDe(nome, id) {
  const vals = aba(nome).getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === String(id)) return i + 1;
  }
  return -1;
}

function adicionar(nome, obj) {
  aba(nome).appendRow(CABECALHOS[nome].map(h => obj[h] !== undefined ? obj[h] : ""));
}

function atualizar(nome, id, campo, valor) {
  const sh = aba(nome);
  const linha = linhaDe(nome, id);
  if (linha < 0) return false;
  sh.getRange(linha, CABECALHOS[nome].indexOf(campo) + 1).setValue(valor);
  return true;
}

function excluirLinha(nome, id) {
  const sh = aba(nome);
  const linha = linhaDe(nome, id);
  if (linha < 0) return false;
  const iFoto = CABECALHOS[nome].indexOf("fotoId");
  if (iFoto >= 0) {
    const fotoId = sh.getRange(linha, iFoto + 1).getValue();
    if (fotoId) { try { DriveApp.getFileById(fotoId).setTrashed(true); } catch (e) {} }
  }
  sh.deleteRow(linha);
  return true;
}

function salvarFoto(dataUrl, prefixo) {
  if (!dataUrl) return { url: "", id: "" };
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return { url: "", id: "" };
  const blob = Utilities.newBlob(
    Utilities.base64Decode(m[2]), m[1],
    prefixo + "_" + Date.now() + ".jpg"
  );
  const f = pastaFotos().createFile(blob);
  f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    url: "https://drive.google.com/thumbnail?id=" + f.getId() + "&sz=w1200",
    id: f.getId(),
  };
}

// ---------- respostas ----------

function saida(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- GET (leituras — suporta JSONP via ?callback=) ----------

function doGet(e) {
  const p = (e && e.parameter) || {};
  let out;
  switch (p.action) {
    case "listarPosts":
      out = { ok: true, posts: ler("Posts").reverse().map(normalizarPost) };
      break;
    case "listarReports":
      out = { ok: true, reports: ler("Reports").reverse().map(normalizarReport) };
      break;
    case "listarSemana":
      out = listarSemana(txt(p.inicio), txt(p.fim));
      break;
    case "listarPendentes":
      out = p.senha === senhaAdmin()
        ? { ok: true, pendentes: ler("Agendamentos").filter(r => r.status === "pendente").reverse().map(normalizarAgendamento) }
        : { ok: false, erro: "senha" };
      break;
    case "listarEventos":
      out = listarEventos();
      break;
    case "listarAvisos":
      out = { ok: true, avisos: avisosDe(p.pagina) };
      break;
    case "verificarSenha":
      out = p.senha === senhaAdmin() ? { ok: true } : { ok: false, erro: "senha" };
      break;
    case "status":
      out = { ok: true, status: "Sistemas IF online" };
      break;
    default:
      out = { ok: false, erro: "acao desconhecida" };
  }
  return saida(out, p.callback);
}

function normalizarPost(r) {
  return {
    id: txt(r.id), tipo: r.tipo, nome: r.nome,
    ondeAchou: r.ondeAchou, ondeDeixou: r.ondeDeixou,
    descricao: r.descricao, foto: r.foto, criadoEm: txt(r.criadoEm),
  };
}

function normalizarReport(r) {
  return {
    id: txt(r.id), titulo: r.titulo, descricao: r.descricao,
    foto: r.foto, criadoEm: txt(r.criadoEm), tipo: r.tipo || "Manutenção",
  };
}

function normalizarAgendamento(r) {
  return {
    id: txt(r.id), dia: txt(r.dia), inicio: txt(r.inicio), fim: txt(r.fim),
    servico: r.servico, nome: r.nome, turma: r.turma, status: r.status,
  };
}

// ---------- POST (escritas) ----------

function doPost(e) {
  const p = (e && e.parameter) || {};
  let out;
  try {
    switch (p.action) {
      case "criarEvento": out = criarEvento(p); break;
      case "editarEvento": out = editarEvento(p); break;
      case "excluirEvento": out = excluirEvento(p); break;
      case "postar": out = postar(p); break;
      case "solicitar": out = solicitar(p); break;
      case "aprovar": out = admin(p, () => atualizar("Agendamentos", p.id, "status", "aprovado")); break;
      case "recusar":
      case "excluirAgendamento": out = admin(p, () => excluirLinha("Agendamentos", p.id)); break;
      case "reportar": out = reportar(p); break;
      case "excluirReport": out = admin(p, () => excluirLinha("Reports", p.id)); break;
      case "fixarAviso": out = admin(p, () => fixarAviso(p)); break;
      case "excluirAviso": out = admin(p, () => excluirLinha("Avisos", p.id)); break;
      default: out = { ok: false, erro: "acao desconhecida" };
    }
  } catch (err) {
    out = { ok: false, erro: String(err) };
  }
  return saida(out);
}

function admin(p, fn) {
  if (p.senha !== senhaAdmin()) return { ok: false, erro: "senha" };
  return { ok: fn() };
}

// ---------- Calendário ----------

function agenda() {
  return CalendarApp.getCalendarById(CALENDAR_ID);
}

function criarEvento(p) {
  if (!p.titulo || !p.data) return { ok: false };
  salvarEvento(p);
  return { ok: true };
}

function salvarEvento(p) {
  const descricao = p.descricao || "";
  if (p.hora) {
    const ini = new Date(p.data + "T" + p.hora + ":00");
    const fim = new Date(ini.getTime() + (parseInt(p.duracao) || 60) * 60000);
    return agenda().createEvent(p.titulo, ini, fim, { description: descricao });
  }
  return agenda().createAllDayEvent(
    p.titulo, new Date(p.data + "T12:00:00"), { description: descricao }
  );
}

function editarEvento(p) {
  if (!p.id) return { ok: false };
  excluirEvento(p); // editar = apagar o antigo e criar de novo
  return criarEvento(p);
}

function excluirEvento(p) {
  const ev = agenda().getEventById(p.id);
  if (!ev) return { ok: false };
  if (ev.deleteEventSeries) ev.deleteEventSeries(); else ev.deleteEvent();
  return { ok: true };
}

function listarEventos() {
  const ini = new Date();
  ini.setHours(0, 0, 0, 0);
  const fim = new Date(ini.getTime() + 731 * 86400000); // ~2 anos
  const eventos = agenda().getEvents(ini, fim).slice(0, 150);
  return {
    ok: true,
    eventos: eventos.map(ev => ({
      id: ev.getId(),
      titulo: ev.getTitle(),
      inicio: ev.getStartTime().toISOString(),
      fim: ev.getEndTime().toISOString(),
      descricao: ev.getDescription(),
      diaInteiro: ev.isAllDayEvent(),
    })),
  };
}

// ---------- Achados e Perdidos ----------

function postar(p) {
  if (!p.nome || !p.tipo) return { ok: false, erro: "campos" };
  if (p.tipo === "achado" && (!p.ondeAchou || !p.ondeDeixou)) return { ok: false, erro: "campos" };
  if (p.tipo === "perdido" && !p.descricao) return { ok: false, erro: "campos" };
  const foto = salvarFoto(p.foto, p.tipo);
  adicionar("Posts", {
    id: Utilities.getUuid(),
    tipo: p.tipo,
    nome: p.nome,
    ondeAchou: p.ondeAchou || "",
    ondeDeixou: p.ondeDeixou || "",
    descricao: p.descricao || "",
    foto: foto.url,
    fotoId: foto.id,
    criadoEm: new Date().toISOString(),
  });
  return { ok: true };
}

// ---------- Agendamentos ----------

const SLOTS_INICIO = {
  Quadra: ["10:50", "11:40", "12:30", "13:20", "14:10", "15:00", "16:10", "17:00", "17:50"],
  "Estúdio": ["08:00", "08:50", "09:40", "10:50", "11:40", "12:30", "13:20", "14:10", "15:00", "16:10", "17:00", "17:50"],
};

// 1=seg ... 5=sex — horários de início bloqueados por serviço
const BLOQUEADOS = {
  Quadra: {
    "1": ["11:40", "12:30", "13:20", "14:10", "15:00", "16:10", "17:00", "17:50"],
    "2": ["11:40", "12:30", "13:20", "14:10", "15:00", "16:10", "17:00"],
    "3": ["11:40", "12:30", "13:20", "14:10", "16:10", "17:00", "17:50"],
    "4": ["10:50", "11:40", "12:30", "13:20", "14:10", "15:00", "16:10", "17:00"],
    "5": ["10:50", "11:40", "12:30", "14:10", "15:00", "16:10", "17:00"],
  },
  "Estúdio": {
    "1": ["08:00", "08:50", "12:30", "15:00", "16:10", "17:00", "17:50"],
    "2": ["12:30", "13:20", "17:50"],
    "3": ["08:00", "08:50", "16:10", "17:00", "17:50"],
    "4": ["08:00", "08:50", "12:30", "13:20", "17:00", "17:50"],
    "5": ["08:00", "08:50", "09:40", "10:50", "11:40", "12:30", "13:20", "14:10", "15:00", "16:10", "17:00", "17:50"],
    "6": ["08:00", "08:50", "09:40", "10:50", "11:40", "12:30", "13:20", "14:10", "15:00", "16:10", "17:00", "17:50"],
  },
};

function solicitar(p) {
  if (!p.dia || !p.inicio || !p.servico || !p.nome || !p.turma) {
    return { ok: false, erro: "campos" };
  }
  const slotsServico = SLOTS_INICIO[p.servico];
  if (!slotsServico || slotsServico.indexOf(p.inicio) < 0) return { ok: false, erro: "horario" };

  const partes = p.dia.split("-").map(Number);
  const dow = String(new Date(partes[0], partes[1] - 1, partes[2]).getDay());
  const mapaBloqueados = (BLOQUEADOS[p.servico] || {})[dow] || [];
  if (mapaBloqueados.indexOf(p.inicio) >= 0) {
    return { ok: false, erro: "bloqueado" };
  }

  const conflito = ler("Agendamentos").some(
    r => r.servico === p.servico && txt(r.dia) === p.dia && txt(r.inicio) === p.inicio && r.status === "aprovado"
  );
  if (conflito) return { ok: false, erro: "ocupado" };

  adicionar("Agendamentos", {
    id: Utilities.getUuid(),
    dia: p.dia,
    inicio: p.inicio,
    fim: p.fim || "",
    servico: p.servico,
    nome: p.nome,
    turma: p.turma,
    status: "pendente",
    criadoEm: new Date().toISOString(),
  });
  return { ok: true };
}

function listarSemana(inicio, fim) {
  const slots = ler("Agendamentos")
    .map(normalizarAgendamento)
    .filter(r => r.dia >= inicio && r.dia <= fim)
    .map(r => ({
      id: r.id, dia: r.dia, inicio: r.inicio, fim: r.fim,
      servico: r.servico, status: r.status,
      nome: r.nome,
      turma: r.turma,
    }));
  return { ok: true, slots: slots };
}

// ---------- Manutenção ----------

function reportar(p) {
  if (!p.titulo || !p.descricao) return { ok: false, erro: "campos" };
  const foto = salvarFoto(p.foto, "manutencao");
  adicionar("Reports", {
    id: Utilities.getUuid(),
    titulo: p.titulo,
    descricao: p.descricao,
    foto: foto.url,
    fotoId: foto.id,
    criadoEm: new Date().toISOString(),
    tipo: p.tipo || "Manutenção",
  });
  return { ok: true };
}

// ---------- Avisos fixados pelo admin (expiram em DIAS_AVISO dias) ----------

function fixarAviso(p) {
  if (!p.texto || !p.pagina) return false;
  adicionar("Avisos", {
    id: Utilities.getUuid(),
    pagina: p.pagina,
    texto: p.texto,
    criadoEm: new Date().toISOString(),
  });
  return true;
}

function avisosDe(pagina) {
  const limite = Date.now() - DIAS_AVISO * 86400000;
  return ler("Avisos")
    .filter(r => r.pagina === pagina && new Date(r.criadoEm).getTime() > limite)
    .reverse()
    .map(r => ({ id: txt(r.id), texto: r.texto, criadoEm: txt(r.criadoEm) }));
}

// ---------- Limpeza automática (gatilho diário) ----------

function limpezaDiaria() {
  limparExpirados("Posts", DIAS_POST);
  limparExpirados("Reports", DIAS_REPORT);
  limparExpirados("Avisos", DIAS_AVISO);
  limparAgendamentosPassados();
  limparEventosPassados();
}

function limparExpirados(nome, dias) {
  const sh = aba(nome);
  const vals = sh.getDataRange().getValues();
  const head = vals[0];
  const iCriado = head.indexOf("criadoEm");
  const iFotoId = head.indexOf("fotoId");
  const limite = Date.now() - dias * 86400000;
  for (let i = vals.length - 1; i >= 1; i--) {
    const criado = new Date(vals[i][iCriado]).getTime();
    if (criado && criado < limite) {
      if (iFotoId >= 0 && vals[i][iFotoId]) {
        try { DriveApp.getFileById(vals[i][iFotoId]).setTrashed(true); } catch (e) {}
      }
      sh.deleteRow(i + 1);
    }
  }
}

function limparAgendamentosPassados() {
  const sh = aba("Agendamentos");
  const vals = sh.getDataRange().getValues();
  const iDia = vals[0].indexOf("dia");
  const hoje = Utilities.formatDate(new Date(), FUSO, "yyyy-MM-dd");
  for (let i = vals.length - 1; i >= 1; i--) {
    if (txt(vals[i][iDia]) < hoje) sh.deleteRow(i + 1);
  }
}

function limparEventosPassados() {
  const fim = new Date();
  fim.setHours(0, 0, 0, 0);
  agenda().getEvents(new Date(2020, 0, 1), fim).forEach(ev => {
    if (ev.deleteEventSeries) ev.deleteEventSeries(); else ev.deleteEvent();
  });
}
