import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { usePhoneScaleHeight } from "./PhoneScaleFit";

export function AppShell({
  children,
  fullBleed,
  badge,
  right,
}: {
  children: ReactNode;
  fullBleed?: boolean;
  badge?: string;
  right?: ReactNode;
}) {
  // PhoneScaleFit 안에서는(핸드폰 축소 모드) dvh/vh 단위가 조상의 transform:
  // scale과 무관하게 항상 "진짜" 화면 기준으로 계산되므로, h-dvh 대신 이 고정
  // 높이를 직접 채워야 태블릿 레이아웃 그대로 축소된 상자 안에 딱 맞게 그려진다.
  const phoneScaleHeight = usePhoneScaleHeight();
  return (
    // 태블릿/모바일 브라우저에서는 h-screen(100vh)이 주소창 등 브라우저 UI가 접혔을 때
    // 기준으로 계산되어, 실제 보이는 화면보다 커진 만큼 안쪽 교재 영역이 넘쳐서
    // 스크롤바가 생기는 문제가 있었다. h-dvh(동적 뷰포트 높이)는 실제 보이는 높이를
    // 기준으로 하므로 이 문제를 없애준다.
    <div
      className={phoneScaleHeight ? "flex flex-col" : "flex h-dvh flex-col"}
      style={phoneScaleHeight ? { height: phoneScaleHeight } : undefined}
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
        <Link to="/" className="font-bold text-brand-700">
          🌍 학교자율시간 디지털 교재
        </Link>
        <div className="flex items-center gap-3">
          {badge && (
            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              {badge}
            </span>
          )}
          {right}
        </div>
      </header>
      <main className={fullBleed ? "flex-1 overflow-hidden" : "flex-1 overflow-auto p-6"}>
        {children}
      </main>
    </div>
  );
}
