import "dotenv/config";
import { PrismaClient, WigCategory } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const styles = [
  // ── HAIR_LOSS ───────────────────────────────────────────────
  {
    name: "실크 스트레이트 롱",
    description: "자연스러운 윤기의 생머리 롱 스타일. 탈모 고민을 자신감으로.",
    category: WigCategory.HAIR_LOSS,
    tags: ["롱", "생머리", "탈모", "자연스러움"],
    sortOrder: 10,
    variants: [
      { color: "자연갈색", colorHex: "#6B4C3B", length: "long", curl: "straight", price: 89000, stock: 20, sku: "HL-LNG-BRN" },
      { color: "블랙", colorHex: "#1A1A1A", length: "long", curl: "straight", price: 85000, stock: 30, sku: "HL-LNG-BLK" },
    ],
  },
  {
    name: "클린 미디 스트레이트",
    description: "어깨선 미디 길이, 자연스러운 볼륨. 일상 탈모 커버에 최적.",
    category: WigCategory.HAIR_LOSS,
    tags: ["미디", "탈모", "데일리", "볼륨"],
    sortOrder: 20,
    variants: [
      { color: "애쉬브라운", colorHex: "#8D7B6A", length: "medium", curl: "straight", price: 75000, stock: 25, sku: "HL-MED-ASH" },
      { color: "블랙", colorHex: "#1A1A1A", length: "medium", curl: "straight", price: 72000, stock: 30, sku: "HL-MED-BLK" },
      { color: "다크브라운", colorHex: "#3B2314", length: "medium", curl: "straight", price: 74000, stock: 20, sku: "HL-MED-DBR" },
    ],
  },
  // ── FASHION ─────────────────────────────────────────────────
  {
    name: "비치 웨이브 롱",
    description: "해변에서 막 나온 듯한 자연스러운 웨이브. 볼륨감과 생동감.",
    category: WigCategory.FASHION,
    tags: ["롱", "웨이브", "패션", "여름"],
    sortOrder: 30,
    variants: [
      { color: "허니블론드", colorHex: "#C9A84C", length: "long", curl: "wavy", price: 98000, stock: 15, sku: "FA-LNG-HON" },
      { color: "자연갈색", colorHex: "#6B4C3B", length: "long", curl: "wavy", price: 95000, stock: 20, sku: "FA-LNG-BRN" },
    ],
  },
  {
    name: "레이어드 글램 롱",
    description: "레이어드 컷으로 풍성함을 더한 긴 머리. 화려하고 고급스러운 분위기.",
    category: WigCategory.FASHION,
    tags: ["롱", "레이어드", "글램", "고급"],
    sortOrder: 40,
    variants: [
      { color: "다크브라운", colorHex: "#3B2314", length: "long", curl: "wavy", price: 120000, stock: 10, sku: "FA-LAY-DBR" },
      { color: "버건디", colorHex: "#6B1C2C", length: "long", curl: "wavy", price: 125000, stock: 8, sku: "FA-LAY-BRG" },
    ],
  },
  // ── COSPLAY ─────────────────────────────────────────────────
  {
    name: "내추럴 컬 풀 볼륨",
    description: "풍성한 컬로 존재감 있는 스타일. 코스프레·화보 촬영에 인기.",
    category: WigCategory.COSPLAY,
    tags: ["롱", "컬", "코스프레", "볼륨"],
    sortOrder: 50,
    variants: [
      { color: "블랙", colorHex: "#1A1A1A", length: "long", curl: "curly", price: 105000, stock: 12, sku: "CS-LNG-BLK" },
      { color: "버건디", colorHex: "#6B1C2C", length: "long", curl: "curly", price: 112000, stock: 8, sku: "CS-LNG-BRG" },
      { color: "로즈핑크", colorHex: "#E8A0B4", length: "long", curl: "curly", price: 118000, stock: 6, sku: "CS-LNG-PNK" },
    ],
  },
  {
    name: "루즈 컬 쇼트",
    description: "짧고 탄력 있는 루즈 컬. 활동적이고 개성 넘치는 캐릭터 연출.",
    category: WigCategory.COSPLAY,
    tags: ["쇼트", "컬", "코스프레", "개성"],
    sortOrder: 60,
    variants: [
      { color: "애쉬그레이", colorHex: "#9A9DA0", length: "short", curl: "curly", price: 72000, stock: 15, sku: "CS-SHT-GRY" },
      { color: "화이트", colorHex: "#F5F5F5", length: "short", curl: "curly", price: 75000, stock: 10, sku: "CS-SHT-WHT" },
    ],
  },
  // ── TOPPER ──────────────────────────────────────────────────
  {
    name: "정수리 토퍼 웨이브",
    description: "정수리 볼륨 커버 전용 토퍼. 기존 머리와 자연스럽게 어울림.",
    category: WigCategory.TOPPER,
    tags: ["토퍼", "정수리", "볼륨", "웨이브"],
    sortOrder: 70,
    variants: [
      { color: "자연갈색", colorHex: "#6B4C3B", length: "short", curl: "wavy", price: 58000, stock: 30, sku: "TP-WAV-BRN" },
      { color: "블랙", colorHex: "#1A1A1A", length: "short", curl: "wavy", price: 55000, stock: 35, sku: "TP-WAV-BLK" },
      { color: "애쉬브라운", colorHex: "#8D7B6A", length: "short", curl: "wavy", price: 59000, stock: 25, sku: "TP-WAV-ASH" },
    ],
  },
  {
    name: "정수리 토퍼 스트레이트",
    description: "생머리 질감의 정수리 토퍼. 납작한 정수리를 자연스럽게 보완.",
    category: WigCategory.TOPPER,
    tags: ["토퍼", "정수리", "생머리", "커버"],
    sortOrder: 80,
    variants: [
      { color: "블랙", colorHex: "#1A1A1A", length: "short", curl: "straight", price: 52000, stock: 40, sku: "TP-STR-BLK" },
      { color: "다크브라운", colorHex: "#3B2314", length: "short", curl: "straight", price: 54000, stock: 30, sku: "TP-STR-DBR" },
    ],
  },
  // ── MEDICAL ─────────────────────────────────────────────────
  {
    name: "의료용 소프트 미디",
    description: "항암 치료 후 사용을 고려한 저자극 의료용 가발. 두피 밀착감 최적화.",
    category: WigCategory.MEDICAL,
    tags: ["의료용", "항암", "저자극", "미디"],
    sortOrder: 90,
    variants: [
      { color: "자연갈색", colorHex: "#6B4C3B", length: "medium", curl: "straight", price: 145000, stock: 15, sku: "MD-MED-BRN" },
      { color: "블랙", colorHex: "#1A1A1A", length: "medium", curl: "straight", price: 140000, stock: 20, sku: "MD-MED-BLK" },
    ],
  },
  {
    name: "의료용 숏 내추럴",
    description: "짧고 관리하기 쉬운 의료용 가발. 일상 착용과 편안함을 최우선.",
    category: WigCategory.MEDICAL,
    tags: ["의료용", "쇼트", "편안함", "착용감"],
    sortOrder: 100,
    variants: [
      { color: "애쉬브라운", colorHex: "#8D7B6A", length: "short", curl: "wavy", price: 128000, stock: 18, sku: "MD-SHT-ASH" },
      { color: "블랙", colorHex: "#1A1A1A", length: "short", curl: "wavy", price: 125000, stock: 22, sku: "MD-SHT-BLK" },
      { color: "다크브라운", colorHex: "#3B2314", length: "short", curl: "wavy", price: 130000, stock: 12, sku: "MD-SHT-DBR" },
    ],
  },
];

async function main() {
  console.log("🌱 시드 시작...");

  for (const style of styles) {
    const { variants, ...styleData } = style;
    const created = await prisma.wigStyle.create({
      data: {
        ...styleData,
        imageKeys: [],
        variants: { create: variants },
      },
    });
    console.log(`  ✔ ${created.name} (${variants.length}개 variant)`);
  }

  const total = styles.reduce((s, st) => s + st.variants.length, 0);
  console.log(`\n✅ 완료: ${styles.length}개 스타일 / ${total}개 variant`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
