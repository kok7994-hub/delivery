import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useCreateStop, getListStopsQueryKey, getGetDeliverySessionQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, MapPin } from "lucide-react";

export default function AddStop() {
  const { id } = useParams<{ id: string }>();
  const sessionId = Number(id);
  const [, setLocation] = useLocation();
  const createStop = useCreateStop();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [address, setAddress] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [items, setItems] = useState("");
  const [notes, setNotes] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!address.trim()) return;
    createStop.mutate(
      {
        params: { id: sessionId },
        data: {
          address: address.trim(),
          recipientName: recipientName.trim() || undefined,
          items: items.trim() || undefined,
          notes: notes.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListStopsQueryKey(sessionId) });
          queryClient.invalidateQueries({ queryKey: getGetDeliverySessionQueryKey(sessionId) });
          setLocation(`/sessions/${sessionId}`);
        },
        onError: () => toast({ title: "배달지 추가 실패", variant: "destructive" }),
      }
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-sidebar text-sidebar-foreground shadow-md">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => setLocation(`/sessions/${sessionId}`)}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">배달지 추가</h1>
            <p className="text-xs text-sidebar-foreground/60">직접 주소 입력</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="address" className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              주소 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="address"
              placeholder="예: 서울시 강남구 테헤란로 123"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              required
              data-testid="input-address"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="recipient">수신자 이름</Label>
            <Input
              id="recipient"
              placeholder="예: 홍길동"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              data-testid="input-recipient"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="items">배달 물품</Label>
            <Input
              id="items"
              placeholder="예: 택배 1개, 서류봉투"
              value={items}
              onChange={(e) => setItems(e.target.value)}
              data-testid="input-items"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">메모</Label>
            <Textarea
              id="notes"
              placeholder="예: 경비실 맡겨주세요, 문 앞에 놓아주세요"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="input-notes"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setLocation(`/sessions/${sessionId}`)}
            >
              취소
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={!address.trim() || createStop.isPending}
              data-testid="button-submit-stop"
            >
              {createStop.isPending ? "추가 중..." : "배달지 추가"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
