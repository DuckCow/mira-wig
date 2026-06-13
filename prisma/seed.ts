import "dotenv/config";
import { PrismaClient, WigCategory } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

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
  basePrice: number,
) {
  return colors.flatMap((c) =>
    lengths.flatMap((l) =>
      curls.map((cu) => ({
        color: c.name,
        colorHex: c.hex,
        length: l.value,
        curl: cu.value,
        price: basePrice,
        stock: STOCK,
        sku: `${prefix}-${c.code}-${l.code}-${cu.code}`,
      })),
    ),
  );
}

// ── 공통 색상 팔레트 ──────────────────────────────────────────

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

// ── 스타일 데이터 ─────────────────────────────────────────────

const styles = [
  // ── HAIR_LOSS ─────────────────────────────────────────────
  {
    name: "실크 스트레이트",
    description: "자연스러운 윤기의 생머리 스타일. 탈모 고민을 자신감으로.",
    category: WigCategory.HAIR_LOSS,
    tags: ["생머리", "탈모", "자연스러움"],
    sortOrder: 10,
    variants: makeVariants(
      "HL-SLKST",
      [BLACK, NAT_BROWN, ASH_BROWN],
      [MEDIUM, LONG],
      [STRAIGHT, WAVY],
      85000,
    ),
  },
  {
    name: "클린 볼륨 미디",
    description: "어깨선 미디 길이, 자연스러운 볼륨. 일상 탈모 커버에 최적.",
    category: WigCategory.HAIR_LOSS,
    tags: ["미디", "탈모", "데일리", "볼륨"],
    sortOrder: 20,
    variants: makeVariants(
      "HL-CLNVL",
      [BLACK, DARK_BROWN, NAT_BROWN],
      [SHORT, MEDIUM],
      [STRAIGHT, WAVY],
      75000,
    ),
  },
  // ── FASHION ───────────────────────────────────────────────
  {
    name: "비치 웨이브",
    description: "해변에서 막 나온 듯한 자연스러운 웨이브. 볼륨감과 생동감.",
    category: WigCategory.FASHION,
    tags: ["웨이브", "패션", "여름", "볼륨"],
    sortOrder: 30,
    variants: makeVariants(
      "FA-BCHWV",
      [HONEY_BLOND, NAT_BROWN, BURGUNDY],
      [MEDIUM, LONG],
      [WAVY, CURLY],
      98000,
    ),
  },
  {
    name: "레이어드 글램",
    description: "레이어드 컷으로 풍성함을 더한 스타일. 화려하고 고급스러운 분위기.",
    category: WigCategory.FASHION,
    tags: ["레이어드", "글램", "고급", "패션"],
    sortOrder: 40,
    variants: makeVariants(
      "FA-LYRGL",
      [DARK_BROWN, BURGUNDY, BLACK],
      [MEDIUM, LONG],
      [WAVY, CURLY],
      120000,
    ),
  },
  // ── COSPLAY ───────────────────────────────────────────────
  {
    name: "내추럴 컬 풀 볼륨",
    description: "풍성한 컬로 존재감 있는 스타일. 코스프레·화보 촬영에 인기.",
    category: WigCategory.COSPLAY,
    tags: ["컬", "코스프레", "볼륨", "개성"],
    sortOrder: 50,
    variants: makeVariants(
      "CS-NTCL",
      [BLACK, ROSE_PINK, ASH_GRAY],
      [MEDIUM, LONG],
      [CURLY, WAVY],
      108000,
    ),
  },
  {
    name: "루즈 컬 쇼트",
    description: "짧고 탄력 있는 루즈 컬. 활동적이고 개성 넘치는 캐릭터 연출.",
    category: WigCategory.COSPLAY,
    tags: ["쇼트", "컬", "코스프레", "개성"],
    sortOrder: 60,
    variants: makeVariants(
      "CS-LZCL",
      [WHITE, ROSE_PINK, ASH_GRAY],
      [SHORT, MEDIUM],
      [CURLY, WAVY],
      78000,
    ),
  },
  // ── TOPPER ────────────────────────────────────────────────
  {
    name: "정수리 토퍼 웨이브",
    description: "정수리 볼륨 커버 전용 토퍼. 기존 머리와 자연스럽게 어울림.",
    category: WigCategory.TOPPER,
    tags: ["토퍼", "정수리", "볼륨", "웨이브"],
    sortOrder: 70,
    variants: makeVariants(
      "TP-WAV",
      [BLACK, NAT_BROWN, ASH_BROWN],
      [SHORT],
      [WAVY, STRAIGHT],
      58000,
    ),
  },
  {
    name: "정수리 토퍼 스트레이트",
    description: "생머리 질감의 정수리 토퍼. 납작한 정수리를 자연스럽게 보완.",
    category: WigCategory.TOPPER,
    tags: ["토퍼", "정수리", "생머리", "커버"],
    sortOrder: 80,
    variants: makeVariants(
      "TP-STR",
      [BLACK, DARK_BROWN, NAT_BROWN],
      [SHORT],
      [STRAIGHT, WAVY],
      54000,
    ),
  },
  // ── MEDICAL ───────────────────────────────────────────────
  {
    name: "의료용 소프트 미디",
    description: "항암 치료 후 사용을 고려한 저자극 의료용 가발. 두피 밀착감 최적화.",
    category: WigCategory.MEDICAL,
    tags: ["의료용", "항암", "저자극", "미디"],
    sortOrder: 90,
    variants: makeVariants(
      "MD-SFMD",
      [BLACK, NAT_BROWN, ASH_BROWN],
      [SHORT, MEDIUM],
      [STRAIGHT, WAVY],
      142000,
    ),
  },
  {
    name: "의료용 숏 내추럴",
    description: "짧고 관리하기 쉬운 의료용 가발. 일상 착용과 편안함을 최우선.",
    category: WigCategory.MEDICAL,
    tags: ["의료용", "쇼트", "편안함", "착용감"],
    sortOrder: 100,
    variants: makeVariants(
      "MD-SHNT",
      [BLACK, DARK_BROWN, ASH_BROWN],
      [SHORT, MEDIUM],
      [STRAIGHT, WAVY],
      128000,
    ),
  },
];

// ── 메인 ─────────────────────────────────────────────────────

async function main() {
  console.log("🗑️  기존 데이터 초기화...");
  await prisma.cartItem.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.tryOn.deleteMany();
  await prisma.wishlistItem.deleteMany();
  await prisma.review.deleteMany();
  await prisma.wigVariant.deleteMany();
  await prisma.wigStyle.deleteMany();

  console.log("🌱 시드 시작...");
  for (const style of styles) {
    const { variants, ...styleData } = style;
    const created = await prisma.wigStyle.create({
      data: { ...styleData, imageKeys: [], variants: { create: variants } },
    });
    console.log(`  ✔ ${created.name} (${variants.length}개 variant)`);
  }

  const total = styles.reduce((s, st) => s + st.variants.length, 0);
  console.log(`\n✅ 완료: ${styles.length}개 스타일 / ${total}개 variant / 재고 각 ${STOCK}개`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
