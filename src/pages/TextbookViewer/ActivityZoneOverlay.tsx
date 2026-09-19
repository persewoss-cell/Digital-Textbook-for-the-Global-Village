import type { ActivityZone } from "./activityZones";

/**
 * "준비하기/활동하기/계획하기/실천하기/키워가기" 구간(및 그 안의 "1","2" 같은 세부 문항)을
 * 눌러서 그 부분만 화면에 꽉 차게 확대해 볼 수 있게 하는 클릭 영역.
 *
 * 마우스는 올리면(hover) 미리 테두리가 보이고 한 번 누르면 바로 확대된다. 손가락(터치)은
 * hover가 없어서, 처음 누르면 그 구간에 테두리와 가운데 확대 아이콘만 보여주고("정말 여기?"
 * 확인), 아이콘을 다시 누르거나 같은 구간을 한 번 더 누르면 그때 확대한다. 다른 곳을 누르면
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
  prefix: string;
  onArm: (key: string) => void;
  onActivate: (zone: ActivityZone, el: HTMLDivElement) => void;
}) {
  if (zones.length === 0) return null;

  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {zones.map((zone, i) => {
        const key = `${prefix}:${i}`;
        const armed = armedKey === key;
        return (
          <div
            key={key}
            role={interactive ? "button" : undefined}
            title="눌러서 이 부분 확대해서 보기"
            className={`absolute flex items-center justify-center rounded-lg ring-2 transition ${
              armed
                ? "bg-orange-400/10 ring-orange-500"
                : "ring-orange-400/0 hover:bg-orange-400/5 hover:ring-orange-400/60"
            } ${interactive ? "cursor-zoom-in" : ""}`}
            style={{
              left: `${zone.x * 100}%`,
              top: `${zone.y * 100}%`,
              width: `${zone.w * 100}%`,
              height: `${zone.h * 100}%`,
              pointerEvents: interactive ? "auto" : "none",
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => {
              e.stopPropagation();
              if (e.pointerType === "mouse") {
                onActivate(zone, e.currentTarget);
                return;
              }
              // 터치/펜: 처음 누르면 테두리만 보여주고, 이미 켜져 있던(같은 구간) 상태에서
              // 다시 누르면 그때 확대한다.
              if (armed) onActivate(zone, e.currentTarget);
              else onArm(key);
            }}
          >
            {armed && (
              <button
                type="button"
                className="pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-500 text-xl text-white shadow-lg"
                onPointerDown={(e) => e.stopPropagation()}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  onActivate(zone, e.currentTarget.parentElement as HTMLDivElement);
                }}
                aria-label="확대하기"
              >
                🔍
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
