/**
 * μ's Song Database
 * v2.8.5 Detail Context Bar
 *
 * 詳細ページを下へスクロールしたとき、
 * 現在見ている曲・イベント・会場名を固定表示する。
 */

export function setupDetailContext(options = {}) {
  const typeLabel =
    String(options.typeLabel || "").trim();

  const titleElement =
    document.querySelector(
      options.titleSelector || ""
    );

  const heroElement =
    document.querySelector(
      options.heroSelector || ".hero"
    );

  if (
    !typeLabel ||
    !titleElement ||
    !heroElement
  ) {
    return;
  }

  injectDetailContextStyles_();

  const bar =
    document.createElement("div");

  bar.className =
    "detail-context-bar";

  bar.setAttribute(
    "aria-hidden",
    "true"
  );

  bar.innerHTML = `
    <div class="detail-context-inner">
      <span class="detail-context-type">
        ${escapeContextHtml_(typeLabel)}
      </span>

      <strong
        class="detail-context-title"
      ></strong>

      <button
        class="detail-context-top-button"
        type="button"
        aria-label="ページ上部へ戻る"
      >
        ↑ 上へ
      </button>
    </div>
  `;

  document.body.appendChild(bar);

  const titleOutput =
    bar.querySelector(
      ".detail-context-title"
    );

  const topButton =
    bar.querySelector(
      ".detail-context-top-button"
    );

  const updateTitle = () => {
    const title =
      String(
        titleElement.textContent || ""
      )
        .replace(/\s+/g, " ")
        .trim();

    titleOutput.textContent =
      title &&
      !title.includes("読み込み中")
        ? title
        : typeLabel + "詳細";
  };

  updateTitle();

  const titleObserver =
    new MutationObserver(
      updateTitle
    );

  titleObserver.observe(
    titleElement,
    {
      childList: true,
      characterData: true,
      subtree: true
    }
  );

  const showBar = () => {
    bar.classList.add(
      "is-visible"
    );

    bar.setAttribute(
      "aria-hidden",
      "false"
    );
  };

  const hideBar = () => {
    bar.classList.remove(
      "is-visible"
    );

    bar.setAttribute(
      "aria-hidden",
      "true"
    );
  };

  if (
    "IntersectionObserver" in window
  ) {
    const observer =
      new IntersectionObserver(
        entries => {
          const entry =
            entries[0];

          if (
            entry &&
            !entry.isIntersecting &&
            entry.boundingClientRect.bottom < 0
          ) {
            showBar();
          } else {
            hideBar();
          }
        },
        {
          rootMargin:
            "-68px 0px 0px 0px",
          threshold: 0
        }
      );

    observer.observe(
      heroElement
    );

  } else {
    const updateVisibility = () => {
      const rect =
        heroElement.getBoundingClientRect();

      if (rect.bottom < 68) {
        showBar();
      } else {
        hideBar();
      }
    };

    window.addEventListener(
      "scroll",
      updateVisibility,
      {
        passive: true
      }
    );

    updateVisibility();
  }

  topButton.addEventListener(
    "click",
    () => {
      window.scrollTo({
        top: 0,
        behavior:
          window.matchMedia(
            "(prefers-reduced-motion: reduce)"
          ).matches
            ? "auto"
            : "smooth"
      });
    }
  );
}


function escapeContextHtml_(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


function injectDetailContextStyles_() {
  if (
    document.getElementById(
      "detailContextStyles"
    )
  ) {
    return;
  }

  const style =
    document.createElement("style");

  style.id =
    "detailContextStyles";

  style.textContent = `
    .detail-context-bar {
      position: fixed;
      z-index: 2200;
      top: 0;
      right: 0;
      left: 0;
      padding: 0 18px;
      pointer-events: none;
      visibility: hidden;
      opacity: 0;
      transform: translateY(-12px);
      transition:
        opacity .18s ease,
        transform .18s ease,
        visibility 0s linear .18s;
    }

    .detail-context-bar.is-visible {
      visibility: visible;
      opacity: 1;
      transform: translateY(0);
      transition-delay: 0s;
    }

    .detail-context-inner {
      width: min(1090px, 100%);
      min-height: 50px;
      margin: 0 auto;
      padding: 8px 10px 8px 13px;
      display: grid;
      grid-template-columns:
        auto minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      border: 1px solid rgba(221,225,235,.96);
      border-radius: 0 0 15px 15px;
      background: rgba(255,255,255,.96);
      box-shadow:
        0 12px 28px rgba(23,32,51,.13);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      pointer-events: none;
    }

    .detail-context-bar.is-visible
    .detail-context-inner {
      pointer-events: auto;
    }

    .detail-context-type {
      padding: 5px 9px;
      border-radius: 999px;
      background: #eceaff;
      color: #4f46e5;
      font-size: 10px;
      font-weight: 900;
      white-space: nowrap;
    }

    .detail-context-title {
      min-width: 0;
      overflow: hidden;
      color: #172033;
      font-size: 14px;
      font-weight: 900;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .detail-context-top-button {
      min-height: 34px;
      padding: 0 11px;
      border: 0;
      border-radius: 10px;
      background: #4f46e5;
      color: #fff;
      font-size: 11px;
      font-weight: 900;
      cursor: pointer;
    }

    @media (max-width: 820px) {
      .detail-context-bar {
        top: 0;
        padding: 0 8px;
      }

      .detail-context-inner {
        min-height: 46px;
        padding: 7px 8px 7px 10px;
        border-radius: 0 0 13px 13px;
      }

      .detail-context-title {
        font-size: 12px;
      }

      .detail-context-top-button {
        padding: 0 9px;
      }
    }

    @media (
      prefers-reduced-motion: reduce
    ) {
      .detail-context-bar {
        transition: none;
      }
    }
  `;

  document.head.appendChild(
    style
  );
}
