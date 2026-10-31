// ---- Configuração dos horários do estúdio ----
// Períodos de 50 min + intervalos (10:30–10:50 manhã, 15:50–16:10 tarde)
const SLOTS = [
  { inicio: "08:00", fim: "08:50" },
  { inicio: "08:50", fim: "09:40" },
  { inicio: "09:40", fim: "10:30" },
  { inicio: "10:30", fim: "10:50", intervalo: true },
  { inicio: "10:50", fim: "11:40" },
  { inicio: "11:40", fim: "12:30" },
  { inicio: "12:30", fim: "13:20" },
  { inicio: "13:20", fim: "14:10" },
  { inicio: "14:10", fim: "15:00" },
  { inicio: "15:00", fim: "15:50" },
  { inicio: "15:50", fim: "16:10", intervalo: true },
  { inicio: "16:10", fim: "17:00" },
  { inicio: "17:00", fim: "17:50" },
  { inicio: "17:50", fim: "18:40" },
];

// Horários bloqueados por dia da semana (1=seg ... 5=sex)
// chave = horário de início do período, valor = texto que aparece na célula
const BLOQUEADOS = {
  1: { "08:00": "Bloqueado", "08:50": "Bloqueado", "12:30": "Bloqueado", "15:00": "Bloqueado", "16:10": "Bloqueado", "17:00": "Bloqueado", "17:50": "Bloqueado" },
  2: { "12:30": "Bloqueado", "13:20": "Bloqueado", "17:50": "Bloqueado" },
  3: { "08:00": "Bloqueado", "08:50": "Bloqueado", "16:10": "Bloqueado", "17:00": "Bloqueado", "17:50": "Bloqueado" },
  4: { "08:00": "Bloqueado", "08:50": "Bloqueado", "12:30": "Bloqueado", "13:20": "Bloqueado", "17:00": "Bloqueado", "17:50": "Bloqueado" },
  5: { "08:00": "Bloqueado", "08:50": "Bloqueado", "09:40": "Bloqueado", "10:50": "Bloqueado", "11:40": "Bloqueado", "12:30": "Bloqueado", "13:20": "Bloqueado", "14:10": "Bloqueado", "15:00": "Bloqueado", "16:10": "Bloqueado", "17:00": "Bloqueado", "17:50": "Bloqueado" },
  6: { "08:00": "Bloqueado", "08:50": "Bloqueado", "09:40": "Bloqueado", "10:50": "Bloqueado", "11:40": "Bloqueado", "12:30": "Bloqueado", "13:20": "Bloqueado", "14:10": "Bloqueado", "15:00": "Bloqueado", "16:10": "Bloqueado", "17:00": "Bloqueado", "17:50": "Bloqueado" },
};

const DIAS_SEMANA = [1, 2, 3, 4, 5, 6]; // seg a sab
const NOMES_DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const SERVICOS = ["Estúdio"];
const PAGINA = "estudio"; // identifica os avisos desta página na planilha
// ------------------------------------

const grade = document.getElementById("grade");
const tituloSemana = document.getElementById("titulo-semana");
const btnAnterior = document.getElementById("btn-anterior");
const btnProxima = document.getElementById("btn-proxima");

const modalSolicitar = document.getElementById("modal-solicitar");
const formSolicitar = document.getElementById("form-solicitar");
const resumoSlot = document.getElementById("resumo-slot");
const feedback = document.getElementById("form-feedback");
const btnEnviar = document.getElementById("btn-enviar");

const modalSenha = document.getElementById("modal-senha");
const formSenha = document.getElementById("form-senha");
const senhaFeedback = document.getElementById("senha-feedback");
const adminPanel = document.getElementById("admin-panel");
const listaPendentes = document.getElementById("lista-pendentes");
const listaAprovados = document.getElementById("lista-aprovados");
const pendentesVazio = document.getElementById("pendentes-vazio");
const aprovadosVazio = document.getElementById("aprovados-vazio");

let semanaOffset = 0;
let slotsMap = {}; // "dia|inicio" -> slot

function dataParaISO(d) {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function segundaFeira(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const recua = (d.getDay() + 6) % 7; // quantos dias desde segunda
  d.setDate(d.getDate() - recua + offset * 7);
  return d;
}

function diasDaSemana(offset) {
  const seg = segundaFeira(offset);
  return DIAS_SEMANA.map((_, i) => {
    const d = new Date(seg);
    d.setDate(d.getDate() + i);
    return d;
  });
}

// popula o <select> de serviços uma vez
formSolicitar.elements.servico.innerHTML = SERVICOS
  .map((s) => `<option>${escapar(s)}</option>`)
  .join("");

async function carregarSemana() {
  const dias = diasDaSemana(semanaOffset);
  const inicioISO = dataParaISO(dias[0]);
  const fimISO = dataParaISO(dias[dias.length - 1]);

  const fmtMes = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" });
  tituloSemana.textContent = `${fmtMes.format(dias[0])} – ${fmtMes.format(dias[dias.length - 1])}`;
  btnAnterior.disabled = semanaOffset <= 0;

  try {
    const data = await apiGet({ action: "listarSemana", inicio: inicioISO, fim: fimISO });
    slotsMap = {};
    (data.slots || [])
      .filter((s) => s.servico === "Estúdio")
      .forEach((s) => {
        slotsMap[s.dia + "|" + s.inicio] = s;
      });
  } catch {
    slotsMap = {};
  }

  renderGrade(dias);
  if (!adminPanel.hidden) carregarAdmin();
}

function renderGrade(dias) {
  let html = "<thead><tr><th></th>";
  dias.forEach((d, i) => {
    html += `<th>${NOMES_DIAS[DIAS_SEMANA[i] - 1]}<small>${fmtDataBR(dataParaISO(d))}</small></th>`;
  });
  html += "</tr></thead><tbody>";

  SLOTS.forEach(({ inicio, fim, intervalo }) => {
    html += `<tr><td class="hora">${inicio}<br><small style="font-weight:400">${fim}</small></td>`;
    dias.forEach((d) => {
      const diaISO = dataParaISO(d);

      if (intervalo) {
        html += `<td class="bloqueado">Bloqueado</td>`;
        return;
      }

      const bloqueado = BLOQUEADOS[d.getDay()] && BLOQUEADOS[d.getDay()][inicio];
      const slot = slotsMap[diaISO + "|" + inicio];

      if (bloqueado) {
        html += `<td class="bloqueado">${escapar(bloqueado)}</td>`;
      } else if (slot && slot.status === "aprovado") {
        html += `<td class="ocupado"><div class="servico">${escapar(slot.servico)}</div><div class="quem">${escapar(slot.nome)}${slot.turma ? " — " + escapar(slot.turma) : ""}</div></td>`;
      } else if (slot && slot.status === "pendente") {
        html += `<td class="pendente"><div class="servico">${escapar(slot.servico)}</div><div class="quem">${escapar(slot.nome)}${slot.turma ? " — " + escapar(slot.turma) : ""}</div></td>`;
      } else {
        html += `<td class="livre" data-dia="${diaISO}" data-inicio="${inicio}" data-fim="${fim}">Livre</td>`;
      }
    });
    html += "</tr>";
  });

  grade.innerHTML = html + "</tbody>";
}

grade.addEventListener("click", (e) => {
  const td = e.target.closest("td.livre");
  if (!td) return;
  formSolicitar.elements.dia.value = td.dataset.dia;
  formSolicitar.elements.inicio.value = td.dataset.inicio;
  formSolicitar.elements.fim.value = td.dataset.fim;
  resumoSlot.textContent = `${fmtDataBR(td.dataset.dia)} das ${td.dataset.inicio} às ${td.dataset.fim}`;
  feedback.hidden = true;
  formSolicitar.reset();
  formSolicitar.elements.dia.value = td.dataset.dia;
  formSolicitar.elements.inicio.value = td.dataset.inicio;
  formSolicitar.elements.fim.value = td.dataset.fim;
  modalSolicitar.showModal();
});

document.getElementById("btn-cancelar").addEventListener("click", () => modalSolicitar.close());

formSolicitar.addEventListener("submit", async (e) => {
  e.preventDefault();
  btnEnviar.disabled = true;
  btnEnviar.textContent = "Enviando...";

  const dados = Object.fromEntries(new FormData(formSolicitar).entries());
  dados.action = "solicitar";

  try {
    await apiPost(dados);
    feedback.className = "feedback ok";
    feedback.textContent = "Solicitação enviada! O admin vai aprovar.";
    feedback.hidden = false;

    // atualização otimista: já marca a célula como pendente agora,
    // sem esperar a planilha confirmar (evita o "flicker" Livre→amarelo)
    slotsMap[dados.dia + "|" + dados.inicio] = {
      dia: dados.dia,
      inicio: dados.inicio,
      fim: dados.fim,
      servico: dados.servico,
      nome: dados.nome,
      turma: dados.turma,
      status: "pendente",
    };
    renderGrade(diasDaSemana(semanaOffset));

    setTimeout(() => {
      modalSolicitar.close();
      carregarSemana();
    }, 1500);
  } catch {
    feedback.className = "feedback erro";
    feedback.textContent = "Não deu pra enviar. Tenta de novo.";
    feedback.hidden = false;
  }

  btnEnviar.disabled = false;
  btnEnviar.textContent = "Solicitar";
});

btnAnterior.addEventListener("click", () => {
  if (semanaOffset > 0) {
    semanaOffset--;
    carregarSemana();
  }
});

btnProxima.addEventListener("click", () => {
  semanaOffset++;
  carregarSemana();
});

// ---- Admin ----

function senhaSalva() {
  return sessionStorage.getItem("senhaAdmin") || "";
}

document.getElementById("btn-admin").addEventListener("click", () => {
  if (senhaSalva()) {
    adminPanel.hidden = false;
    carregarAdmin();
    adminPanel.scrollIntoView({ behavior: "smooth" });
  } else {
    senhaFeedback.hidden = true;
    modalSenha.showModal();
  }
});

document.getElementById("btn-senha-cancelar").addEventListener("click", () => modalSenha.close());

formSenha.addEventListener("submit", async (e) => {
  e.preventDefault();
  const senha = formSenha.elements.senha.value;
  try {
    const data = await apiGet({ action: "listarPendentes", senha });
    if (!data.ok) {
      senhaFeedback.className = "feedback erro";
      senhaFeedback.textContent = "Senha incorreta.";
      senhaFeedback.hidden = false;
      return;
    }
    sessionStorage.setItem("senhaAdmin", senha);
    modalSenha.close();
    adminPanel.hidden = false;
    renderPendentes(data.pendentes || []);
    carregarAdmin();
  } catch {
    senhaFeedback.className = "feedback erro";
    senhaFeedback.textContent = "Erro ao conectar.";
    senhaFeedback.hidden = false;
  }
});

function renderPendentes(pendentes) {
  const filtrados = pendentes.filter((s) => s.servico === "Estúdio");
  pendentesVazio.hidden = filtrados.length > 0;
  listaPendentes.innerHTML = filtrados
    .map(
      (s) => `
      <div class="admin-item">
        <div class="info">
          <strong>${escapar(s.servico)}</strong> — ${fmtDataBR(s.dia)} ${escapar(s.inicio)}–${escapar(s.fim)}
          <small>${escapar(s.nome)} · ${escapar(s.turma)}</small>
        </div>
        <div class="botoes">
          <button class="btn-primario btn-mini" data-acao="aprovar" data-id="${escapar(s.id)}">Aprovar</button>
          <button class="btn-perigo btn-mini" data-acao="recusar" data-id="${escapar(s.id)}">Recusar</button>
        </div>
      </div>`
    )
    .join("");
}

function renderAprovados() {
  const aprovados = Object.values(slotsMap).filter((s) => s.status === "aprovado");
  aprovadosVazio.hidden = aprovados.length > 0;
  listaAprovados.innerHTML = aprovados
    .map(
      (s) => `
      <div class="admin-item">
        <div class="info">
          <strong>${escapar(s.servico)}</strong> — ${fmtDataBR(s.dia)} ${escapar(s.inicio)}–${escapar(s.fim)}
          <small>${escapar(s.nome)} · ${escapar(s.turma)}</small>
        </div>
        <div class="botoes">
          <button class="btn-perigo btn-mini" data-acao="excluirAgendamento" data-id="${escapar(s.id)}">Excluir</button>
        </div>
      </div>`
    )
    .join("");
}

async function carregarAdmin() {
  try {
    const data = await apiGet({ action: "listarPendentes", senha: senhaSalva() });
    if (!data.ok) {
      adminPanel.innerHTML = `<p class="vazio">Senha inválida ou expirada. Recarregue a página.</p>`;
      return;
    }
    renderPendentes(data.pendentes || []);
    renderAprovados();
    renderAvisosAdmin(PAGINA);
  } catch {
    listaPendentes.innerHTML = `<p class="vazio">Erro ao carregar.</p>`;
  }
}

adminPanel.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-acao]");
  if (!btn) return;
  btn.disabled = true;
  try {
    await apiPost({ action: btn.dataset.acao, id: btn.dataset.id, senha: senhaSalva() });
    setTimeout(carregarSemana, 1200);
  } catch {
    btn.disabled = false;
  }
});

carregarAvisos(PAGINA);
initAvisosAdmin(PAGINA, senhaSalva);
carregarSemana();
