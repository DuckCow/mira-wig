import { notFound } from "next/navigation";
import Link from "next/link";
import { getStyleDetail } from "@/lib/admin-catalog-data";
import { StyleEditForm } from "./StyleEditForm";
import { VariantSection } from "./VariantSection";

type Params = Promise<{ id: string }>;

export default async function StyleDetailPage({ params }: { params: Params }) {
  const { id } = await params;
  const style = await getStyleDetail(id);
  if (!style) notFound();
  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/admin/styles" className="text-sm text-gray-500 hover:text-gray-700">← 목록</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-700 font-medium">{style.name}</span>
      </div>
      <StyleEditForm style={style} />
      <VariantSection variants={style.variants} wigStyleId={style.id} />
    </div>
  );
}
