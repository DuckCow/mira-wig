import { ToastProvider } from "@/components/ui/Toast";

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
