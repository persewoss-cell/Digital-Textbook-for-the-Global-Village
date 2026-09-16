import { forwardRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { PdfPageCanvas } from "./PdfPageCanvas";
import { AnnotationLayer, type AnnotationTool } from "./AnnotationLayer";

interface BookPageProps {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  boxWidth: number;
  boxHeight: number;
  uid: string;
  textbookId: string;
  tool: AnnotationTool;
  color: string;
  readOnly: boolean;
  bookmarked: boolean;
  highContrast: boolean;
}

export const BookPage = forwardRef<HTMLDivElement, BookPageProps>(
  function BookPage(
    {
      pdf,
      pageNumber,
      boxWidth,
      boxHeight,
      uid,
      textbookId,
      tool,
      color,
      readOnly,
      bookmarked,
      highContrast,
    },
    ref,
  ) {
    return (
      <div
        ref={ref}
        className="relative overflow-hidden bg-white shadow-inner"
        style={{ width: boxWidth, height: boxHeight }}
      >
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={highContrast ? { filter: "invert(1) hue-rotate(180deg)" } : undefined}
        >
          <div className="relative">
            <PdfPageCanvas pdf={pdf} pageNumber={pageNumber} width={boxWidth} />
            <AnnotationLayer
              uid={uid}
              textbookId={textbookId}
              page={pageNumber}
              width={boxWidth}
              height={boxHeight}
              tool={tool}
              color={color}
              readOnly={readOnly}
            />
          </div>
        </div>
        {bookmarked && (
          <div className="absolute right-3 top-0 h-8 w-5 rounded-b bg-amber-400 shadow" />
        )}
        <div className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-slate-400">
          {pageNumber}
        </div>
      </div>
    );
  },
);
