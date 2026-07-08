import { listStyles } from "@/lib/admin-catalog-data";
import { StylesClient } from "./StylesClient";

export const metadata = { title: "스타일 관리" };

export default async function StylesPage() {
  const styles = await listStyles();
  return <StylesClient styles={styles} />;
}
