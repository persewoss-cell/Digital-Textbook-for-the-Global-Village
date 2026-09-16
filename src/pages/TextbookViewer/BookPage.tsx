import { forwardRef, useImperativeHandle, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfPageCanvas } from "./PdfPageCanvas";
import { AnnotationLayer, type AnnotationLayerHandle } from "./AnnotationLayer";
import { NotesOverlay } from "./NotesOverlay";
import type { DrawTool, PlacedNote } from "@/types";

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
  tool: DrawTool | "note" | "none";
  color: string;
  eraserSize: number;
  readOnly: boolean;
  onDraw?: () => void;
  showNotes: boolean;
  noteItems: PlacedNote[];
  activeNoteId: string | null;
  onCreateNote: (x: number, y: number) => void;
  onSelectNote: (id: string) => void;
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
    showNotes,
    noteItems,
    activeNoteId,
    onCreateNote,
    onSelectNote,
  },
  ref,
) {
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const annotationRef = useRef<AnnotationLayerHandle>(null);

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
      <PdfPageCanvas ref={pdfCanvasRef} pdf={pdf} pageNumber={pageNumber} width={boxWidth} />
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
      />
      {showNotes && (
        <NotesOverlay
          items={noteItems}
          activeId={activeNoteId}
          active={tool === "note"}
          readOnly={readOnly}
          boxWidth={boxWidth}
          onCreate={onCreateNote}
          onSelect={onSelectNote}
        />
      )}
      <div className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-slate-400">
        {pageNumber}
      </div>
    </div>
  );
});
