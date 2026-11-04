const SUPABASE_URL =
"https://gtqvpjwpsxdampdsdvry.supabase.co";

const SUPABASE_KEY =
"sb_publishable_GfFX8mud_W3b39-f0p6jDg_M-EPAcu-";

const SHOP_WHATSAPP = "923007466664";

const ADMIN_PASSWORD = "123.babli";

const supabaseClient =
window.supabase.createClient(
SUPABASE_URL,
SUPABASE_KEY
);

const $ = id => document.getElementById(id);

const state = {
products: [],
cart: [],
filter: "all",
isAdmin: false
};

function money(n) {
return Number(n || 0).toLocaleString("en-PK", {
maximumFractionDigits: 2
}) + " روپے";
}

function safeText(value) {
return String(value ?? "").replace(/[&<>"']/g, c => ({
"&":"&amp;",
"<":"&lt;",
">":"&gt;",
'"':"&quot;",
"'":"&#39;"
}[c]));
}

const emojiList = [
[/آلو|potato/i,"🥔"],
[/پیاز|onion/i,"🧅"],
[/ٹماٹر|tomato/i,"🍅"],
[/مرچ|chilli|chili/i,"🌶️"],
[/گاجر|carrot/i,"🥕"],
[/کھیرا|cucumber/i,"🥒"],
[/بینگن/i,"🍆"],
[/پالک/i,"🥬"],
[/گوبھی/i,"🥦"],
[/مٹر/i,"🫛"],
[/لہسن/i,"🧄"],
[/ادرک/i,"🫚"],
[/لیموں/i,"🍋"],
[/سیب|apple/i,"🍎"],
[/کیلا|banana/i,"🍌"],
[/آم|mango/i,"🥭"],
[/مالٹا|orange/i,"🍊"],
[/انگور/i,"🍇"],
[/تربوز/i,"🍉"],
[/خربوزہ/i,"🍈"]
];

function emojiOf(name) {
const found = emojiList.find(x => x[0].test(name));
return found ? found[1] : "🥗";
}

function categoryOf(p) {
const fruits =
/fruit|سیب|کیلا|آم|مالٹا|انگور|امرود|انار|تربوز|خربوزہ|کھجور|ناشپاتی|پپیتا|چیکو|آڑو/i;

return p.category ||
(fruits.test(p.name) ? "fruit" : "vegetable");
}

function showNotice(message, error=false) {
$("notice").textContent = message;
$("notice").classList.toggle("error", error);
}

async function loadProducts() {

showNotice("Supabase سے قیمتیں لوڈ ہو رہی ہیں...");

const {data,error} = await supabaseClient
.from("vegetables")
.select("*")
.order("id", {ascending:true});

if(error) {
showNotice(
"ڈیٹا بیس مسئلہ: " + error.message +
"۔ Supabase ٹیبل اور اجازتیں چیک کرنا ضروری ہیں۔",
true
);
$("products").innerHTML =
"<p>قیمتیں دستیاب نہیں۔</p>";
return;
}

state.products = (data || [])
.map(p => ({
...p,
price_per_kg: Number(p.price_per_kg)
}))
.filter(p =>
p.id != null &&
p.name &&
Number.isFinite(p.price_per_kg)
);

if(!state.products.length) {
showNotice(
"Supabase کی vegetables ٹیبل خالی ہے۔ پہلے اشیا اور قیمتیں شامل کریں۔",
true
);
} else {
showNotice(state.products.length + " اشیا لوڈ ہو گئیں۔");
}

renderProducts();

if(state.isAdmin) renderAdmin();
}

function renderProducts() {

const term = $("search").value.trim().toLowerCase();

const list = state.products.filter(p => {

const correctCategory =
state.filter === "all" ||
categoryOf(p) === state.filter;

const correctSearch =
String(p.name).toLowerCase().includes(term);

return correctCategory && correctSearch;

});

if(!list.length) {
$("products").innerHTML = "<p>کوئی چیز نہیں ملی۔</p>";
return;
}

$("products").innerHTML = list.map(p => `
<article class="product-card">

<div class="product-emoji">
${emojiOf(p.name)}
</div>

<div>
<h3>${safeText(p.name)}</h3>
<div class="price">
${money(p.price_per_kg)} فی کلو
</div>
</div>

<div class="product-actions">

<label>
وزن گرام میں
<input
type="number"
min="1"
max="100000"
id="weight-${safeText(p.id)}"
value="500">
</label>

<button
class="primary-btn"
type="button"
data-add="${safeText(p.id)}">
ٹوکری میں ڈالیں
</button>

</div>
</article>
`).join("");

$("products")
.querySelectorAll("[data-add]")
.forEach(btn => {
btn.addEventListener("click", () => {
addToCart(btn.dataset.add);
});
});
}

function addToCart(id) {

const product = state.products.find(
p => String(p.id) === String(id)
);

const grams = Number($("weight-" + id).value);

if(!product || !Number.isFinite(grams) ||
grams <= 0 || grams > 100000) {
alert("درست وزن درج کریں۔");
return;
}

const existing = state.cart.find(
p => String(p.id) === String(id)
);

if(existing) {
existing.grams += grams;
} else {
state.cart.push({
id: product.id,
name: product.name,
price_per_kg: product.price_per_kg,
grams: grams
});
}

renderCart();
}

function renderCart() {

const box = $("cart-items");

if(!state.cart.length) {

box.innerHTML = "<p>آپ کی ٹوکری خالی ہے۔</p>";

} else {

box.innerHTML = state.cart.map((item,i) => {

const cost =
item.price_per_kg * item.grams / 1000;

return `
<div class="cart-row">

<div>
<strong>${safeText(item.name)}</strong>

<small>
${item.grams} گرام
</small>

<small>
${money(cost)}
</small>
</div>

<button
class="remove-btn"
type="button"
data-remove="${i}">
ہٹائیں
</button>

</div>
`;

}).join("");

}

box.querySelectorAll("[data-remove]")
.forEach(button => {

button.addEventListener("click", () => {

state.cart.splice(Number(button.dataset.remove),1);

renderCart();

});

});

const total = state.cart.reduce(
(sum,item) =>
sum + item.price_per_kg * item.grams / 1000,
0
);

$("grand-total").textContent = money(total);

}

function renderAdmin() {

$("admin-list").innerHTML =
state.products.map(p => `

<div class="admin-row">

<span>${safeText(p.name)}</span>

<input
type="number"
min="0"
step="0.01"
id="admin-price-${safeText(p.id)}"
value="${p.price_per_kg}">

<button
type="button"
data-save="${safeText(p.id)}">
محفوظ
</button>

</div>

`).join("");

$("admin-list")
.querySelectorAll("[data-save]")
.forEach(button => {

button.addEventListener("click", () => {
savePrice(button.dataset.save,button);
});

});

}

async function savePrice(id,button) {

const value = Number(
$("admin-price-" + id).value
);

if(!Number.isFinite(value) || value < 0) {
alert("درست قیمت درج کریں۔");
return;
}

button.disabled = true;

const {error} = await supabaseClient
.from("vegetables")
.update({price_per_kg:value})
.eq("id",id);

button.disabled = false;

if(error) {
alert("قیمت محفوظ نہیں ہوئی: " + error.message);
return;
}

const product = state.products.find(
p => String(p.id) === String(id)
);

if(product) {
product.price_per_kg = value;
}

state.cart.forEach(item => {
if(String(item.id) === String(id)) {
item.price_per_kg = value;
}
});

renderProducts();
renderCart();
renderAdmin();

showNotice("قیمت کامیابی سے اپ ڈیٹ ہو گئی۔");

}

function loginAdmin() {

if($("admin-pass").value !== ADMIN_PASSWORD) {
alert("پاس ورڈ غلط ہے۔");
return;
}

state.isAdmin = true;

$("admin-login").hidden = true;
$("admin-panel").hidden = false;

renderAdmin();

}

function logoutAdmin() {

state.isAdmin = false;

$("admin-login").hidden = false;
$("admin-panel").hidden = true;

$("admin-pass").value = "";

}

$("search").addEventListener("input",renderProducts);

document.querySelectorAll("[data-filter]")
.forEach(button => {

button.addEventListener("click", () => {

state.filter = button.dataset.filter;

document.querySelectorAll(".tab")
.forEach(tab => {
tab.classList.toggle("active",tab === button);
});

renderProducts();

});

});

$("clear-cart").addEventListener("click", () => {

state.cart = [];

renderCart();

});

$("login-btn").addEventListener("click",loginAdmin);

$("logout-btn").addEventListener("click",logoutAdmin);

$("admin-pass").addEventListener("keydown",e => {

if(e.key === "Enter") loginAdmin();

});

$("order-form").addEventListener("submit",e => {

e.preventDefault();

if(!state.cart.length) {
alert("پہلے ٹوکری میں چیزیں شامل کریں۔");
return;
}

const name = $("customer-name").value.trim();
const phone = $("customer-phone").value.trim();
const address = $("customer-address").value.trim();

if(!name || !phone || !address) {
alert("تمام معلومات مکمل درج کریں۔");
return;
}

const total = state.cart.reduce(
(sum,item) =>
sum + item.price_per_kg * item.grams / 1000,
0
);

const lines = state.cart.map(item => {

const price =
item.price_per_kg * item.grams / 1000;

return `
• ${item.name}
وزن: ${item.grams} گرام
قیمت: ${money(price)}
فی کلو: ${item.price_per_kg} روپے
`;

});

const message = [

"مسلم ویجیٹیبل اینڈ فروٹ شاپ",
"نیا آرڈر",
"",
"نام: " + name,
"موبائل: " + phone,
"پتہ: " + address,
"",
"آرڈر کی تفصیل:",
...lines,
"",
"کل بل: " + money(total),
"ادائیگی: " + $("payment-method").value,
"",
"براہ کرم آرڈر کی تصدیق کریں۔"

].join("\n");

const url =
"https://wa.me/" +
SHOP_WHATSAPP +
"?text=" +
encodeURIComponent(message);

window.open(url,"_blank");

});

renderCart();

loadProducts();
