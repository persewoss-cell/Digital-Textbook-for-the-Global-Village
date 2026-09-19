import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// 이보다 좁으면 "핸드폰"으로 보고 축소 모드를 적용한다. 태블릿 세로 모드(보통
// 768px 이상)는 이미 반응형 레이아웃이 괜찮아서 건드리지 않는다.
const PHONE_BREAKPOINT = 700;
// 안쪽 내용은 항상 이 크기(태블릿 가로 화면 하나)로 렌더링해 두고 화면에 맞게
// CSS로 축소만 한다 - 글씨/버튼/사각박스 크기 등 모든 비율이 태블릿과 똑같이
// 유지된다.
const REFERENCE_WIDTH = 1024;
const REFERENCE_HEIGHT = 768;

function usePhoneScale() {
  const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  const isPhone = viewport.w < PHONE_BREAKPOINT;
  const scale = isPhone ? Math.min(viewport.w / REFERENCE_WIDTH, viewport.h / REFERENCE_HEIGHT) : 1;
  return { isPhone, scale, viewport };
}

// AppShell이 h-dvh(실제 화면 높이) 대신 이 고정 높이를 쓰도록 알려주는 값. dvh/vh
// 단위는 축소 래퍼 안에서도 항상 "진짜" 화면 기준으로 계산되기 때문에(조상의
// transform: scale의 영향을 받지 않음), AppShell을 REFERENCE_HEIGHT짜리 상자
// 기준으로 직접 채우도록 바꿔줘야 한다.
const PhoneScaleHeightContext = createContext<number | null>(null);
export function usePhoneScaleHeight() {
  return useContext(PhoneScaleHeightContext);
}

/**
 * 핸드폰처럼 화면이 좁을 때, 반응형으로 새로 배치하는 대신 태블릿/PC 레이아웃을
 * 통째로 줄여서 그대로 보여준다("아주 작게 보이더라도 태블릿에 보이는 그대로").
 * 화면이 좁지 않으면(태블릿/PC) 아무 것도 하지 않고 그대로 렌더링한다.
 */
export function PhoneScaleFit({ children }: { children: ReactNode }) {
  const { isPhone, scale, viewport } = usePhoneScale();

  if (!isPhone) return <>{children}</>;

  return (
    <div
      className="flex items-center justify-center bg-slate-900"
      style={{ width: viewport.w, height: viewport.h, overflow: "hidden" }}
    >
      <div
        style={{
          width: REFERENCE_WIDTH,
          height: REFERENCE_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          flexShrink: 0,
        }}
      >
        <PhoneScaleHeightContext.Provider value={REFERENCE_HEIGHT}>{children}</PhoneScaleHeightContext.Provider>
      </div>
    </div>
  );
}
