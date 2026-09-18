import type { ImageRegion } from "./pageImages";

/**
 * 쪽 안의 사진 위치를 덮는 투명한 클릭 영역. 누르면 그 사진만 잘라서 팝업으로 크게
 * 보여준다(교재 전체를 확대하는 대신, 사진만 따로 크게).
 */
export function ImageZoneOverlay({
  regions,
  interactive,
  onActivate,
}: {
  regions: ImageRegion[];
  interactive: boolean;
  onActivate: (region: ImageRegion) => void;
}) {
  if (regions.length === 0) return null;

  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {regions.map((region, i) => (
        <button
          key={i}
          type="button"
          title="눌러서 사진 크게 보기"
          className={`absolute rounded ring-2 ring-emerald-400/0 transition hover:ring-emerald-400/70 hover:bg-emerald-400/10 ${
            interactive ? "cursor-zoom-in" : ""
          }`}
          style={{
            left: `${region.x * 100}%`,
            top: `${region.y * 100}%`,
            width: `${region.w * 100}%`,
            height: `${region.h * 100}%`,
            pointerEvents: interactive ? "auto" : "none",
          }}
          onClick={(e) => {
            e.stopPropagation();
            onActivate(region);
          }}
        />
      ))}
    </div>
  );
}
