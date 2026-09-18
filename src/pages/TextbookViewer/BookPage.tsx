import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfPageCanvas } from "./PdfPageCanvas";
import { AnnotationLayer, type AnnotationLayerHandle } from "./AnnotationLayer";
import { NotesOverlay } from "./NotesOverlay";
import { PageLinkOverlay } from "./PageLinkOverlay";
import { detectPageLinks, type PageLink } from "./pageLinks";
import { ActivityZoneOverlay } from "./ActivityZoneOverlay";
import { detectActivityZones, type ActivityZone } from "./activityZones";
import { ImageZoneOverlay } from "./ImageZoneOverlay";
import { detectPageImages, type ImageRegion } from "./pageImages";
import { MediaPopup } from "./MediaPopup";
import type { AnnotationTool, PlacedNote, Stroke } from "@/types";

export interface BookPageHandle {
  undo: () => void;
  redo: () => void;
  captureDataUrl: () => string | null;
}

interface BookPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  boxWidth: number;
  boxHeight: number;
  /** 확대(zoom)와 무관하게 이 쪽이 화면에서 가장 커질 수 있는 크기. PdfPageCanvas가
   * 이 크기 기준으로 한 번만 그려 두면, 실제 보여줄 크기(boxWidth)가 줌에 따라
   * 바뀔 때마다 다시 그릴 필요 없이 CSS로만 줄여/키워 보여줄 수 있다. */
  maxBoxWidth: number;
  uid: string;
  textbookId: string;
  tool: AnnotationTool;
  color: string;
  eraserSize: number;
  readOnly: boolean;
  onDraw?: () => void;
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
  onMoveNote: (id: string, x: number, y: number) => void;
  onActivateZone: (zone: ActivityZone, el: HTMLDivElement) => void;
}

export const BookPage = forwardRef<BookPageHandle, BookPageProps>(function BookPage(
  {
    pdf,
    pageNumber,
    boxWidth,
    boxHeight,
    maxBoxWidth,
    uid,
    textbookId,
    tool,
    color,
    eraserSize,
    readOnly,
    onDraw,
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
    onMoveNote,
    onActivateZone,
  },
  ref,
) {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotationRef = useRef<AnnotationLayerHandle>(null);
  const [links, setLinks] = useState<PageLink[]>([]);
  const linkDetectSeq = useRef(0);
  const [zones, setZones] = useState<ActivityZone[]>([]);
  const zoneDetectSeq = useRef(0);
  const [images, setImages] = useState<ImageRegion[]>([]);
  const imageDetectSeq = useRef(0);
  const [popup, setPopup] = useState<{ type: "image"; dataUrl: string } | { type: "video"; embedUrl: string } | null>(
    null,
  );

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
    }),
    [],
  );

  const drawTool = tool === "note" ? "none" : tool;

  const handleActivateImage = (region: ImageRegion) => {
    const canvas = pdfCanvasRef.current;
    if (!canvas) return;
    const sx = region.x * canvas.width;
    const sy = region.y * canvas.height;
    const sw = region.w * canvas.width;
    const sh = region.h * canvas.height;
    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    // 이미 화면에 렌더링된(최대 해상도) 캔버스에서 해당 영역만 그대로 잘라내므로,
    // PDF 이미지를 색공간/디코딩까지 다시 처리할 필요 없이 화질 그대로 크게 보여줄 수 있다.
    ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    setPopup({ type: "image", dataUrl: out.toDataURL("image/png") });
  };

  return (
    <div
      className="relative overflow-hidden bg-white shadow-inner"
      style={{ width: boxWidth, height: boxHeight }}
    >
      <PdfPageCanvas
        ref={pdfCanvasRef}
        pdf={pdf}
        pageNumber={pageNumber}
        renderWidth={maxBoxWidth}
        displayWidth={boxWidth}
        onSize={() => {
          const seq = ++linkDetectSeq.current;
          detectPageLinks(pdf, pageNumber, pdfCanvasRef.current).then((found) => {
            if (linkDetectSeq.current === seq) setLinks(found);
          });
          const zseq = ++zoneDetectSeq.current;
          detectActivityZones(pdf, pageNumber).then((found) => {
            if (zoneDetectSeq.current === zseq) setZones(found);
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
        width={boxWidth}
        height={boxHeight}
        tool={drawTool}
        color={color}
        eraserSize={eraserSize}
        readOnly={readOnly}
        onDraw={onDraw}
        historyMap={historyMap}
        futureMap={futureMap}
        persist={persist}
        penWidth={penWidth}
        penAlpha={penAlpha}
      />
      {showNotes && (
        <NotesOverlay
          items={noteItems}
          activeId={activeNoteId}
          active={tool === "note"}
          readOnly={readOnly}
          pageWidth={boxWidth}
          onCreate={onCreateNote}
          onSelect={onSelectNote}
          onMove={onMoveNote}
        />
      )}
      <ActivityZoneOverlay zones={zones} interactive={tool === "none"} onActivate={onActivateZone} />
      <ImageZoneOverlay regions={images} interactive={tool === "none"} onActivate={handleActivateImage} />
      <PageLinkOverlay
        links={links}
        interactive={tool === "none"}
        onOpenVideo={(embedUrl) => setPopup({ type: "video", embedUrl })}
      />
      {popup?.type === "image" && (
        <MediaPopup onClose={() => setPopup(null)}>
          <img src={popup.dataUrl} className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl" alt="" />
        </MediaPopup>
      )}
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
