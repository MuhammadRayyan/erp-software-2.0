"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, CircleCheck, CircleX, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/core/format";
import type { NotificationRecord } from "@/modules/notifications/notification-service";

export function NotificationBell({
  businessId,
  initialUnreadCount = 0,
}: {
  businessId: string;
  initialUnreadCount?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [items, setItems] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  async function refreshList() {
    setLoading(true);
    try {
      const res = await fetch(`/api/businesses/${businessId}/notifications`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as {
          unreadCount: number;
          notifications: NotificationRecord[];
        };
        setUnreadCount(data.unreadCount);
        setItems(data.notifications);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      void refreshList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, businessId]);

  async function markOneRead(item: NotificationRecord) {
    if (!item.isRead) {
      await fetch(`/api/businesses/${businessId}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", notificationId: item.id }),
      });
      setItems((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (item.actionUrl) {
      router.push(item.actionUrl);
    }
  }

  async function markAllRead() {
    await fetch(`/api/businesses/${businessId}/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark_all_read" }),
    });
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    router.refresh();
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          title="Notifications"
          className="relative"
        >
          <Bell className="size-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-[17px] h-[17px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white tabular-nums">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] p-0">
        <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary tabular-nums">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer"
            >
              <CheckCheck className="size-3" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {loading && items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">
              No notifications yet.
            </p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => void markOneRead(item)}
                className={`w-full text-left px-3.5 py-2.5 transition-colors hover:bg-surface-muted/50 cursor-pointer ${
                  !item.isRead ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0">
                    {item.type === "approval_approved" ? (
                      <CircleCheck className="size-4 text-success" />
                    ) : item.type === "approval_rejected" ? (
                      <CircleX className="size-4 text-danger" />
                    ) : (
                      <Clock className="size-4 text-warning" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-foreground">
                        {item.title}
                      </p>
                      {!item.isRead && (
                        <span className="size-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                      {item.message}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground/80">
                      {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
