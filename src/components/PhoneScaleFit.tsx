import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// 가로 폭이 이보다 좁으면 "핸드폰"으로 보고 축소 모드를 적용한다. 한때 "짧은
// 쪽"(가로 모드면 높이) 기준으로 판단하도록 바꿔서 핸드폰 가로 모드까지
// 잡으려 했는데, 그러면 태블릿이나 PC에서도 브라우저 창 높이가 이 기준보다
// 낮아지기만 하면(창을 작게 띄우거나 노트북처럼 화면이 낮은 경우) 태블릿/PC인데도
// 핸드폰 모드로 잘못 축소되는 문제가 있었다. 태블릿/PC를 절대 건드리지 않는 게
// 더 중요하므로, 너비만 보는 원래 방식으로 되돌린다 - 핸드폰을 가로로 눕히면
// 이 축소 모드가 적용되지 않지만(폭이 커지므로), 세로 모드에서는 그대로 잘 된다.
const PHONE_BREAKPOINT = 700;
// 안쪽 내용은 항상 이 크기(태블릿 가로 화면 하나)로 렌더링해 두고 화면에 맞게
// CSS로 축소만 한다 - 글씨/버튼/사각박스 크기 등 모든 비율이 태블릿과 똑같이
// 유지된다.
const REFERENCE_WIDTH = 1024;
const REFERENCE_HEIGHT = 768;

// 모바일 브라우저는 주소창이 나타났다 사라졌다 하면서 window.innerWidth/Height가
// 화면에 실제로 보이는 크기와 다르게 보고될 때가 있다(예: 주소창이 보이는데도
// 주소창이 없을 때 기준 높이를 돌려주는 경우) - 그러면 축소 배율을 실제보다 크게
// 잡아서 화면 아래가 잘리거나 다른 요소와 겹쳐 보이는 문제가 생긴다.
// window.visualViewport는 실제로 지금 보이는 영역을 더 정확히 알려주므로 있으면
// 그걸 우선 쓴다.
function readViewport() {
  const vv = window.visualViewport;
  if (vv) return { w: vv.width, h: vv.height };
  return { w: window.innerWidth, h: window.innerHeight };
}

export function isPhoneViewport(w?: number) {
  const v = w !== undefined ? w : readViewport().w;
  return v < PHONE_BREAKPOINT;
}

function usePhoneScale() {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    const update = () => setViewport(readViewport());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
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
 * 핸드폰처럼 화면이 좁을 때(세로/가로 모두), 반응형으로 새로 배치하는 대신
 * 태블릿/PC 레이아웃을 통째로 줄여서 그대로 보여준다("아주 작게 보이더라도
 * 태블릿에 보이는 그대로"). 화면이 좁지 않으면(태블릿/PC) 아무 것도 하지 않고
 * 그대로 렌더링한다.
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
