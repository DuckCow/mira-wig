import "server-only";

import { db } from "@/lib/db";
import { catalogStorage } from "@/lib/storage";
import { parseSnapshotData } from "./snapshot";
import type { SnapshotData, UserOrderListItem } from "./types";

async function fetchUserOrderRows(userId: string) {
  return db.order.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      status: true,
      currency: true,
      totalAmount: true,
      createdAt: true,
      items: {
        orderBy: { id: "asc" },
        take: 1,
        select: { snapshotData: true },
      },
      _count: { select: { items: true } },
    },
  });
}

type UserOrderRow = Awaited<ReturnType<typeof fetchUserOrderRows>>[number];

function representativeSnapshot(row: UserOrderRow): SnapshotData | null {
  const item = row.items[0];
  return item ? parseSnapshotData(item.snapshotData) : null;
}

async function resolveImageUrl(snapshot: SnapshotData | null): Promise<string | null> {
  if (!snapshot?.coverImageKey) return null;
  return catalogStorage.getViewUrl(snapshot.coverImageKey).catch(() => null);
}

async function toUserOrderListItem(row: UserOrderRow): Promise<UserOrderListItem> {
  const snapshot = representativeSnapshot(row);
  const imageUrl = await resolveImageUrl(snapshot);
  return {
    id: row.id,
    status: row.status,
    currency: row.currency,
    totalAmount: row.totalAmount,
    createdAt: row.createdAt,
    itemCount: row._count.items,
    representativeItem: snapshot
      ? { styleName: snapshot.styleName, coverImageKey: snapshot.coverImageKey, imageUrl }
      : null,
  };
}

export async function getUserOrders(userId: string): Promise<UserOrderListItem[]> {
  const rows = await fetchUserOrderRows(userId);
  return Promise.all(rows.map(toUserOrderListItem));
}
