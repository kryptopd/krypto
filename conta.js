const K = window.Krypto;
const $ = (s) => document.querySelector(s);
const next = K.safeNext(new URLSearchParams(location.search).get("next"), "index.html");
const authCard = $("#auth-card"), loggedCard = $("#logged-card");
const loginForm = $("#panel-login"), signupForm = $("#panel-signup");
const tabs = { login: $("#tab-login"), signup: $("#tab-signup") };
const panels = { login: loginForm, signup: signupForm };

function note(el, message, isError) { el.textContent = message; if (isError) el.dataset.error = "true"; else delete el.dataset.error; }

function showTab(which) {
  Object.entries(tabs).forEach(([name, tab]) => { tab.setAttribute("aria-selected", String(name === which)); tab.tabIndex = name === which ? 0 : -1; });
  Object.entries(panels).forEach(([name, panel]) => { panel.hidden = name !== which; });
}
Object.entries(tabs).forEach(([name, tab]) => tab.addEventListener("click", () => showTab(name)));
document.querySelectorAll("[data-switch]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.switch)));

function friendly(error) {
  const m = String((error && error.message) || "");
  if (/invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que enviamos e tente entrar de novo.";
  if (/already registered|already been registered/i.test(m)) return "Este e-mail já tem cadastro. Use a aba Entrar.";
  if (/password.*(short|least|weak)/i.test(m)) return "Use uma senha com pelo menos 8 caracteres.";
  if (/rate limit|too many/i.test(m)) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  if (/valid email|invalid email/i.test(m)) return "Informe um e-mail válido.";
  return m || "Não foi possível concluir. Tente novamente.";
}

function formatAddress(a) {
  return `${a.address}, ${a.address_number}${a.complement ? ` — ${a.complement}` : ""}\n${a.city}/${a.state} · CEP ${String(a.postal_code).replace(/^(\d{5})(\d{3})$/, "$1-$2")}`;
}
function showLogged(session) {
  authCard.hidden = true; loggedCard.hidden = false;
  const user = session.user;
  $("#logged-name").textContent = K.firstName(user);
  $("#logged-email").textContent = user.email;
  const address = user.user_metadata && user.user_metadata.address;
  const box = $("#account-address");
  box.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = "Endereço de entrega";
  const text = document.createElement("p");
  text.textContent = address ? formatAddress(address) : "Nenhum endereço cadastrado ainda. Você poderá informar na hora de finalizar a compra.";
  box.append(title, text);
  $("#go-next").href = next;
  if (next !== "index.html") $("#go-next").firstChild.textContent = "Continuar para a compra ";
}

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = loginForm.elements, fb = $("#login-feedback"), btn = loginForm.querySelector('[type="submit"]');
  if (!f.email.value.trim() || !f.password.value) return note(fb, "Informe e-mail e senha.", true);
  const client = await K.auth();
  if (!client) return note(fb, "O login não está disponível agora. Tente novamente em instantes.", true);
  btn.disabled = true; note(fb, "Entrando…");
  const { data, error } = await client.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
  btn.disabled = false;
  if (error) return note(fb, friendly(error), true);
  note(fb, "Pronto! Redirecionando…");
  location.assign(next);
});

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = signupForm.elements, fb = $("#signup-feedback"), btn = signupForm.querySelector('[type="submit"]');
  if (f.name.value.trim().length < 2) return note(fb, "Informe seu nome.", true);
  if (!f.email.value.trim()) return note(fb, "Informe seu e-mail.", true);
  if (f.password.value.length < 8) return note(fb, "Use uma senha com pelo menos 8 caracteres.", true);
  if (f.password.value !== f.password2.value) return note(fb, "As senhas não são iguais.", true);
  if (!f.consent.checked) return note(fb, "Marque a confirmação de leitura da Política de Privacidade.", true);
  const client = await K.auth();
  if (!client) return note(fb, "O cadastro não está disponível agora. Tente novamente em instantes.", true);
  btn.disabled = true; note(fb, "Criando sua conta…");
  const { data, error } = await client.auth.signUp({
    email: f.email.value.trim(), password: f.password.value,
    options: { data: { full_name: f.name.value.trim() } }
  });
  btn.disabled = false;
  if (error) return note(fb, friendly(error), true);
  // Sem sessão: o projeto exige confirmar o e-mail. Com identities vazio: e-mail já cadastrado.
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return note(fb, "Este e-mail já tem cadastro. Use a aba Entrar.", true);
  }
  if (!data.session) {
    return note(fb, "Conta criada! Enviamos um link de confirmação para o seu e-mail. Depois de confirmar, volte e entre.", false);
  }
  note(fb, "Conta criada! Redirecionando…");
  location.assign(next);
});

$("#logout").addEventListener("click", async () => {
  const client = await K.auth();
  if (client) await client.auth.signOut();
  location.assign("conta.html");
});

(async function init() {
  const session = await K.session();
  if (session) return showLogged(session);
  authCard.hidden = false;
  if (next === "checkout.html") $("#auth-lead").textContent = "Para finalizar a compra, entre na sua conta ou crie um cadastro rápido. Suas peças continuam na sacola.";
  if (new URLSearchParams(location.search).get("tab") === "signup") showTab("signup");
})();
