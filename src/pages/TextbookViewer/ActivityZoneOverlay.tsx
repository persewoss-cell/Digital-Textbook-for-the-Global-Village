import { useRef, useState } from "react";
import type { ActivityZone, Rect } from "./activityZones";

function RectStyle(r: Rect) {
  return {
    left: `${r.x * 100}%`,
    top: `${r.y * 100}%`,
    width: `${r.w * 100}%`,
    height: `${r.h * 100}%`,
  };
}

/**
 * "준비하기/활동하기/계획하기/실천하기/키워가기" 구간(및 그 안의 "1","2" 같은 세부 문항,
 * 사진)을 눌러서 그 부분만 화면에 꽉 차게 확대해 볼 수 있게 하는 클릭 영역.
 *
 * 실제로 누를 수 있는 범위(trigger)는 캐릭터 아이콘/번호 배지만큼만 작다 - 그 옆 본문을
 * 눌렀을 때는(필기 등) 반응하지 않는다. 대신 그 작은 범위에 마우스를 올리거나(hover)
 * 손가락으로 누르면, 실제로 확대될 전체 범위(target)를 테두리로 미리 보여준다.
 *
 * 마우스는 올리면(hover) 미리 테두리가 보이고 한 번 누르면 바로 확대된다. 손가락(터치)은
 * hover가 없어서, 처음 누르면 테두리와 가운데 확대 아이콘만 보여주고("정말 여기?" 확인),
 * 아이콘을 다시 누르거나 같은 trigger를 한 번 더 누르면 그때 확대한다. 다른 곳을 누르면
 * (BookPage의 배경 클릭 처리에서) 테두리가 사라진다.
 *
 * 필기 도구를 쓰는 중에는(연필로 그 위를 지나가야 할 수도 있으니) 클릭을 가로채지 않도록
 * 도구가 없을 때만 활성화된다.
 */
export function ActivityZoneOverlay({
  zones,
  interactive,
  armedKey,
  prefix,
  onArm,
  onActivate,
}: {
  zones: ActivityZone[];
  interactive: boolean;
  armedKey: string | null;
  prefix: "step" | "sub" | "img";
  onArm: (key: string) => void;
  onActivate: (zone: ActivityZone, el: HTMLDivElement, kind: "step" | "sub" | "img") => void;
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const targetRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  if (zones.length === 0) return null;

  // scrollIntoView는 "확대될 전체 범위(target)" 기준으로 해야, 작은 트리거만 화면
  // 가운데로 오는 게 아니라 활동 전체가 잘 보이게 스크롤된다.
  const activate = (zone: ActivityZone, key: string, fallback: HTMLDivElement) => {
    onActivate(zone, targetRefs.current.get(key) ?? fallback, prefix);
  };

  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {zones.map((zone, i) => {
        const key = `${prefix}:${i}`;
        const armed = armedKey === key;
        const previewing = armed || hoveredKey === key;
        return (
          <div key={key}>
            {previewing && (
              <div
                ref={(el) => {
                  if (el) targetRefs.current.set(key, el);
                  else targetRefs.current.delete(key);
                }}
                className="absolute flex items-center justify-center rounded-lg bg-orange-400/10 ring-2 ring-orange-500"
                style={{ ...RectStyle(zone.target), pointerEvents: "none" }}
              >
                {armed && (
                  <button
                    type="button"
                    data-no-pan="true"
                    className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-500 text-xl text-white shadow-lg"
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      activate(zone, key, e.currentTarget.parentElement as HTMLDivElement);
                    }}
                    aria-label="확대하기"
                  >
                    🔍
                  </button>
                )}
              </div>
            )}
            <div
              role={interactive ? "button" : undefined}
              title="눌러서 이 부분 확대해서 보기"
              data-no-pan="true"
              className={interactive ? "absolute cursor-zoom-in" : "absolute"}
              style={{ ...RectStyle(zone.trigger), pointerEvents: interactive ? "auto" : "none" }}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") setHoveredKey(key);
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === "mouse") setHoveredKey((k) => (k === key ? null : k));
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => {
                e.stopPropagation();
                if (e.pointerType === "mouse") {
                  activate(zone, key, e.currentTarget);
                  return;
                }
                // 터치/펜: 처음 누르면 테두리만 보여주고, 이미 켜져 있던(같은 구간) 상태에서
                // 다시 누르면 그때 확대한다.
                if (armed) activate(zone, key, e.currentTarget);
                else onArm(key);
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
