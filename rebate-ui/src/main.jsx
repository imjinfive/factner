import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AnimatePresence,
  MotionConfig,
  motion,
  useReducedMotion,
} from "motion/react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowLeft,
  Check,
  CheckCircle,
  SealCheck,
  Heart,
  MagnifyingGlass,
  SlidersHorizontal,
  X,
  Package,
  Cube,
  Gift,
  Tote,
  Stack,
  SquaresFour,
  MapPin,
  Star,
  Camera,
  ClipboardText,
  CaretRight,
  CaretDown,
  Plus,
  PaperPlaneTilt,
  Sun,
  Moon,
  Sparkle,
  Scales,
  Tray,
  Clock,
} from "@phosphor-icons/react";
import {
  categories,
  suppliers,
  filterSuppliers,
  eligibleSuppliers,
  validateRequest,
  readSaved,
} from "./model";
import "./styles.css";
import ServiceIntro from "./ServiceIntro";

const spring = { type: "spring", stiffness: 420, damping: 30, mass: 0.8 };
const categoryIcons = [SquaresFour, Cube, Package, Gift, Tote, Stack];
const money = (n) => new Intl.NumberFormat("ko-KR").format(n);
const navItems = [
  ["intro", "서비스 소개"],
  ["explore", "업체 찾기"],
  ["guide", "이용 안내"],
  ["membership", "멤버십"],
];

function Button({ children, className = "", tone = "primary", ...props }) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      className={`button ${tone} ${className}`}
      whileHover={reduce ? {} : { y: -2 }}
      whileTap={reduce ? {} : { scale: 0.96, y: 0 }}
      transition={spring}
      {...props}
    >
      {children}
    </motion.button>
  );
}
function Photo({ index, className = "", label }) {
  return (
    <div
      role="img"
      aria-label={label || "패키징 제작 사례 예시 이미지"}
      className={`product-photo photo-${index} ${className}`}
    />
  );
}
function Modal({ open, onClose, title, description, children, wide = false }) {
  const reduce = useReducedMotion();
  return (
    <Dialog.Root open={open} onOpenChange={(value) => !value && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                document.querySelector("[data-return-focus]")?.focus();
              }}
            >
              <motion.div
                className={`modal ${wide ? "wide" : ""}`}
                initial={
                  reduce ? { opacity: 0 } : { opacity: 0, y: 35, scale: 0.97 }
                }
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={
                  reduce ? { opacity: 0 } : { opacity: 0, y: 25, scale: 0.98 }
                }
                transition={spring}
              >
                <div className="modal-heading">
                  <div>
                    <Dialog.Title>{title}</Dialog.Title>
                    <Dialog.Description>{description}</Dialog.Description>
                  </div>
                  <Dialog.Close asChild>
                    <Button
                      tone="ghost"
                      className="icon-button"
                      aria-label="닫기"
                    >
                      <X size={22} />
                    </Button>
                  </Dialog.Close>
                </div>
                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
function Empty({ title, description, action }) {
  return (
    <div className="empty">
      <Tray size={42} weight="duotone" />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

function SupplierCard({
  supplier: s,
  favorites,
  compare,
  openModal,
  toggleFavorite,
  toggleCompare,
}) {
  const reduce = useReducedMotion();
  return (
    <motion.article
      layout={!reduce}
      className="supplier-card"
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={spring}
    >
      <div className="card-photo-wrap">
        <button
          className="photo-link"
          onClick={() => openModal({ type: "supplier", supplier: s })}
          aria-label={`${s.name} 상세 보기`}
        >
          <Photo index={s.image} label={`${s.name}의 패키징 예시`} />
        </button>
        <Button
          tone="glass"
          className={`favorite icon-button ${favorites.includes(s.id) ? "is-saved" : ""}`}
          aria-label={`${s.name} ${favorites.includes(s.id) ? "찜 해제" : "찜하기"}`}
          aria-pressed={favorites.includes(s.id)}
          onClick={() => toggleFavorite(s.id)}
        >
          <Heart
            size={22}
            weight={favorites.includes(s.id) ? "fill" : "regular"}
          />
        </Button>
      </div>
      <div className="card-body">
        <div className="card-status">
          <span className={s.visit ? "verified" : "muted"}>
            {s.visit ? (
              <SealCheck weight="fill" size={16} />
            ) : (
              <Clock size={16} />
            )}{" "}
            {s.visit ? "현장 확인" : "방문 예정"}
          </span>
          <span>
            <MapPin size={13} /> {s.area}
          </span>
        </div>
        <button
          className="card-title"
          onClick={() => openModal({ type: "supplier", supplier: s })}
        >
          <h3>{s.name}</h3>
          <ArrowUpRight size={20} />
        </button>
        <div className="tags">
          {s.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
        <div className="card-bottom">
          <span>
            <Star size={15} weight="fill" /> <strong>{s.rating}</strong>{" "}
            <span className="muted">({s.reviews})</span>
          </span>
          <span>
            최소 <strong>{money(s.moq)}개</strong>
          </span>
        </div>
        <label className="compare-check">
          <input
            type="checkbox"
            checked={compare.includes(s.id)}
            onChange={() => toggleCompare(s.id)}
          />
          <span>비교함에 담기</span>
        </label>
      </div>
    </motion.article>
  );
}

function App() {
  const [page, setPage] = useState(() =>
    ["intro", "guide", "membership", "activity"].includes(location.hash.slice(1))
      ? location.hash.slice(1)
      : "explore",
  );
  const [category, setCategory] = useState("전체");
  const [query, setQuery] = useState("");
  const [visitedOnly, setVisitedOnly] = useState(false);
  const [smallOnly, setSmallOnly] = useState(false);
  const [sort, setSort] = useState("추천순");
  const [filterOpen, setFilterOpen] = useState(false);
  const [favorites, setFavorites] = useState(() =>
    readSaved("rebate:favorites", []),
  );
  const [requests, setRequests] = useState(() =>
    readSaved("rebate:requests", []),
  );
  const [compare, setCompare] = useState([]);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState("");
  const [audience, setAudience] = useState("brand");
  const [activityTab, setActivityTab] = useState("requests");
  const [theme, setTheme] = useState(() =>
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  const reduce = useReducedMotion();
  const toastTimer = useRef();
  const results = filterSuppliers(suppliers, {
    category,
    query,
    visitedOnly,
    smallOnly,
    sort,
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const sync = () => {
      if (location.hash === "#main") return;
      setPage(
        ["intro", "guide", "membership", "activity"].includes(location.hash.slice(1))
          ? location.hash.slice(1)
          : "explore",
      );
    };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  function notify(message) {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 3400);
  }
  function navigate(next) {
    setPage(next);
    location.hash = next;
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function persist(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      notify("브라우저에 저장하지 못했어요. 현재 화면에서만 유지돼요.");
      return false;
    }
  }
  function toggleFavorite(id) {
    const next = favorites.includes(id)
      ? favorites.filter((x) => x !== id)
      : [...favorites, id];
    setFavorites(next);
    if (persist("rebate:favorites", next))
      notify(
        next.includes(id) ? "관심 업체에 담았어요." : "관심 업체에서 뺐어요.",
      );
  }
  function toggleCompare(id) {
    if (compare.includes(id)) setCompare(compare.filter((x) => x !== id));
    else if (compare.length < 3) setCompare([...compare, id]);
    else notify("한 번에 3개 업체까지 비교할 수 있어요.");
  }
  function openModal(value) {
    if (!document.activeElement?.closest(".modal")) {
      document
        .querySelector("[data-return-focus]")
        ?.removeAttribute("data-return-focus");
      document.activeElement?.setAttribute("data-return-focus", "");
    }
    setModal(value);
  }
  function startRequest(supplier) {
    openModal({ type: "request", supplier });
  }
  function submitRequest(form, supplier) {
    const item = {
      ...form,
      id: crypto.randomUUID(),
      supplier: supplier?.name || "",
      createdAt: new Date().toISOString(),
    };
    const next = [item, ...requests];
    setRequests(next);
    persist("rebate:requests", next);
    setModal({ type: "success", item });
  }
  function browse() {
    if (page !== "explore") navigate("explore");
    requestAnimationFrame(() =>
      document
        .getElementById("partners")
        ?.scrollIntoView({
          behavior: reduce ? "instant" : "smooth",
          block: "start",
        }),
    );
  }
  const titleByPage = {
    intro: "서비스 소개",
    explore: "좋은 패키징의 시작",
    guide: "이용 안내",
    membership: "멤버십",
    activity: "나의 활동",
  };
  useEffect(() => {
    document.title = `리베이트 | ${titleByPage[page]}`;
  }, [page]);

  return (
    <MotionConfig transition={spring} reducedMotion="user">
      <a
        href="#main"
        className="skip-link"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        본문 바로가기
      </a>
      <header className="site-header">
        <div className="header-inner">
          <button
            className="logo"
            aria-label="리베이트 홈"
            onClick={() => navigate("explore")}
          >
            <Package size={28} weight="fill" />
            <span>
              rebate<span className="logo-dot">.</span>
            </span>
          </button>
          <nav aria-label="주 메뉴">
            {navItems.map(([key, label]) => (
              <button
                key={key}
                onClick={() => navigate(key)}
                className={`nav-link ${page === key ? "active" : ""}`}
                aria-current={page === key ? "page" : undefined}
              >
                {label}
                {page === key && (
                  <motion.span
                    className="nav-indicator"
                    layoutId="nav-indicator"
                  />
                )}
              </button>
            ))}
          </nav>
          <div className="header-actions">
            <button
              className={`activity-link ${page === "activity" ? "active" : ""}`}
              aria-label="나의 활동"
              onClick={() => navigate("activity")}
            >
              <Heart size={19} />
              <span>나의 활동</span>
              {requests.length > 0 && (
                <span className="count">{requests.length}</span>
              )}
            </button>
            <Button className="header-cta" onClick={() => startRequest()}>
              견적 요청하기 <ArrowUpRight size={17} />
            </Button>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={reduce ? false : { opacity: 0, y: page === "intro" ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {page === "intro" && (
              <ServiceIntro
                Button={Button}
                Photo={Photo}
                onExplore={() => navigate("explore")}
                onRequest={() => startRequest()}
                onSupplier={(supplier) => openModal({ type: "supplier", supplier })}
              />
            )}
            {page === "explore" && (
              <>
                <section className="hero shell">
                  <div className="hero-copy">
                    <h1>
                      브랜드의 첫인상,
                      <br />
                      좋은 <span>패키징</span>에서.
                    </h1>
                    <p>패키징 업체를 비교하고, 견적을 받아보세요.</p>
                    <div className="hero-actions">
                      <Button onClick={() => startRequest()}>
                        견적 받기 <ArrowRight size={20} />
                      </Button>
                      <Button tone="white" onClick={browse}>
                        업체 찾기
                      </Button>
                    </div>
                  </div>
                  <motion.div
                    className="hero-visual"
                    initial={reduce ? false : { opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.7 }}
                  >
                    <img
                      src="/images/packaging-hero.png"
                      alt="초록색 단상자, 종이 쇼핑백과 크라프트 택배박스 패키징 예시"
                      width="1536"
                      height="1024"
                      fetchPriority="high"
                    />
                  </motion.div>
                </section>
                <section className="shell explore-section" id="partners">
                  <div className="section-heading">
                    <div>
                      <h2>패키징 업체</h2>
                    </div>
                    <div className="search-box">
                      <MagnifyingGlass size={21} />
                      <input
                        aria-label="업체 및 패키징 검색"
                        placeholder="업체명, 지역, 패키징 검색"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      {query && (
                        <button
                          aria-label="검색어 지우기"
                          onClick={() => setQuery("")}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="categories" aria-label="패키징 종류">
                    {categories.map((c, i) => {
                      const Icon = categoryIcons[i];
                      return (
                        <motion.button
                          whileTap={reduce ? {} : { scale: 0.94 }}
                          key={c}
                          className={`category ${category === c ? "selected" : ""}`}
                          aria-pressed={category === c}
                          onClick={() => setCategory(c)}
                        >
                          <span className="category-icon">
                            <Icon
                              size={27}
                              weight={category === c ? "fill" : "duotone"}
                            />
                          </span>
                          <span>{c}</span>
                          {category === c && (
                            <motion.span
                              layoutId="category-indicator"
                              className="category-indicator"
                            />
                          )}
                        </motion.button>
                      );
                    })}
                  </div>
                  <div className="filter-row">
                    <div className="filter-left">
                      <Button
                        tone={visitedOnly ? "soft" : "outline"}
                        className="filter-chip"
                        aria-pressed={visitedOnly}
                        onClick={() => setVisitedOnly(!visitedOnly)}
                      >
                        <SealCheck size={17} /> 현장 확인
                        {visitedOnly && <Check size={14} />}
                      </Button>
                      <Button
                        tone={smallOnly ? "soft" : "outline"}
                        className="filter-chip"
                        aria-pressed={smallOnly}
                        onClick={() => setSmallOnly(!smallOnly)}
                      >
                        최소 주문 300개 이하{smallOnly && <Check size={14} />}
                      </Button>
                      <Button
                        tone="outline"
                        className="filter-chip"
                        aria-expanded={filterOpen}
                        onClick={() => setFilterOpen(!filterOpen)}
                      >
                        <SlidersHorizontal size={18} />
                        <span>필터</span>
                      </Button>
                    </div>
                    <label className="sort-label">
                      <span className="sr-only">업체 정렬</span>
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option>추천순</option>
                        <option>리뷰 많은 순</option>
                        <option>최소 수량 낮은 순</option>
                      </select>
                      <CaretDown size={14} />
                    </label>
                  </div>
                  <AnimatePresence>
                    {filterOpen && (
                      <motion.div
                        className="filter-panel"
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                      >
                        <div>
                          <label>
                            <input
                              type="checkbox"
                              checked={visitedOnly}
                              onChange={(e) => setVisitedOnly(e.target.checked)}
                            />{" "}
                            현장 확인 완료
                          </label>
                          <label>
                            <input
                              type="checkbox"
                              checked={smallOnly}
                              onChange={(e) => setSmallOnly(e.target.checked)}
                            />{" "}
                            최소 주문 300개 이하
                          </label>
                          <Button
                            tone="ghost"
                            onClick={() => {
                              setCategory("전체");
                              setVisitedOnly(false);
                              setSmallOnly(false);
                              setQuery("");
                              setSort("추천순");
                            }}
                          >
                            초기화
                          </Button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="results-meta">
                    <span>
                      업체 <strong>{results.length}곳</strong>
                    </span>
                    <span>
                      예시 업체
                    </span>
                  </div>
                  <motion.div className="supplier-grid" layout={!reduce}>
                    <AnimatePresence mode="popLayout">
                      {results.map((s) => (
                        <SupplierCard
                          key={s.id}
                          supplier={s}
                          favorites={favorites}
                          compare={compare}
                          openModal={openModal}
                          toggleFavorite={toggleFavorite}
                          toggleCompare={toggleCompare}
                        />
                      ))}
                    </AnimatePresence>
                  </motion.div>
                  {results.length === 0 && (
                    <Empty
                      title="조건에 맞는 업체가 아직 없어요"
                      description="검색어나 필터를 조금 바꿔보세요."
                      action={
                        <Button
                          tone="soft"
                          onClick={() => {
                            setQuery("");
                            setCategory("전체");
                            setVisitedOnly(false);
                            setSmallOnly(false);
                          }}
                        >
                          전체 업체 보기
                        </Button>
                      }
                    />
                  )}
                </section>
                <section className="shell help-banner">
                  <div className="help-icon">
                    <PaperPlaneTilt size={36} weight="duotone" />
                  </div>
                  <div>
                    <h2>여러 업체의 견적을 한 번에 받아보세요.</h2>
                  </div>
                  <Button tone="white" onClick={() => startRequest()}>
                    견적 요청하기 <ArrowRight size={18} />
                  </Button>
                </section>
              </>
            )}
            {page === "guide" && (
              <section className="shell inner-page">
                <div className="page-heading">
                  <h1>이용 안내</h1>
                </div>
                <div className="path-grid">
                  <article>
                    <div className="path-icon">
                      <MagnifyingGlass size={32} />
                    </div>
                    <h2>직접 선택</h2>
                    <ol>
                      <li>제작 사례·현장 사진 확인</li>
                      <li>리뷰·제작 조건 비교</li>
                      <li>업체 선택 후 매칭 요청</li>
                    </ol>
                    <Button tone="soft" onClick={browse}>
                      업체 둘러보기 <ArrowRight size={18} />
                    </Button>
                  </article>
                  <article className="green-path">
                    <div className="path-icon">
                      <PaperPlaneTilt size={32} />
                    </div>
                    <h2>비교 견적</h2>
                    <ol>
                      <li>제품·수량·사양 입력</li>
                      <li>조건에 맞는 업체의 제안 확인</li>
                      <li>견적·샘플 비교 후 업체 선택</li>
                    </ol>
                    <Button onClick={() => startRequest()}>
                      견적 요청하기 <ArrowRight size={18} />
                    </Button>
                  </article>
                </div>
                <div className="guide-note">
                  <SealCheck size={30} weight="duotone" />
                  <div>
                    <h3>현장 확인</h3>
                    <p>
                      리베이트가 작업 현장과 완성품을 직접 살펴보고, 사진과 제작 사양을 기록합니다.
                    </p>
                  </div>
                </div>
                <h2 className="faq-title">자주 묻는 질문</h2>
                <div className="faq">
                  {[
                    [
                      "사양을 잘 몰라도 요청할 수 있나요?",
                      "제품과 수량만 적어도 됩니다. 규격과 재질은 상담하며 정할 수 있어요.",
                    ],
                    [
                      "직접 매칭하면 바로 제작이 시작되나요?",
                      "견적과 샘플을 확인하고 발주를 확정한 뒤 제작합니다.",
                    ],
                    [
                      "플래티넘 업체가 항상 선택되나요?",
                      "조건에 맞는 업체에 우선 제안 기회를 제공합니다. 최종 선택은 브랜드가 합니다.",
                    ],
                    [
                      "지금 요청하면 업체에 전달되나요?",
                      "현재는 미리보기입니다. 요청은 이 브라우저에만 저장되며 업체에 전달되지 않습니다.",
                    ],
                  ].map(([q, a]) => (
                    <details key={q}>
                      <summary>
                        {q}
                        <Plus size={19} />
                      </summary>
                      <p>{a}</p>
                    </details>
                  ))}
                </div>
              </section>
            )}
            {page === "membership" && (
              <section className="shell inner-page">
                <div className="page-heading">
                  <h1>멤버십</h1>
                </div>
                <div className="segmented" aria-label="멤버십 대상">
                  {[
                    ["brand", "브랜드"],
                    ["supplier", "제작업체"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      className={audience === value ? "selected" : ""}
                      aria-pressed={audience === value}
                      onClick={() => setAudience(value)}
                    >
                      {audience === value && (
                        <motion.span layoutId="membership-segment" />
                      )}
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
                <div className="plans">
                  {["실버", "골드", "플래티넘"].map((tier, i) => {
                    const benefits =
                      audience === "brand"
                        ? [
                            [
                              "업체·제작 사례 열람",
                              "견적 비교",
                              "찜·요청 관리",
                            ],
                            [
                              "실버의 모든 혜택",
                              "샘플 수배 지원",
                              "제작 조건 비교",
                            ],
                            [
                              "골드의 모든 혜택",
                              "전담 상담",
                              "업체 발굴·일정 확인",
                            ],
                          ]
                        : [
                            [
                              "업체 프로필 등록",
                              "적격 입찰 참여",
                              "견적·상담 관리",
                            ],
                            [
                              "실버의 모든 혜택",
                              "맞춤 발주 알림",
                              "견적 제안 지원",
                            ],
                            [
                              "골드의 모든 혜택",
                              "적격 입찰 우선권",
                              "대형 발주 영업 지원",
                            ],
                          ];
                    return (
                      <article
                        key={tier}
                        className={`plan ${i === 2 ? "featured" : ""}`}
                      >
                        <h2>{tier}</h2>
                        <div className="plan-price">요금 준비 중</div>
                        <ul>
                          {benefits[i].map((b) => (
                            <li key={b}>
                              <CheckCircle weight="fill" size={19} />
                              {b}
                            </li>
                          ))}
                        </ul>
                        <Button
                          tone={i === 2 ? "primary" : "soft"}
                          onClick={() =>
                            openModal({
                              type: "plan",
                              tier,
                              benefits: benefits[i],
                            })
                          }
                        >
                          혜택 보기 <ArrowRight size={17} />
                        </Button>
                      </article>
                    );
                  })}
                </div>
                <div className="guide-note">
                  <Scales size={30} />
                  <div>
                    <h3>입찰 우선권</h3>
                    <p>
                      제작 조건을 충족한 업체에만 적용됩니다. 최종 선택은 브랜드가 합니다.
                    </p>
                  </div>
                </div>
              </section>
            )}
            {page === "activity" && (
              <section className="shell inner-page">
                <div className="page-heading">
                  <h1>나의 활동</h1>
                </div>
                <div className="activity-tabs">
                  {[
                    ["requests", "견적·매칭 요청", requests.length],
                    ["favorites", "관심 업체", favorites.length],
                  ].map(([key, label, count]) => (
                    <button
                      key={key}
                      onClick={() => setActivityTab(key)}
                      className={activityTab === key ? "active" : ""}
                    >
                      {label} <span>{count}</span>
                    </button>
                  ))}
                </div>
                <p className="demo-note">
                  브라우저에만 저장된 요청이며, 업체에는 전달되지 않습니다.
                </p>
                {activityTab === "favorites" ? (
                  favorites.length ? (
                    <div className="supplier-grid">
                      {suppliers
                        .filter((s) => favorites.includes(s.id))
                        .map((s) => (
                          <SupplierCard
                            key={s.id}
                            supplier={s}
                            favorites={favorites}
                            compare={compare}
                            openModal={openModal}
                            toggleFavorite={toggleFavorite}
                            toggleCompare={toggleCompare}
                          />
                        ))}
                    </div>
                  ) : (
                    <Empty
                      title="찜한 업체가 없어요"
                      description="업체의 하트를 눌러 저장하세요."
                      action={
                        <Button onClick={browse}>
                          업체 찾아보기 <ArrowRight size={18} />
                        </Button>
                      }
                    />
                  )
                ) : requests.length ? (
                  <div className="request-list">
                    {requests.map((r) => (
                      <button
                        key={r.id}
                        className="request-row"
                        onClick={() =>
                          openModal({ type: "requestDetail", item: r })
                        }
                      >
                        <span className="request-icon">
                          <ClipboardText size={24} />
                        </span>
                        <span>
                          <small>
                            {r.supplier ? "직접 매칭" : "비교 견적"} ·{" "}
                            {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                          </small>
                          <strong>
                            {r.brand}의 {r.category} 제작
                          </strong>
                          <span>
                            {money(r.quantity)}개{" "}
                            {r.supplier && ` / ${r.supplier}`}
                          </span>
                        </span>
                        <span className="request-status">
                          작성 완료 <CaretRight size={18} />
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="작성한 요청이 없어요"
                    action={
                      <Button onClick={() => startRequest()}>
                        견적 요청하기 <ArrowRight size={18} />
                      </Button>
                    }
                  />
                )}
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      <footer className="site-footer shell">
        <div>
          <button className="logo" onClick={() => navigate("explore")}>
            <Package size={24} weight="fill" />
            <span>rebate.</span>
          </button>
          <small>© {new Date().getFullYear()} rebate.</small>
        </div>
        <div className="footer-right">
          <button onClick={() => navigate("guide")}>이용 안내</button>
          <button onClick={() => navigate("membership")}>멤버십</button>
          <Button
            tone="ghost"
            className="icon-button"
            aria-label={
              theme === "light" ? "다크 모드로 전환" : "라이트 모드로 전환"
            }
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
          </Button>
          <p>미리보기 · 업체·리뷰는 예시, 사진은 AI 생성 이미지입니다.</p>
        </div>
      </footer>
      <AnimatePresence>
        {compare.length > 0 && (
          <motion.div
            className="compare-bar"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
          >
            <div>
              <Scales size={22} />
              <strong>{compare.length}개 업체</strong>
            </div>
            <Button onClick={() => openModal({ type: "compare" })}>
              조건 비교하기 <ArrowRight size={17} />
            </Button>
            <Button
              tone="ghost"
              className="icon-button"
              aria-label="비교함 비우기"
              onClick={() => setCompare([])}
            >
              <X size={18} />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="toast-region" role="status" aria-live="polite">
        <AnimatePresence>
          {toast && (
            <motion.div
              className="toast"
              key={toast}
              initial={{ y: 16, opacity: 0, scale: 0.94 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 8, opacity: 0 }}
            >
              <CheckCircle size={21} weight="fill" />
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <Modal
        open={modal?.type === "supplier"}
        onClose={() => setModal(null)}
        title={modal?.supplier?.name || ""}
        description="예시 업체 · 현장 확인·리뷰·이미지는 가상 자료입니다."
        wide
      >
        {modal?.type === "supplier" && (
          <SupplierDetail
            supplier={modal.supplier}
            favorite={favorites.includes(modal.supplier.id)}
            onFavorite={() => toggleFavorite(modal.supplier.id)}
            onRequest={() => startRequest(modal.supplier)}
          />
        )}
      </Modal>
      <Modal
        open={modal?.type === "request"}
        onClose={() => setModal(null)}
        title={
          modal?.supplier
            ? `${modal.supplier.name}에 매칭 요청`
            : "견적 요청"
        }
        description="미리보기 · 요청은 브라우저에만 저장되며 업체에 전달되지 않습니다."
      >
        {modal?.type === "request" && (
          <RequestForm
            supplier={modal.supplier}
            onSubmit={(form) => submitRequest(form, modal.supplier)}
          />
        )}
      </Modal>
      <Modal
        open={modal?.type === "success"}
        onClose={() => setModal(null)}
        title="요청서 작성 완료"
        description="업체에는 전달되지 않은 미리보기 요청서입니다."
      >
        {modal?.type === "success" && (
          <div className="success-content">
            <motion.div
              initial={reduce ? false : { scale: 0.4 }}
              animate={{ scale: 1 }}
              transition={spring}
            >
              <CheckCircle size={80} weight="fill" />
            </motion.div>
            <h3>{modal.item.brand}</h3>
            <p>
              {modal.item.category} {money(modal.item.quantity)}개
            </p>
            <Button
              onClick={() => {
                setModal(null);
                setActivityTab("requests");
                navigate("activity");
              }}
            >
              요청서 보기 <ArrowRight size={18} />
            </Button>
          </div>
        )}
      </Modal>
      <Modal
        open={modal?.type === "compare"}
        onClose={() => setModal(null)}
        title="업체 비교"
        description="예시 조건입니다. 실제 견적은 사양 확인 후 결정됩니다."
        wide
      >
        <div className="comparison-wrap">
          <table className="comparison">
            <thead>
              <tr>
                <th scope="col">제작 조건</th>
                {compare.map((id) => (
                  <th key={id} scope="col">
                    {suppliers.find((s) => s.id === id).name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["주요 품목", (s) => s.categories.join(", ")],
                ["최소 주문", (s) => `${money(s.moq)}개`],
                ["예상 제작 기간", (s) => `약 ${s.days}일`],
                ["소재지", (s) => s.area],
                [
                  "현장 확인",
                  (s) => (s.visit ? "확인 완료 (예시)" : "방문 예정"),
                ],
                ["리뷰", (s) => `${s.rating} / ${s.reviews}개 (예시)`],
              ].map(([label, render]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  {compare.map((id) => (
                    <td key={id}>
                      {render(suppliers.find((s) => s.id === id))}
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <th scope="row">상담</th>
                {compare.map((id) => (
                  <td key={id}>
                    <Button
                      tone="soft"
                      onClick={() =>
                        startRequest(suppliers.find((s) => s.id === id))
                      }
                    >
                      매칭 요청
                    </Button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Modal>
      <Modal
        open={modal?.type === "plan"}
        onClose={() => setModal(null)}
        title={`${audience === "brand" ? "브랜드" : "제작업체"} ${modal?.tier || ""}`}
        description="준비 중인 혜택입니다."
      >
        {modal?.type === "plan" && (
          <div className="plan-detail">
            <span className="plan-detail-icon">
              <Sparkle size={35} weight="duotone" />
            </span>
            <ul>
              {modal.benefits.map((b) => (
                <li key={b}>
                  <CheckCircle size={21} />
                  {b}
                </li>
              ))}
            </ul>
            <p>
              요금·가입 준비 중입니다. 결제되지 않습니다.
            </p>
            <Button onClick={() => setModal(null)}>확인</Button>
          </div>
        )}
      </Modal>
      <Modal
        open={modal?.type === "requestDetail"}
        onClose={() => setModal(null)}
        title="작성한 요청서"
        description="미발송 요청서"
      >
        {modal?.type === "requestDetail" && (
          <div className="request-detail">
            <dl>
              {[
                ["브랜드", modal.item.brand],
                [
                  "요청 방식",
                  modal.item.supplier
                    ? `직접 매칭 / ${modal.item.supplier}`
                    : "비교 견적",
                ],
                ["패키징", modal.item.category],
                ["수량", `${money(modal.item.quantity)}개`],
                ["희망 규격", modal.item.size || "상담 후 결정"],
                ["희망 납기", modal.item.deadline || "협의 가능"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <h3>요청 내용</h3>
            <p className="request-description">{modal.item.description}</p>
          </div>
        )}
      </Modal>
    </MotionConfig>
  );
}

function SupplierDetail({ supplier: s, favorite, onFavorite, onRequest }) {
  const [tab, setTab] = useState("portfolio");
  return (
    <>
      <Photo index={s.image} className="detail-photo" />
      <div className="detail-intro">
        <div className="verified">
          <SealCheck weight="fill" size={18} />
          {s.visit ? "현장 확인 (예시)" : "방문 예정"}
        </div>
        <p>{s.description}</p>
        <div className="detail-stats">
          <div>
            <small>최소 주문 수량</small>
            <strong>{money(s.moq)}개</strong>
          </div>
          <div>
            <small>예상 제작 기간</small>
            <strong>약 {s.days}일</strong>
          </div>
          <div>
            <small>브랜드 리뷰</small>
            <strong>
              <Star weight="fill" size={17} /> {s.rating}{" "}
              <small>({s.reviews})</small>
            </strong>
          </div>
        </div>
      </div>
      <div className="detail-tabs" role="tablist" aria-label="업체 상세 정보">
        {[
          ["portfolio", "제작 사례"],
          ["visit", "현장 확인"],
          ["reviews", "브랜드 리뷰"],
        ].map(([key, label], index) => (
          <button
            id={`tab-${key}`}
            role="tab"
            aria-controls="supplier-panel"
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
            onKeyDown={(event) => {
              const keys = ['portfolio', 'visit', 'reviews'];
              let next = index;
              if (event.key === 'ArrowRight') next = (index + 1) % 3;
              else if (event.key === 'ArrowLeft') next = (index + 2) % 3;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = 2;
              else return;
              event.preventDefault();
              setTab(keys[next]);
              document.getElementById(`tab-${keys[next]}`)?.focus();
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id="supplier-panel"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`tab-${tab}`}
        className="detail-panel"
      >
        {tab === "portfolio" ? (
          <>
            <h3>제작 품목</h3>
            <div className="tags">
              {s.categories.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <dl className="spec-list">
              <div>
                <dt>사용 소재</dt>
                <dd>{s.material}</dd>
              </div>
              <div>
                <dt>후가공</dt>
                <dd>{s.finish}</dd>
              </div>
              <div>
                <dt>제작 수량</dt>
                <dd>{money(s.moq)}개부터 상담 가능</dd>
              </div>
            </dl>
          </>
        ) : tab === "visit" ? (
          <>
            <h3>
              {s.visit ? "현장 확인 항목" : "방문 예정"}
            </h3>
            <div className="visit-items">
              {[
                "설비와 작업 공간",
                "인쇄·접착·마감 상태",
                "검수와 완성품 보관",
              ].map((t) => (
                <div key={t}>
                  <CheckCircle size={20} />
                  <span>{t}</span>
                  <small>{s.visit ? "확인 예시" : "확인 예정"}</small>
                </div>
              ))}
            </div>
            <div className="photo-placeholder">
              <Camera size={26} />
              <span>현장 사진 미등록</span>
            </div>
          </>
        ) : (
          <>
            <div className="review-heading">
              <Star weight="fill" size={28} />
              <strong>{s.rating}</strong>
              <span>리뷰 {s.reviews}개 · 예시</span>
            </div>
            <article className="review">
              <strong>
                뷰티 브랜드 담당자 <span>거래 리뷰 예시</span>
              </strong>
              <p>{s.review}</p>
              <div className="tags">
                <span>친절한 상담</span>
                <span>샘플 만족</span>
              </div>
            </article>
          </>
        )}
      </div>
      <div className="detail-actions">
        <Button
          tone="outline"
          className={favorite ? "is-saved" : ""}
          onClick={onFavorite}
          aria-pressed={favorite}
        >
          <Heart size={21} weight={favorite ? "fill" : "regular"} />
          {favorite ? "관심 업체" : "찜하기"}
        </Button>
        <Button onClick={onRequest}>
          매칭 요청 <ArrowRight size={19} />
        </Button>
      </div>
    </>
  );
}

function RequestForm({ supplier, onSubmit }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    category: supplier?.categories[0] || "",
    brand: "",
    quantity: "",
    size: "",
    deadline: "",
    description: "",
  });
  const [errors, setErrors] = useState({});
  const focusRef = useRef(null);
  const reduce = useReducedMotion();
  const allowed = supplier ? supplier.categories : categories.slice(1);
  const update = (key, value) => {
    setForm({ ...form, [key]: value });
    setErrors({ ...errors, [key]: "" });
  };
  const matches = eligibleSuppliers(suppliers, {
    category: form.category,
    quantity: form.quantity,
    days: form.deadline
      ? Math.ceil(
          (new Date(`${form.deadline}T00:00:00`) -
            new Date(new Date().setHours(0, 0, 0, 0))) /
            86400000,
        )
      : Infinity,
  });
  useEffect(() => {
    focusRef.current?.focus();
  }, [step]);
  function next(event) {
    event.preventDefault();
    const nextErrors = validateRequest(form);
    if (step === 0 && nextErrors.category) {
      setErrors({ category: nextErrors.category });
      return;
    }
    if (step === 1 && Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    if (step === 2) onSubmit(form);
    else setStep(step + 1);
  }
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return (
    <form onSubmit={next} className="request-form">
      <div className="stepper" aria-label={`3단계 중 ${step + 1}단계`}>
        {["패키징 선택", "제작 조건", "내용 확인"].map((label, i) => (
          <span key={label} className={i <= step ? "current" : ""}>
            <b>{i < step ? <Check size={13} /> : i + 1}</b>
            {label}
          </span>
        ))}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={reduce ? false : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <h3 tabIndex={-1} ref={focusRef} className="form-step-title">
            {
              [
                "패키징 선택",
                "제작 조건",
                "요청 내용 확인",
              ][step]
            }
          </h3>
          {step === 0 && (
            <>
              <div className="form-categories">
                {allowed.map((c) => {
                  const Icon = categoryIcons[categories.indexOf(c)];
                  return (
                    <Button
                      key={c}
                      tone="outline"
                      className={form.category === c ? "selected" : ""}
                      aria-pressed={form.category === c}
                      onClick={() => update("category", c)}
                    >
                      <Icon size={28} weight="duotone" />
                      <span>{c}</span>
                      {form.category === c && (
                        <CheckCircle size={20} weight="fill" />
                      )}
                    </Button>
                  );
                })}
              </div>
              {errors.category && (
                <p className="field-error" role="alert">
                  {errors.category}
                </p>
              )}
              <p className="helper-text">
                재질과 규격은 상담 후 정해도 됩니다.
              </p>
            </>
          )}
          {step === 1 && (
            <div className="fields">
              <label>
                브랜드 이름 <span className="required">필수</span>
                <input
                  maxLength={60}
                  value={form.brand}
                  aria-invalid={!!errors.brand}
                  aria-describedby={errors.brand ? "brand-error" : undefined}
                  onChange={(e) => update("brand", e.target.value)}
                  placeholder="예: 리베이트 스튜디오"
                />
                {errors.brand && (
                  <span id="brand-error" className="field-error">
                    {errors.brand}
                  </span>
                )}
              </label>
              <div className="field-pair">
                <label>
                  제작 수량 <span className="required">필수</span>
                  <div className="unit-input">
                    <input
                      inputMode="numeric"
                      type="number"
                      min="1"
                      max="10000000"
                      step="1"
                      aria-invalid={!!errors.quantity}
                      aria-describedby={
                        errors.quantity ? "quantity-error" : undefined
                      }
                      value={form.quantity}
                      onChange={(e) => update("quantity", e.target.value)}
                      placeholder="500"
                    />
                    <span>개</span>
                  </div>
                  {errors.quantity && (
                    <span id="quantity-error" className="field-error">
                      {errors.quantity}
                    </span>
                  )}
                </label>
                <label>
                  희망 납기 <span className="optional">선택</span>
                  <input
                    type="date"
                    min={minDate}
                    value={form.deadline}
                    onChange={(e) => update("deadline", e.target.value)}
                  />
                </label>
              </div>
              <label>
                희망 규격 <span className="optional">선택</span>
                <input
                  maxLength={100}
                  value={form.size}
                  onChange={(e) => update("size", e.target.value)}
                  placeholder="예: 가로 80 × 세로 80 × 높이 150 mm"
                />
              </label>
              <label>
                제품과 원하는 패키징 <span className="required">필수</span>
                <textarea
                  rows={4}
                  maxLength={1500}
                  aria-invalid={!!errors.description}
                  aria-describedby={
                    errors.description ? "description-error" : undefined
                  }
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="제품, 재질, 인쇄 등 필요한 조건"
                />
                {errors.description && (
                  <span id="description-error" className="field-error">
                    {errors.description}
                  </span>
                )}
              </label>
            </div>
          )}
          {step === 2 && (
            <>
              <dl className="summary-list">
                <div>
                  <dt>브랜드</dt>
                  <dd>{form.brand}</dd>
                </div>
                <div>
                  <dt>패키징</dt>
                  <dd>{form.category}</dd>
                </div>
                <div>
                  <dt>수량</dt>
                  <dd>{money(form.quantity)}개</dd>
                </div>
                <div>
                  <dt>규격 / 납기</dt>
                  <dd>
                    {form.size || "상담 후 결정"} /{" "}
                    {form.deadline || "협의 가능"}
                  </dd>
                </div>
              </dl>
              <p className="request-description">{form.description}</p>
              <div className="matching-note">
                <SealCheck size={24} />
                <div>
                  <strong>
                    {supplier
                      ? `${supplier.name}에 매칭 요청`
                      : matches.length
                        ? `조건에 맞는 예시 업체 ${matches.length}곳`
                        : "조건에 맞는 업체 없음"}
                  </strong>
                  <p>
                    {supplier
                      ? "제작 가능 여부와 견적은 상담 후 확정됩니다."
                      : matches.length
                        ? "품목·수량·납기 기준이며, 세부 사양은 추가 확인이 필요합니다."
                        : "수량이나 납기를 변경해보세요."}
                  </p>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
      <div className="form-actions">
        {step > 0 && (
          <Button tone="outline" onClick={() => setStep(step - 1)}>
            <ArrowLeft size={18} /> 이전
          </Button>
        )}
        <Button type="submit">
          {step === 2 ? "작성 완료" : "다음"}
          {step === 2 ? <Check size={18} /> : <ArrowRight size={18} />}
        </Button>
      </div>
    </form>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
