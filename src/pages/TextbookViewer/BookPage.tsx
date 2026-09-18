import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfPageCanvas } from "./PdfPageCanvas";
import { AnnotationLayer, type AnnotationLayerHandle } from "./AnnotationLayer";
import { NotesOverlay } from "./NotesOverlay";
import { PageLinkOverlay } from "./PageLinkOverlay";
import { detectPageLinks, type PageLink } from "./pageLinks";
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
}

export const BookPage = forwardRef<BookPageHandle, BookPageProps>(function BookPage(
  {
    pdf,
    pageNumber,
    boxWidth,
    boxHeight,
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
  },
  ref,
) {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotationRef = useRef<AnnotationLayerHandle>(null);
  const [links, setLinks] = useState<PageLink[]>([]);
  const linkDetectSeq = useRef(0);

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

  return (
    <div
      className="relative overflow-hidden bg-white shadow-inner"
      style={{ width: boxWidth, height: boxHeight }}
    >
      <PdfPageCanvas
        ref={pdfCanvasRef}
        pdf={pdf}
        pageNumber={pageNumber}
        width={boxWidth}
        onSize={() => {
          const seq = ++linkDetectSeq.current;
          detectPageLinks(pdf, pageNumber, pdfCanvasRef.current).then((found) => {
            if (linkDetectSeq.current === seq) setLinks(found);
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
          onCreate={onCreateNote}
          onSelect={onSelectNote}
          onMove={onMoveNote}
        />
      )}
      <PageLinkOverlay links={links} interactive={tool === "none"} />
    </div>
  );
});
