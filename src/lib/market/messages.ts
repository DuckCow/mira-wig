import type { CommerceIntegrityFailureCode } from "@/lib/commerce-integrity";
import type { Locale } from "./locale";

export interface StorefrontMessages {
  common: { retry: string; cartLoadError: string; checkoutLoadError: string };
  nav: { home: string; styles: string; cart: string; orders: string; login: string; signOut: string; defaultUser: string; profile: string };
  selector: { label: string; region: string; language: string; preview: string; confirm: string; cancel: string; impactChanged: string; unavailable: string };
  home: { eyebrow: string; title: string; description: string; primaryCta: string; featured: string; trust: string; delivery: string };
  styles: { title: string; searchLabel: string; searchPlaceholder: string; search: string; all: string; empty: string; emptyHint: string; loadError: string; priceUnavailable: string; productLanguageNotice: string; imageUnavailable: string; thumbnail: string };
  detail: { back: string; imageUnavailable: string; productLanguageNotice: string; notFoundTitle: string; notFoundDescription: string; relatedStyles: string };
  product: { color: string; length: string; curl: string; quantity: string; decreaseQuantity: string; increaseQuantity: string; soldOut: string; adding: string; addToCart: string; added: string; viewCart: string };
  marketConfirmation: {
    currentCartMarketLabel: string; proposedTargetMarketLabel: string; currentPricePremise: string;
    switchPreviewPremise: string; currencyTransitionLabel: string; proposedCurrencyLabel: string;
    unitPriceTransitionLabel: string; lineSubtotalTransitionLabel: string; currentAmountLabel: string; targetAmountLabel: string;
    unavailableTargetState: string; confirm: string; confirmSwitch: string; change: string; required: string;
    impactChanged: string; noConfirmedMarketPremise: string; targetProjectionLabel: string;
    previewRegionLabel: string; reviewImpact: string; cancel: string;
  };
  cart: {
    title: string; empty: string; browse: string; image: string; unavailablePrice: string; priceReview: string;
    subtotal: string; itemReview: string; shippingPending: string; unavailableNotice: string; unavailableCheckout: string;
    checkout: string; checkoutConfirmationRequired: string; itemsLabel: string; remove: string; removing: string;
    quantityControl: string; decreaseQuantity: string; increaseQuantity: string;
    targetProjectionUnitPrice: string; targetProjectionLineSubtotal: string; targetProjectionSubtotal: string;
    targetProjectionNotice: string;
    integrityErrors: Record<CommerceIntegrityFailureCode, string>;
  };
  checkout: {
    back: string; title: string; introBeforeAmount: string; introAfterAmount: string; address: string; selectedMarket: string;
    shippingCountry: string; marketCountryPremise: string; recipientName: string; phone: string; postalCode: string;
    administrativeArea: string; city: string; addressLine1: string; addressLine2: string; memo: string; memoPlaceholder: string;
    select: string; creating: string; recreate: string; create: string; items: string; subtotal: string; cartSnapshotNotice: string;
    sessionSnapshot: string; shipping: string; taxDuty: string; taxPending: string; total: string; sessionNotice: string; shippingPolicyPending: string;
    resumeTitle: string; frozenMarket: string; frozenShipping: string; changeShipping: string;
    resumeUnavailableTitle: string; resumeUnavailableDescription: string; resumeExpired: string; resumeCompleted: string;
    resumePaymentExists: string; resumeTerminal: string; viewPaymentStatus: string; viewOrder: string;
    recoveryTitle: string; recoveryDescription: string; recoveryAction: string; recoveryChecking: string;
    recoveryObserved: string; recoveryUnknown: string; recoveryUnavailable: string;
    errors: Record<string, string>;
    payment: {
      title: string; cardPending: string; cardDisabled: string; overseasPending: string; overseasDisabled: string;
      internationalCardTitle: string; internationalCardDescription: string; internationalCardStart: string;
      internationalCardProcessing: string; unavailableCard: string;
      mockTitle: string; mockDescription: string; processing: string; orders: string; success: string;
      initiationInProgress: string; outcomeUnknown: string; remediationRequired: string; unavailableMock: string;
      confirmationUnexpected: string; checkingState: string; checkingOutcome: string; checkingProblem: string;
      checkingOrders: string; completed: string; retry: string; start: string; orderProcessing: string;
      errors: Record<string, string>; fallbackError: string;
    };
  };
  login: { title: string; subtitle: string; consent: string; continueGoogle: string; loading: string; error: string };
  savedFitting: { back: string; title: string; source: string; result: string; pending: string; failed: string; returnToProduct: string };
  order: OrderMessages;
}

export type OrderMessages = ReturnType<typeof orderCopy>;

const COMMON_PAYMENT_ERRORS = {
  ko: {
    UNAUTHORIZED: "로그인이 필요합니다. 다시 로그인해 주세요.", SESSION_UNAVAILABLE: "주문서를 찾을 수 없거나 사용할 권한이 없습니다.", SESSION_NOT_USABLE: "주문서를 사용할 수 없습니다.", PROVIDER_INVALID: "현재 사용할 수 있는 결제 수단이 없습니다.", PROVIDER_MISMATCH: "현재 사용할 수 있는 결제 수단이 없습니다.", PROVIDER_UNAVAILABLE: "현재 사용할 수 있는 결제 수단이 없습니다.", PAYMENT_UNAVAILABLE: "결제 시도를 다시 시작해야 합니다.", PROVIDER_RETRYABLE: "일시적인 처리 지연입니다.", PAYMENT_FAILED: "결제가 승인되지 않았습니다.", PROVIDER_TERMINAL: "결제가 승인되지 않았습니다.",
  },
  en: {
    UNAUTHORIZED: "Please sign in again.", SESSION_UNAVAILABLE: "This checkout is unavailable or does not belong to you.", SESSION_NOT_USABLE: "This checkout cannot be used.", PROVIDER_INVALID: "No payment method is available.", PROVIDER_MISMATCH: "No payment method is available.", PROVIDER_UNAVAILABLE: "No payment method is available.", PAYMENT_UNAVAILABLE: "Start a new payment attempt.", PROVIDER_RETRYABLE: "Processing is temporarily delayed.", PAYMENT_FAILED: "Payment was not approved.", PROVIDER_TERMINAL: "Payment was not approved.",
  },
  ja: {
    UNAUTHORIZED: "もう一度ログインしてください。", SESSION_UNAVAILABLE: "注文書を利用できないか、アクセス権がありません。", SESSION_NOT_USABLE: "この注文書は利用できません。", PROVIDER_INVALID: "利用可能な決済方法がありません。", PROVIDER_MISMATCH: "利用可能な決済方法がありません。", PROVIDER_UNAVAILABLE: "利用可能な決済方法がありません。", PAYMENT_UNAVAILABLE: "決済を最初からやり直してください。", PROVIDER_RETRYABLE: "処理が一時的に遅れています。", PAYMENT_FAILED: "決済は承認されませんでした。", PROVIDER_TERMINAL: "決済は承認されませんでした。",
  },
} as const;

const MESSAGES: Record<Locale, StorefrontMessages> = {
  ko: {
    common: { retry: "다시 시도", cartLoadError: "장바구니를 불러오지 못했습니다.", checkoutLoadError: "주문서를 불러오지 못했습니다." },
    nav: { home: "홈", styles: "스타일", cart: "장바구니", orders: "내 주문", login: "로그인", signOut: "로그아웃", defaultUser: "사용자", profile: "프로필" },
    selector: { label: "지역 및 언어", region: "배송 지역", language: "언어", preview: "변경 내용 확인", confirm: "변경 확인", cancel: "취소", impactChanged: "장바구니 상태가 바뀌었습니다. 변경 내용을 다시 확인해 주세요.", unavailable: "구매 불가" },
    home: { eyebrow: "프리미엄 맞춤 가발 플랫폼", title: "맞춤 가발을 더 쉽게 비교하고 선택하세요", description: "스타일을 둘러보고 어울리는 디자인을 비교한 뒤 가상 피팅으로 이어가세요.", primaryCta: "스타일 둘러보기", featured: "엄선된 스타일", trust: "가격과 구매 가능 여부는 선택한 배송 지역을 기준으로 확인됩니다.", delivery: "배송비와 세금은 추후 검증된 배송 견적에서 확정됩니다." },
    styles: { title: "가발 스타일", searchLabel: "스타일 검색", searchPlaceholder: "이름 또는 태그 검색", search: "검색", all: "전체", empty: "검색 결과가 없습니다", emptyHint: "다른 키워드나 카테고리를 시도해 보세요.", loadError: "스타일 목록을 불러오지 못했습니다.", priceUnavailable: "가격 정보 없음", productLanguageNotice: "상품명과 설명은 등록된 원문으로 표시되며 원문의 언어는 확인되지 않았습니다.", imageUnavailable: "이미지 없음", thumbnail: "가발 썸네일" },
    detail: { back: "스타일 목록", imageUnavailable: "이미지 없음", productLanguageNotice: "이 상품 정보는 등록된 원문으로 표시되며 원문의 언어는 확인되지 않았습니다.", notFoundTitle: "스타일을 찾을 수 없습니다", notFoundDescription: "삭제되었거나 존재하지 않는 스타일입니다.", relatedStyles: "관련 스타일" },
    product: { color: "색상", length: "길이", curl: "컬", quantity: "수량", decreaseQuantity: "수량 줄이기", increaseQuantity: "수량 늘리기", soldOut: "품절", adding: "담는 중…", addToCart: "장바구니 담기", added: "장바구니에 담았습니다.", viewCart: "장바구니 보기" },
    marketConfirmation: { currentCartMarketLabel: "현재 장바구니 가격 기준", proposedTargetMarketLabel: "변경 예정 배송 마켓", currentPricePremise: "장바구니의 현재 가격과 구매 가능 여부는 이 마켓을 기준으로 합니다.", switchPreviewPremise: "대상 가격은 변경 제안이며, 확인이 완료되기 전에는 장바구니에 적용되지 않습니다.", currencyTransitionLabel: "통화 변경", proposedCurrencyLabel: "제안 통화", unitPriceTransitionLabel: "개당 가격 변경", lineSubtotalTransitionLabel: "수량 반영 상품 합계 변경", currentAmountLabel: "현재", targetAmountLabel: "변경 제안", unavailableTargetState: "변경 대상 마켓에서 구매 불가", confirm: "이 지역으로 배송받습니다", confirmSwitch: "변경 예정 마켓으로 전환", change: "지역 변경", required: "장바구니에 담기 전에 배송 지역을 확인해 주세요.", impactChanged: "장바구니 상태가 바뀌었습니다. 갱신된 변경 내용을 다시 확인해 주세요.", noConfirmedMarketPremise: "확인된 배송 마켓이 없습니다. 주문 전에 배송 마켓을 선택하고 확인해 주세요.", targetProjectionLabel: "선택한 마켓의 예상 가격", previewRegionLabel: "장바구니 마켓 변경 영향", reviewImpact: "변경 영향 확인", cancel: "취소" },
    cart: { title: "장바구니", empty: "장바구니가 비어있습니다", browse: "스타일 둘러보기", image: "이미지", unavailablePrice: "이 마켓에서 가격 미제공", priceReview: "가격 확인 필요", subtotal: "상품 합계", itemReview: "상품 확인 필요", shippingPending: "배송비·세금은 검증된 배송 견적에서 확정됩니다.", unavailableNotice: "현재 구매할 수 없는 상품이 있습니다. 안내된 상품을 제거하거나 다시 담아주세요.", unavailableCheckout: "주문 불가", checkout: "주문하기", checkoutConfirmationRequired: "배송 지역 확인 후 주문할 수 있습니다", itemsLabel: "장바구니 상품 목록", remove: "삭제", removing: "삭제 중…", quantityControl: "수량 조절", decreaseQuantity: "수량 줄이기", increaseQuantity: "수량 늘리기", targetProjectionUnitPrice: "선택한 마켓의 예상 개당 가격", targetProjectionLineSubtotal: "선택한 마켓의 예상 상품 합계", targetProjectionSubtotal: "선택한 마켓의 예상 장바구니 합계", targetProjectionNotice: "확인된 배송 마켓이 없어 이 금액은 제안값입니다. 마켓 확인 전에는 장바구니 가격 기준이 되지 않습니다.", integrityErrors: { VARIANT_PARENT_MISMATCH: "선택한 스타일과 옵션이 일치하지 않습니다.", STYLE_UNPUBLISHED: "현재 마켓에서 판매하지 않는 스타일입니다.", VARIANT_UNAVAILABLE: "현재 구매할 수 없는 옵션입니다.", VARIANT_PRICE_UNAVAILABLE: "현재 마켓 가격이 없습니다.", STOCK_INSUFFICIENT: "선택한 수량을 구매할 수 없습니다." } },
    checkout: checkoutKo(),
    login: { title: "로그인", subtitle: "가발 가상 피팅 플랫폼", consent: "로그인하면 개인정보 처리방침에 동의하게 됩니다.", continueGoogle: "Google로 계속하기", loading: "로그인 중…", error: "로그인 중 오류가 발생했습니다. 다시 시도해 주세요." },
    savedFitting: { back: "뒤로가기", title: "피팅 결과", source: "원본", result: "피팅", pending: "아직 처리 중입니다. 잠시 후 새로고침하세요.", failed: "피팅에 실패했습니다.", returnToProduct: "상품 페이지로 돌아가기" },
    order: orderCopy("ko"),
  },
  en: {
    common: { retry: "Try again", cartLoadError: "The cart could not be loaded.", checkoutLoadError: "Checkout could not be loaded." },
    nav: { home: "Home", styles: "Styles", cart: "Cart", orders: "Orders", login: "Sign in", signOut: "Sign out", defaultUser: "Customer", profile: "profile" },
    selector: { label: "Region and language", region: "Delivery region", language: "Language", preview: "Review changes", confirm: "Confirm change", cancel: "Cancel", impactChanged: "Your cart changed. Review the updated impact before confirming.", unavailable: "Unavailable" },
    home: { eyebrow: "Premium custom wig platform", title: "Compare and choose your custom wig with confidence", description: "Explore styles, compare designs, and continue to a virtual fitting experience.", primaryCta: "Browse styles", featured: "Featured styles", trust: "Prices and availability follow your selected delivery region.", delivery: "Shipping and tax remain pending a verified fulfillment quote." },
    styles: { title: "Wig styles", searchLabel: "Search styles", searchPlaceholder: "Search name or tag", search: "Search", all: "All", empty: "No styles found", emptyHint: "Try another keyword or category.", loadError: "The style list could not be loaded.", priceUnavailable: "Price unavailable", productLanguageNotice: "Product names and descriptions use the registered original content; its source language is unverified.", imageUnavailable: "No image", thumbnail: "wig thumbnail" },
    detail: { back: "Back to styles", imageUnavailable: "No image", productLanguageNotice: "This product uses the registered original content; its source language is unverified.", notFoundTitle: "Style not found", notFoundDescription: "This style does not exist or is no longer available.", relatedStyles: "Related styles" },
    product: { color: "Color", length: "Length", curl: "Curl", quantity: "Quantity", decreaseQuantity: "Decrease quantity", increaseQuantity: "Increase quantity", soldOut: "Sold out", adding: "Adding…", addToCart: "Add to cart", added: "Added to cart.", viewCart: "View cart" },
    marketConfirmation: { currentCartMarketLabel: "Current cart price authority", proposedTargetMarketLabel: "Proposed delivery market", currentPricePremise: "Current cart prices and availability remain governed by this market.", switchPreviewPremise: "Target prices are a proposal and do not apply to the cart until confirmation succeeds.", currencyTransitionLabel: "Currency change", proposedCurrencyLabel: "Proposed currency", unitPriceTransitionLabel: "Unit price change", lineSubtotalTransitionLabel: "Quantity-adjusted line subtotal change", currentAmountLabel: "Current", targetAmountLabel: "Proposed", unavailableTargetState: "Unavailable in the proposed market", confirm: "Confirm this delivery region", confirmSwitch: "Switch to the proposed market", change: "Change region", required: "Confirm your delivery region before adding to cart.", impactChanged: "Your cart changed. Review the refreshed impact before confirming.", noConfirmedMarketPremise: "No active delivery market is confirmed. Select and confirm one before checkout.", targetProjectionLabel: "Projected price for the selected market", previewRegionLabel: "Cart market switch impact", reviewImpact: "Review switch impact", cancel: "Cancel" },
    cart: { title: "Cart", empty: "Your cart is empty", browse: "Browse styles", image: "Image", unavailablePrice: "Price unavailable in this market", priceReview: "Price review required", subtotal: "Product subtotal", itemReview: "Item review required", shippingPending: "Shipping and tax will be set by a verified fulfillment quote.", unavailableNotice: "Some items are unavailable. Remove or reselect the indicated items.", unavailableCheckout: "Checkout unavailable", checkout: "Checkout", checkoutConfirmationRequired: "Confirm the delivery region to continue", itemsLabel: "Cart items", remove: "Remove", removing: "Removing…", quantityControl: "Quantity control", decreaseQuantity: "Decrease quantity", increaseQuantity: "Increase quantity", targetProjectionUnitPrice: "Projected unit price for the selected market", targetProjectionLineSubtotal: "Projected line subtotal for the selected market", targetProjectionSubtotal: "Projected cart subtotal for the selected market", targetProjectionNotice: "No delivery market is confirmed, so these amounts are proposals. They do not govern the cart until confirmation succeeds.", integrityErrors: { VARIANT_PARENT_MISMATCH: "The selected style and option do not match.", STYLE_UNPUBLISHED: "This style is not sold in the current market.", VARIANT_UNAVAILABLE: "This option is unavailable.", VARIANT_PRICE_UNAVAILABLE: "This market has no price for the item.", STOCK_INSUFFICIENT: "The selected quantity is unavailable." } },
    checkout: checkoutEn(),
    login: { title: "Sign in", subtitle: "Virtual wig fitting platform", consent: "By signing in, you agree to the privacy policy.", continueGoogle: "Continue with Google", loading: "Signing in…", error: "Sign-in failed. Please try again." },
    savedFitting: { back: "Back", title: "Fitting result", source: "Original", result: "Fitting", pending: "Still processing. Refresh shortly.", failed: "Fitting failed.", returnToProduct: "Return to product" },
    order: orderCopy("en"),
  },
  ja: {
    common: { retry: "もう一度試す", cartLoadError: "カートを読み込めませんでした。", checkoutLoadError: "注文情報を読み込めませんでした。" },
    nav: { home: "ホーム", styles: "スタイル", cart: "カート", orders: "注文履歴", login: "ログイン", signOut: "ログアウト", defaultUser: "お客様", profile: "プロフィール" },
    selector: { label: "地域と言語", region: "配送地域", language: "言語", preview: "変更内容を確認", confirm: "変更を確定", cancel: "キャンセル", impactChanged: "カートの状態が変わりました。内容をもう一度確認してください。", unavailable: "購入不可" },
    home: { eyebrow: "プレミアム・カスタムウィッグ", title: "自分に合うウィッグを比較して選びましょう", description: "スタイルを見比べ、気になるデザインからバーチャル試着へ進めます。", primaryCta: "スタイルを見る", featured: "おすすめスタイル", trust: "価格と購入可否は選択した配送地域に基づきます。", delivery: "送料と税金は、今後の検証済み配送見積もりで確定します。" },
    styles: { title: "ウィッグスタイル", searchLabel: "スタイル検索", searchPlaceholder: "名前またはタグを検索", search: "検索", all: "すべて", empty: "該当するスタイルがありません", emptyHint: "別のキーワードやカテゴリーをお試しください。", loadError: "スタイル一覧を読み込めませんでした。", priceUnavailable: "価格情報なし", productLanguageNotice: "商品名と説明は登録済みの原文で表示され、原文の言語は未確認です。", imageUnavailable: "画像なし", thumbnail: "ウィッグのサムネイル" },
    detail: { back: "スタイル一覧", imageUnavailable: "画像なし", productLanguageNotice: "この商品情報は登録済みの原文で表示され、原文の言語は未確認です。", notFoundTitle: "スタイルが見つかりません", notFoundDescription: "このスタイルは存在しないか、現在利用できません。", relatedStyles: "関連スタイル" },
    product: { color: "カラー", length: "長さ", curl: "カール", quantity: "数量", decreaseQuantity: "数量を減らす", increaseQuantity: "数量を増やす", soldOut: "在庫切れ", adding: "追加中…", addToCart: "カートに追加", added: "カートに追加しました。", viewCart: "カートを見る" },
    marketConfirmation: { currentCartMarketLabel: "現在のカート価格基準", proposedTargetMarketLabel: "変更先として提案する配送マーケット", currentPricePremise: "現在のカート価格と購入可否はこのマーケットに基づいています。", switchPreviewPremise: "変更先の価格は提案であり、確認が完了するまでカートには適用されません。", currencyTransitionLabel: "通貨の変更", proposedCurrencyLabel: "提案通貨", unitPriceTransitionLabel: "単価の変更", lineSubtotalTransitionLabel: "数量を反映した商品小計の変更", currentAmountLabel: "現在", targetAmountLabel: "変更後の提案", unavailableTargetState: "変更先マーケットでは購入不可", confirm: "この地域への配送を確認", confirmSwitch: "提案されたマーケットへ変更", change: "地域を変更", required: "カートに追加する前に配送地域を確認してください。", impactChanged: "カートの状態が変わりました。更新された変更内容をもう一度確認してください。", noConfirmedMarketPremise: "確認済みの配送マーケットがありません。注文前に配送マーケットを選択して確認してください。", targetProjectionLabel: "選択したマーケットでの予想価格", previewRegionLabel: "カートのマーケット変更による影響", reviewImpact: "変更内容を確認", cancel: "キャンセル" },
    cart: { title: "カート", empty: "カートは空です", browse: "スタイルを見る", image: "画像", unavailablePrice: "このマーケットでは価格未設定", priceReview: "価格の確認が必要", subtotal: "商品小計", itemReview: "商品の確認が必要", shippingPending: "送料と税金は検証済み配送見積もりで確定します。", unavailableNotice: "購入できない商品があります。該当商品を削除または選び直してください。", unavailableCheckout: "注文不可", checkout: "注文へ進む", checkoutConfirmationRequired: "配送地域を確認してから進んでください", itemsLabel: "カートの商品", remove: "削除", removing: "削除中…", quantityControl: "数量調整", decreaseQuantity: "数量を減らす", increaseQuantity: "数量を増やす", targetProjectionUnitPrice: "選択したマーケットでの予想単価", targetProjectionLineSubtotal: "選択したマーケットでの予想商品小計", targetProjectionSubtotal: "選択したマーケットでの予想カート小計", targetProjectionNotice: "確認済みの配送マーケットがないため、これらの金額は提案値です。確認が完了するまでカートの価格基準にはなりません。", integrityErrors: { VARIANT_PARENT_MISMATCH: "選択したスタイルとオプションが一致しません。", STYLE_UNPUBLISHED: "このマーケットでは販売していないスタイルです。", VARIANT_UNAVAILABLE: "このオプションは購入できません。", VARIANT_PRICE_UNAVAILABLE: "このマーケットの価格がありません。", STOCK_INSUFFICIENT: "選択した数量は購入できません。" } },
    checkout: checkoutJa(),
    login: { title: "ログイン", subtitle: "ウィッグのバーチャル試着プラットフォーム", consent: "ログインするとプライバシーポリシーに同意したものとみなされます。", continueGoogle: "Googleで続ける", loading: "ログイン中…", error: "ログインに失敗しました。もう一度お試しください。" },
    savedFitting: { back: "戻る", title: "試着結果", source: "元の写真", result: "試着", pending: "処理中です。しばらくしてから更新してください。", failed: "試着に失敗しました。", returnToProduct: "商品ページに戻る" },
    order: orderCopy("ja"),
  },
};

function orderCopy(locale: Locale) {
  const ko = locale === "ko";
  const ja = locale === "ja";
  const pick = (korean: string, english: string, japanese: string) => ko ? korean : ja ? japanese : english;
  return {
    metadataTitle: pick("주문 상세", "Order details", "注文詳細"),
    back: pick("← 내 주문", "← My orders", "← 注文履歴"),
    title: pick("주문 확인", "Order confirmation", "注文確認"),
    orderNumber: pick("주문번호", "Order number", "注文番号"),
    paidAt: pick("결제일", "Paid", "決済日時"),
    refundPendingReceived: pick("환불 요청이 접수되어 처리 중입니다.", "A refund request is being processed.", "返金リクエストを処理しています。"),
    refundPendingUnconfirmed: pick("환불 여부와 완료 시점은 아직 확정되지 않았습니다.", "Refund approval and completion timing are not yet confirmed.", "返金の可否と完了時期はまだ確定していません。"),
    items: pick("주문 상품", "Order items", "注文商品"),
    shippingInfo: pick("배송 정보", "Shipping information", "配送情報"),
    shippingPending: pick("배송지 정보 확인 중", "Shipping information is being checked", "配送先情報を確認しています"),
    paymentDetails: pick("결제 내역", "Payment details", "決済内容"),
    subtotal: pick("상품 합계", "Product subtotal", "商品小計"),
    shipping: pick("배송비", "Shipping", "送料"),
    shippingPolicyPending: pick("배송비 정책 확정 전", "Shipping policy pending", "送料ポリシー未確定"),
    taxDuty: pick("세금·관세", "Tax and duties", "税金・関税"),
    taxPending: pick("세금·관세는 정책 확정 전이며, 현재 주문 금액으로 별도 계산하지 않았습니다.", "Tax and duties are pending policy and were not added to this order amount.", "税金・関税はポリシー未確定のため、この注文金額には加算されていません。"),
    totalPaid: pick("총 결제 금액", "Total paid", "お支払い合計"),
    paymentStatus: pick("결제 상태", "Payment status", "決済状態"),
    paymentAmount: pick("결제 금액", "Payment amount", "決済金額"),
    paymentMethod: pick("결제 수단", "Payment method", "決済方法"),
    paymentSucceeded: pick("결제 완료", "Payment complete", "決済完了"),
    paymentChecking: pick("결제 확인 중", "Checking payment", "決済確認中"),
    paymentFailed: pick("결제 실패", "Payment failed", "決済失敗"),
    paymentVoided: pick("결제 취소", "Payment canceled", "決済取消"),
    paymentUnknown: pick("결제 상태 확인 중", "Payment status unavailable", "決済状態を確認しています"),
    orderStatusPaid: pick("결제 완료", "Paid", "決済完了"),
    orderStatusCancelled: pick("주문 취소", "Order canceled", "注文取消"),
    orderStatusRefundPending: pick("환불 요청 처리 중", "Refund request processing", "返金リクエスト処理中"),
    orderStatusPartiallyRefunded: pick("부분 환불", "Partially refunded", "一部返金済み"),
    orderStatusRefunded: pick("환불 완료", "Refunded", "返金完了"),
    orderStatusUnknown: pick("상태 확인 중", "Status unavailable", "状態を確認しています"),
    tossMethod: pick("국내 카드 결제", "Domestic card payment", "韓国国内カード決済"),
    eximbayMethod: pick("해외 카드 결제", "International card payment", "海外カード決済"),
    mockMethod: pick("테스트 결제", "Test payment", "テスト決済"),
    otherMethod: pick("온라인 결제", "Online payment", "オンライン決済"),
    refundDetails: pick("환불 내역", "Refund details", "返金内容"),
    refundPending: pick("환불 처리 중", "Refund processing", "返金処理中"),
    partialRefund: pick("부분 환불 완료", "Partial refund complete", "一部返金完了"),
    fullRefund: pick("전액 환불 완료", "Full refund complete", "全額返金完了"),
    completedRefundAmount: pick("완료된 환불 금액", "Completed refund amount", "返金完了額"),
    latestRefundDate: pick("최근 환불 완료일", "Latest refund completion", "最新の返金完了日時"),
    orderList: pick("주문 목록", "Order list", "注文履歴"),
    browseStyles: pick("스타일 둘러보기", "Browse styles", "スタイルを見る"),
    postOrderNav: pick("주문 후 이동", "Order navigation", "注文後の移動"),
    productFallback: pick("상품 정보 확인 중", "Product information unavailable", "商品情報を確認しています"),
    optionFallback: pick("옵션 정보 확인 중", "Option information unavailable", "オプション情報を確認しています"),
    mto: pick("주문 제작", "Made to order", "受注製作"),
    stocked: pick("재고 상품", "Stocked item", "在庫商品"),
    fulfillmentUnknown: pick("상품 유형 확인 중", "Item type unavailable", "商品種別を確認しています"),
    countryKR: pick("대한민국", "South Korea", "韓国"),
    countryUS: pick("미국", "United States", "米国"),
    countryJP: pick("일본", "Japan", "日本"),
    shippingMemo: pick("배송 메모", "Delivery note", "配送メモ"),
    currencyMissing: pick("통화 코드 없음", "Currency code missing", "通貨コードなし"),
    storedMinorUnit: pick("저장된 최소 단위", "stored minor units", "保存済み最小単位"),
    decimalUnavailable: pick("소수 자릿수 확인 불가", "decimal digits unavailable", "小数桁不明"),
    intake: {
      title: pick("환불 검토 요청", "Refund review request", "返金審査リクエスト"),
      intro: pick("환불 가능 여부 검토를 요청할 수 있습니다. 요청만으로 환불 가능 여부나 금액은 확정되지 않습니다.", "You can request a refund review. A request does not confirm eligibility or amount.", "返金可否の審査を依頼できます。依頼だけでは返金の可否や金額は確定しません。"),
      newRequest: pick("새 환불 검토 요청", "New refund review request", "新しい返金審査リクエスト"),
      submitTitle: pick("환불 검토 요청 접수", "Submit refund review request", "返金審査を依頼"),
      serverRecheck: pick("접수 가능 여부는 요청 시점에 서버가 다시 확인합니다.", "Eligibility is checked again when you submit.", "送信時に受付可否を再確認します。"),
      reason: pick("요청 사유", "Reason", "理由"),
      submittedAt: pick("접수 시각", "Submitted", "受付日時"),
      withdrawnAt: pick("철회 시각", "Withdrawn", "取下日時"),
      detail: pick("요청 내용", "Request details", "依頼内容"),
      optional: pick("선택", "optional", "任意"),
      plainText: pick("일반 텍스트와 줄바꿈만 입력할 수 있습니다.", "Use plain text and line breaks only.", "通常のテキストと改行のみ入力できます。"),
      noSecrets: pick("카드번호·계좌번호·비밀번호 등 결제/인증 정보는 입력하지 마세요.", "Do not enter card, bank-account, password, or authentication details.", "カード番号・口座番号・パスワードなどの決済・認証情報は入力しないでください。"),
      withdraw: pick("환불 검토 요청 철회", "Withdraw refund review request", "返金審査リクエストを取り下げる"),
      withdrawQuestion: pick("환불 검토 요청을 철회하시겠습니까?", "Withdraw this refund review request?", "この返金審査リクエストを取り下げますか？"),
      orderUnchanged: pick("주문과 결제는 그대로 유지됩니다.", "The order and payment remain unchanged.", "注文と決済は変更されません。"),
      cancel: pick("취소", "Cancel", "キャンセル"),
      withdrawing: pick("철회 처리 중...", "Withdrawing…", "取下げ処理中…"),
      withdrawAction: pick("요청 철회", "Withdraw request", "リクエストを取り下げる"),
      submitting: pick("요청 접수 중...", "Submitting…", "送信中…"),
      submitAction: pick("환불 검토 요청 접수", "Submit refund review request", "返金審査を依頼"),
      chooseReason: pick("요청 사유를 선택해주세요.", "Choose a reason.", "理由を選択してください。"),
      detailTooLong: pick("요청 내용은 500자 이내로 입력해주세요.", "Keep request details within 500 characters.", "依頼内容は500文字以内で入力してください。"),
      reasons: {
        changeOfMind: pick("단순 변심", "Changed my mind", "お客様都合"),
        productDefect: pick("상품 하자", "Product defect", "商品不良"),
        deliveryIssue: pick("배송 문제·지연", "Delivery issue or delay", "配送問題・遅延"),
        other: pick("기타", "Other", "その他"),
        unknown: pick("사유 확인 필요", "Reason unavailable", "理由を確認しています"),
      },
      statuses: {
        submitted: pick("접수됨", "Submitted", "受付済み"), withdrawn: pick("철회됨", "Withdrawn", "取下げ済み"),
        rejected: pick("온라인 진행 불가", "Online request unavailable", "オンライン手続き不可"), approved: pick("승인됨", "Approved", "承認済み"),
        unknown: pick("상태 확인 필요", "Status unavailable", "状態を確認しています"),
      },
      lifecycle: {
        submitted: [pick("환불 검토 요청이 접수되었습니다.", "Your refund review request was submitted.", "返金審査リクエストを受け付けました。"), pick("환불 가능 여부 확인 후 안내드립니다.", "We will notify you after reviewing eligibility.", "返金可否の確認後にご案内します。")],
        withdrawn: [pick("환불 검토 요청이 철회되었습니다.", "Your refund review request was withdrawn.", "返金審査リクエストを取り下げました。")],
        rejected: [pick("온라인 환불 요청을 진행할 수 없습니다.", "This refund request cannot continue online.", "オンラインでは返金手続きを進められません。"), pick("자세한 내용은 고객센터로 문의해주세요.", "Contact customer support for details.", "詳細はカスタマーサポートへお問い合わせください。")],
        approved: [pick("환불 검토 요청이 승인되었습니다.", "Your refund review request was approved.", "返金審査リクエストが承認されました。"), pick("진행 상황은 위 주문 상태에서 확인할 수 있습니다.", "Check the order status above for progress.", "進捗は上の注文状態で確認できます。")],
        unknown: [pick("환불 검토 요청 상태를 확인하고 있습니다.", "We are checking the request status.", "返金審査リクエストの状態を確認しています。")],
      },
      featureDisabled: [pick("온라인 환불 검토 요청은 현재 제공되지 않습니다.", "Online refund review requests are currently unavailable.", "オンラインでの返金審査リクエストは現在利用できません。"), pick("고객센터로 문의해주세요.", "Contact customer support.", "カスタマーサポートへお問い合わせください。")],
      orderUnavailable: [pick("현재 주문 상태에서는 환불 검토 요청을 접수할 수 없습니다.", "A refund review request is unavailable for this order status.", "現在の注文状態では返金審査を依頼できません。"), pick("자세한 내용은 고객센터로 문의해주세요.", "Contact customer support for details.", "詳細はカスタマーサポートへお問い合わせください。")],
      unavailable: [pick("현재 이 주문에서는 온라인 환불 검토 요청을 이용할 수 없습니다.", "Online refund review is unavailable for this order.", "この注文ではオンライン返金審査を利用できません。"), pick("고객센터로 문의해주세요.", "Contact customer support.", "カスタマーサポートへお問い合わせください。")],
      replayedSame: pick("동일한 환불 검토 요청이 이미 접수되어 있습니다.", "The same refund review request is already submitted.", "同じ返金審査リクエストはすでに受け付けられています。"),
      replayedDifferent: pick("이미 접수된 요청이 유지됩니다. 새로 입력한 내용은 저장되지 않았습니다.", "The existing request remains; new details were not saved.", "受付済みのリクエストが維持され、新しい内容は保存されませんでした。"),
      alreadyWithdrawn: pick("이미 철회된 요청입니다.", "This request was already withdrawn.", "このリクエストはすでに取り下げられています。"),
      unexpected: pick("처리 결과를 확인하지 못했습니다. 잠시 후 새로고침된 상태를 확인해 주세요.", "The result could not be confirmed. Refresh shortly to check the latest state.", "処理結果を確認できませんでした。しばらくしてから更新し、最新の状態をご確認ください。"),
      unauthenticated: pick("로그인이 만료되었습니다. 다시 로그인한 뒤 시도해주세요.", "Your sign-in expired. Sign in and try again.", "ログインの有効期限が切れました。再度ログインしてお試しください。"),
      invalidInput: pick("입력 내용을 확인해주세요.", "Check the information entered.", "入力内容をご確認ください。"),
      invalidDetail: pick("요청 내용에 사용할 수 없는 문자가 포함되어 있습니다. 일반 텍스트와 줄바꿈만 입력해주세요.", "Request details contain unsupported characters. Use plain text and line breaks only.", "依頼内容に使用できない文字があります。通常のテキストと改行のみ入力してください。"),
      notFound: pick("주문 또는 요청 정보를 확인할 수 없습니다. 최신 상태를 확인해주세요.", "The order or request could not be found. Check the latest state.", "注文またはリクエストを確認できません。最新の状態をご確認ください。"),
      submitUnavailable: pick("현재 환불 검토 요청을 처리할 수 없습니다. 최신 상태를 확인해주세요.", "The refund review request cannot be processed now. Check the latest state.", "現在、返金審査リクエストを処理できません。最新の状態をご確認ください。"),
      invalidRequest: pick("요청 정보를 확인해주세요.", "Check the request information.", "リクエスト情報をご確認ください。"),
      withdrawUnavailable: pick("현재 요청은 철회할 수 없습니다. 최신 상태를 확인해주세요.", "This request cannot be withdrawn now. Check the latest state.", "現在このリクエストは取り下げられません。最新の状態をご確認ください。"),
    },
  } as const;
}

function checkoutKo(): StorefrontMessages["checkout"] { return checkoutCopy("ko"); }
function checkoutEn(): StorefrontMessages["checkout"] { return checkoutCopy("en"); }
function checkoutJa(): StorefrontMessages["checkout"] { return checkoutCopy("ja"); }

function checkoutCopy(locale: Locale): StorefrontMessages["checkout"] {
  const ko = locale === "ko";
  const ja = locale === "ja";
  const pick = (korean: string, english: string, japanese: string) => ko ? korean : ja ? japanese : english;
  return {
    back: pick("장바구니", "Cart", "カート"), title: pick("주문서 작성", "Checkout", "注文情報"), introBeforeAmount: pick("상품 합계", "Enter a shipping address for the", "商品小計"), introAfterAmount: pick("기준으로 배송지를 입력합니다. 제출 시 마켓을 다시 검증합니다.", "subtotal. The market is revalidated on submit.", "を基準に配送先を入力してください。送信時にマーケットを再確認します。"),
    address: pick("배송지", "Shipping address", "配送先"), selectedMarket: pick("선택 마켓", "Selected market", "選択マーケット"), shippingCountry: pick("배송 국가", "Shipping country", "配送国"), marketCountryPremise: pick("주문서는 선택한 마켓의 배송 국가로 생성됩니다.", "The checkout uses the selected market's shipping country.", "注文書は選択マーケットの配送国で作成されます。"), recipientName: pick("받는 분 이름", "Recipient name", "受取人名"), phone: pick("전화번호", "Phone", "電話番号"), postalCode: pick("우편번호", "Postal code", "郵便番号"), administrativeArea: pick("시/도", "State / Province", "都道府県"), city: pick("도시", "City", "市区町村"), addressLine1: pick("주소", "Address", "住所"), addressLine2: pick("상세주소 (선택)", "Address line 2 (optional)", "建物名・部屋番号（任意）"), memo: pick("배송 메모 (선택)", "Delivery note (optional)", "配送メモ（任意）"), memoPlaceholder: pick("배송 요청사항", "Delivery instructions", "配送に関する希望"), select: pick("선택하세요", "Select", "選択してください"), creating: pick("주문서 생성 중…", "Creating checkout…", "注文書を作成中…"), recreate: pick("주문서 다시 생성", "Recreate checkout", "注文書を再作成"), create: pick("주문서 생성", "Create checkout", "注文書を作成"), items: pick("주문 상품", "Order items", "注文商品"), subtotal: pick("상품 합계", "Product subtotal", "商品小計"), cartSnapshotNotice: pick("배송비·세금·관세는 아직 확정되지 않았습니다.", "Shipping, tax, and duties are not yet finalized.", "送料・税金・関税はまだ確定していません。"), sessionSnapshot: pick("주문서 스냅샷", "Checkout snapshot", "注文書スナップショット"), shipping: pick("배송비", "Shipping", "送料"), taxDuty: pick("세금·관세", "Tax and duties", "税金・関税"), taxPending: pick("정책 확정 전 - 금액으로 계산하지 않았습니다.", "Policy pending — no amount has been calculated.", "ポリシー未確定のため金額は計算されていません。"), total: pick("총 결제 예정 금액", "Expected total", "お支払い予定額"), sessionNotice: pick("결제는 생성된 주문서 스냅샷 기준입니다. 배송지를 수정하면 다시 생성해 주세요.", "Payment uses this checkout snapshot. Recreate it after changing the address.", "決済はこの注文書スナップショットに基づきます。配送先を変更した場合は再作成してください。"), shippingPolicyPending: pick("배송비 정책 확정 전", "Shipping policy pending", "送料ポリシー未確定"),
    resumeTitle: pick("저장된 주문서", "Saved checkout", "保存済みの注文書"), frozenMarket: pick("주문서 마켓", "Checkout market", "注文書マーケット"), frozenShipping: pick("확정된 배송지", "Frozen shipping address", "確定済みの配送先"), changeShipping: pick("배송지 변경 · 새 주문서 시작", "Change shipping · start a new checkout", "配送先を変更・新しい注文書を開始"), resumeUnavailableTitle: pick("주문서를 불러올 수 없습니다", "Checkout unavailable", "注文書を読み込めません"), resumeUnavailableDescription: pick("주문서가 없거나 접근 권한이 없습니다.", "The checkout does not exist or is not available to this account.", "注文書が存在しないか、このアカウントでは利用できません。"), resumeExpired: pick("이 주문서는 만료되어 결제를 시작할 수 없습니다.", "This checkout has expired and cannot start payment.", "この注文書は期限切れのため決済を開始できません。"), resumeCompleted: pick("이 주문서는 이미 완료되었습니다.", "This checkout is already complete.", "この注文書はすでに完了しています。"), resumePaymentExists: pick("이 주문서에는 이미 결제 시도가 있습니다. 상태를 확인해 주세요.", "This checkout already has a payment attempt. Check its status.", "この注文書には決済試行があります。状態を確認してください。"), resumeTerminal: pick("이 주문서는 현재 결제에 사용할 수 없습니다.", "This checkout cannot currently be used for payment.", "この注文書は現在決済に利用できません。"), viewPaymentStatus: pick("결제 상태 확인", "Check payment status", "決済状態を確認"), viewOrder: pick("주문 보기", "View order", "注文を見る"), recoveryTitle: pick("결제 상태 확인", "Check payment status", "決済状態を確認"), recoveryDescription: pick("이전 결제가 현재 조회되는지 확인한 뒤, 안전한 경우에만 새 결제를 시작할 수 있습니다. 이후 성공 알림이 올 가능성은 계속 관리됩니다.", "Check whether the previous payment is currently observed. A new payment becomes available only when it is safe; a later success can still be handled.", "以前の決済が現在確認できるかを照会し、安全な場合のみ新しい決済を開始できます。後から成功通知が届く可能性も引き続き管理されます。"), recoveryAction: pick("결제 상태 확인 및 복구", "Check status and recover", "状態を確認して復旧"), recoveryChecking: pick("결제 상태 확인 중…", "Checking payment status…", "決済状態を確認中…"), recoveryObserved: pick("결제 거래가 확인되어 새 결제를 열지 않았습니다.", "A payment transaction was observed, so a new payment was not enabled.", "決済取引が確認されたため、新しい決済は有効になりませんでした。"), recoveryUnknown: pick("결제 상태를 신뢰할 수 있게 확인하지 못해 새 결제를 열지 않았습니다.", "The payment status could not be established reliably, so a new payment was not enabled.", "決済状態を信頼できる形で確認できなかったため、新しい決済は有効になりませんでした。"), recoveryUnavailable: pick("현재 결제 상태 복구를 사용할 수 없습니다.", "Payment status recovery is currently unavailable.", "現在、決済状態の復旧は利用できません。"),
    errors: {
      UNAUTHORIZED: pick("다시 로그인해 주세요.", "Please sign in again.", "もう一度ログインしてください。"), MARKET_CONFIRMATION_REQUIRED: pick("배송 지역을 먼저 확인해 주세요.", "Confirm the delivery region first.", "先に配送地域を確認してください。"), MARKET_CHANGED: pick("배송 지역이 변경되었습니다. 장바구니에서 가격을 다시 확인해 주세요.", "The delivery region changed. Review prices in the cart.", "配送地域が変わりました。カートで価格を確認してください。"), CART_EMPTY: pick("장바구니가 비어 있습니다.", "Your cart is empty.", "カートは空です。"), VARIANT_PRICE_UNAVAILABLE: pick("가격이 없는 상품이 있습니다.", "An item has no price in this market.", "価格が設定されていない商品があります。"), SHIPPING_COUNTRY_INVALID: pick("배송 국가가 올바르지 않습니다.", "The shipping country is invalid.", "配送国が無効です。"), SHIPPING_ADDRESS_INVALID: pick("배송지 필수 항목을 확인해 주세요.", "Check the required address fields.", "配送先の必須項目を確認してください。"), TOTAL_AMOUNT_TOO_LOW: pick("결제 가능한 최소 금액에 미달합니다.", "The total is below the minimum payment amount.", "決済可能な最低金額を下回っています。"),
    },
    payment: { title: pick("결제 방법", "Payment method", "決済方法"), cardPending: pick("카드 결제 (준비 중)", "Card payment (coming soon)", "カード決済（準備中）"), cardDisabled: pick("실제 결제 연동은 아직 비활성화되어 있습니다.", "Live payment is not enabled.", "実決済はまだ有効化されていません。"), overseasPending: pick("해외 결제 (준비 중)", "International payment (coming soon)", "海外決済（準備中）"), overseasDisabled: pick("해외 결제 수단은 정책 확정 후 열립니다.", "International methods open after policy approval.", "海外決済はポリシー確定後に提供します。"), internationalCardTitle: pick("해외 카드 결제", "International card payment", "海外カード決済"), internationalCardDescription: pick("안전한 해외 카드 결제창에서 결제를 진행합니다.", "Continue in the secure international card checkout.", "安全な海外カード決済画面で決済を続けます。"), internationalCardStart: pick("해외 카드로 결제", "Pay by international card", "海外カードで支払う"), internationalCardProcessing: pick("해외 카드 결제 준비 중…", "Preparing international card payment…", "海外カード決済を準備中…"), unavailableCard: pick("현재 사용할 수 있는 카드 결제 수단이 없습니다.", "Card payment is currently unavailable.", "現在利用できるカード決済方法がありません。"), mockTitle: pick("테스트 결제 (MOCK)", "Test payment (MOCK)", "テスト決済（MOCK）"), mockDescription: pick("개발 환경에서만 주문 생성을 확인하며 실제 결제는 발생하지 않습니다.", "Development-only order creation; no real payment occurs.", "開発環境専用で、実際の決済は発生しません。"), processing: pick("테스트 결제 처리 중…", "Processing test payment…", "テスト決済を処理中…"), orders: pick("주문 내역 보기", "View orders", "注文履歴を見る"), success: pick("테스트 주문이 생성되었습니다.", "Test order created.", "テスト注文が作成されました。"), initiationInProgress: pick("결제 준비가 처리 중입니다. 주문 내역에서 확인해 주세요.", "Payment preparation is still processing. Check Orders.", "決済準備を処理中です。注文履歴で確認してください。"), outcomeUnknown: pick("결제 결과를 확인 중입니다. 자동으로 다시 결제하지 마세요.", "The payment outcome is being checked. Do not retry automatically.", "決済結果を確認中です。自動で再決済しないでください。"), remediationRequired: pick("이 주문서의 결제 문제를 확인 중입니다.", "A payment issue for this checkout is under review.", "この注文書の決済問題を確認中です。"), unavailableMock: pick("사용 가능한 테스트 결제 수단이 없습니다.", "No test payment method is available.", "利用可能なテスト決済方法がありません。"), confirmationUnexpected: pick("결제 확인 결과 형식이 올바르지 않습니다.", "The payment confirmation result was unexpected.", "決済確認結果の形式が正しくありません。"), checkingState: pick("결제 처리 상태 확인", "Check payment status", "決済状態を確認"), checkingOutcome: pick("결제 결과 확인 중", "Checking payment outcome", "決済結果を確認中"), checkingProblem: pick("결제 문제 확인 중", "Reviewing payment issue", "決済問題を確認中"), checkingOrders: pick("주문 내역에서 확인", "Check Orders", "注文履歴で確認"), completed: pick("테스트 주문 생성 완료", "Test order created", "テスト注文作成完了"), retry: pick("주문서 다시 생성 후 재시도", "Recreate checkout and retry", "注文書を再作成して再試行"), start: pick("테스트 결제 진행", "Run test payment", "テスト決済を実行"), orderProcessing: pick("결제가 처리 중입니다. 주문 내역에서 확인해 주세요.", "Payment is processing. Check Orders.", "決済を処理中です。注文履歴で確認してください。"), errors: COMMON_PAYMENT_ERRORS[locale], fallbackError: pick("결제를 완료할 수 없습니다. 주문서를 다시 생성해 주세요.", "Payment could not be completed. Recreate the checkout.", "決済を完了できません。注文書を再作成してください。"), },
  };
}

export function messagesFor(locale: Locale): StorefrontMessages {
  return MESSAGES[locale];
}

export function messageDictionaries(): Readonly<Record<Locale, StorefrontMessages>> {
  return MESSAGES;
}
