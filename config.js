// わんこみち。の収益化まわりの設定。ブラウザ(main.js の前に読み込む)と
// Node の生成スクリプト(loadGlobal で評価して読む)の両方から使う唯一の設定ファイル。
//
// ★ 楽天アフィリエイトに登録したら、下の RAKUTEN_AFFILIATE_ID に発行された ID を入れること。
//   空文字のあいだは楽天リンク/CTA は一切描画されない(=登録前でも安全にデプロイできる)。
//   ID はリンクに現れる公開情報なので秘匿不要。サイト別レポートのため わんこみち。専用IDを設定
//   している(たびそめ。は別ID)。楽天のリンク作成で「わんこみち」のサイトを選んで発行したもの。
const RAKUTEN_AFFILIATE_ID = "55e0a081.15b5afa8.55e0a082.96242fc0";

// 楽天アフィリエイトのラッパURL。targetUrl は楽天ドメインの遷移先。ID 未設定なら空文字を返す。
function rakutenLink(targetUrl) {
  if (!RAKUTEN_AFFILIATE_ID) return "";
  const enc = encodeURIComponent(targetUrl);
  return "https://hb.afl.rakuten.co.jp/hgc/" + RAKUTEN_AFFILIATE_ID + "/?pc=" + enc + "&m=" + enc;
}

// 楽天市場のキーワード検索(犬グッズ物販)。わんこみちの主役 CTA。ID 未設定なら空文字。
function rakutenItemSearch(keyword) {
  return rakutenLink("https://search.rakuten.co.jp/search/mall/" + encodeURIComponent(keyword) + "/");
}

// 楽天トラベルのキーワード検索(犬OKの宿さがし)。ID 未設定なら空文字。
function rakutenTravelSearch(keyword) {
  return rakutenLink("https://search.travel.rakuten.co.jp/ds/hotellist/?f_query=" + encodeURIComponent(keyword));
}
