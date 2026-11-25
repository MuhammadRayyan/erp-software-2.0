"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, CircleCheck, CircleX, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateTime } from "@/core/format";
import { requestGuardedNavigation } from "@/hooks/use-unsaved-changes";
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
  const [markingAll, setMarkingAll] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setUnreadCount(initialUnreadCount);
  }, [initialUnreadCount]);

  useEffect(() => {
    setItems([]);
    abortRef.current?.abort();
  }, [businessId]);

  async function refreshList() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(`/api/businesses/${businessId}/notifications`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (res.ok && !controller.signal.aborted) {
        const data = (await res.json()) as {
          unreadCount: number;
          notifications: NotificationRecord[];
        };
        setUnreadCount(data.unreadCount);
        setItems(data.notifications);
      }
    } catch {
      // Ignore abort / network failures on menu refresh
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (open) {
      void refreshList();
    }
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, businessId]);

  async function markOneRead(item: NotificationRecord) {
    if (!item.isRead) {
      try {
        const res = await fetch(`/api/businesses/${businessId}/notifications`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "mark_read", notificationId: item.id }),
        });
        if (res.ok) {
          setItems((prev) =>
            prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)),
          );
          setUnreadCount((c) => Math.max(0, c - 1));
        }
      } catch {
        // Still proceed to navigate
      }
    }
    setOpen(false);
    if (item.actionUrl) {
      const targetUrl = item.actionUrl;
      requestGuardedNavigation(targetUrl, () => router.push(targetUrl));
    }
  }

  async function markAllRead() {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      const res = await fetch(`/api/businesses/${businessId}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_all_read" }),
      });
      if (res.ok) {
        setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
        setUnreadCount(0);
        router.refresh();
      }
    } catch {
      // Ignore transient failure
    } finally {
      setMarkingAll(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          title="Notifications"
          className="relative"
        >
          <Bell className="size-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-[17px] h-[17px] place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-danger-foreground tabular-nums">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0">
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
                className={`block w-full px-3.5 py-2.5 text-left transition-colors hover:bg-surface-muted/80 cursor-pointer ${
                  !item.isRead ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex w-full items-start gap-2.5">
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
      </PopoverContent>
    </Popover>
  );
}
