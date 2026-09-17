import type { PageLink } from "./pageLinks";

/**
 * 쪽에서 찾아낸 QR코드/링크 영역을 눌렀을 때 새 창에서 열어 준다. 필기/노트 도구를 쓰는
 * 중에는(연필로 그 위를 지나가야 할 수도 있으니) 클릭을 가로채지 않도록 도구가 없을 때만
 * 활성화된다.
 */
export function PageLinkOverlay({ links, interactive }: { links: PageLink[]; interactive: boolean }) {
  if (links.length === 0) return null;

  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {links.map((link, i) => (
        <button
          key={`${link.url}-${i}`}
          type="button"
          title={`새 창에서 열기: ${link.url}`}
          className={`absolute rounded ring-2 ring-blue-400/0 transition hover:ring-blue-400/70 hover:bg-blue-400/10 ${
            interactive ? "cursor-pointer" : ""
          }`}
          style={{
            left: `${link.x * 100}%`,
            top: `${link.y * 100}%`,
            width: `${link.w * 100}%`,
            height: `${link.h * 100}%`,
            pointerEvents: interactive ? "auto" : "none",
          }}
          onClick={(e) => {
            e.stopPropagation();
            window.open(link.url, "_blank", "noopener,noreferrer");
          }}
        />
      ))}
    </div>
  );
}
