import type { ActivityZone } from "./activityZones";

/**
 * "준비하기/활동하기/계획하기/실천하기" 구간을 눌러서 그 부분만 화면에 꽉 차게
 * 확대해 볼 수 있게 하는 투명한 클릭 영역. 필기 도구를 쓰는 중에는(그 위에 그려야
 * 할 수도 있으니) 클릭을 가로채지 않도록 도구가 없을 때만 활성화된다.
 */
export function ActivityZoneOverlay({
  zones,
  interactive,
  onActivate,
}: {
  zones: ActivityZone[];
  interactive: boolean;
  onActivate: (zone: ActivityZone, el: HTMLDivElement) => void;
}) {
  if (zones.length === 0) return null;

  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {zones.map((zone, i) => (
        <div
          key={i}
          role={interactive ? "button" : undefined}
          title="눌러서 이 부분 확대해서 보기"
          className={`absolute rounded-lg ring-2 ring-orange-400/0 transition hover:ring-orange-400/60 hover:bg-orange-400/5 ${
            interactive ? "cursor-zoom-in" : ""
          }`}
          style={{
            left: `${zone.x * 100}%`,
            top: `${zone.y * 100}%`,
            width: `${zone.w * 100}%`,
            height: `${zone.h * 100}%`,
            pointerEvents: interactive ? "auto" : "none",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onActivate(zone, e.currentTarget);
          }}
        />
      ))}
    </div>
  );
}
