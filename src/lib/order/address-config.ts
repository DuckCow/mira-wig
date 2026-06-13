// ============================================================
// lib/order/address-config.ts — 국가별 주소 폼 설정
// 클라이언트 안전, server-only 없음
// ============================================================

export interface AdminAreaOption {
  value: string;
  label: string;
}

export interface CountryFormConfig {
  countryCode: string;
  postalCodeLabel: string;
  postalCodePattern: RegExp;
  postalCodePlaceholder: string;
  administrativeAreaLabel: string;
  administrativeAreaRequired: boolean;
  administrativeAreaOptions: AdminAreaOption[] | null; // null = 자유 입력
  cityLabel: string;
  phonePrefix: string;
  phonePattern: RegExp;
  phonePlaceholder: string;
}

const US_STATES: AdminAreaOption[] = [
  { value: "AL", label: "Alabama" }, { value: "AK", label: "Alaska" },
  { value: "AZ", label: "Arizona" }, { value: "AR", label: "Arkansas" },
  { value: "CA", label: "California" }, { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" }, { value: "DE", label: "Delaware" },
  { value: "DC", label: "District of Columbia" }, { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" }, { value: "HI", label: "Hawaii" },
  { value: "ID", label: "Idaho" }, { value: "IL", label: "Illinois" },
  { value: "IN", label: "Indiana" }, { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" }, { value: "KY", label: "Kentucky" },
  { value: "LA", label: "Louisiana" }, { value: "ME", label: "Maine" },
  { value: "MD", label: "Maryland" }, { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" }, { value: "MN", label: "Minnesota" },
  { value: "MS", label: "Mississippi" }, { value: "MO", label: "Missouri" },
  { value: "MT", label: "Montana" }, { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" }, { value: "NH", label: "New Hampshire" },
  { value: "NJ", label: "New Jersey" }, { value: "NM", label: "New Mexico" },
  { value: "NY", label: "New York" }, { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" }, { value: "OH", label: "Ohio" },
  { value: "OK", label: "Oklahoma" }, { value: "OR", label: "Oregon" },
  { value: "PA", label: "Pennsylvania" }, { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" }, { value: "SD", label: "South Dakota" },
  { value: "TN", label: "Tennessee" }, { value: "TX", label: "Texas" },
  { value: "UT", label: "Utah" }, { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" }, { value: "WA", label: "Washington" },
  { value: "WV", label: "West Virginia" }, { value: "WI", label: "Wisconsin" },
  { value: "WY", label: "Wyoming" },
];

const JP_PREFECTURES: AdminAreaOption[] = [
  { value: "北海道", label: "北海道" }, { value: "青森県", label: "青森県" },
  { value: "岩手県", label: "岩手県" }, { value: "宮城県", label: "宮城県" },
  { value: "秋田県", label: "秋田県" }, { value: "山形県", label: "山形県" },
  { value: "福島県", label: "福島県" }, { value: "茨城県", label: "茨城県" },
  { value: "栃木県", label: "栃木県" }, { value: "群馬県", label: "群馬県" },
  { value: "埼玉県", label: "埼玉県" }, { value: "千葉県", label: "千葉県" },
  { value: "東京都", label: "東京都" }, { value: "神奈川県", label: "神奈川県" },
  { value: "新潟県", label: "新潟県" }, { value: "富山県", label: "富山県" },
  { value: "石川県", label: "石川県" }, { value: "福井県", label: "福井県" },
  { value: "山梨県", label: "山梨県" }, { value: "長野県", label: "長野県" },
  { value: "岐阜県", label: "岐阜県" }, { value: "静岡県", label: "静岡県" },
  { value: "愛知県", label: "愛知県" }, { value: "三重県", label: "三重県" },
  { value: "滋賀県", label: "滋賀県" }, { value: "京都府", label: "京都府" },
  { value: "大阪府", label: "大阪府" }, { value: "兵庫県", label: "兵庫県" },
  { value: "奈良県", label: "奈良県" }, { value: "和歌山県", label: "和歌山県" },
  { value: "鳥取県", label: "鳥取県" }, { value: "島根県", label: "島根県" },
  { value: "岡山県", label: "岡山県" }, { value: "広島県", label: "広島県" },
  { value: "山口県", label: "山口県" }, { value: "徳島県", label: "徳島県" },
  { value: "香川県", label: "香川県" }, { value: "愛媛県", label: "愛媛県" },
  { value: "高知県", label: "高知県" }, { value: "福岡県", label: "福岡県" },
  { value: "佐賀県", label: "佐賀県" }, { value: "長崎県", label: "長崎県" },
  { value: "熊本県", label: "熊本県" }, { value: "大分県", label: "大分県" },
  { value: "宮崎県", label: "宮崎県" }, { value: "鹿児島県", label: "鹿児島県" },
  { value: "沖縄県", label: "沖縄県" },
];

export const COUNTRY_FORM_CONFIGS: Record<string, CountryFormConfig> = {
  KR: {
    countryCode: "KR",
    postalCodeLabel: "우편번호",
    postalCodePattern: /^\d{5}$/,
    postalCodePlaceholder: "12345",
    administrativeAreaLabel: "시·도 (선택)",
    administrativeAreaRequired: false,
    administrativeAreaOptions: null,
    cityLabel: "시·군·구",
    phonePrefix: "+82",
    phonePattern: /^0\d{1,2}-\d{3,4}-\d{4}$/,
    phonePlaceholder: "010-1234-5678",
  },
  US: {
    countryCode: "US",
    postalCodeLabel: "ZIP Code",
    postalCodePattern: /^\d{5}(-\d{4})?$/,
    postalCodePlaceholder: "90210",
    administrativeAreaLabel: "State",
    administrativeAreaRequired: true,
    administrativeAreaOptions: US_STATES,
    cityLabel: "City",
    phonePrefix: "+1",
    phonePattern: /^\d{3}-\d{3}-\d{4}$/,
    phonePlaceholder: "555-123-4567",
  },
  JP: {
    countryCode: "JP",
    postalCodeLabel: "郵便番号",
    postalCodePattern: /^\d{3}-\d{4}$/,
    postalCodePlaceholder: "150-0001",
    administrativeAreaLabel: "都道府県",
    administrativeAreaRequired: true,
    administrativeAreaOptions: JP_PREFECTURES,
    cityLabel: "市区町村",
    phonePrefix: "+81",
    phonePattern: /^0\d{1,4}-\d{1,4}-\d{4}$/,
    phonePlaceholder: "090-1234-5678",
  },
};
