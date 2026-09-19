import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { AppShell } from "@/components/AppShell";
import { getFirstTextbookForGrade } from "@/lib/firestore";
import { loadPdf } from "@/lib/pdf";
import { PdfPageCanvas } from "@/pages/TextbookViewer/PdfPageCanvas";
import { GRADES, type Grade, type TextbookDoc } from "@/types";

// 이 표지 상자를 처음(실제 너비를 재기 전) 그릴 때만 쓰는 값. 실제 표지 크기는
// 아래 ResizeObserver로 상자의 진짜 너비를 재서 정한다 - 고정 픽셀 값을 그대로
// 쓰면 핸드폰처럼 그리드 칸이 이 값보다 좁을 때 표지가 칸 밖으로 넘쳐서 옆 칸과
// 겹쳐 보이는 문제가 있었다.
const COVER_WIDTH = 220;
const COVER_ASPECT = 1.3;

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
  const coverRef = useRef<HTMLDivElement>(null);
  const [coverWidth, setCoverWidth] = useState(COVER_WIDTH);

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

  // 표지 상자는 항상 그리드 칸(카드) 너비에 꽉 차게(w-full) 두고, 그 실제 픽셀
  // 너비를 재서 캔버스 렌더링 크기로 쓴다 - 화면이 좁아도(핸드폰) 칸 안에 정확히
  // 맞게 줄어든다.
  useEffect(() => {
    const el = coverRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setCoverWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
        ref={coverRef}
        className="flex w-full items-center justify-center overflow-hidden rounded-lg bg-slate-100 shadow-inner"
        style={{ aspectRatio: `1 / ${COVER_ASPECT}` }}
      >
        {pdf ? (
          <PdfPageCanvas pdf={pdf} pageNumber={1} renderWidth={coverWidth} displayWidth={coverWidth} />
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
            학년을 골라 학생처럼 디지털 교재를 둘러볼 수 있어요. 필기와 메모는 저장되지 않아요.
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

        <p className="mt-10 text-center text-xs text-slate-400">만든이: 강형권 선생님</p>
      </div>
    </AppShell>
  );
}
