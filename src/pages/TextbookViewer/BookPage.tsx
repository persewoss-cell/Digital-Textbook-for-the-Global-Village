import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfPageCanvas } from "./PdfPageCanvas";
import { AnnotationLayer, type AnnotationLayerHandle } from "./AnnotationLayer";
import { NotesOverlay } from "./NotesOverlay";
import { PageLinkOverlay } from "./PageLinkOverlay";
import { detectPageLinks, type PageLink } from "./pageLinks";
import { ActivityZoneOverlay } from "./ActivityZoneOverlay";
import { detectActivityZones, type ActivityZone } from "./activityZones";
import { detectPageImages, type ImageRegion } from "./pageImages";
import { MediaPopup } from "./MediaPopup";
import type { AnnotationTool, PlacedNote, Stroke } from "@/types";

export interface BookPageHandle {
  undo: () => void;
  redo: () => void;
  captureDataUrl: () => string | null;
  getAnnotationHandle: () => AnnotationLayerHandle | null;
}

interface BookPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  boxWidth: number;
  boxHeight: number;
  /** 확대(zoom)와 무관하게 이 쪽이 화면에서 가장 커질 수 있는(다시 그릴) 크기.
   * PdfPageCanvas/AnnotationLayer가 이 크기 기준으로만 다시 그려 두면, 실제 보여줄
   * 크기(boxWidth/boxHeight)가 줌에 따라 바뀔 때마다 다시 그릴 필요 없이 CSS로만
   * 줄여/키워 보여줄 수 있다. */
  maxBoxWidth: number;
  maxBoxHeight: number;
  uid: string;
  textbookId: string;
  tool: AnnotationTool;
  color: string;
  eraserSize: number;
  readOnly: boolean;
  onDraw?: () => void;
  /** 한 번의 필기/지우개 동작이 이 쪽과 옆 쪽 양쪽을 다 건드렸을 때 두 쪽 번호를
   * 한꺼번에 알려준다 - 되돌리기가 그 동작을 한 번에 두 쪽 다 되돌릴 수 있게. */
  onCompoundDraw?: (pages: number[]) => void;
  historyMap: Map<number, Stroke[][]>;
  futureMap: Map<number, Stroke[][]>;
  /** false면 필기를 서버에 저장/조회하지 않는다 (교재 체험 모드용). */
  persist?: boolean;
  penWidth?: number;
  penAlpha?: number;
  showNotes: boolean;
  noteItems: PlacedNote[];
  activeNoteId: string | null;
  onCreateNote: (x: number, y: number) => void;
  onSelectNote: (id: string) => void;
  /** 메모를 실제로 끌기 시작한 순간(부모가 두 쪽에 걸친 유령 레이어를 띄우기
   * 시작함) 한 번, 끄는 동안 매 pointermove마다, 손을 뗐을 때 한 번 불린다. 두
   * 쪽 보기에서 경계를 넘어가도 메모가 잘리지 않고 계속 보이려면 실제 이동은
   * 부모(TextbookViewerPage)가 화면 전체 좌표 기준으로 처리해야 한다. */
  onNoteDragStart: (note: PlacedNote, clientX: number, clientY: number) => void;
  onNoteDragMove: (clientX: number, clientY: number) => void;
  onNoteDragEnd: (clientX: number, clientY: number) => void;
  /** 지금 두 쪽에 걸쳐 드래그 중인 메모의 id(부모가 관리) - 이 쪽에 있는
   * 메모여도 이 값과 같으면 제자리에는 안 보이게 한다. */
  activeDragNoteId?: string | null;
  /** 지우개가 메모 위를 지나가면 그 메모를 통째로 지운다(실수로 지웠으면 undo로
   * 되살릴 수 있다). 없으면 지우개는 필기만 지운다. */
  onDeleteNote?: (id: string) => void;
  /** 도구가 선택된 상태에서 교재(캔버스) 위에 마우스 오른쪽 버튼을 누르면
   * 선택을 해제해 달라고 부모에게 요청한다. */
  onRequestDeselectTool?: () => void;
  /** 두 쪽 보기에서 옆 쪽으로 넘어간 획을 이어 그릴 수 있도록 옆 쪽의
   * AnnotationLayer를 알려준다. 한 쪽 보기거나 스프레드 끝이면 undefined. */
  neighborAnnotation?: { boundaryFx: 0 | 1; page: number; getHandle: () => AnnotationLayerHandle | null };
  onActivateZone: (
    zone: ActivityZone,
    el: HTMLDivElement,
    pageNumber: number,
    kind: "step" | "sub" | "img",
  ) => void;
  /** 이 쪽의 PDF가 처음으로 다 그려졌을 때(캔버스에 실제로 그림) 한 번 불린다.
   * 부모가 이걸로 "지금 보여줄 쪽들이 전부 준비됐는지"를 판단해 가운데 로딩
   * 표시를 없앤다. */
  onPageReady?: () => void;
}

export const BookPage = forwardRef<BookPageHandle, BookPageProps>(function BookPage(
  {
    pdf,
    pageNumber,
    boxWidth,
    boxHeight,
    maxBoxWidth,
    maxBoxHeight,
    uid,
    textbookId,
    tool,
    color,
    eraserSize,
    readOnly,
    onDraw,
    onCompoundDraw,
    historyMap,
    futureMap,
    persist,
    penWidth,
    penAlpha,
    showNotes,
    noteItems,
    activeNoteId,
    onCreateNote,
    onSelectNote,
    onNoteDragStart,
    onNoteDragMove,
    onNoteDragEnd,
    activeDragNoteId,
    onDeleteNote,
    onRequestDeselectTool,
    neighborAnnotation,
    onActivateZone,
    onPageReady,
  },
  ref,
) {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotationRef = useRef<AnnotationLayerHandle>(null);
  const [links, setLinks] = useState<PageLink[]>([]);
  const linkDetectSeq = useRef(0);
  const [zones, setZones] = useState<ActivityZone[]>([]);
  const [subZones, setSubZones] = useState<ActivityZone[]>([]);
  const zoneDetectSeq = useRef(0);
  const [images, setImages] = useState<ImageRegion[]>([]);
  const imageDetectSeq = useRef(0);
  const [popup, setPopup] = useState<{ type: "video"; embedUrl: string } | null>(null);
  // 확대 구간(활동 단계/세부 문항/사진)을 터치로 처음 누르면 켜지는 "이 부분 맞아요?"
  // 표시. 마우스는 hover로 미리 보이니 바로 확대하지만, 터치는 hover가 없어서 한 번 더
  // 눌러야 확대되게 한다. 세 종류(zones/subZones/images) 중 하나만 켜져 있을 수 있다.
  const [armedKey, setArmedKey] = useState<string | null>(null);
  // 지우개가 스친 메모의 id를 이번 드래그가 끝날 때(pointerup)까지 모아 뒀다가
  // 그때 한꺼번에 지운다. 바로바로 지우면(pointerdown/move 시점), 같은 드래그
  // 안에서 필기(잉크)도 같이 지워졌을 때 필기 쪽 실행취소 기록이 나중에(pointerup
  // 시점에) 찍혀서 "가장 최근 동작"이 필기 지우기가 돼 버려, 되돌리기를 한 번
  // 눌러도 메모가 아니라 필기부터 되돌아가는 문제가 있었다. 메모 삭제도 똑같이
  // pointerup에서 처리해야 항상 이 드래그의 "가장 마지막 동작"이 되어, 되돌리기
  // 한 번으로 방금 지운 메모가 바로 되살아난다.
  const pendingErasedNoteIdsRef = useRef<Set<string>>(new Set());
  // 지우개 원(화면에 보이는 크기)에서 살짝 더 넉넉하게 잡아야, 작은 메모 아이콘도
  // 정확히 겨냥하지 않아도 자연스럽게 지워진다.
  const NOTE_ERASE_PADDING = 16;

  useImperativeHandle(
    ref,
    () => ({
      undo: () => annotationRef.current?.undo(),
      redo: () => annotationRef.current?.redo(),
      captureDataUrl: () => {
        const pdfCanvas = pdfCanvasRef.current;
        if (!pdfCanvas) return null;
        const out = document.createElement("canvas");
        out.width = pdfCanvas.width;
        out.height = pdfCanvas.height;
        const ctx = out.getContext("2d");
        if (!ctx) return null;
        ctx.drawImage(pdfCanvas, 0, 0, out.width, out.height);
        const annoCanvas = annotationRef.current?.getCanvas();
        if (annoCanvas) ctx.drawImage(annoCanvas, 0, 0, out.width, out.height);
        return out.toDataURL("image/png");
      },
      getAnnotationHandle: () => annotationRef.current,
    }),
    [],
  );

  const drawTool = tool === "note" ? "none" : tool;

  const markNotesForErase = (clientX: number, clientY: number, rect: DOMRect) => {
    if (tool !== "eraser" || readOnly || !onDeleteNote) return;
    for (const note of noteItems) {
      const nx = rect.left + note.x * rect.width;
      const ny = rect.top + note.y * rect.height;
      if (Math.hypot(clientX - nx, clientY - ny) <= eraserSize + NOTE_ERASE_PADDING) {
        pendingErasedNoteIdsRef.current.add(note.id);
      }
    }
  };

  // 확대가 실제로 시작되면(터치로 두 번째 눌러서 확정하든, 마우스로 바로 누르든)
  // 남아있던 "이 부분 맞아요?" 표시/아이콘은 지운다.
  const handleActivate = (zone: ActivityZone, el: HTMLDivElement, kind: "step" | "sub" | "img") => {
    setArmedKey(null);
    onActivateZone(zone, el, pageNumber, kind);
  };

  return (
    <div
      className="relative overflow-hidden bg-white shadow-inner"
      style={{ width: boxWidth, height: boxHeight }}
      onPointerDown={(e) => {
        setArmedKey(null);
        markNotesForErase(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
      }}
      onPointerMove={(e) => {
        if (e.buttons & 1) markNotesForErase(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
      }}
      onPointerUp={() => {
        // 이 시점엔 이미 자식(AnnotationLayer 캔버스)의 pointerup이 먼저 실행되어
        // 이번 드래그로 지워진 필기가 있었다면 그 커밋까지 끝난 뒤다 - 메모 삭제를
        // 여기서 처리해야 항상 그 다음 순서(=가장 최근 동작)가 되어 되돌리기 한
        // 번으로 메모부터 되살아난다.
        if (pendingErasedNoteIdsRef.current.size > 0 && onDeleteNote) {
          pendingErasedNoteIdsRef.current.forEach((id) => onDeleteNote(id));
          pendingErasedNoteIdsRef.current.clear();
        }
      }}
      onContextMenu={(e) => {
        // "선택 해제" 오른쪽 클릭은 아이콘이 아니라 교재(캔버스) 위에서 눌러야
        // 동작한다 - 여기서 처리해야 도구가 선택된 동안 실수로 브라우저 기본
        // 메뉴가 뜨는 것도 같이 막을 수 있다.
        if (tool !== "none" && onRequestDeselectTool) {
          e.preventDefault();
          onRequestDeselectTool();
        }
      }}
    >
      <PdfPageCanvas
        ref={pdfCanvasRef}
        pdf={pdf}
        pageNumber={pageNumber}
        renderWidth={maxBoxWidth}
        displayWidth={boxWidth}
        onSize={() => {
          onPageReady?.();
          const seq = ++linkDetectSeq.current;
          detectPageLinks(pdf, pageNumber, pdfCanvasRef.current).then((found) => {
            if (linkDetectSeq.current === seq) setLinks(found);
          });
          const zseq = ++zoneDetectSeq.current;
          detectActivityZones(pdf, pageNumber).then(({ zones: found, subZones: foundSub }) => {
            if (zoneDetectSeq.current === zseq) {
              setZones(found);
              setSubZones(foundSub);
            }
          });
          const iseq = ++imageDetectSeq.current;
          detectPageImages(pdf, pageNumber, pdfCanvasRef.current).then((found) => {
            if (imageDetectSeq.current === iseq) setImages(found);
          });
        }}
      />
      <AnnotationLayer
        ref={annotationRef}
        uid={uid}
        textbookId={textbookId}
        page={pageNumber}
        renderWidth={maxBoxWidth}
        renderHeight={maxBoxHeight}
        displayWidth={boxWidth}
        displayHeight={boxHeight}
        tool={drawTool}
        color={color}
        eraserSize={eraserSize}
        readOnly={readOnly}
        onDraw={onDraw}
        onCompoundDraw={onCompoundDraw}
        historyMap={historyMap}
        futureMap={futureMap}
        persist={persist}
        penWidth={penWidth}
        penAlpha={penAlpha}
        neighborAnnotation={neighborAnnotation}
      />
      {showNotes && (
        <NotesOverlay
          items={noteItems}
          activeId={activeNoteId}
          active={tool === "note"}
          readOnly={readOnly}
          pageWidth={boxWidth}
          activeDragNoteId={activeDragNoteId}
          onCreate={onCreateNote}
          onSelect={onSelectNote}
          onDragStart={onNoteDragStart}
          onDragMove={onNoteDragMove}
          onDragEnd={onNoteDragEnd}
        />
      )}
      <ActivityZoneOverlay
        zones={zones}
        interactive={tool === "none"}
        armedKey={armedKey}
        prefix="step"
        onArm={setArmedKey}
        onActivate={handleActivate}
      />
      <ActivityZoneOverlay
        zones={subZones}
        interactive={tool === "none"}
        armedKey={armedKey}
        prefix="sub"
        onArm={setArmedKey}
        onActivate={handleActivate}
      />
      {/* 사진도 활동 단계와 같은 확대 구간으로 다룬다 - 팝업으로 잘라 보여주면 화질이
          나빠지니, 교재 자체를 확대해서 화면에 꽉 차게 보여준다. 사진은 캐릭터/번호처럼
          트리거를 따로 좁힐 필요가 없어서 trigger=target으로 그대로 쓴다. */}
      <ActivityZoneOverlay
        zones={images.map((r) => ({ trigger: r, target: r }))}
        interactive={tool === "none"}
        armedKey={armedKey}
        prefix="img"
        onArm={setArmedKey}
        onActivate={handleActivate}
      />
      <PageLinkOverlay
        links={links}
        interactive={tool === "none"}
        onOpenVideo={(embedUrl) => setPopup({ type: "video", embedUrl })}
      />
      {popup?.type === "video" && (
        <MediaPopup onClose={() => setPopup(null)}>
          <iframe
            src={popup.embedUrl}
            className="aspect-video w-[85vw] max-w-3xl rounded-lg bg-black shadow-2xl"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </MediaPopup>
      )}
    </div>
  );
});
