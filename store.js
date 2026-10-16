const productGrid = document.querySelector("#product-grid");
const categoryLinks = [...document.querySelectorAll("[data-category]")];
const productCount = document.querySelector("#product-count");
let products = [];
let selectedCategory = "";

const currency = (cents) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

function renderProducts() {
  const visibleProducts = products.filter(
    (product) => !selectedCategory || product.category === selectedCategory,
  );
  productGrid.replaceChildren();

  if (!visibleProducts.length) {
    const message = document.createElement("p");
    message.className = "catalog-message";
    message.textContent = products.length
      ? "Nenhum produto disponível nesta categoria."
      : "Nenhum produto disponível no momento.";
    productGrid.append(message);
    return;
  }

  visibleProducts.forEach((product, index) => {
    const card = document.createElement("article");
    card.className = "product-card";

    const link = document.createElement("a");
    link.className = "product-image";
    link.href = `checkout.html?product=${encodeURIComponent(product.id)}`;
    link.setAttribute("aria-label", `Comprar ${product.name}`);
    link.style.backgroundImage = `url("${product.image_url}")`;

    if (product.tag) {
      const tag = document.createElement("span");
      tag.className = "product-tag";
      if (index > 0) tag.classList.add("product-tag-muted");
      tag.textContent = product.tag;
      link.append(tag);
    }

    const number = document.createElement("span");
    number.className = "product-number";
    number.textContent = `${String(index + 1).padStart(2, "0")} / ${String(visibleProducts.length).padStart(2, "0")}`;
    link.append(number);

    const quickAdd = document.createElement("span");
    quickAdd.className = "quick-add";
    quickAdd.append("VER PEÇA ", Object.assign(document.createElement("span"), { textContent: "↗" }));
    link.append(quickAdd);

    const details = document.createElement("div");
    details.className = "product-info";
    const description = document.createElement("div");
    const name = document.createElement("h3");
    name.textContent = product.name;
    const summary = document.createElement("p");
    summary.textContent = product.description || product.category.toUpperCase();
    description.append(name, summary);

    const price = document.createElement("strong");
    price.textContent = currency(product.price_cents);
    details.append(description, price);
    card.append(link, details);
    productGrid.append(card);
  });
}

categoryLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    selectedCategory = link.dataset.category;
    categoryLinks.forEach((item) => item.classList.toggle("active", item === link));
    renderProducts();
  });
});

fetch("/api/products")
  .then(async (response) => {
    if (!response.ok) throw new Error("Não foi possível carregar os produtos.");
    products = await response.json();
    productCount.textContent = String(products.length).padStart(2, "0");
    renderProducts();
  })
  .catch((error) => {
    productGrid.replaceChildren();
    const message = document.createElement("p");
    message.className = "catalog-message";
    message.textContent = `${error.message} Tente novamente mais tarde.`;
    productGrid.append(message);
  });
