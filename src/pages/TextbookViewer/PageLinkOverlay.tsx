import { toEmbeddableUrl, type PageLink } from "./pageLinks";

const TITLES: Record<PageLink["kind"], string> = {
  url: "새 창에서 열기",
  video: "눌러서 영상 크게 보기",
  citation: "출처를 새 창에서 검색해 보기",
};

/**
 * 쪽에서 찾아낸 QR코드/링크/출처 표기 영역을 누르면: 유튜브 등 임베드 가능한 영상은
 * 팝업 안에서 바로 재생하고, 그 외 링크는 새 창으로 열고, 링크 없이 출처만 적힌
 * 경우는 그 출처를 새 창에서 검색해 준다. 필기/노트 도구를 쓰는 중에는(연필로 그
 * 위를 지나가야 할 수도 있으니) 클릭을 가로채지 않도록 도구가 없을 때만 활성화된다.
 */
export function PageLinkOverlay({
  links,
  interactive,
  onOpenVideo,
}: {
  links: PageLink[];
  interactive: boolean;
  onOpenVideo: (embedUrl: string) => void;
}) {
  if (links.length === 0) return null;

  return (
    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
      {links.map((link, i) => (
        <button
          key={`${link.url}-${i}`}
          type="button"
          title={`${TITLES[link.kind]}: ${link.url}`}
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
            const embed = link.kind === "video" ? toEmbeddableUrl(link.url) : null;
            if (embed) onOpenVideo(embed);
            else window.open(link.url, "_blank", "noopener,noreferrer");
          }}
        />
      ))}
    </div>
  );
}
