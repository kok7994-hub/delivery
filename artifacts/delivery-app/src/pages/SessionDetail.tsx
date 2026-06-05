import { useState, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetDeliverySession,
  getGetDeliverySessionQueryKey,
  useUpdateStop,
  useDeleteStop,
  useOptimizeRoute,
  useExtractAddresses,
  useBatchCreateStops,
  useGeocodeAddress,
  getListStopsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import { createNumberedIcon } from "@/lib/leaflet-icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Plus, Upload, Zap, CheckCircle, XCircle, SkipForward,
  Trash2, MapPin, Package, Clock, Navigation, ChevronDown, ChevronUp
} from "lucide-react";

type Stop = {
  id: number;
  sessionId: number;
  address: string;
  recipientName?: string | null;
  items?: string | null;
  notes?: string | null;
  lat?: number | null;
  lng?: number | null;
  orderIndex: number;
  status: "pending" | "delivered" | "failed" | "skipped";
  estimatedArrival?: string | null;
  createdAt: string;
};

type ExtractedStop = {
  address: string;
  recipientName?: string | null;
  items?: string | null;
  notes?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  delivered: "완료",
  failed: "실패",
  skipped: "건너뜀",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-blue-100 text-blue-700",
  delivered: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-gray-100 text-gray-600",
};

function useGeocode(address: string, enabled: boolean) {
  return useGeocodeAddress(
    { address },
    { query: { enabled, queryKey: getListStopsQueryKey(0) } }
  );
}

export default function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const sessionId = Number(id);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: session, isLoading } = useGetDeliverySession(sessionId, {
    query: { enabled: !!sessionId, queryKey: getGetDeliverySessionQueryKey(sessionId) },
  });

  const updateStop = useUpdateStop();
  const deleteStop = useDeleteStop();
  const optimizeRoute = useOptimizeRoute();
  const extractAddresses = useExtractAddresses();
  const batchCreateStops = useBatchCreateStops();

  const [routePolyline, setRoutePolyline] = useState<[number, number][]>([]);
  const [extractedStops, setExtractedStops] = useState<ExtractedStop[]>([]);
  const [showExtractPreview, setShowExtractPreview] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [expandedStop, setExpandedStop] = useState<number | null>(null);

  const stops: Stop[] = (session?.stops ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex);
  const geocodedStops = stops.filter((s) => s.lat !== null && s.lng !== null) as (Stop & { lat: number; lng: number })[];

  const mapCenter: [number, number] =
    geocodedStops.length > 0
      ? [geocodedStops[0].lat, geocodedStops[0].lng]
      : [37.5665, 126.978]; // Seoul

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let imageBase64 = "";
      let mimeType = "image/jpeg";

      if (file.type === "application/pdf") {
        // Dynamically import pdfjs
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url
        ).toString();

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        imageBase64 = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
        mimeType = "image/jpeg";
      } else {
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        imageBase64 = dataUrl.split(",")[1];
        mimeType = file.type || "image/jpeg";
      }

      toast({ title: "AI가 주소를 분석 중입니다..." });

      extractAddresses.mutate(
        { data: { imageBase64, mimeType } },
        {
          onSuccess: (result) => {
            if (!result.stops || result.stops.length === 0) {
              toast({ title: "주소를 찾을 수 없습니다", description: "다른 이미지를 시도해보세요", variant: "destructive" });
              return;
            }
            setExtractedStops(result.stops as ExtractedStop[]);
            setShowExtractPreview(true);
            toast({ title: `${result.stops.length}개 주소를 찾았습니다`, description: "확인 후 추가하세요" });
          },
          onError: () => toast({ title: "주소 추출 실패", variant: "destructive" }),
        }
      );
    } catch {
      toast({ title: "파일 처리 실패", variant: "destructive" });
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleConfirmExtracted() {
    if (extractedStops.length === 0) return;
    batchCreateStops.mutate(
      { params: { id: sessionId }, data: { stops: extractedStops.map(s => ({ address: s.address, recipientName: s.recipientName ?? undefined, items: s.items ?? undefined, notes: s.notes ?? undefined })) } },
      {
        onSuccess: async (newStops) => {
          setShowExtractPreview(false);
          setExtractedStops([]);
          queryClient.invalidateQueries({ queryKey: getGetDeliverySessionQueryKey(sessionId) });
          toast({ title: "주소 추가 완료", description: "지도 표시를 위해 주소를 변환 중..." });

          // Geocode each new stop
          setIsGeocoding(true);
          for (const stop of newStops) {
            try {
              const resp = await fetch(`/api/geocode?address=${encodeURIComponent(stop.address)}`, {
                headers: { "User-Agent": "DeliveryApp/1.0" },
              });
              if (resp.ok) {
                const geo = await resp.json() as { lat: number; lng: number };
                await fetch(`/api/stops/${stop.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ lat: geo.lat, lng: geo.lng }),
                });
              }
            } catch { /* skip geocoding failure */ }
          }
          setIsGeocoding(false);
          queryClient.invalidateQueries({ queryKey: getGetDeliverySessionQueryKey(sessionId) });
          toast({ title: "완료!", description: "지도에 배달지가 표시됩니다" });
        },
        onError: () => toast({ title: "추가 실패", variant: "destructive" }),
      }
    );
  }

  function handleOptimize() {
    optimizeRoute.mutate(
      { params: { id: sessionId }, data: {} },
      {
        onSuccess: (result) => {
          const waypoints: [number, number][] = result.waypoints?.map((w) => [w.lat, w.lng]) ?? [];
          setRoutePolyline(waypoints);
          queryClient.invalidateQueries({ queryKey: getGetDeliverySessionQueryKey(sessionId) });
          toast({
            title: "경로 최적화 완료",
            description: `총 ${result.totalDistanceKm}km · 약 ${result.estimatedDurationMinutes}분`,
          });
        },
        onError: () => toast({ title: "경로 최적화 실패", description: "주소 좌표가 없는 배달지가 있을 수 있습니다", variant: "destructive" }),
      }
    );
  }

  function handleStatusChange(stop: Stop, status: Stop["status"]) {
    updateStop.mutate(
      { params: { stopId: stop.id }, data: { status } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetDeliverySessionQueryKey(sessionId) }),
        onError: () => toast({ title: "상태 변경 실패", variant: "destructive" }),
      }
    );
  }

  function handleDeleteStop(stopId: number) {
    if (!confirm("이 배달지를 삭제하시겠습니까?")) return;
    deleteStop.mutate(
      { params: { stopId } },
      {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetDeliverySessionQueryKey(sessionId) }),
        onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
      }
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-sidebar h-16" />
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>세션을 찾을 수 없습니다</p>
          <Button variant="link" onClick={() => setLocation("/")}>목록으로</Button>
        </div>
      </div>
    );
  }

  const completedCount = stops.filter((s) => s.status === "delivered").length;
  const progress = stops.length > 0 ? (completedCount / stops.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-sidebar text-sidebar-foreground shadow-md sticky top-0 z-[1000]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
            onClick={() => setLocation("/")}
            data-testid="button-back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold truncate">{session.name}</h1>
            <div className="flex items-center gap-2 text-xs text-sidebar-foreground/60">
              <span>{session.date}</span>
              {session.estimatedDurationMinutes && (
                <span className="flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  약 {session.estimatedDurationMinutes}분
                </span>
              )}
            </div>
          </div>
          <div className="text-xs text-sidebar-foreground/60 shrink-0">
            {completedCount}/{stops.length}
          </div>
        </div>
        {stops.length > 0 && (
          <div className="h-1 bg-sidebar-border">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Map */}
        <div className="rounded-xl overflow-hidden border border-card-border shadow-sm">
          <MapContainer
            center={mapCenter}
            zoom={13}
            className="h-64 w-full"
            style={{ zIndex: 0 }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            {geocodedStops.map((stop, idx) => (
              <Marker
                key={stop.id}
                position={[stop.lat, stop.lng]}
                icon={createNumberedIcon(idx + 1, "#2563eb", stop.status === "delivered")}
              >
                <Popup>
                  <div className="text-sm font-medium">#{idx + 1} {stop.address}</div>
                  {stop.recipientName && <div className="text-xs text-gray-600">{stop.recipientName}</div>}
                  {stop.items && <div className="text-xs text-gray-500 mt-1">{stop.items}</div>}
                </Popup>
              </Marker>
            ))}
            {routePolyline.length > 1 && (
              <Polyline positions={routePolyline} color="#2563eb" weight={3} opacity={0.7} />
            )}
          </MapContainer>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={handleFileUpload}
            data-testid="input-file"
          />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 flex-1"
            onClick={() => fileInputRef.current?.click()}
            disabled={extractAddresses.isPending}
            data-testid="button-upload"
          >
            <Upload className="w-4 h-4" />
            {extractAddresses.isPending ? "분석 중..." : "PDF/이미지 업로드"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 flex-1"
            onClick={() => setLocation(`/sessions/${sessionId}/stops/new`)}
            data-testid="button-add-stop"
          >
            <Plus className="w-4 h-4" />
            직접 추가
          </Button>
          <Button
            size="sm"
            className="gap-1.5 flex-1"
            onClick={handleOptimize}
            disabled={geocodedStops.length < 2 || optimizeRoute.isPending}
            data-testid="button-optimize"
          >
            <Zap className="w-4 h-4" />
            {optimizeRoute.isPending ? "최적화 중..." : "경로 최적화"}
          </Button>
        </div>

        {/* Geocoding progress */}
        {isGeocoding && (
          <div className="bg-accent text-accent-foreground rounded-lg px-4 py-3 text-sm flex items-center gap-2">
            <Navigation className="w-4 h-4 animate-pulse" />
            주소를 지도 좌표로 변환 중...
          </div>
        )}

        {/* Extracted stops preview */}
        {showExtractPreview && extractedStops.length > 0 && (
          <Card className="border-primary/30 bg-accent/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">추출된 배달지 ({extractedStops.length}개)</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowExtractPreview(false)}>
                  취소
                </Button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                {extractedStops.map((s, i) => (
                  <div key={i} className="bg-background rounded-lg px-3 py-2 text-sm">
                    <div className="font-medium">{i + 1}. {s.address}</div>
                    {s.recipientName && <div className="text-muted-foreground text-xs">{s.recipientName}</div>}
                    {s.items && <div className="text-muted-foreground text-xs">{s.items}</div>}
                  </div>
                ))}
              </div>
              <Button
                className="w-full gap-1.5"
                onClick={handleConfirmExtracted}
                disabled={batchCreateStops.isPending}
                data-testid="button-confirm-extracted"
              >
                <CheckCircle className="w-4 h-4" />
                {batchCreateStops.isPending ? "추가 중..." : `${extractedStops.length}개 배달지 추가`}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Stops list */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground px-1">
            배달지 목록 ({stops.length}개)
          </h2>
          {stops.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <MapPin className="w-8 h-8 mx-auto mb-3 opacity-20" />
              <p>배달지가 없습니다</p>
              <p className="text-xs mt-1">PDF 업로드 또는 직접 추가로 시작하세요</p>
            </div>
          ) : (
            stops.map((stop, idx) => (
              <Card
                key={stop.id}
                className={`border border-card-border transition-all ${stop.status === "delivered" ? "opacity-60" : ""}`}
                data-testid={`card-stop-${stop.id}`}
              >
                <CardContent className="p-0">
                  <div
                    className="flex items-start gap-3 px-4 py-3 cursor-pointer"
                    onClick={() => setExpandedStop(expandedStop === stop.id ? null : stop.id)}
                  >
                    {/* Order number */}
                    <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white mt-0.5 ${stop.status === "delivered" ? "bg-green-500" : "bg-primary"}`}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight truncate">{stop.address}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 font-medium ${STATUS_COLORS[stop.status]}`}>
                          {STATUS_LABEL[stop.status]}
                        </span>
                      </div>
                      {stop.recipientName && (
                        <p className="text-xs text-muted-foreground mt-0.5">{stop.recipientName}</p>
                      )}
                      {stop.items && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                          <Package className="w-3 h-3" />
                          {stop.items}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-muted-foreground">
                      {expandedStop === stop.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>

                  {/* Expanded actions */}
                  {expandedStop === stop.id && (
                    <div className="border-t border-card-border px-4 py-3 bg-muted/30 space-y-2">
                      {stop.notes && (
                        <p className="text-xs text-muted-foreground bg-background rounded px-2 py-1">{stop.notes}</p>
                      )}
                      {!stop.lat && (
                        <p className="text-xs text-amber-600">지도 좌표 없음 (경로 최적화 불가)</p>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        {stop.status !== "delivered" && (
                          <Button
                            size="sm"
                            className="gap-1 bg-green-600 hover:bg-green-700 text-white text-xs h-8"
                            onClick={() => handleStatusChange(stop, "delivered")}
                            disabled={updateStop.isPending}
                            data-testid={`button-deliver-${stop.id}`}
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            완료
                          </Button>
                        )}
                        {stop.status !== "failed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-destructive border-destructive/30 text-xs h-8"
                            onClick={() => handleStatusChange(stop, "failed")}
                            disabled={updateStop.isPending}
                            data-testid={`button-fail-${stop.id}`}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            실패
                          </Button>
                        )}
                        {stop.status !== "skipped" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-muted-foreground text-xs h-8"
                            onClick={() => handleStatusChange(stop, "skipped")}
                            disabled={updateStop.isPending}
                            data-testid={`button-skip-${stop.id}`}
                          >
                            <SkipForward className="w-3.5 h-3.5" />
                            건너뜀
                          </Button>
                        )}
                        {stop.status !== "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-xs h-8"
                            onClick={() => handleStatusChange(stop, "pending")}
                            disabled={updateStop.isPending}
                          >
                            되돌리기
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-destructive text-xs h-8 ml-auto"
                          onClick={() => handleDeleteStop(stop.id)}
                          data-testid={`button-delete-stop-${stop.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
