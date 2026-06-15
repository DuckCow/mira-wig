import "dotenv/config";
import { PrismaClient, WigCategory } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ── 통화 최소단위 규칙 ────────────────────────────────────────
//   KRW (zero-decimal): ₩30,000 → 30000
//   USD (2-decimal):    $29.99  → 2999  (센트 단위)
//   JPY (zero-decimal): ¥1,500  → 1500

const MARKET_CODES = ["KR", "US", "JP"] as const;
type MarketCode = (typeof MARKET_CODES)[number];

const markets: {
  code: MarketCode;
  currency: string;
  shippableCountries: string[];
  defaultLocale: string;
}[] = [
  { code: "KR", currency: "KRW", shippableCountries: ["KR"], defaultLocale: "ko" },
  { code: "US", currency: "USD", shippableCountries: ["US"], defaultLocale: "en" },
  { code: "JP", currency: "JPY", shippableCountries: ["JP"], defaultLocale: "ja" },
];

// ── 조합 생성 헬퍼 ────────────────────────────────────────────

const STOCK = 50;

type ColorDef = { name: string; hex: string; code: string };
type LengthDef = { value: string; code: string };
type CurlDef = { value: string; code: string };

function makeVariants(
  prefix: string,
  colors: ColorDef[],
  lengths: LengthDef[],
  curls: CurlDef[],
  krwPrice: number,
) {
  return colors.flatMap((c) =>
    lengths.flatMap((l) =>
      curls.map((cu) => ({
        color: c.name,
        colorHex: c.hex,
        length: l.value,
        curl: cu.value,
        price: krwPrice, // KRW 기준가 (장바구니 하위 호환)
        stock: STOCK,
        sku: `${prefix}-${c.code}-${l.code}-${cu.code}`,
      })),
    ),
  );
}

// ── 색상 팔레트 ───────────────────────────────────────────────

const BLACK:       ColorDef = { name: "블랙",       hex: "#1A1A1A", code: "BLK" };
const DARK_BROWN:  ColorDef = { name: "다크브라운", hex: "#3B2314", code: "DBR" };
const NAT_BROWN:   ColorDef = { name: "자연갈색",   hex: "#6B4C3B", code: "NBR" };
const ASH_BROWN:   ColorDef = { name: "애쉬브라운", hex: "#8D7B6A", code: "ASH" };
const HONEY_BLOND: ColorDef = { name: "허니블론드", hex: "#C9A84C", code: "HON" };
const BURGUNDY:    ColorDef = { name: "버건디",     hex: "#6B1C2C", code: "BRG" };
const ROSE_PINK:   ColorDef = { name: "로즈핑크",   hex: "#E8A0B4", code: "PNK" };
const ASH_GRAY:    ColorDef = { name: "애쉬그레이", hex: "#9A9DA0", code: "GRY" };
const WHITE:       ColorDef = { name: "화이트",     hex: "#F5F5F5", code: "WHT" };

const SHORT:  LengthDef = { value: "short",  code: "S" };
const MEDIUM: LengthDef = { value: "medium", code: "M" };
const LONG:   LengthDef = { value: "long",   code: "L" };

const STRAIGHT: CurlDef = { value: "straight", code: "ST" };
const WAVY:     CurlDef = { value: "wavy",     code: "WV" };
const CURLY:    CurlDef = { value: "curly",    code: "CU" };

// ── 스타일 정의 ───────────────────────────────────────────────
// marketPrices: KR=KRW 최소단위, US=USD 센트, JP=JPY 최소단위

type StyleDef = {
  name: string;
  description: string;
  category: WigCategory;
  tags: string[];
  sortOrder: number;
  variants: ReturnType<typeof makeVariants>;
  marketPrices: Record<MarketCode, number>;
};

const styles: StyleDef[] = [
  // ── HAIR_LOSS ─────────────────────────────────────────────
  {
    name: "실크 스트레이트",
    description: "자연스러운 윤기의 생머리 스타일. 탈모 고민을 자신감으로.",
    category: WigCategory.HAIR_LOSS,
    tags: ["생머리", "탈모", "자연스러움"],
    sortOrder: 10,
    variants: makeVariants("HL-SLKST", [BLACK, NAT_BROWN, ASH_BROWN], [MEDIUM, LONG], [STRAIGHT, WAVY], 85000),
    marketPrices: { KR: 85000, US: 7799, JP: 9800 },
  },
  {
    name: "클린 볼륨 미디",
    description: "어깨선 미디 길이, 자연스러운 볼륨. 일상 탈모 커버에 최적.",
    category: WigCategory.HAIR_LOSS,
    tags: ["미디", "탈모", "데일리", "볼륨"],
    sortOrder: 20,
    variants: makeVariants("HL-CLNVL", [BLACK, DARK_BROWN, NAT_BROWN], [SHORT, MEDIUM], [STRAIGHT, WAVY], 75000),
    marketPrices: { KR: 75000, US: 6899, JP: 8600 },
  },
  // ── FASHION ───────────────────────────────────────────────
  {
    name: "비치 웨이브",
    description: "해변에서 막 나온 듯한 자연스러운 웨이브. 볼륨감과 생동감.",
    category: WigCategory.FASHION,
    tags: ["웨이브", "패션", "여름", "볼륨"],
    sortOrder: 30,
    variants: makeVariants("FA-BCHWV", [HONEY_BLOND, NAT_BROWN, BURGUNDY], [MEDIUM, LONG], [WAVY, CURLY], 98000),
    marketPrices: { KR: 98000, US: 8999, JP: 11200 },
  },
  {
    name: "레이어드 글램",
    description: "레이어드 컷으로 풍성함을 더한 스타일. 화려하고 고급스러운 분위기.",
    category: WigCategory.FASHION,
    tags: ["레이어드", "글램", "고급", "패션"],
    sortOrder: 40,
    variants: makeVariants("FA-LYRGL", [DARK_BROWN, BURGUNDY, BLACK], [MEDIUM, LONG], [WAVY, CURLY], 120000),
    marketPrices: { KR: 120000, US: 10999, JP: 13600 },
  },
  // ── COSPLAY ───────────────────────────────────────────────
  {
    name: "내추럴 컬 풀 볼륨",
    description: "풍성한 컬로 존재감 있는 스타일. 코스프레·화보 촬영에 인기.",
    category: WigCategory.COSPLAY,
    tags: ["컬", "코스프레", "볼륨", "개성"],
    sortOrder: 50,
    variants: makeVariants("CS-NTCL", [BLACK, ROSE_PINK, ASH_GRAY], [MEDIUM, LONG], [CURLY, WAVY], 108000),
    marketPrices: { KR: 108000, US: 9899, JP: 12200 },
  },
  {
    name: "루즈 컬 쇼트",
    description: "짧고 탄력 있는 루즈 컬. 활동적이고 개성 넘치는 캐릭터 연출.",
    category: WigCategory.COSPLAY,
    tags: ["쇼트", "컬", "코스프레", "개성"],
    sortOrder: 60,
    variants: makeVariants("CS-LZCL", [WHITE, ROSE_PINK, ASH_GRAY], [SHORT, MEDIUM], [CURLY, WAVY], 78000),
    marketPrices: { KR: 78000, US: 7199, JP: 8900 },
  },
  // ── TOPPER ────────────────────────────────────────────────
  {
    name: "정수리 토퍼 웨이브",
    description: "정수리 볼륨 커버 전용 토퍼. 기존 머리와 자연스럽게 어울림.",
    category: WigCategory.TOPPER,
    tags: ["토퍼", "정수리", "볼륨", "웨이브"],
    sortOrder: 70,
    variants: makeVariants("TP-WAV", [BLACK, NAT_BROWN, ASH_BROWN], [SHORT], [WAVY, STRAIGHT], 58000),
    marketPrices: { KR: 58000, US: 5299, JP: 6600 },
  },
  {
    name: "정수리 토퍼 스트레이트",
    description: "생머리 질감의 정수리 토퍼. 납작한 정수리를 자연스럽게 보완.",
    category: WigCategory.TOPPER,
    tags: ["토퍼", "정수리", "생머리", "커버"],
    sortOrder: 80,
    variants: makeVariants("TP-STR", [BLACK, DARK_BROWN, NAT_BROWN], [SHORT], [STRAIGHT, WAVY], 54000),
    marketPrices: { KR: 54000, US: 4999, JP: 6200 },
  },
  // ── MEDICAL ───────────────────────────────────────────────
  {
    name: "의료용 소프트 미디",
    description: "항암 치료 후 사용을 고려한 저자극 의료용 가발. 두피 밀착감 최적화.",
    category: WigCategory.MEDICAL,
    tags: ["의료용", "항암", "저자극", "미디"],
    sortOrder: 90,
    variants: makeVariants("MD-SFMD", [BLACK, NAT_BROWN, ASH_BROWN], [SHORT, MEDIUM], [STRAIGHT, WAVY], 142000),
    marketPrices: { KR: 142000, US: 12999, JP: 16200 },
  },
  {
    name: "의료용 숏 내추럴",
    description: "짧고 관리하기 쉬운 의료용 가발. 일상 착용과 편안함을 최우선.",
    category: WigCategory.MEDICAL,
    tags: ["의료용", "쇼트", "편안함", "착용감"],
    sortOrder: 100,
    variants: makeVariants("MD-SHNT", [BLACK, DARK_BROWN, ASH_BROWN], [SHORT, MEDIUM], [STRAIGHT, WAVY], 128000),
    marketPrices: { KR: 128000, US: 11699, JP: 14500 },
  },
];

// ── 메인 ─────────────────────────────────────────────────────

async function main() {
  console.log("🗑️  기존 데이터 초기화...");
  await prisma.cartItem.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.wishlistItem.deleteMany();
  await prisma.review.deleteMany();
  await prisma.wigStyleMarket.deleteMany();
  await prisma.variantMarketPrice.deleteMany();
  await prisma.wigVariant.deleteMany();
  await prisma.wigStyle.deleteMany();
  await prisma.market.deleteMany();

  console.log("🌍 마켓 생성...");
  await prisma.market.createMany({ data: markets });

  console.log("🌱 스타일 + 변형 + 마켓 가격 시드 시작...");
  let totalVariants = 0;

  for (const style of styles) {
    const { variants, marketPrices, ...styleData } = style;

    const created = await prisma.wigStyle.create({
      data: { ...styleData, imageKeys: [], variants: { create: variants } },
      include: { variants: true },
    });

    // 변형별 마켓 가격
    await prisma.variantMarketPrice.createMany({
      data: created.variants.flatMap((v) =>
        MARKET_CODES.map((mc) => ({
          variantId: v.id,
          marketCode: mc,
          amount: marketPrices[mc],
        })),
      ),
    });

    // 스타일 마켓 가용성 (전 마켓 활성화)
    await prisma.wigStyleMarket.createMany({
      data: MARKET_CODES.map((mc) => ({
        wigStyleId: created.id,
        marketCode: mc,
        isActive: true,
      })),
    });

    totalVariants += created.variants.length;
    console.log(`  ✔ ${created.name} (${created.variants.length}개 variant × 3 마켓)`);
  }

  console.log(
    `\n✅ 완료: ${styles.length}개 스타일 / ${totalVariants}개 variant` +
    ` / 재고 각 ${STOCK}개 / KR·US·JP 마켓 가격 설정`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
