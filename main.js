// 一覧・絞り込み・詳細モーダル・地図ビュー・近い順・いきたいリストのロジック。
// 状態はグローバル変数で持ち、URLハッシュで表示を切り替える(たびそめと同じ作り):
// "" → スポット一覧 / #map → 地図ビュー / #spot/<id> → 現在のビューの上に詳細モーダル
const REGIONS = ["北海道", "東北", "関東", "中部", "近畿", "中国", "四国", "九州・沖縄"];
const CATEGORIES = ["公園", "水辺", "海辺", "高原・山", "街なか"];
const FEATURES = ["ドッグラン", "足洗い場", "水飲み場", "犬OKカフェ近く", "駐車場"];
const WISHLIST_KEY = "wankomichi-wishlist";
const VISITED_KEY = "wankomichi-visited";
// ヒーローに使うスポット(写真が未設定の間はCSSのグラデーションのまま)
const HERO_SPOT_ID = "yamanakako";

// 写真がないスポット用の地域色グラデーション(暖色寄りのトーン)
const REGION_COLORS = {
  "北海道": ["#9db8a8", "#5f8371"],
  "東北": ["#a8b294", "#6f7d58"],
  "関東": ["#d3b184", "#a17945"],
  "中部": ["#adb4a0", "#6f7a63"],
  "近畿": ["#cfa48e", "#996449"],
  "中国": ["#c2ab90", "#8d7350"],
  "四国": ["#b0bc93", "#75885a"],
  "九州・沖縄": ["#d0a97c", "#a06e42"],
};

// 肉球マーク(さんぽ済みスタンプなどで使う)
const PAW_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="16.2" rx="5" ry="4.1"/><ellipse cx="4.9" cy="10.8" rx="2.2" ry="2.9" transform="rotate(-22 4.9 10.8)"/><ellipse cx="19.1" cy="10.8" rx="2.2" ry="2.9" transform="rotate(22 19.1 10.8)"/><ellipse cx="8.9" cy="6.6" rx="2.2" ry="3" transform="rotate(-8 8.9 6.6)"/><ellipse cx="15.1" cy="6.6" rx="2.2" ry="3" transform="rotate(8 15.1 6.6)"/></svg>';

let searchText = "";
let selectedRegion = "";
let selectedPrefecture = "";
let selectedCategories = new Set();
let selectedFeatures = new Set();
let wishlistOnly = false;
let userLoc = null;    // {lat, lng} 取得済みの現在地
let nearActive = false; // 「近い順」が有効か
let lastFiltered = SPOTS; // 地図のピン更新用に最後の絞り込み結果を持つ
let lastViewHash = ""; // モーダルを閉じたときに戻る先("" / #map)

const spotById = {};
SPOTS.forEach((spot) => { spotById[spot.id] = spot; });

// ---- いきたいリスト(id をキーにしたオブジェクト)と さんぽ済み(id → true) ----
let wishlist = {};
try {
  wishlist = JSON.parse(localStorage.getItem(WISHLIST_KEY) || "{}") || {};
} catch (e) { /* 壊れていたら空から始める(アプリ全体を道連れにしない) */ }
let visitedIds = {};
try {
  visitedIds = JSON.parse(localStorage.getItem(VISITED_KEY) || "{}") || {};
} catch (e) { /* 壊れていたら空から始める */ }

function today() {
  return new Date().toISOString().slice(0, 10);
}
function saveWishlist() {
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
  document.getElementById("wishlist-count").textContent = Object.keys(wishlist).length;
}
function saveVisited() {
  localStorage.setItem(VISITED_KEY, JSON.stringify(visitedIds));
}
function ensureEntry(id) {
  if (!wishlist[id]) wishlist[id] = { added: today(), memo: "" };
  return wishlist[id];
}

// ---- DOM 参照 ----
const searchBox = document.getElementById("search-box");
const prefectureSelect = document.getElementById("prefecture-select");
const regionTabs = document.getElementById("region-tabs");
const categoryChips = document.getElementById("category-chips");
const featureChips = document.getElementById("feature-chips");
const nearBtn = document.getElementById("near-btn");
const wishlistToggle = document.getElementById("wishlist-toggle");
const resultCount = document.getElementById("result-count");
const cardsEl = document.getElementById("cards");
const emptyMessage = document.getElementById("empty-message");
const spotControls = document.getElementById("spot-controls");
const mapView = document.getElementById("map-view");
const tabList = document.getElementById("tab-list");
const tabMap = document.getElementById("tab-map");
const dialog = document.getElementById("spot-dialog");

// ---- 写真まわり(Wikimedia Commons。たびそめと同じ方式) ----
function photoUrl(spot, width) {
  return "https://commons.wikimedia.org/wiki/Special:FilePath/" +
    encodeURIComponent(spot.photo.file) + "?width=" + width;
}
function photoPageUrl(spot) {
  return "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(spot.photo.file);
}
// ライセンス表記を条文ページのURLへ。未知の表記は null(素のテキストにフォールバック)
function licenseUrl(license) {
  if (license === "CC0") return "https://creativecommons.org/publicdomain/zero/1.0/";
  if (license === "Public domain") return "https://creativecommons.org/publicdomain/mark/1.0/";
  const m = license.match(/^CC (BY(?:-SA)?) ([\d.]+)( \w+)?$/);
  if (!m) return null;
  const type = m[1].toLowerCase();
  const port = m[3] ? m[3].trim() + "/" : "";
  return "https://creativecommons.org/licenses/" + type + "/" + m[2] + "/" + port;
}
// クレジット内リンク。カード内で押してもスポットモーダルが開かないよう伝播を止める
function creditLink(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = text;
  a.addEventListener("click", (e) => e.stopPropagation());
  return a;
}
function buildCredit(spot) {
  const span = document.createElement("span");
  span.appendChild(document.createTextNode("写真: " + spot.photo.author + " ("));
  const url = licenseUrl(spot.photo.license);
  if (url) span.appendChild(creditLink(url, spot.photo.license));
  else span.appendChild(document.createTextNode(spot.photo.license));
  span.appendChild(document.createTextNode(") / "));
  span.appendChild(creditLink(photoPageUrl(spot), "Wikimedia Commons"));
  return span;
}
// 写真ボックス(img + 失敗時のプレースホルダー + クレジット)を container に組み立てる
function fillPhotoBox(container, spot, width) {
  container.querySelectorAll("img, .photo-placeholder, .photo-credit").forEach((el) => el.remove());
  const colors = REGION_COLORS[spot.region];
  container.style.background = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
  const placeholder = document.createElement("div");
  placeholder.className = "photo-placeholder";
  placeholder.style.background = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
  placeholder.textContent = spot.name.charAt(0);
  if (spot.photo.file) {
    const img = document.createElement("img");
    img.src = photoUrl(spot, width);
    img.alt = spot.name;
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => {
      img.remove();
      container.prepend(placeholder);
    });
    container.prepend(img);
    const credit = buildCredit(spot);
    credit.className = "photo-credit";
    container.appendChild(credit);
  } else {
    container.prepend(placeholder);
  }
}
function mapUrl(spot) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(spot.mapQuery);
}
// おでかけグッズ検索リンク(楽天市場)。不足設備で検索語を文脈化する。
// config.js の楽天アフィリエイトID が未設定なら空文字を返す(=CTA を出さない)
function shopSearchUrl(spot) {
  if (typeof rakutenItemSearch !== "function") return "";
  const keyword = !spot.features.includes("足洗い場") ? "犬 携帯 足洗い ボトル"
    : !spot.features.includes("水飲み場") ? "犬 携帯 給水 ボトル"
    : "犬 お散歩 グッズ";
  return rakutenItemSearch(keyword);
}
// 楽天アフィリエイトが有効か(開示表示の出し分けに使う)
function affiliateActive() {
  return typeof RAKUTEN_AFFILIATE_ID !== "undefined" && !!RAKUTEN_AFFILIATE_ID;
}

// ---- 現在地と距離 ----
// 2点間の概算距離(km)。近い順の並べ替えと表示用なのでハーバサインで十分
function distanceKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function formatDistance(km) {
  if (km < 1) return Math.round(km * 100) * 10 + "m";
  if (km < 10) return km.toFixed(1) + "km";
  return Math.round(km) + "km";
}
function setNearActive(on) {
  nearActive = on;
  nearBtn.classList.toggle("active", on);
  nearBtn.textContent = on ? "📍 近い順で表示中" : "📍 いまいる場所から近い順";
}
nearBtn.addEventListener("click", () => {
  if (nearActive) {
    setNearActive(false);
    applyFilters();
    return;
  }
  if (userLoc) {
    setNearActive(true);
    applyFilters();
    return;
  }
  if (!navigator.geolocation) {
    alert("この端末では位置情報を使えないため、近い順は利用できません。");
    return;
  }
  nearBtn.disabled = true;
  nearBtn.textContent = "📍 現在地を取得中…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      nearBtn.disabled = false;
      setNearActive(true);
      applyFilters();
    },
    () => {
      nearBtn.disabled = false;
      setNearActive(false);
      alert("現在地を取得できませんでした。ブラウザの位置情報の許可をご確認ください。");
    },
    { timeout: 10000 }
  );
});

// ---- フィルターUIの生成 ----
["", ...REGIONS].forEach((region) => {
  const btn = document.createElement("button");
  btn.textContent = region === "" ? "すべて" : region;
  if (region === selectedRegion) btn.classList.add("active");
  btn.addEventListener("click", () => {
    selectedRegion = region;
    selectedPrefecture = "";
    regionTabs.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    updatePrefectureOptions();
    applyFilters();
  });
  regionTabs.appendChild(btn);
});

CATEGORIES.forEach((category) => {
  const btn = document.createElement("button");
  btn.textContent = category;
  btn.dataset.cat = category;
  btn.addEventListener("click", () => {
    if (selectedCategories.has(category)) {
      selectedCategories.delete(category);
      btn.classList.remove("active");
    } else {
      selectedCategories.add(category);
      btn.classList.add("active");
    }
    applyFilters();
  });
  categoryChips.appendChild(btn);
});

FEATURES.forEach((feature) => {
  const btn = document.createElement("button");
  btn.textContent = feature;
  btn.addEventListener("click", () => {
    if (selectedFeatures.has(feature)) {
      selectedFeatures.delete(feature);
      btn.classList.remove("active");
    } else {
      selectedFeatures.add(feature);
      btn.classList.add("active");
    }
    applyFilters();
  });
  featureChips.appendChild(btn);
});

function updatePrefectureOptions() {
  const prefectures = [];
  SPOTS.forEach((spot) => {
    if (selectedRegion !== "" && spot.region !== selectedRegion) return;
    if (!prefectures.includes(spot.prefecture)) prefectures.push(spot.prefecture);
  });
  prefectureSelect.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "都道府県: すべて";
  prefectureSelect.appendChild(allOption);
  prefectures.forEach((pref) => {
    const option = document.createElement("option");
    option.value = pref;
    option.textContent = pref;
    prefectureSelect.appendChild(option);
  });
  prefectureSelect.value = selectedPrefecture;
}

let searchTimer = null;
searchBox.addEventListener("input", () => {
  clearTimeout(searchTimer); // 1文字ごとに全カードを再描画しないよう少し待つ
  searchTimer = setTimeout(() => {
    searchText = searchBox.value.trim();
    applyFilters();
  }, 150);
});
prefectureSelect.addEventListener("change", () => {
  selectedPrefecture = prefectureSelect.value;
  applyFilters();
});
wishlistToggle.addEventListener("click", () => {
  wishlistOnly = !wishlistOnly;
  wishlistToggle.classList.toggle("active", wishlistOnly);
  applyFilters();
});

// 0件のときの「条件をクリア」: すべての絞り込みを外して初期状態に戻す
document.getElementById("clear-filters").addEventListener("click", () => {
  searchText = "";
  searchBox.value = "";
  selectedRegion = "";
  selectedPrefecture = "";
  selectedCategories.clear();
  selectedFeatures.clear();
  wishlistOnly = false;
  wishlistToggle.classList.remove("active");
  regionTabs.querySelectorAll("button").forEach((b, i) => b.classList.toggle("active", i === 0));
  categoryChips.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  featureChips.querySelectorAll("button").forEach((b) => b.classList.remove("active"));
  updatePrefectureOptions();
  applyFilters();
});

// ---- スポット一覧 ----
function applyFilters() {
  let filtered = SPOTS.filter((spot) => {
    if (selectedRegion !== "" && spot.region !== selectedRegion) return false;
    if (selectedPrefecture !== "" && spot.prefecture !== selectedPrefecture) return false;
    if (selectedCategories.size > 0 && ![...selectedCategories].every((c) => spot.categories.includes(c))) return false;
    if (selectedFeatures.size > 0 && ![...selectedFeatures].every((f) => spot.features.includes(f))) return false;
    if (wishlistOnly && !wishlist[spot.id]) return false;
    if (searchText !== "") {
      const haystack = spot.name + spot.description + spot.prefecture + spot.categories.join("") + spot.features.join("");
      if (!haystack.toLowerCase().includes(searchText.toLowerCase())) return false;
    }
    return true;
  });

  if (nearActive && userLoc) {
    filtered = [...filtered].sort((a, b) => distanceKm(userLoc, a) - distanceKm(userLoc, b));
  }

  lastFiltered = filtered;
  cardsEl.innerHTML = "";
  filtered.forEach((spot) => cardsEl.appendChild(buildCard(spot)));
  resultCount.textContent = `${filtered.length}件 / 全${SPOTS.length}件`;
  emptyMessage.hidden = filtered.length !== 0;
  refreshMapMarkers();
}

function buildCard(spot) {
  const card = document.createElement("div");
  card.className = "card";
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${spot.name}の詳細を見る`);

  const photoBox = document.createElement("div");
  photoBox.className = "card-photo";
  fillPhotoBox(photoBox, spot, 480);

  const starBtn = document.createElement("button");
  starBtn.className = "star-btn";
  starBtn.textContent = "⭐";
  starBtn.title = `${spot.name}をいきたいリストに追加/削除`;
  starBtn.setAttribute("aria-label", starBtn.title);
  starBtn.classList.toggle("on", !!wishlist[spot.id]);
  starBtn.setAttribute("aria-pressed", !!wishlist[spot.id]);
  starBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleStar(spot.id);
    starBtn.classList.toggle("on", !!wishlist[spot.id]);
    starBtn.setAttribute("aria-pressed", !!wishlist[spot.id]);
    if (wishlistOnly) applyFilters();
  });
  photoBox.appendChild(starBtn);

  if (visitedIds[spot.id]) {
    const stamp = document.createElement("span");
    stamp.className = "visited-stamp";
    stamp.innerHTML = PAW_SVG;
    stamp.title = "さんぽ済み";
    photoBox.appendChild(stamp);
  }

  // スポット名と県名は写真の上に重ねる(可読性はCSSのスクリムで確保)
  const overlay = document.createElement("div");
  overlay.className = "card-overlay";
  // 近い順のときは現在地からの距離をスポット名の上に出す
  if (nearActive && userLoc) {
    const dist = document.createElement("span");
    dist.className = "distance-pill";
    dist.textContent = "📍 " + formatDistance(distanceKm(userLoc, spot));
    overlay.appendChild(dist);
  }
  const place = document.createElement("div");
  place.className = "card-place";
  place.textContent = `${spot.region}|${spot.prefecture}`;
  const title = document.createElement("h2");
  title.textContent = spot.name;
  overlay.appendChild(place);
  overlay.appendChild(title);
  photoBox.appendChild(overlay);

  const body = document.createElement("div");
  body.className = "card-body";
  body.appendChild(buildTags(spot));
  const desc = document.createElement("p");
  desc.className = "card-desc";
  desc.textContent = spot.description;
  body.appendChild(desc);

  const foot = document.createElement("div");
  foot.className = "card-foot";
  const walk = document.createElement("span");
  walk.textContent = "🐾 " + (spot.length || spot.time);
  const mapLink = document.createElement("a");
  mapLink.className = "map-link";
  mapLink.textContent = "地図を見る →";
  mapLink.href = mapUrl(spot);
  mapLink.target = "_blank";
  mapLink.rel = "noopener";
  mapLink.addEventListener("click", (e) => e.stopPropagation());
  foot.appendChild(walk);
  foot.appendChild(mapLink);
  body.appendChild(foot);

  card.appendChild(photoBox);
  card.appendChild(body);

  card.addEventListener("click", (e) => {
    if (e.target.closest("a, .star-btn")) return; // 内側のリンク・ボタンはカードを開かない
    gotoSpot(spot.id);
  });
  card.addEventListener("keydown", (e) => {
    if (e.target !== card) return; // 内側の⭐やリンクのキーボード操作を奪わない
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      gotoSpot(spot.id);
    }
  });
  return card;
}

// カテゴリ(暖色)と設備(緑)のタグをまとめて組み立てる
function buildTags(spot) {
  const tags = document.createElement("div");
  tags.className = "tags";
  spot.categories.forEach((category) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.dataset.cat = category;
    tag.textContent = category;
    tags.appendChild(tag);
  });
  spot.features.forEach((feature) => {
    const tag = document.createElement("span");
    tag.className = "tag tag-feature";
    tag.textContent = feature;
    tags.appendChild(tag);
  });
  return tags;
}

function toggleStar(id) {
  const entry = wishlist[id];
  if (entry) {
    if (entry.memo && !confirm("メモも消えます。いきたいリストから外しますか?")) return;
    delete wishlist[id];
  } else {
    ensureEntry(id);
  }
  saveWishlist();
}

// ---- 地図ビュー(Leaflet) ----
// 地図は初めて表示されたときに一度だけ作る。ピンは絞り込みのたびに引き直す
let bigMap = null;
let markerLayer = null;

function initBigMap() {
  bigMap = L.map("big-map");
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(bigMap);
  markerLayer = L.layerGroup().addTo(bigMap);
  bigMap.setView([37.5, 137.0], 5); // 日本全体
  refreshMapMarkers();
}

function refreshMapMarkers() {
  if (!bigMap) return;
  markerLayer.clearLayers();
  lastFiltered.forEach((spot) => {
    const marker = L.circleMarker([spot.lat, spot.lng], {
      radius: 9,
      color: "#fff",
      weight: 2,
      fillColor: visitedIds[spot.id] ? "#5c8a4e" : "#b9762c",
      fillOpacity: 0.95,
    });
    // ポップアップはDOMで組み立ててボタンにイベントを付ける
    const box = document.createElement("div");
    box.className = "map-popup";
    const name = document.createElement("strong");
    name.textContent = spot.name;
    const pref = document.createElement("span");
    pref.textContent = spot.prefecture;
    const open = document.createElement("button");
    open.textContent = "くわしく見る";
    open.addEventListener("click", () => gotoSpot(spot.id));
    box.appendChild(name);
    box.appendChild(pref);
    box.appendChild(open);
    marker.bindPopup(box);
    marker.addTo(markerLayer);
  });
}

// ---- スポット詳細モーダル ----
const dialogPhoto = document.getElementById("dialog-photo");
const dialogStar = document.getElementById("dialog-star");
const dialogVisited = document.getElementById("dialog-visited");
const memoInput = document.getElementById("memo-input");
let dialogSpotId = null;
let miniMap = null; // モーダル内のミニ地図(開くたびに作り、閉じるときに破棄)

// スポット詳細を開く。モーダル内からの遷移は履歴エントリを積み替える
// (積むと、閉じたあとブラウザの「戻る」で古い #spot/ に当たってモーダルが復活してしまう)
function gotoSpot(id) {
  if (dialog.open) {
    history.replaceState(null, "", location.pathname + location.search + "#spot/" + id);
    openSpot(id);
  } else {
    location.hash = "spot/" + id;
  }
}

function openSpot(id) {
  const spot = spotById[id];
  if (!spot) return;
  dialogSpotId = id;
  fillPhotoBox(dialogPhoto, spot, 1024);
  document.getElementById("dialog-title").textContent = spot.name;
  document.getElementById("dialog-place").textContent = `${spot.region}|${spot.prefecture}`;
  const tagsEl = document.getElementById("dialog-tags");
  tagsEl.innerHTML = "";
  buildTags(spot).querySelectorAll("span").forEach((tag) => tagsEl.appendChild(tag));
  document.getElementById("dialog-desc").textContent = spot.description;

  // 犬目線の情報グリッド
  const info = document.getElementById("dialog-info");
  info.innerHTML = "";
  [
    ["リードのきまり", spot.leash],
    ["路面", spot.surface],
    ["木陰", spot.shade],
    ...(spot.length ? [["みちのり", spot.length]] : []),
    ["所要目安", spot.time],
    ["ベストシーズン", spot.bestSeason],
    ["アクセス", spot.access],
  ].forEach(([label, value]) => {
    const cell = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    cell.appendChild(dt);
    cell.appendChild(dd);
    info.appendChild(cell);
  });

  // 設備(あるものだけ緑のチェックで見せる)
  const featBox = document.getElementById("dialog-features");
  featBox.innerHTML = "";
  spot.features.forEach((feature) => {
    const chip = document.createElement("span");
    chip.textContent = "✓ " + feature;
    featBox.appendChild(chip);
  });
  featBox.hidden = spot.features.length === 0;

  const cautionEl = document.getElementById("dialog-caution");
  cautionEl.hidden = !spot.caution;
  cautionEl.textContent = spot.caution ? "⚠ " + spot.caution : "";

  document.getElementById("dialog-gmap").href = mapUrl(spot);
  const shopLink = document.getElementById("dialog-shop");
  const shopUrl = shopSearchUrl(spot);
  shopLink.href = shopUrl || "#";
  shopLink.textContent = "🛍 おでかけグッズを楽天で探す";
  shopLink.hidden = !shopUrl;
  document.getElementById("dialog-affiliate-note").hidden = !affiliateActive();
  refreshDialogButtons();
  memoInput.value = wishlist[id]?.memo || "";

  // あわせてあるきたい(周辺スポット)
  const nearbyList = document.getElementById("nearby-list");
  nearbyList.innerHTML = "";
  const nearbySpots = (spot.nearby || []).map((nid) => spotById[nid]).filter(Boolean);
  document.getElementById("nearby-heading").hidden = nearbySpots.length === 0;
  nearbySpots.forEach((n) => {
    const btn = document.createElement("button");
    const name = document.createElement("span");
    name.textContent = n.name;
    const pref = document.createElement("span");
    pref.className = "pref";
    pref.textContent = n.prefecture;
    btn.appendChild(name);
    btn.appendChild(pref);
    btn.addEventListener("click", () => { gotoSpot(n.id); });
    nearbyList.appendChild(btn);
  });

  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;

  // ミニ地図はダイアログの表示後に作らないとサイズが確定しない
  if (miniMap) { miniMap.remove(); miniMap = null; }
  miniMap = L.map("dialog-map-box", {
    zoomControl: false, dragging: false, scrollWheelZoom: false,
    doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false,
  });
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(miniMap);
  miniMap.setView([spot.lat, spot.lng], 14);
  L.circleMarker([spot.lat, spot.lng], {
    radius: 9, color: "#fff", weight: 2, fillColor: "#b9762c", fillOpacity: 0.95,
  }).addTo(miniMap);
  setTimeout(() => { if (miniMap) miniMap.invalidateSize(); }, 0);
}

function refreshDialogButtons() {
  const entry = wishlist[dialogSpotId];
  dialogStar.textContent = entry ? "⭐ いきたいリストに追加済み" : "☆ いきたいリストに追加";
  dialogStar.classList.toggle("on", !!entry);
  dialogVisited.innerHTML = (visitedIds[dialogSpotId] ? PAW_SVG + " さんぽ済み" : PAW_SVG + " まだあるいていない");
  dialogVisited.classList.toggle("on", !!visitedIds[dialogSpotId]);
}

// モーダル内の変更は閉じるときにまとめて一覧へ反映する(毎回全カードを再描画しない)
let cardsStale = false;

dialogStar.addEventListener("click", () => {
  toggleStar(dialogSpotId);
  memoInput.value = wishlist[dialogSpotId]?.memo || "";
  refreshDialogButtons();
  cardsStale = true;
});
dialogVisited.addEventListener("click", () => {
  // さんぽ記録はいきたいリストとは独立(リストには追加しない)
  if (visitedIds[dialogSpotId]) delete visitedIds[dialogSpotId];
  else visitedIds[dialogSpotId] = true;
  saveVisited();
  refreshDialogButtons();
  cardsStale = true;
});
memoInput.addEventListener("change", () => {
  const text = memoInput.value.trim();
  if (text === "" && !wishlist[dialogSpotId]) return;
  const entry = ensureEntry(dialogSpotId); // メモを書いたらリストにも追加
  entry.memo = text;
  saveWishlist();
  refreshDialogButtons();
  cardsStale = true;
});

document.getElementById("dialog-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (e) => {
  if (e.target === dialog) dialog.close(); // 背景クリックで閉じる
});
dialog.addEventListener("close", () => {
  dialogSpotId = null;
  if (miniMap) { miniMap.remove(); miniMap = null; }
  if (location.hash.startsWith("#spot/")) {
    history.replaceState(null, "", location.pathname + location.search + lastViewHash);
  }
  if (cardsStale) {
    applyFilters();
    cardsStale = false;
  }
});

// ---- ビュー切り替えとハッシュルーティング ----
tabList.addEventListener("click", () => { location.hash = ""; });
tabMap.addEventListener("click", () => { location.hash = "map"; });

function showView(view) {
  const isList = view === "list";
  tabList.classList.toggle("active", isList);
  tabMap.classList.toggle("active", !isList);
  spotControls.hidden = !isList;
  cardsEl.hidden = !isList;
  resultCount.hidden = !isList;
  emptyMessage.hidden = !isList || cardsEl.children.length !== 0;
  mapView.hidden = isList;
  document.getElementById("seasonal-section").hidden = !isList || !seasonalHasItems;
  if (!isList) {
    if (!bigMap) initBigMap();
    // hidden の間にサイズが変わっている可能性があるので必ず測り直す
    setTimeout(() => bigMap.invalidateSize(), 0);
  }
}

function route() {
  const hash = location.hash;
  if (hash.startsWith("#spot/")) {
    openSpot(decodeURIComponent(hash.slice(6)));
    return; // ビューは変えない(lastViewHash のまま)
  }
  if (dialog.open) dialog.close();
  if (hash === "#map") {
    lastViewHash = hash;
    showView("map");
    return;
  }
  lastViewHash = "";
  showView("list");
}
window.addEventListener("hashchange", route);

// ---- 固定ナビ ----
// ヒーローが画面から出たら .view-tabs にブランド名を表示する
const heroEl = document.querySelector(".hero");
const viewTabsEl = document.querySelector(".view-tabs");
new IntersectionObserver((entries) => {
  viewTabsEl.classList.toggle("scrolled", !entries[0].isIntersecting);
}, { rootMargin: "-56px 0px 0px 0px" }).observe(heroEl);

// ---- ヒーロー写真 ----
// ヒーロースポットに写真が入ったら差し込む(未収集の間はCSSのグラデーションのまま)
{
  const heroSpot = spotById[HERO_SPOT_ID];
  if (heroSpot && heroSpot.photo.file) {
    const img = document.createElement("img");
    img.src = photoUrl(heroSpot, 1920);
    img.alt = heroSpot.name;
    img.decoding = "async";
    document.getElementById("hero-photo").appendChild(img);
    const credit = buildCredit(heroSpot);
    document.getElementById("hero-credit").appendChild(credit);
  }
}

// ---- いまの季節におすすめ(ベストシーズンが今月のスポット) ----
let seasonalHasItems = false;

function seasonalSpots() {
  const month = new Date().getMonth() + 1;
  const matches = SPOTS.filter((spot) => {
    const s = spot.bestSeason;
    if (s.includes("通年")) return false;
    // 「4〜6月・9〜10月」のような複数レンジにも対応する
    for (const m of s.matchAll(/(\d+)〜(\d+)月/g)) {
      const a = +m[1], b = +m[2];
      if (a <= b ? (month >= a && month <= b) : (month >= a || month <= b)) return true;
    }
    return false;
  });
  // 特定の地方に偏らないよう、1地方2件までで最大10件
  const perRegion = {};
  const picked = [];
  for (const spot of matches) {
    perRegion[spot.region] = (perRegion[spot.region] || 0) + 1;
    if (perRegion[spot.region] <= 2) picked.push(spot);
    if (picked.length >= 10) break;
  }
  return picked;
}

function renderSeasonal() {
  const list = seasonalSpots();
  seasonalHasItems = list.length > 0;
  if (!seasonalHasItems) return;
  document.getElementById("seasonal-month").textContent = (new Date().getMonth() + 1) + "月";
  const strip = document.getElementById("seasonal-strip");
  strip.innerHTML = "";
  list.forEach((spot) => {
    const chip = document.createElement("div");
    chip.className = "seasonal-chip";
    chip.tabIndex = 0;
    chip.setAttribute("role", "button");
    chip.setAttribute("aria-label", `${spot.name}の詳細を見る`);
    fillPhotoBox(chip, spot, 480);
    const overlay = document.createElement("div");
    overlay.className = "seasonal-overlay";
    const name = document.createElement("strong");
    name.textContent = spot.name;
    const pref = document.createElement("span");
    pref.textContent = spot.prefecture;
    overlay.appendChild(name);
    overlay.appendChild(pref);
    chip.appendChild(overlay);
    chip.addEventListener("click", (e) => {
      if (e.target.closest("a")) return; // クレジットのリンクはモーダルを開かない
      gotoSpot(spot.id);
    });
    chip.addEventListener("keydown", (e) => {
      if (e.target !== chip) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        gotoSpot(spot.id);
      }
    });
    strip.appendChild(chip);
  });
}

// ---- 初期化 ----
document.getElementById("spot-total").textContent = SPOTS.length + "件";
document.getElementById("footer-total").textContent = SPOTS.length + "件";
saveWishlist();
updatePrefectureOptions();
renderSeasonal();
applyFilters();
route();
