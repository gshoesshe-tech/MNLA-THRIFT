// app.js (premium)
const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  BRAND_NAME,
  BRAND_LOGO_TEXT,
  CURRENCY_SYMBOL,
  FACEBOOK_ORDER_LINK,
  FACEBOOK_LABEL,
  STORAGE_BUCKET
} = window.APP_CONFIG;

const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}

function fmtMoney(n) {
  const num = Number(n || 0);
  return `${CURRENCY_SYMBOL}${num.toFixed(2)}`;
}

function setBrand() {
  // Brand logo text
  $$(".brandLogo").forEach(el => el.textContent = BRAND_LOGO_TEXT || BRAND_NAME);
  // Facebook links
  $$(".fbLink").forEach(el => {
    el.href = FACEBOOK_ORDER_LINK;
    el.textContent = FACEBOOK_LABEL;
  });
}

/* =========================
   Drawer
========================= */
function setupDrawer() {
  const backdrop = $(".drawerBackdrop");
  const drawer = $(".drawer");
  const openBtn = $("#openDrawer");
  const closeBtn = $("#drawerClose");

  const close = () => {
    backdrop?.classList.remove("open");
    drawer?.classList.remove("open");
  };

  openBtn?.addEventListener("click", () => {
    backdrop?.classList.add("open");
    drawer?.classList.add("open");
  });
  backdrop?.addEventListener("click", close);
  closeBtn?.addEventListener("click", close);
}

/* =========================
   Cart (localStorage)
========================= */
function cartRead() {
  try { return JSON.parse(localStorage.getItem("cart_v2") || "[]"); }
  catch { return []; }
}
function cartWrite(items) {
  localStorage.setItem("cart_v2", JSON.stringify(items));
  updateCartCount();
}
function updateCartCount() {
  const items = cartRead();
  const count = items.reduce((a, i) => a + (i.qty || 0), 0);
  $$(".cartCount").forEach(el => {
    if (!el) return;
    el.textContent = String(count);
    el.style.display = count > 0 ? "inline-flex" : "none";
  });
}
function cartAdd(product, qty = 1) {
  const items = cartRead();
  const idx = items.findIndex(i => i.id === product.id);
  if (idx >= 0) items[idx].qty += qty;
  else items.push({ id: product.id, title: product.title, price: Number(product.price), img: product.img || "", qty });
  cartWrite(items);
}
function cartSetQty(id, qty) {
  const items = cartRead().map(i => i.id === id ? ({ ...i, qty: Math.max(1, qty) }) : i);
  cartWrite(items);
}
function cartRemove(id) {
  cartWrite(cartRead().filter(i => i.id !== id));
}
function cartTotal() {
  return cartRead().reduce((a, i) => a + Number(i.price || 0) * Number(i.qty || 0), 0);
}

/* =========================
   Cart Modal
========================= */
function setupCartModal() {
  const mb = $(".modalBackdrop");
  const m = $("#cartModal");
  const openBtn = $("#openCart");
  const closeBtn = $("#closeCart");

  const open = () => {
    mb?.classList.add("open");
    m?.classList.add("open");
    renderCartModal();
  };
  const close = () => {
    mb?.classList.remove("open");
    m?.classList.remove("open");
  };

  openBtn?.addEventListener("click", open);
  mb?.addEventListener("click", close);
  closeBtn?.addEventListener("click", close);
}

function renderCartModal() {
  const wrap = $("#cartItems");
  const totalEl = $("#cartTotal");
  const items = cartRead();

  if (!wrap) return;

  if (items.length === 0) {
    wrap.innerHTML = `<div class="statusNote" style="display:block">Your cart is empty.</div>`;
    if (totalEl) totalEl.textContent = fmtMoney(0);
    return;
  }

  wrap.innerHTML = items.map(i => `
    <div class="cartItem" data-id="${i.id}">
      <div class="cartThumb">${i.img ? `<img src="${i.img}" alt="">` : ""}</div>
      <div>
        <p class="cartName">${escapeHtml(i.title)}</p>
        <p class="cartSub">${fmtMoney(i.price)} × ${i.qty}</p>
        <div class="smallLink removeItem">Remove</div>
      </div>
      <div class="qtyRow">
        <button class="qtyBtn dec" type="button" aria-label="Decrease">−</button>
        <div style="min-width:20px;text-align:center;font-size:12px">${i.qty}</div>
        <button class="qtyBtn inc" type="button" aria-label="Increase">+</button>
      </div>
    </div>
  `).join("");

  wrap.querySelectorAll(".cartItem").forEach(row => {
    const id = row.getAttribute("data-id");
    row.querySelector(".inc").addEventListener("click", () => {
      const item = cartRead().find(x => x.id === id);
      cartSetQty(id, (item?.qty || 1) + 1);
      renderCartModal();
    });
    row.querySelector(".dec").addEventListener("click", () => {
      const item = cartRead().find(x => x.id === id);
      cartSetQty(id, (item?.qty || 1) - 1);
      renderCartModal();
    });
    row.querySelector(".removeItem").addEventListener("click", () => {
      cartRemove(id);
      renderCartModal();
    });
  });

  if (totalEl) totalEl.textContent = fmtMoney(cartTotal());
}

/* =========================
   Supabase: fetch products
========================= */
async function fetchProducts({ search = "", category = "ALL" } = {}) {
  if (!supabase) throw new Error("Supabase not loaded.");

  let q = supabase
    .from("products")
    .select("id,title,price,category,description,is_sold_out,created_at,product_images(id,url,sort)")
    .order("created_at", { ascending: false });

  if (category && category !== "ALL") q = q.eq("category", category);

  const { data, error } = await q;
  if (error) throw error;

  const normalized = (data || []).map(p => {
    const imgs = (p.product_images || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const img = imgs[0]?.url || "";
    return { ...p, img, images: imgs.map(x => x.url) };
  });

  const s = search.trim().toLowerCase();
  if (!s) return normalized;

  return normalized.filter(p =>
    (p.title || "").toLowerCase().includes(s) ||
    (p.category || "").toLowerCase().includes(s)
  );
}

/* =========================
   Shop init
========================= */
async function initShop() {
  const grid = $("#productGrid");
  const searchInput = $("#searchInput");
  const catList = $("#categoryList");
  const status = $("#shopStatus");
  const activeFilter = $("#activeFilter");

  let currentCategory = "ALL";
  const urlCat = new URLSearchParams(location.search).get("cat");
  if (urlCat) currentCategory = urlCat;

  const renderCats = (allProductsForCats) => {
    if (!catList) return;

    const cats = Array.from(new Set(allProductsForCats.map(p => p.category).filter(Boolean))).sort();
    const all = ["ALL", ...cats];

    catList.innerHTML = all.map(c =>
      `<button class="catBtn" data-cat="${escapeHtml(c)}" type="button">${escapeHtml(c)}</button>`
    ).join("");

    catList.querySelectorAll(".catBtn").forEach(btn => {
      btn.addEventListener("click", async () => {
        currentCategory = btn.getAttribute("data-cat");
        // keep UI hint
        updateActiveFilter();
        await refresh();
      });
    });

    // auto apply URL filter if exists
    if (urlCat) {
      const btn = catList.querySelector(`.catBtn[data-cat="${CSS.escape(urlCat)}"]`);
      if (btn) btn.click();
      else updateActiveFilter(); // show label even if no cat button (edge)
    } else {
      updateActiveFilter();
    }
  };

  const updateActiveFilter = () => {
    if (!activeFilter) return;
    if (currentCategory && currentCategory !== "ALL") {
      activeFilter.style.display = "block";
      activeFilter.textContent = `Filter: ${currentCategory}`;
    } else {
      activeFilter.style.display = "none";
      activeFilter.textContent = "";
    }
  };

  const render = (products) => {
    if (!grid) return;

    if (!products.length) {
      grid.innerHTML = `<div class="statusNote" style="display:block">No products found.</div>`;
      return;
    }

    grid.innerHTML = products.map(p => `
      <a class="card" href="./product.html?id=${p.id}">
        <div class="cardImg">
          ${p.img ? `<img src="${p.img}" alt="${escapeHtml(p.title)}">` : ""}
        </div>
        <div class="cardMeta">
          <div class="cardName">${escapeHtml(p.title)}</div>
          <div class="cardPrice">${fmtMoney(p.price)}</div>
          ${p.is_sold_out ? `<div><span class="soldBadge">Sold out</span></div>` : ``}
        </div>
      </a>
    `).join("");
  };

  const refresh = async () => {
    try {
      status.style.display = "none";
      const s = searchInput?.value || "";
      const products = await fetchProducts({ search: s, category: currentCategory });
      render(products);
    } catch (e) {
      console.error(e);
      status.style.display = "block";
      status.textContent = "Failed to load products. Check Supabase config, tables, and RLS policies.";
    }
  };

  try {
    const initialAll = await fetchProducts({ search: "", category: "ALL" });
    renderCats(initialAll);

    // If URL cat, refresh handles it after cat apply; otherwise show initial
    if (!urlCat) render(initialAll);
  } catch (e) {
    console.error(e);
    status.style.display = "block";
    status.textContent = "Failed to load products. Check Supabase config, tables, and RLS policies.";
  }

  searchInput?.addEventListener("input", refresh);
}

/* =========================
   Product page init
========================= */
async function initProduct() {
  const id = new URLSearchParams(location.search).get("id");
  const wrap = $("#pdpWrap");
  if (!id) {
    wrap.innerHTML = `<div class="statusNote" style="display:block">Product not found.</div>`;
    return;
  }

  const { data, error } = await supabase
    .from("products")
    .select("id,title,price,category,description,is_sold_out,product_images(id,url,sort)")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    wrap.innerHTML = `<div class="statusNote" style="display:block">Product not found.</div>`;
    return;
  }

  const imgs = (data.product_images || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
  const img = imgs[0]?.url || "";

  const pdpImg = $("#pdpImg");
  const pdpTitle = $("#pdpTitle");
  const pdpPrice = $("#pdpPrice");
  const pdpDesc = $("#pdpDesc");
  const pdpMeta = $("#pdpMeta");
  const addBtn = $("#addToCart");

  pdpImg.classList.remove("skeleton");
  pdpImg.innerHTML = img ? `<img src="${img}" alt="${escapeHtml(data.title)}">` : "";
  pdpTitle.classList.remove("skeletonText");
  pdpTitle.textContent = data.title || "Untitled";
  pdpPrice.classList.remove("skeletonText");
  pdpPrice.textContent = fmtMoney(data.price);
  pdpDesc.classList.remove("skeletonText");
  pdpDesc.textContent = data.description || "";

  pdpMeta.innerHTML = `
    ${data.category ? `<span class="pdpTag">${escapeHtml(data.category)}</span>` : ""}
    ${data.is_sold_out ? `<span class="pdpTag">Sold out</span>` : `<span class="pdpTag">Available</span>`}
  `;

  if (data.is_sold_out) {
    addBtn.textContent = "Sold out";
    addBtn.disabled = true;
    addBtn.style.opacity = .65;
    addBtn.style.cursor = "not-allowed";
    return;
  }

  addBtn.addEventListener("click", () => {
    cartAdd({ id: data.id, title: data.title, price: data.price, img });
    $("#openCart")?.click();
  });
}

/* =========================
   Checkout (manual copy)
========================= */
function buildOrderText(form) {
  const items = cartRead();
  const total = cartTotal();

  const lines = [];
  lines.push(`${BRAND_NAME} — Manual Order`);
  lines.push(`--------------------------------`);
  lines.push(`Name: ${form.fullname}`);
  lines.push(`FB Name/Link: ${form.facebook}`);
  lines.push(`Contact: ${form.contact}`);
  lines.push(`Address: ${form.address}`);
  lines.push(`--------------------------------`);
  lines.push(`Items:`);

  items.forEach((i, idx) => {
    lines.push(`${idx + 1}. ${i.title} — ${fmtMoney(i.price)} × ${i.qty} = ${fmtMoney(i.price * i.qty)}`);
  });

  lines.push(`--------------------------------`);
  lines.push(`Total: ${fmtMoney(total)}`);
  lines.push(`Notes: ${form.notes || "-"}`);
  lines.push(`--------------------------------`);
  lines.push(`Send this order to: ${FACEBOOK_ORDER_LINK}`);
  return lines.join("\n");
}

function initCheckout() {
  const items = cartRead();
  if (items.length === 0) {
    $("#checkoutWrap").innerHTML = `<div class="statusNote" style="display:block">Your cart is empty. Go to <a href="./shop.html" style="text-decoration:underline">Shop</a>.</div>`;
    return;
  }

  const summary = $("#orderSummary");
  const btnCopy = $("#copyOrder");
  const btnClear = $("#clearCart");

  const render = () => {
    const form = {
      fullname: ($("#fullname")?.value || "").trim(),
      facebook: ($("#facebook")?.value || "").trim(),
      contact: ($("#contact")?.value || "").trim(),
      address: ($("#address")?.value || "").trim(),
      notes: ($("#notes")?.value || "").trim(),
    };
    summary.textContent = buildOrderText(form);
  };

  ["fullname", "facebook", "contact", "address", "notes"].forEach(id => {
    $("#" + id)?.addEventListener("input", render);
  });

  btnCopy?.addEventListener("click", async () => {
    render();
    try {
      await navigator.clipboard.writeText(summary.textContent);
      btnCopy.textContent = "Copied";
      setTimeout(() => (btnCopy.textContent = "Copy order"), 1200);
    } catch {
      alert("Copy failed. Please select and copy manually.");
    }
  });

  btnClear?.addEventListener("click", () => {
    if (confirm("Clear cart?")) {
      cartWrite([]);
      location.href = "./shop.html";
    }
  });

  render();
}

/* =========================
   Admin (Auth + CRUD + Storage)
========================= */
async function initAdmin() {
  const authBox = $("#authBox");
  const adminBox = $("#adminBox");
  const loginBtn = $("#loginBtn");
  const logoutBtn = $("#logoutBtn");

  async function refreshAuth() {
    const { data } = await supabase.auth.getSession();
    const session = data.session;

    if (session) {
      authBox.style.display = "none";
      adminBox.style.display = "block";
      $("#adminEmail").textContent = session.user.email || "Admin";
      await renderAdminProducts();
    } else {
      authBox.style.display = "block";
      adminBox.style.display = "none";
    }
  }

  loginBtn?.addEventListener("click", async () => {
    const email = ($("#email")?.value || "").trim();
    const password = ($("#password")?.value || "").trim();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);
    await refreshAuth();
  });

  logoutBtn?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    await refreshAuth();
  });

  async function uploadImagesToProduct(productId, fileList) {
    const files = Array.from(fileList || []);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${productId}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase
        .storage
        .from(STORAGE_BUCKET)
        .upload(path, f, { cacheControl: "3600", upsert: false });

      if (upErr) {
        console.error(upErr);
        alert(upErr.message);
        continue;
      }

      const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      const url = pub.publicUrl;

      const { error: insErr } = await supabase
        .from("product_images")
        .insert([{ product_id: productId, url, sort: i }]);

      if (insErr) {
        console.error(insErr);
        alert(insErr.message);
      }
    }
  }

  $("#createProduct")?.addEventListener("click", async () => {
    const title = ($("#pTitle")?.value || "").trim();
    const price = Number($("#pPrice")?.value || 0);
    const category = ($("#pCategory")?.value || "").trim() || "garments";
    const description = ($("#pDesc")?.value || "").trim();
    const is_sold_out = $("#pSold")?.checked || false;

    if (!title) return alert("Title required.");

    const { data, error } = await supabase
      .from("products")
      .insert([{ title, price, category, description, is_sold_out }])
      .select("id")
      .single();

    if (error) return alert(error.message);

    const files = $("#pImages")?.files;
    if (files && files.length) await uploadImagesToProduct(data.id, files);

    $("#pTitle").value = "";
    $("#pPrice").value = "";
    $("#pCategory").value = "garments";
    $("#pDesc").value = "";
    $("#pSold").checked = false;
    $("#pImages").value = "";

    await renderAdminProducts();
  });

  async function renderAdminProducts() {
    const list = $("#adminProducts");
    list.innerHTML = `<div class="statusNote" style="display:block">Loading…</div>`;

    const { data, error } = await supabase
      .from("products")
      .select("id,title,price,category,is_sold_out,created_at,product_images(id,url,sort)")
      .order("created_at", { ascending: false });

    if (error) {
      list.innerHTML = `<div class="statusNote" style="display:block">Failed: ${escapeHtml(error.message)}</div>`;
      return;
    }

    list.innerHTML = (data || []).map(p => {
      const imgs = (p.product_images || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
      const img = imgs[0]?.url || "";

      return `
        <div class="cardPanel" data-id="${p.id}" style="padding:14px">
          <div style="display:grid;grid-template-columns:72px 1fr;gap:12px;align-items:center">
            <div class="cartThumb" style="width:72px;height:72px;border-radius:16px">
              ${img ? `<img src="${img}" alt="">` : ``}
            </div>
            <div>
              <div style="font-weight:800;letter-spacing:.10em;text-transform:uppercase;font-size:12px">${escapeHtml(p.title)}</div>
              <div style="color:var(--muted);font-size:12px;margin-top:6px">
                ${fmtMoney(p.price)} • ${escapeHtml(p.category)} • ${p.is_sold_out ? "SOLD OUT" : "AVAILABLE"}
              </div>

              <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
                <button class="btnGhost toggleSold" type="button" style="margin:0;max-width:210px">
                  ${p.is_sold_out ? "Mark Available" : "Mark Sold Out"}
                </button>

                <button class="btnDanger delProd" type="button" style="margin:0;max-width:160px">
                  Delete
                </button>

                <label class="btnGhost" style="margin:0;max-width:210px;cursor:pointer;display:grid;place-items:center">
                  Add Images
                  <input type="file" class="addImgs" accept="image/*" multiple style="display:none">
                </label>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    list.querySelectorAll("[data-id]").forEach(row => {
      const id = row.getAttribute("data-id");

      row.querySelector(".toggleSold").addEventListener("click", async () => {
        const { data: cur } = await supabase.from("products").select("is_sold_out").eq("id", id).single();
        const next = !cur.is_sold_out;
        const { error } = await supabase.from("products").update({ is_sold_out: next }).eq("id", id);
        if (error) return alert(error.message);
        await renderAdminProducts();
      });

      row.querySelector(".delProd").addEventListener("click", async () => {
        if (!confirm("Delete product?")) return;
        const { error } = await supabase.from("products").delete().eq("id", id);
        if (error) return alert(error.message);
        await renderAdminProducts();
      });

      row.querySelector(".addImgs").addEventListener("change", async (e) => {
        const files = e.target.files;
        if (files && files.length) {
          await uploadImagesToProduct(id, files);
          await renderAdminProducts();
        }
      });
    });
  }

  await refreshAuth();
}

/* =========================
   Boot
========================= */
document.addEventListener("DOMContentLoaded", async () => {
  setBrand();
  setupDrawer();
  setupCartModal();
  updateCartCount();

  const page = document.body.getAttribute("data-page");

  try {
    if (page === "shop") await initShop();
    if (page === "product") await initProduct();
    if (page === "checkout") initCheckout();
    if (page === "admin") await initAdmin();
  } catch (e) {
    console.error(e);
  }
});
