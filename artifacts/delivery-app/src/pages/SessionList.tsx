import { useState } from "react";
import { useLocation } from "wouter";
import { useListDeliverySessions, useCreateDeliverySession, useDeleteDeliverySession, getListDeliverySessionsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, MapPin, Package, Clock, ChevronRight, Truck } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  in_progress: "진행중",
  completed: "완료",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "secondary",
  in_progress: "default",
  completed: "outline",
};

export default function SessionList() {
  const [, setLocation] = useLocation();
  const { data: sessions, isLoading } = useListDeliverySessions();
  const createSession = useCreateDeliverySession();
  const deleteSession = useDeleteDeliverySession();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startAddress, setStartAddress] = useState("");

  function handleCreate() {
    if (!name.trim()) return;
    createSession.mutate(
      { data: { name: name.trim(), date, startAddress: startAddress.trim() || undefined } },
      {
        onSuccess: (session) => {
          queryClient.invalidateQueries({ queryKey: getListDeliverySessionsQueryKey() });
          setOpen(false);
          setName("");
          setStartAddress("");
          setLocation(`/sessions/${session.id}`);
        },
        onError: () => toast({ title: "세션 생성 실패", variant: "destructive" }),
      }
    );
  }

  function handleDelete(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (!confirm("이 배달 세션을 삭제하시겠습니까?")) return;
    deleteSession.mutate(
      { params: { id } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getListDeliverySessionsQueryKey() }),
        onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
      }
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-sidebar text-sidebar-foreground shadow-md">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary rounded-lg p-2">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">배달 경로 최적화</h1>
              <p className="text-xs text-sidebar-foreground/60">배달 세션 관리</p>
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5" data-testid="button-new-session">
                <Plus className="w-4 h-4" />
                새 세션
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>새 배달 세션</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="session-name">세션 이름</Label>
                  <Input
                    id="session-name"
                    placeholder="예: 6월 5일 오전 배달"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="input-session-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="session-date">날짜</Label>
                  <Input
                    id="session-date"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    data-testid="input-session-date"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="start-address">출발지 주소 (선택)</Label>
                  <Input
                    id="start-address"
                    placeholder="예: 서울시 강남구 역삼동 창고"
                    value={startAddress}
                    onChange={(e) => setStartAddress(e.target.value)}
                    data-testid="input-start-address"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={!name.trim() || createSession.isPending}
                  data-testid="button-create-session"
                >
                  {createSession.isPending ? "생성 중..." : "세션 만들기"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))
        ) : !sessions || sessions.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Truck className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">배달 세션이 없습니다</p>
            <p className="text-sm mt-1">새 세션을 만들어 시작하세요</p>
          </div>
        ) : (
          sessions.map((session) => (
            <Card
              key={session.id}
              className="cursor-pointer hover:shadow-md transition-all hover:-translate-y-0.5 border border-card-border"
              onClick={() => setLocation(`/sessions/${session.id}`)}
              data-testid={`card-session-${session.id}`}
            >
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base font-semibold">{session.name}</CardTitle>
                    <Badge variant={STATUS_COLOR[session.status] as "default" | "secondary" | "outline"}>
                      {STATUS_LABEL[session.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleDelete(e, session.id)}
                      data-testid={`button-delete-session-${session.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{session.date}</span>
                  <span className="flex items-center gap-1">
                    <Package className="w-3.5 h-3.5" />
                    {session.completedStops}/{session.totalStops} 완료
                  </span>
                  {session.estimatedDurationMinutes && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      약 {session.estimatedDurationMinutes}분
                    </span>
                  )}
                </div>
                {session.startAddress && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    {session.startAddress}
                  </div>
                )}
                {session.totalStops > 0 && (
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${(session.completedStops / session.totalStops) * 100}%` }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
