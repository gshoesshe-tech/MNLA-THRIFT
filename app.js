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

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

function escapeHtml(str){
  return String(str ?? "").replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}
function fmtMoney(n){
  const num = Number(n || 0);
  return `${CURRENCY_SYMBOL}${num.toFixed(2)}`;
}

/* =========================
   Brand + FB links
========================= */
function setBrand(){
  $$(".brandLogo").forEach(el => el.textContent = BRAND_LOGO_TEXT || BRAND_NAME);
  $$(".fbLink").forEach(el => {
    el.href = FACEBOOK_ORDER_LINK;
    el.textContent = FACEBOOK_LABEL;
  });
}

/* =========================
   Drawer
========================= */
function setupDrawer(){
  const b = $(".drawerBackdrop");
  const d = $(".drawer");
  const open = $("#openDrawer");
  const close = $("#drawerClose");

  const closeAll = () => {
    b?.classList.remove("open");
    d?.classList.remove("open");
  };

  open?.addEventListener("click", () => {
    b?.classList.add("open");
    d?.classList.add("open");
  });
  b?.addEventListener("click", closeAll);
  close?.addEventListener("click", closeAll);
}

/* =========================
   Global backdrop + modals
========================= */
function openModal(modalId){
  const back = $("#globalBackdrop");
  const modal = $(modalId);
  back?.classList.add("open");
  modal?.classList.add("open");
}
function closeModals(){
  $("#globalBackdrop")?.classList.remove("open");
  $("#helpModal")?.classList.remove("open");
  $("#cartModal")?.classList.remove("open");
}

function setupHelpModal(){
  $("#openHelp")?.addEventListener("click", (e) => {
    e.preventDefault();
    openModal("#helpModal");
  });
  $("#openHelpFromDrawer")?.addEventListener("click", () => openModal("#helpModal"));
  $("#closeHelp")?.addEventListener("click", closeModals);
}

function setupBackdropClose(){
  $("#globalBackdrop")?.addEventListener("click", closeModals);
}

/* =========================
   Landing slideshow
========================= */
function setupSlideshow(){
  const slides = $$(".slide");
  if (!slides.length) return;

  let idx = 0;
  setInterval(() => {
    slides[idx]?.classList.remove("isActive");
    idx = (idx + 1) % slides.length;
    slides[idx]?.classList.add("isActive");
  }, 3500);
}

/* =========================
   Cart (localStorage)
========================= */
function cartRead(){
  try { return JSON.parse(localStorage.getItem("cart_mnl_v1") || "[]"); }
  catch { return []; }
}
function cartWrite(items){
  localStorage.setItem("cart_mnl_v1", JSON.stringify(items));
  updateCartCount();
}
function updateCartCount(){
  const items = cartRead();
  const count = items.reduce((a,i)=>a+(i.qty||0),0);
  $$(".cartCount").forEach(el=>{
    el.textContent = String(count);
    el.style.display = count>0 ? "inline-flex" : "none";
  });
}
function cartAdd(product, qty=1){
  const items = cartRead();
  const idx = items.findIndex(i=>i.id===product.id);
  if (idx>=0) items[idx].qty += qty;
  else items.push({ id: product.id, title: product.title, price: Number(product.price), img: product.img || "", qty });
  cartWrite(items);
}
function cartSetQty(id, qty){
  cartWrite(cartRead().map(i => i.id===id ? ({...i, qty: Math.max(1, qty)}) : i));
}
function cartRemove(id){
  cartWrite(cartRead().filter(i => i.id !== id));
}
function cartTotal(){
  return cartRead().reduce((a,i)=>a+Number(i.price||0)*Number(i.qty||0),0);
}

/* =========================
   Cart modal
========================= */
function setupCartModal(){
  $("#openCart")?.addEventListener("click", () => {
    openModal("#cartModal");
    renderCart();
  });
  $("#closeCart")?.addEventListener("click", closeModals);
}

function renderCart(){
  const wrap = $("#cartItems");
  const totalEl = $("#cartTotal");
  if (!wrap) return;

  const items = cartRead();
  if (!items.length){
    wrap.innerHTML = `<div class="note" style="display:block;margin:14px">Your cart is empty.</div>`;
    if (totalEl) totalEl.textContent = fmtMoney(0);
    return;
  }

  wrap.innerHTML = items.map(i => `
    <div class="cartItem" data-id="${i.id}">
      <div class="cartThumb">${i.img ? `<img src="${i.img}" alt="">` : ""}</div>
      <div>
        <p class="cartName">${escapeHtml(i.title)}</p>
        <p class="cartSub">${fmtMoney(i.price)} × ${i.qty}</p>
        <span class="smallLink removeItem">Remove</span>
      </div>
      <div class="qtyRow" style="margin:0">
        <button class="qtyBtn dec" type="button">−</button>
        <div style="min-width:18px;text-align:center;font-size:12px">${i.qty}</div>
        <button class="qtyBtn inc" type="button">+</button>
      </div>
    </div>
  `).join("");

  wrap.querySelectorAll(".cartItem").forEach(row => {
    const id = row.getAttribute("data-id");
    row.querySelector(".inc").addEventListener("click", () => {
      const item = cartRead().find(x=>x.id===id);
      cartSetQty(id, (item?.qty||1) + 1);
      renderCart();
    });
    row.querySelector(".dec").addEventListener("click", () => {
      const item = cartRead().find(x=>x.id===id);
      cartSetQty(id, (item?.qty||1) - 1);
      renderCart();
    });
    row.querySelector(".removeItem").addEventListener("click", () => {
      cartRemove(id);
      renderCart();
    });
  });

  if (totalEl) totalEl.textContent = fmtMoney(cartTotal());
}

/* =========================
   Supabase fetch
========================= */
async function fetchProducts({ search="" } = {}){
  if (!supabase) throw new Error("Supabase not loaded.");

  const { data, error } = await supabase
    .from("products")
    .select("id,title,price,category,description,is_sold_out,created_at,product_images(id,url,sort)")
    .order("created_at", { ascending:false });

  if (error) throw error;

  const normalized = (data||[]).map(p => {
    const imgs = (p.product_images||[]).slice().sort((a,b)=>(a.sort||0)-(b.sort||0));
    const img = imgs[0]?.url || "";
    return { ...p, img, images: imgs.map(x=>x.url) };
  });

  const s = search.trim().toLowerCase();
  if (!s) return normalized;

  return normalized.filter(p =>
    (p.title||"").toLowerCase().includes(s) ||
    (p.category||"").toLowerCase().includes(s)
  );
}

/* =========================
   Shop init (Dosmil product grid)
========================= */
async function initShop(){
  const grid = $("#productGrid");
  const status = $("#shopStatus");
  const search = $("#searchInput");

  const render = (products) => {
    if (!grid) return;
    if (!products.length){
      grid.innerHTML = `<div class="note" style="display:block">No products found.</div>`;
      return;
    }
    grid.innerHTML = products.map(p => `
      <a class="card" href="./product.html?id=${p.id}">
        <div class="cardMedia">${p.img ? `<img src="${p.img}" alt="${escapeHtml(p.title)}">` : ""}</div>
        <div class="cardInfo">
          <div class="cardName">${escapeHtml(p.title)}</div>
          <div class="cardPrice">${fmtMoney(p.price)}</div>
          ${p.is_sold_out ? `<div class="soldText">Sold out</div>` : ``}
        </div>
      </a>
    `).join("");
  };

  const refresh = async () => {
    try{
      status.style.display = "none";
      const products = await fetchProducts({ search: search?.value || "" });
      render(products);
    }catch(e){
      console.error(e);
      status.style.display = "block";
      status.textContent = "Failed to load products. Check Supabase config + tables + RLS.";
    }
  };

  await refresh();
  search?.addEventListener("input", refresh);
}

/* =========================
   Product detail (gallery 3–6 images)
========================= */
async function initProduct(){
  const id = new URLSearchParams(location.search).get("id");
  const err = $("#pdpError");
  if (!id){
    err.style.display = "block";
    err.textContent = "Product not found.";
    return;
  }

  const { data, error } = await supabase
    .from("products")
    .select("id,title,price,category,description,is_sold_out,product_images(id,url,sort)")
    .eq("id", id)
    .maybeSingle();

  if (error || !data){
    err.style.display = "block";
    err.textContent = "Product not found.";
    return;
  }

  const imgs = (data.product_images||[]).slice().sort((a,b)=>(a.sort||0)-(b.sort||0));
  const urls = imgs.map(x=>x.url).filter(Boolean);

  const main = $("#pdpMain");
  const thumbs = $("#pdpThumbs");
  const title = $("#pdpTitle");
  const price = $("#pdpPrice");
  const meta = $("#pdpMeta");
  const desc = $("#pdpDesc");
  const addBtn = $("#addToCart");

  title.textContent = data.title || "Untitled";
  price.textContent = fmtMoney(data.price);
  meta.textContent = `${data.category || ""}${data.is_sold_out ? " • Sold out" : ""}`.trim();
  desc.textContent = data.description || "";

  let activeIndex = 0;
  const setActive = (i) => {
    activeIndex = i;
    const url = urls[i] || "";
    main.innerHTML = url ? `<img src="${url}" alt="${escapeHtml(data.title)}">` : "";
    $$(".thumb", thumbs).forEach((b, idx) => b.classList.toggle("isActive", idx === i));
  };

  // Render thumbs (if no images, show empty)
  thumbs.innerHTML = urls.length ? urls.map((u, i) => `
    <button class="thumb ${i===0 ? "isActive":""}" type="button" data-idx="${i}">
      <img src="${u}" alt="thumb ${i+1}">
    </button>
  `).join("") : `<div class="note" style="display:block;margin:12px">No images uploaded yet.</div>`;

  thumbs.querySelectorAll(".thumb").forEach(btn => {
    btn.addEventListener("click", () => setActive(Number(btn.getAttribute("data-idx"))));
  });

  setActive(0);

  // Qty controls
  const qtyInput = $("#qtyInput");
  const getQty = () => {
    const v = parseInt((qtyInput?.value || "1"), 10);
    return Number.isFinite(v) ? Math.max(1, v) : 1;
  };
  $("#qtyInc")?.addEventListener("click", () => { qtyInput.value = String(getQty() + 1); });
  $("#qtyDec")?.addEventListener("click", () => { qtyInput.value = String(Math.max(1, getQty() - 1)); });
  qtyInput?.addEventListener("input", () => { qtyInput.value = String(getQty()); });

  if (data.is_sold_out){
    addBtn.textContent = "Sold out";
    addBtn.disabled = true;
    addBtn.style.opacity = .6;
    addBtn.style.cursor = "not-allowed";
    return;
  }

  addBtn.addEventListener("click", () => {
    cartAdd({ id: data.id, title: data.title, price: data.price, img: urls[0] || "" }, getQty());
    openModal("#cartModal");
    renderCart();
  });
}

/* =========================
   Checkout (manual copy)
========================= */
function buildOrderText(form){
  const items = cartRead();
  const total = cartTotal();

  const lines = [];
  lines.push(`${BRAND_NAME} — Manual Order`);
  lines.push(`--------------------------------`);
  lines.push(`Name: ${form.fullname}`);
  lines.push(`FB Name/Link: ${form.facebook}`);
  lines.push(`Contact: ${form.contact}`);
  lines.push(`Courier: ${form.courier}`);
  lines.push(`Address: ${form.address}`);
  lines.push(`--------------------------------`);
  lines.push(`Items:`);

  items.forEach((i, idx) => {
    lines.push(`${idx+1}. ${i.title} — ${fmtMoney(i.price)} × ${i.qty} = ${fmtMoney(i.price*i.qty)}`);
  });

  lines.push(`--------------------------------`);
  lines.push(`Total: ${fmtMoney(total)}`);
  lines.push(`Notes: ${form.notes || "-"}`);
  lines.push(`--------------------------------`);
  lines.push(`Send this order to: ${FACEBOOK_ORDER_LINK}`);
  return lines.join("\n");
}

function initCheckout(){
  const wrap = $("#checkoutWrap");
  const items = cartRead();
  if (!items.length){
    wrap.innerHTML = `<div class="note" style="display:block">Your cart is empty. Go to <a href="./shop.html" style="text-decoration:underline">Shop</a>.</div>`;
    return;
  }

  const summary = $("#orderSummary");
  const copyBtn = $("#copyOrder");
  const clearBtn = $("#clearCart");

  const render = () => {
    const form = {
      fullname: ($("#fullname")?.value || "").trim(),
      facebook: ($("#facebook")?.value || "").trim(),
      contact: ($("#contact")?.value || "").trim(),
      courier: ($("#courier")?.value || "").trim(),
      address: ($("#address")?.value || "").trim(),
      notes: ($("#notes")?.value || "").trim()
    };
    summary.textContent = buildOrderText(form);
  };

  ["fullname","facebook","contact","courier","address","notes"].forEach(id => {
    $("#"+id)?.addEventListener("input", render);
  });

  copyBtn?.addEventListener("click", async () => {
    render();
    try{
      await navigator.clipboard.writeText(summary.textContent);
      copyBtn.textContent = "Copied";
      setTimeout(()=>copyBtn.textContent="Copy order", 1200);
    }catch{
      alert("Copy failed. Please select and copy manually.");
    }
  });

  clearBtn?.addEventListener("click", () => {
    if (confirm("Clear cart?")){
      cartWrite([]);
      location.href = "./shop.html";
    }
  });

  render();
}

/* =========================
   Admin (auth + create + upload images)
========================= */
async function initAdmin(){
  const authBox = $("#authBox");
  const adminBox = $("#adminBox");

  async function refreshAuth(){
    const { data } = await supabase.auth.getSession();
    const session = data.session;

    if (session){
      authBox.style.display = "none";
      adminBox.style.display = "block";
      $("#adminEmail").textContent = session.user.email || "Admin";
      await renderAdminProducts();
    }else{
      authBox.style.display = "block";
      adminBox.style.display = "none";
    }
  }

  $("#loginBtn")?.addEventListener("click", async () => {
    const email = ($("#email")?.value || "").trim();
    const password = ($("#password")?.value || "").trim();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return alert(error.message);
    await refreshAuth();
  });

  $("#logoutBtn")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    await refreshAuth();
  });

  async function uploadImages(productId, fileList){
    const files = Array.from(fileList || []);
    for (let i=0; i<files.length; i++){
      const f = files[i];
      const ext = (f.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${productId}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage.from(STORAGE_BUCKET).upload(path, f, {
        cacheControl: "3600",
        upsert: false
      });
      if (upErr){
        console.error(upErr);
        alert(upErr.message);
        continue;
      }

      const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
      const url = pub.publicUrl;

      const { error: insErr } = await supabase.from("product_images").insert([{
        product_id: productId,
        url,
        sort: i
      }]);
      if (insErr){
        console.error(insErr);
        alert(insErr.message);
      }
    }
  }

  $("#createProduct")?.addEventListener("click", async () => {
    const title = ($("#pTitle")?.value || "").trim();
    const price = Number($("#pPrice")?.value || 0);
    const category = ($("#pCategory")?.value || "garments").trim() || "garments";
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
    if (files && files.length) await uploadImages(data.id, files);

    $("#pTitle").value = "";
    $("#pPrice").value = "";
    $("#pCategory").value = "garments";
    $("#pDesc").value = "";
    $("#pSold").checked = false;
    $("#pImages").value = "";

    await renderAdminProducts();
  });

  async function renderAdminProducts(){
    const list = $("#adminProducts");
    list.innerHTML = `<div class="note" style="display:block">Loading…</div>`;

    const { data, error } = await supabase
      .from("products")
      .select("id,title,price,category,is_sold_out,created_at,product_images(id,url,sort)")
      .order("created_at", { ascending:false });

    if (error){
      list.innerHTML = `<div class="note" style="display:block">Failed: ${escapeHtml(error.message)}</div>`;
      return;
    }

    list.innerHTML = (data||[]).map(p => {
      const imgs = (p.product_images||[]).slice().sort((a,b)=>(a.sort||0)-(b.sort||0));
      const img = imgs[0]?.url || "";

      return `
        <div class="panel" data-id="${p.id}">
          <div class="panelTitle">${escapeHtml(p.title)}</div>
          <div class="panelHint">${fmtMoney(p.price)} • ${escapeHtml(p.category)} • ${p.is_sold_out ? "SOLD OUT" : "AVAILABLE"}</div>

          ${img ? `<div style="margin-top:12px;display:flex;gap:12px;align-items:center">
              <div class="cartThumb" style="width:72px;height:72px"><img src="${img}" alt=""></div>
              <div class="panelHint" style="margin:0">Primary image used on shop grid.</div>
          </div>` : `<div class="panelHint" style="margin-top:12px">No images yet.</div>`}

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px">
            <button class="btnGhost toggleSold" type="button">${p.is_sold_out ? "Mark available" : "Mark sold out"}</button>
            <button class="btnDanger delProd" type="button">Delete</button>
          </div>

          <label class="btnGhost" style="margin-top:10px;cursor:pointer">
            Add images
            <input class="addImgs" type="file" accept="image/*" multiple style="display:none">
          </label>
        </div>
      `;
    }).join("");

    list.querySelectorAll(".panel[data-id]").forEach(row => {
      const id = row.getAttribute("data-id");

      row.querySelector(".toggleSold").addEventListener("click", async () => {
        const { data: cur } = await supabase.from("products").select("is_sold_out").eq("id", id).single();
        const { error } = await supabase.from("products").update({ is_sold_out: !cur.is_sold_out }).eq("id", id);
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
        if (files && files.length){
          await uploadImages(id, files);
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
  setupHelpModal();
  setupBackdropClose();
  setupCartModal();
  updateCartCount();

  const page = document.body.getAttribute("data-page");

  try{
    if (page === "home") setupSlideshow();
    if (page === "shop") await initShop();
    if (page === "product") await initProduct();
    if (page === "checkout") initCheckout();
    if (page === "admin") await initAdmin();
  }catch(e){
    console.error(e);
  }
});
