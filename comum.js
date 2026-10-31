const CONFIG = {
  scriptUrl: "https://script.google.com/macros/s/AKfycbzDtXxzfNb8pzTnab0MMxxgUIfjiIFOatjb-hMOkZTJ_aTRXompfCpaPJJqsyOSd3MC/exec",
};

// Leitura de dados via JSONP (o Apps Script não libera CORS pra fetch)
function apiGet(params) {
  return new Promise((resolve, reject) => {
    const cb = "jsonp" + Math.random().toString(36).slice(2);
    const s = document.createElement("script");
    const timeout = setTimeout(() => {
      limpar();
      reject(new Error("timeout"));
    }, 15000);
    function limpar() {
      delete window[cb];
      s.remove();
      clearTimeout(timeout);
    }
    window[cb] = (data) => {
      limpar();
      resolve(data);
    };
    s.onerror = () => {
      limpar();
      reject(new Error("falha ao carregar"));
    };
    s.src = CONFIG.scriptUrl + "?" + new URLSearchParams({ ...params, callback: cb });
    document.body.appendChild(s);
  });
}

// Escritas: POST simples; a resposta não é legível (no-cors),
// então a UI recarrega os dados depois pra refletir o resultado
function apiPost(dados) {
  return fetch(CONFIG.scriptUrl, {
    method: "POST",
    mode: "no-cors",
    body: new URLSearchParams(dados),
  });
}

function escapar(t) {
  const d = document.createElement("div");
  d.textContent = t == null ? "" : t;
  return d.innerHTML;
}

function hojeISO() {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function fmtDataBR(iso) {
  if (!iso) return "";
  const partes = String(iso).slice(0, 10).split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : iso;
}

function somarDias(iso, dias) {
  const d = new Date(iso);
  d.setDate(d.getDate() + dias);
  return d;
}

// ---- Avisos fixados pelo admin (aparecem no topo, expiram em 5 dias) ----

const DIAS_AVISO = 5;

function expiraAvisoEm(criadoEm) {
  return fmtDataBR(new Date(new Date(criadoEm).getTime() + DIAS_AVISO * 86400000).toISOString());
}

async function carregarAvisos(pagina) {
  const box = document.getElementById("avisos");
  if (!box) return;
  try {
    const data = await apiGet({ action: "listarAvisos", pagina });
    box.innerHTML = (data.avisos || [])
      .map((a) => `<div class="aviso">${escapar(a.texto)}<small>avisado ${fmtDataBR(a.criadoEm)} · some ${expiraAvisoEm(a.criadoEm)}</small></div>`)
      .join("");
  } catch {}
}

async function renderAvisosAdmin(pagina) {
  const lista = document.getElementById("lista-avisos");
  const vazio = document.getElementById("avisos-vazio");
  if (!lista) return;
  try {
    const data = await apiGet({ action: "listarAvisos", pagina });
    const avisos = data.avisos || [];
    vazio.hidden = avisos.length > 0;
    lista.innerHTML = avisos
      .map(
        (a) => `
        <div class="admin-item">
          <div class="info">
            <strong>${escapar(a.texto)}</strong>
            <small>fixado ${fmtDataBR(a.criadoEm)} · some ${expiraAvisoEm(a.criadoEm)}</small>
          </div>
          <div class="botoes">
            <button class="btn-perigo btn-mini" data-aviso="${escapar(a.id)}">Excluir</button>
          </div>
        </div>`
      )
      .join("");
  } catch {
    lista.innerHTML = `<p class="vazio">Erro ao carregar.</p>`;
  }
}

function initAvisosAdmin(pagina, getSenha) {
  const form = document.getElementById("form-aviso");
  const lista = document.getElementById("lista-avisos");
  if (!form || !lista) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      await apiPost({
        action: "fixarAviso",
        pagina,
        texto: form.elements.texto.value,
        senha: getSenha(),
      });
      form.reset();
      setTimeout(() => {
        renderAvisosAdmin(pagina);
        carregarAvisos(pagina);
      }, 1200);
    } catch {
      btn.disabled = false;
    }
  });

  lista.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-aviso]");
    if (!btn) return;
    if (!confirm("Excluir esse aviso?")) return;
    btn.disabled = true;
    try {
      await apiPost({ action: "excluirAviso", id: btn.dataset.aviso, pagina, senha: getSenha() });
      setTimeout(() => {
        renderAvisosAdmin(pagina);
        carregarAvisos(pagina);
      }, 1200);
    } catch {
      btn.disabled = false;
    }
  });
}

// Reduz a foto antes de enviar (celular tira foto pesada)
function fotoBase64(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, 1200 / Math.max(img.width, img.height));
        const w = Math.round(img.width * escala);
        const h = Math.round(img.height * escala);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = () => resolve("");
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
