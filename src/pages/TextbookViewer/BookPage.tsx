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
  const [subZones, setSubZones] = useState<ActivityZone[]>([]);
  const zoneDetectSeq = useRef(0);
  const [images, setImages] = useState<ImageRegion[]>([]);
  const imageDetectSeq = useRef(0);
  const [popup, setPopup] = useState<{ type: "video"; embedUrl: string } | null>(null);
  // 확대 구간(활동 단계/세부 문항/사진)을 터치로 처음 누르면 켜지는 "이 부분 맞아요?"
  // 표시. 마우스는 hover로 미리 보이니 바로 확대하지만, 터치는 hover가 없어서 한 번 더
  // 눌러야 확대되게 한다. 세 종류(zones/subZones/images) 중 하나만 켜져 있을 수 있다.
  const [armedKey, setArmedKey] = useState<string | null>(null);

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

  // 확대가 실제로 시작되면(터치로 두 번째 눌러서 확정하든, 마우스로 바로 누르든)
  // 남아있던 "이 부분 맞아요?" 표시/아이콘은 지운다.
  const handleActivate = (zone: ActivityZone, el: HTMLDivElement) => {
    setArmedKey(null);
    onActivateZone(zone, el);
  };

  return (
    <div
      className="relative overflow-hidden bg-white shadow-inner"
      style={{ width: boxWidth, height: boxHeight }}
      onPointerDown={() => setArmedKey(null)}
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
      {/* ImageRegion과 ActivityZone은 모양이 같아서(x,y,w,h) 사진도 활동 단계와 같은
          확대 구간으로 다룬다 - 팝업으로 잘라 보여주면 화질이 나빠지니, 교재 자체를
          확대해서 화면에 꽉 차게 보여준다. */}
      <ActivityZoneOverlay
        zones={images}
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
