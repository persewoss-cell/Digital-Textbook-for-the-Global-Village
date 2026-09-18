import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { AppShell } from "@/components/AppShell";
import { getFirstTextbookForGrade } from "@/lib/firestore";
import { loadPdf } from "@/lib/pdf";
import { PdfPageCanvas } from "@/pages/TextbookViewer/PdfPageCanvas";
import { GRADES, type Grade, type TextbookDoc } from "@/types";

const COVER_WIDTH = 220;

function GradeCoverCard({
  grade,
  textbook,
  onOpen,
}: {
  grade: Grade;
  textbook: TextbookDoc | null | undefined; // undefined = 아직 불러오는 중, null = 없음
  onOpen: () => void;
}) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);

  useEffect(() => {
    if (!textbook) {
      setPdf(null);
      return;
    }
    let cancelled = false;
    loadPdf(textbook.filePath).then((doc) => {
      if (!cancelled) setPdf(doc);
    });
    return () => {
      cancelled = true;
    };
  }, [textbook]);

  const disabled = !textbook;

  return (
    <button
      onClick={onOpen}
      disabled={disabled}
      className={`card flex flex-col items-center gap-3 p-5 text-center transition ${
        disabled ? "cursor-not-allowed opacity-50" : "hover:shadow-md"
      }`}
    >
      <div
        className="flex items-center justify-center overflow-hidden rounded-lg bg-slate-100 shadow-inner"
        style={{ width: COVER_WIDTH, height: COVER_WIDTH * 1.3 }}
      >
        {pdf ? (
          <PdfPageCanvas pdf={pdf} pageNumber={1} renderWidth={COVER_WIDTH} displayWidth={COVER_WIDTH} />
        ) : (
          <span className="px-4 text-xs text-slate-400">
            {textbook === undefined ? "불러오는 중..." : "등록된 교재가 없어요"}
          </span>
        )}
      </div>
      <div>
        <p className="text-lg font-bold text-slate-800">{grade}학년</p>
        <p className="text-xs text-slate-500">{textbook?.title ?? "-"}</p>
      </div>
    </button>
  );
}

export default function GradePreviewPage() {
  const navigate = useNavigate();
  const [textbooks, setTextbooks] = useState<Record<Grade, TextbookDoc | null | undefined>>({
    3: undefined,
    4: undefined,
    5: undefined,
    6: undefined,
  });

  useEffect(() => {
    GRADES.forEach((g) => {
      getFirstTextbookForGrade(g).then((t) => {
        setTextbooks((prev) => ({ ...prev, [g]: t }));
      });
    });
  }, []);

  return (
    <AppShell
      right={
        <Link to="/" className="btn-ghost">
          나가기
        </Link>
      }
    >
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold">학년별 교재 체험하기</h1>
          <p className="mt-1 text-sm text-slate-500">
            학년을 골라 학생처럼 디지털 교과서를 둘러볼 수 있어요. 필기와 메모는 저장되지 않아요.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {GRADES.map((g) => (
            <GradeCoverCard
              key={g}
              grade={g}
              textbook={textbooks[g]}
              onOpen={() => {
                const t = textbooks[g];
                if (t) navigate(`/preview/${t.id}`);
              }}
            />
          ))}
        </div>
      </div>
    </AppShell>
  );
}
