import { useState, useEffect, useRef } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  limit,
} from "firebase/firestore";
import { auth, db } from "./firebase.js";

// ─── 定数 ─────────────────────────────────────────────────────────────────────
const INDUSTRY_GROUPS = {
  "金融・銀行":   ["銀行","信託銀行","地方銀行","証券会社","生命保険","損害保険","消費者金融"],
  "商社":         ["総合商社","専門商社"],
  "メーカー":     ["自動車","電機・電子","機械・重工","化学・素材","食品・飲料","医薬品","その他メーカー"],
  "IT・テック":   ["SIer","ソフトウェア","Web・インターネット","通信","半導体・電子部品"],
  "コンサル":     ["経営コンサル","ITコンサル","会計・税務","法律・特許"],
  "不動産・建設": ["デベロッパー","建設・ゼネコン","設備・インフラ"],
  "小売・流通":   ["百貨店・スーパー","EC・通販","物流・運輸","専門小売"],
  "サービス":     ["人材・派遣","広告・PR","メディア","ホテル・旅行","外食"],
  "医療・ヘルス": ["病院・クリニック","医療機器","医薬品卸"],
  "教育・公共":   ["学校・予備校","官公庁・公務員","NPO・団体"],
  "エンタメ":     ["ゲーム","映像・音楽","スポーツ","出版"],
};
const ALL_GROUPS   = Object.keys(INDUSTRY_GROUPS);
const STAGES       = ["書類選考","一次面接","二次面接","最終面接","内定","辞退・不合格"];
const EMP_TYPES    = ["正社員","契約社員","派遣社員","アルバイト","インターン","元社員"];
const TENURES      = ["~1年未満","1~3年","3~5年","5~10年","10年以上"];
const AGE_RANGES   = ["20~24歳","25~29歳","30~34歳","35~39歳","40~44歳","45歳以上"];
const JOB_TYPES    = ["エンジニア","営業","マーケティング","企画・経営","管理","デザイナー","研究・開発","人事","法務","その他"];
const JOB_CATEGORIES = [
  "全職種",
  "総合職","技術職","一般職","専門職",
  "パイロット（自社養成）","パイロット（既卒）","キャビンアテンダント","グランドスタッフ",
  "エンジニア","営業","マーケティング","企画・経営","管理・バックオフィス",
  "研究・開発","人事・採用","法務・コンプライアンス","デザイナー","その他",
];
const EMOJIS       = ["🏢","🌐","💻","🚗","🛒","📱","🏦","📋","🎮","🏥","📢","🏭","✈️","🍜","📚","🎯","💊","🔬","⚡","🌿"];
const RCATS        = [
  { key:"salary", label:"待遇・給与" },
  { key:"culture",label:"社風・文化" },
  { key:"wlb",    label:"WLB" },
  { key:"career", label:"キャリア・成長" },
  { key:"mgmt",   label:"経営・将来性" },
];
const STAGE_COLORS = {
  "書類選考":    { bg:"#F0F4FF", tx:"#1E3A8A", br:"#BFCCF0" },
  "一次面接":    { bg:"#F0FBF4", tx:"#14532D", br:"#A7D7B5" },
  "二次面接":    { bg:"#FEFCE8", tx:"#713F12", br:"#E9D06A" },
  "最終面接":    { bg:"#FFF1F1", tx:"#7F1D1D", br:"#F5BBBB" },
  "内定":        { bg:"#F0FBF4", tx:"#14532D", br:"#6BCF8E" },
  "辞退・不合格":{ bg:"#F9FAFB", tx:"#525252", br:"#CCC"    },
};
const PLANS = {
  free:     { id:"free",     name:"無料",         color:"#555",    price:0    },
  standard: { id:"standard", name:"スタンダード", color:"#1a5276", price:980  },
  premium:  { id:"premium",  name:"プレミアム",   color:"#7B0000", price:2980 },
};

// ─── カラーパレット ────────────────────────────────────────────────────────────
const C = {
  bg:"#F5F5F0", surface:"#FFFFFF", ink:"#1A1A1A",
  sub:"#606060", accent:"#9B0000", border:"#CCCCCC",
};

// ─── ユーティリティ ────────────────────────────────────────────────────────────
const ini   = (n) => n ? String(n).slice(0,2) : "?";
const today = () => new Date().toISOString().slice(0,10);
const ago   = (ts) => {
  if (!ts) return "-";
  const d    = ts?.toDate ? ts.toDate() : new Date(typeof ts === "number" ? ts * 1000 : ts);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return "今日";
  if (diff  <  7) return diff + "日前";
  if (diff  < 30) return Math.floor(diff / 7) + "週間前";
  return Math.floor(diff / 30) + "ヶ月前";
};
const calcAvg = (revs) => {
  if (!revs || !revs.length) return null;
  const keys = RCATS.map(c => c.key);
  const s = { overall: 0 };
  keys.forEach(k => { s[k] = 0; });
  revs.forEach(r => {
    s.overall += r.overall || 0;
    keys.forEach(k => { s[k] += (r.rats && r.rats[k]) || 0; });
  });
  const n = revs.length;
  const out = { overall: s.overall / n };
  keys.forEach(k => { out[k] = s[k] / n; });
  return out;
};
const calcAvgSal = (sals) => {
  if (!sals || !sals.length) return null;
  return Math.round(sals.reduce((a, s) => a + (s.annualSalary || 0), 0) / sals.length);
};
const getGroup = (ind) => {
  for (const [g, ss] of Object.entries(INDUSTRY_GROUPS)) {
    if (g === ind || ss.includes(ind)) return g;
  }
  return ind;
};
function useWidth() {
  const [w, setW] = useState(window.innerWidth);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return w;
}

// ─── Firestore ヘルパー ────────────────────────────────────────────────────────
const col  = (name)     => collection(db, name);
const dref = (c, id)    => doc(db, c, id);

const fsAdd = async (c, data) => {
  const ref = await addDoc(col(c), { ...data, createdAt: serverTimestamp() });
  return ref.id;
};
const fsSet = async (c, id, data) => {
  await setDoc(dref(c, id), { ...data, updatedAt: serverTimestamp() }, { merge: true });
};
const fsDel = async (c, id) => {
  await deleteDoc(dref(c, id));
};
const fsGet = async (c, id) => {
  const snap = await getDoc(dref(c, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};
const fsAll = async (c, orderField = null) => {
  const q   = orderField ? query(col(c), orderBy(orderField, "desc")) : col(c);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};
const fsWhere = async (c, field, op, val) => {
  const snap = await getDocs(query(col(c), where(field, op, val)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
};
const fsUpdate = async (c, id, data) => {
  await updateDoc(dref(c, id), { ...data, updatedAt: serverTimestamp() });
};

// ─── アプリ本体 ────────────────────────────────────────────────────────────────
export default function App() {
  // Auth state
  const [authUser,  setAuthUser]  = useState(undefined); // undefined = loading
  const [profile,   setProfile]   = useState(null);

  // Data
  const [companies,   setCompanies]   = useState([]);
  const [posts,       setPosts]       = useState([]);
  const [reviews,     setReviews]     = useState([]);
  const [salaries,    setSalaries]    = useState([]);
  const [jobListings, setJobListings] = useState([]);
  const [diary,       setDiary]       = useState([]);
  const [favorites,   setFavorites]   = useState([]); // お気に入り投稿IDのリスト
  const [dataReady,   setDataReady]   = useState(false);

  // UI
  const [page,     setPage]     = useState("home");
  const [selCo,    setSelCo]    = useState(null);
  const [selTab,   setSelTab]   = useState("interview");
  const [authMode, setAuthMode] = useState(null);
  const [toast,    setToast]    = useState(null);
  const [editTgt,  setEditTgt]  = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQ,  setSearchQ]  = useState("");
  const [grpFilter,setGrpFilter]= useState("");
  const [subFilter,setSubFilter]= useState("");
  const [sortBy,   setSortBy]   = useState("posts");

  const w        = useWidth();
  const isMobile = w < 768;

  // ── Auth リスナー（Firebase Auth）
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        let prof = await fsGet("users", user.uid);
        if (!prof) {
          prof = {
            uid: user.uid,
            displayName: user.displayName || "匿名",
            email: user.email || "",
            plan: "free",
            isAdmin: false,
            joinDate: today(),
          };
          await fsSet("users", user.uid, prof);
        }
        setProfile(prof);
        // お気に入りを読み込む
        const favDoc = await fsGet("favorites", user.uid);
        setFavorites(favDoc?.postIds || []);
        // 就活日記を読み込む
        const d = await fsWhere("diary", "uid", "==", user.uid);
        setDiary(d.sort((a, b) => (b.date || "").localeCompare(a.date || "")));
      } else {
        setProfile(null);
        setDiary([]);
      }
    });
    return unsub;
  }, []);

  // ── 公開データ読み込み（Firestore）
  useEffect(() => {
    (async () => {
      const [c, p, r, s, j] = await Promise.all([
        fsAll("companies"),
        fsAll("posts",       "createdAt"),
        fsAll("reviews",     "createdAt"),
        fsAll("salaries",    "createdAt"),
        fsAll("joblistings", "postedDate"),
      ]);
      setCompanies(c);
      setPosts(p);
      setReviews(r);
      setSalaries(s);
      setJobListings(j);
      setDataReady(true);
    })();
  }, []);

  const toast2 = (m) => {
    setToast(m);
    setTimeout(() => setToast(null), 3000);
  };

  // ── 認証（Firebase Auth）
  const register = async (email, displayName, password) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName });
      await sendEmailVerification(cred.user);
      const prof = {
        uid: cred.user.uid,
        displayName,
        email,
        plan: "free",
        isAdmin: false,
        joinDate: today(),
        emailVerified: false,
      };
      await fsSet("users", cred.user.uid, prof);
      setAuthMode(null);
      toast2("登録しました。確認メールをご確認ください。");
      return null;
    } catch (e) {
      const m = {
        "auth/email-already-in-use": "このメールアドレスはすでに使用されています",
        "auth/invalid-email":        "メールアドレスの形式が正しくありません",
        "auth/weak-password":        "パスワードは6文字以上にしてください",
      };
      return m[e.code] || ("エラー: " + e.message);
    }
  };

  const login = async (email, password) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setAuthMode(null);
      toast2("ログインしました");
      return null;
    } catch (e) {
      return "メールアドレスまたはパスワードが正しくありません";
    }
  };

  const logout = async () => {
    await signOut(auth);
    toast2("ログアウトしました");
  };

  const upgradePlan = async (planId) => {
    if (!authUser) return;
    await fsUpdate("users", authUser.uid, { plan: planId });
    setProfile(p => ({ ...p, plan: planId }));
    toast2(PLANS[planId].name + "プランに変更しました");
  };

  // ── Stripe課金（将来実装）─────────────────────────────────────────────────
  // 現在はプランをFirestore上で手動管理しています。
  // Stripe導入手順:
  //   1. stripe.com でアカウント作成
  //   2. Firebase Extensions の "Run Payments with Stripe" を有効化
  //      (Firebaseコンソール > Extensions > Stripe Payments)
  //   3. 拡張機能が自動的に /customers/{uid}/checkout_sessions を監視
  //   4. 以下の checkoutSession 関数のコメントを外すだけで課金が動き出します
  //
  // const checkoutSession = async (priceId) => {
  //   if (!authUser) { setAuthMode("login"); return; }
  //   const sessionRef = await fsAdd(
  //     "customers/" + authUser.uid + "/checkout_sessions",
  //     { price: priceId, success_url: window.location.href, cancel_url: window.location.href }
  //   );
  //   // Stripe Firebase Extension がリダイレクトURLを自動生成してくれる
  //   const unsubscribe = onSnapshot(dref("customers/" + authUser.uid + "/checkout_sessions", sessionRef), (snap) => {
  //     const { url } = snap.data();
  //     if (url) { window.location.assign(url); unsubscribe(); }
  //   });
  // };
  // ───────────────────────────────────────────────────────────────────────────

  // ── 画面遷移
  const go = (p, co = null, tab = null) => {
    setPage(p);
    if (co  !== null) setSelCo(co);
    if (tab !== null) setSelTab(tab);
    else if (p === "company") setSelTab("interview");
    window.scrollTo(0, 0);
    setMenuOpen(false);
  };

  // ── 派生値
  const plan    = profile?.plan    || "free";
  const isAdmin = !!profile?.isAdmin;
  const sess    = authUser && profile ? { ...profile, uid: authUser.uid } : null;
  // 登録不要投稿のため、ログインしていなくても名前を使える
  const uName   = profile?.displayName || "匿名ユーザー";

  // 匿名ユーザーのいいね識別
  const anonKey = () => {
    let k = localStorage.getItem("anonId");
    if (!k) { k = Math.random().toString(36).slice(2,10); localStorage.setItem("anonId", k); }
    return "anon_" + k;
  };

  // ── CRUD（Firestore）
  const addCompany = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に企業追加できます"); return; }
    const data = { ...d, group: d.group || getGroup(d.industry), author: uName, authorUid: authUser?.uid || null };
    const id   = await fsAdd("companies", data);
    setCompanies(prev => [{ id, ...data, createdAt: null }, ...prev]);
    toast2("「" + d.name + "」を追加しました");
    go("company", { id, ...data }, "interview");
  };

  const addPost = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に投稿できます"); return; }
    const data = { ...d, author: uName, authorUid: authUser?.uid || null, likes: [], comments: [] };
    const id   = await fsAdd("posts", data);
    setPosts(prev => [{ id, ...data, createdAt: null }, ...prev]);
    toast2("投稿しました");
    go("company", companies.find(c => c.id === d.companyId), d.ptype);
  };

  const addReview = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に口コミ投稿できます"); return; }
    const data = { ...d, author: uName, authorUid: authUser?.uid || null };
    const id   = await fsAdd("reviews", data);
    setReviews(prev => [{ id, ...data, createdAt: null }, ...prev]);
    toast2("口コミを投稿しました");
    go("company", companies.find(c => c.id === d.companyId), "review");
  };

  const addSalary = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に年収情報投稿できます"); return; }
    const data = { ...d, author: uName, authorUid: authUser?.uid || null };
    const id   = await fsAdd("salaries", data);
    setSalaries(prev => [{ id, ...data, createdAt: null }, ...prev]);
    toast2("年収情報を投稿しました");
    go("company", companies.find(c => c.id === d.companyId), "salary");
  };

  const addJobListing = async (d) => {
    if (!authUser) { setAuthMode("login"); toast2("ログイン後に募集要項追加できます"); return; }
    const data = { ...d, author: uName, authorUid: authUser?.uid || null };
    const id   = await fsAdd("joblistings", data);
    setJobListings(prev => [{ id, ...data }, ...prev]);
    toast2("募集要項を追加しました");
    go("company", companies.find(c => c.id === d.companyId), "jobs");
  };

  const toggleFavorite = async (postId) => {
    if (!authUser) { setAuthMode("login"); return; }
    const newFavs = favorites.includes(postId)
      ? favorites.filter(id => id !== postId)
      : [...favorites, postId];
    setFavorites(newFavs);
    await fsSet("favorites", authUser.uid, { postIds: newFavs, uid: authUser.uid });
    toast2(favorites.includes(postId) ? "お気に入りを解除しました" : "お気に入りに追加しました");
  };

  const addComment = async (postId, content) => {
    const cmt     = { id: Math.random().toString(36).slice(2,10), author: uName, authorUid: authUser?.uid || null, content, date: today() };
    const post    = posts.find(p => p.id === postId);
    const newCmts = [...(post?.comments || []), cmt];
    await fsUpdate("posts", postId, { comments: newCmts });
    setPosts(prev => prev.map(p => p.id !== postId ? p : { ...p, comments: newCmts }));
  };

  const toggleLike = async (postId) => {
    const key  = authUser?.uid || anonKey();
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    const liked    = (post.likes || []).includes(key);
    const newLikes = liked ? post.likes.filter(u => u !== key) : [...(post.likes || []), key];
    await fsUpdate("posts", postId, { likes: newLikes });
    setPosts(prev => prev.map(p => p.id !== postId ? p : { ...p, likes: newLikes }));
  };

  const adminDelete = async (type, id) => {
    if (!window.confirm("削除しますか？")) return;
    const colMap = { post:"posts", review:"reviews", salary:"salaries", job:"joblistings", company:"companies" };
    if (colMap[type]) {
      await fsDel(colMap[type], id);
      if (type === "post")     setPosts(prev     => prev.filter(x => x.id !== id));
      if (type === "review")   setReviews(prev   => prev.filter(x => x.id !== id));
      if (type === "salary")   setSalaries(prev  => prev.filter(x => x.id !== id));
      if (type === "job")      setJobListings(prev => prev.filter(x => x.id !== id));
      if (type === "company")  setCompanies(prev => prev.filter(x => x.id !== id));
    }
    if (type === "comment") {
      const [pid, cid] = id.split(":");
      const post       = posts.find(p => p.id === pid);
      const newCmts    = (post?.comments || []).filter(c => c.id !== cid);
      await fsUpdate("posts", pid, { comments: newCmts });
      setPosts(prev => prev.map(p => p.id !== pid ? p : { ...p, comments: newCmts }));
    }
    toast2("削除しました");
  };

  const adminEdit = async (type, id, v) => {
    const colMap = { post:"posts", review:"reviews", salary:"salaries", job:"joblistings", company:"companies" };
    if (colMap[type]) await fsUpdate(colMap[type], id, v);
    if (type === "post")     setPosts(prev     => prev.map(x => x.id !== id ? x : { ...x, ...v }));
    if (type === "review")   setReviews(prev   => prev.map(x => x.id !== id ? x : { ...x, ...v }));
    if (type === "salary")   setSalaries(prev  => prev.map(x => x.id !== id ? x : { ...x, ...v }));
    if (type === "job")      setJobListings(prev => prev.map(x => x.id !== id ? x : { ...x, ...v }));
    if (type === "company")  setCompanies(prev => prev.map(x => x.id !== id ? x : { ...x, ...v }));
    toast2("更新しました");
    setEditTgt(null);
  };

  const saveDiary = async (entries) => {
    setDiary(entries);
    if (!authUser) return;
    // Firestoreに保存（ユーザーの日記）
    const existing = await fsWhere("diary", "uid", "==", authUser.uid);
    await Promise.all(existing.map(e => fsDel("diary", e.id)));
    await Promise.all(entries.map(e => fsSet("diary", e.id, { ...e, uid: authUser.uid })));
  };

  // ── 派生データ
  const coPosts      = (id) => posts.filter(p => p.companyId === id);
  const coRevs       = (id) => reviews.filter(r => r.companyId === id);
  const coSals       = (id) => salaries.filter(s => s.companyId === id);
  const coJobs       = (id) => jobListings.filter(j => j.companyId === id);

  let filteredCos = [...companies];
  if (grpFilter)  filteredCos = filteredCos.filter(c => (c.group || getGroup(c.industry)) === grpFilter);
  if (subFilter)  filteredCos = filteredCos.filter(c => c.industry === subFilter);
  if (searchQ)    filteredCos = filteredCos.filter(c => c.name.includes(searchQ));
  if (sortBy === "rating")  filteredCos.sort((a,b) => (calcAvg(coRevs(b.id))?.overall || 0) - (calcAvg(coRevs(a.id))?.overall || 0));
  else if (sortBy === "salary") filteredCos.sort((a,b) => (calcAvgSal(coSals(b.id)) || 0) - (calcAvgSal(coSals(a.id)) || 0));
  else filteredCos.sort((a,b) => coPosts(b.id).length + coRevs(b.id).length - (coPosts(a.id).length + coRevs(a.id).length));

  // ローディング
  if (authUser === undefined || !dataReady) {
    return (
      <div style={{ display:"flex", justifyContent:"center", alignItems:"center", height:"100vh", flexDirection:"column", gap:16 }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ width:28, height:28, border:"2px solid #DDD", borderTopColor:"#9B0000", borderRadius:"50%", animation:"spin .8s linear infinite" }} />
        <p style={{ fontSize:13, color:"#888" }}>読み込み中...</p>
      </div>
    );
  }

  const sp = { sess, go, companies, posts, reviews, salaries, jobListings, plan, isAdmin, adminDelete, adminEdit, setEditTgt, setAuthMode, isMobile, uName, upgradePlan, authUser, favorites, toggleFavorite };

  return (
    <div style={S.root}>
      <style>{CSS}</style>
      <AppNav {...sp} menuOpen={menuOpen} setMenuOpen={setMenuOpen} logout={logout} />
      {toast && <div style={S.toast} className="fadeUp">{toast}</div>}
      {authMode && <AuthModal mode={authMode} setMode={setAuthMode} onLogin={login} onRegister={register} />}
      {editTgt  && <EditModal target={editTgt} setTarget={setEditTgt} onSave={adminEdit} />}

      {authUser && !authUser.emailVerified && (
        <div style={{ background:"#FFFBEB", borderBottom:"1px solid #FDE68A", padding:"10px 20px", textAlign:"center", fontSize:12 }}>
          メールアドレスの確認が完了していません。
          <button style={{ marginLeft:8, color:C.accent, background:"none", border:"none", textDecoration:"underline", cursor:"pointer", fontSize:12, fontFamily:"inherit" }}
            onClick={() => sendEmailVerification(authUser).then(() => toast2("確認メールを再送しました"))}>
            確認メールを再送する
          </button>
        </div>
      )}

      <main style={{ ...S.main, padding: isMobile ? "0 12px 60px" : "0 24px 72px" }}>
        {page === "home"       && <HomePage       {...sp} coPosts={coPosts} coRevs={coRevs} coSals={coSals} />}
        {page === "companies"  && <CompaniesPage  {...sp} filtered={filteredCos} searchQ={searchQ} setSearchQ={setSearchQ} grpFilter={grpFilter} setGrpFilter={setGrpFilter} subFilter={subFilter} setSubFilter={setSubFilter} sortBy={sortBy} setSortBy={setSortBy} coPosts={coPosts} coRevs={coRevs} coSals={coSals} />}
        {page === "company"    && selCo && (
          <CompanyPage {...sp}
            co={selCo}
            cposts={coPosts(selCo.id)} crevs={coRevs(selCo.id)}
            csals={coSals(selCo.id)}   cjobs={coJobs(selCo.id)}
            initTab={selTab}
            onToggleLike={toggleLike} onAddComment={addComment}
            onAddPost={addPost}       onAddReview={addReview}
            onAddSalary={addSalary}   onAddJob={addJobListing}
          />
        )}
        {page === "ranking"    && <RankingPage    {...sp} coPosts={coPosts} coRevs={coRevs} coSals={coSals} />}
        {page === "pricing"    && <PricingPage    {...sp} />}
        {page === "addCompany" && <AddCompanyPage {...sp} onSubmit={addCompany} />}
        {page === "mypage"     && (
          <MyPage {...sp}
            diary={diary} saveDiary={saveDiary}
            myPosts={posts.filter(p => p.authorUid === authUser?.uid)}
            myRevs={reviews.filter(r => r.authorUid === authUser?.uid)}
            favPosts={posts.filter(p => favorites.includes(p.id))}
          />
        )}
        {page === "admin"     && (isAdmin ? <AdminPage   {...sp} /> : <AccessDenied go={go} />)}
        {page === "analytics" && (isAdmin ? <AnalyticsPage companies={companies} posts={posts} reviews={reviews} salaries={salaries} isMobile={isMobile} /> : <AccessDenied go={go} />)}
      </main>

      <footer style={S.footer}>
        <div style={{ maxWidth:1160, margin:"0 auto", display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
          <button style={S.logoBtn} onClick={() => go("home")}>
            <span style={{ ...S.logoText, fontSize:15 }}>テン活ノート</span>
          </button>
          <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
            {[["ranking","ランキング"],["companies","企業一覧"],["pricing","料金プラン"]].map(([p,l]) => (
              <button key={p} style={{ background:"none", border:"none", color:C.sub, fontSize:12, fontFamily:"inherit", cursor:"pointer", textDecoration:"underline" }} onClick={() => go(p)}>{l}</button>
            ))}
          </div>
        </div>
        <p style={{ fontSize:10, color:"#888", textAlign:"center", marginTop:8 }}>(c) 2026 テン活ノート</p>
      </footer>
    </div>
  );
}

// ─── AuthModal（本物のFirebase Auth）────────────────────────────────────────
function AuthModal({ mode, setMode, onLogin, onRegister }) {
  const [email, setEmail] = useState("");
  const [dn,    setDn]    = useState("");
  const [pw,    setPw]    = useState("");
  const [err,   setErr]   = useState("");
  const [ld,    setLd]    = useState(false);

  const doLogin = async () => {
    setErr(""); setLd(true);
    const e = await onLogin(email.trim(), pw);
    if (e) setErr(e);
    setLd(false);
  };
  const doReg = async () => {
    setErr(""); setLd(true);
    if (!dn.trim()) { setErr("表示名を入力してください"); setLd(false); return; }
    if (pw.length < 6) { setErr("パスワードは6文字以上にしてください"); setLd(false); return; }
    const e = await onRegister(email.trim(), dn.trim(), pw);
    if (e) setErr(e);
    setLd(false);
  };

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setMode(null); }}>
      <div style={S.modal} className="fadeUp">
        <h2 style={S.modalTitle}>{mode === "login" ? "ログイン" : "新規会員登録"}</h2>
        <div style={S.modalHr} />
        {mode === "register" && (
          <div style={{ background:"#F0F9FF", border:"1px solid #BAE6FD", padding:"10px 14px", marginBottom:12, fontSize:12, lineHeight:1.7 }}>
            メールアドレスだけで無料登録できます。<br />
            登録後、すべての投稿・閲覧・企業追加機能をご利用いただけます。
          </div>
        )}
        {err && <div style={S.errBox}>{err}</div>}
        <Fld label="メールアドレス">
          <input style={S.input} type="email" placeholder="example@email.com" value={email} onChange={e => setEmail(e.target.value)} />
        </Fld>
        {mode === "register" && (
          <Fld label="表示名（掲示板に表示される名前）">
            <input style={S.input} placeholder="例：転職中エンジニア" value={dn} onChange={e => setDn(e.target.value)} />
          </Fld>
        )}
        <Fld label="パスワード（6文字以上）">
          <input style={S.input} type="password" value={pw} onChange={e => setPw(e.target.value)} onKeyDown={e => { if (e.key === "Enter") (mode === "login" ? doLogin() : doReg()); }} />
        </Fld>
        <button style={{ ...S.primaryBtn, width:"100%", padding:"11px", opacity: ld ? 0.6 : 1 }} onClick={mode === "login" ? doLogin : doReg} disabled={ld}>
          {ld ? "処理中..." : (mode === "login" ? "ログイン" : "登録する")}
        </button>
        <p style={{ textAlign:"center", marginTop:14, fontSize:12, color:C.sub }}>
          {mode === "login" ? "アカウントをお持ちでない方は" : "すでにアカウントをお持ちの方は"}
          <button style={S.textLink} onClick={() => { setMode(mode === "login" ? "register" : "login"); setErr(""); }}>
            {mode === "login" ? " 新規登録" : " ログイン"}
          </button>
        </p>
      </div>
    </div>
  );
}

// ─── EditModal ────────────────────────────────────────────────────────────────
function EditModal({ target, setTarget, onSave }) {
  const { type, data } = target;
  const [v, setV] = useState({ ...data });
  const fields =
    type === "company" ? [{ k:"name", l:"企業名" }, { k:"industry", l:"業界" }] :
    type === "post"    ? [{ k:"title", l:"タイトル" }, { k:"content", l:"本文", multi:true }] :
    type === "job"     ? [{ k:"title", l:"タイトル" }, { k:"content", l:"内容",  multi:true }] :
                        [{ k:"pros",  l:"良いところ", multi:true }, { k:"cons", l:"改善点", multi:true }];
  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setTarget(null); }}>
      <div style={{ ...S.modal, maxWidth:520 }} className="fadeUp">
        <h2 style={S.modalTitle}>内容を編集</h2>
        <div style={S.modalHr} />
        {fields.map(f => (
          <Fld key={f.k} label={f.l}>
            {f.multi
              ? <textarea style={{ ...S.input, resize:"vertical" }} rows={4} value={v[f.k] || ""} onChange={e => setV({ ...v, [f.k]: e.target.value })} />
              : <input   style={S.input} value={v[f.k] || ""} onChange={e => setV({ ...v, [f.k]: e.target.value })} />
            }
          </Fld>
        ))}
        <div style={{ display:"flex", gap:8 }}>
          <button style={{ ...S.primaryBtn, flex:1 }} onClick={() => onSave(type, data.id, v)}>保存する</button>
          <button style={{ ...S.secondaryBtn, flex:1 }} onClick={() => setTarget(null)}>キャンセル</button>
        </div>
      </div>
    </div>
  );
}

// ─── AppNav ───────────────────────────────────────────────────────────────────
function AppNav({ sess, go, plan, isAdmin, setAuthMode, isMobile, menuOpen, setMenuOpen, logout }) {
  const [drop, setDrop] = useState(false);
  const pl = PLANS[plan];
  return (
    <nav style={S.nav}>
      <div style={{ height:4, background:C.accent }} />
      <div style={{ maxWidth:1160, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", padding: isMobile ? "8px 12px" : "10px 24px" }}>
        <button style={S.logoBtn} onClick={() => go("home")}>
          <span style={{ ...S.logoText, fontSize: isMobile ? 17 : 22 }}>テン活ノート</span>
          {!isMobile && <span style={{ display:"block", fontSize:9, color:C.sub, letterSpacing:"0.1em", marginTop:1 }}>転職・就活情報コミュニティ</span>}
        </button>
        {isMobile ? (
          <button style={{ background:"none", border:"none", display:"flex", flexDirection:"column", gap:4, padding:6, cursor:"pointer" }} onClick={() => setMenuOpen(o => !o)}>
            <span style={{ display:"block", width:20, height:2, background:C.ink, transition:"all .2s", transform: menuOpen ? "rotate(45deg) translateY(6px)" : "none" }} />
            <span style={{ display:"block", width:20, height:2, background:C.ink, transition:"all .2s", opacity: menuOpen ? 0 : 1 }} />
            <span style={{ display:"block", width:20, height:2, background:C.ink, transition:"all .2s", transform: menuOpen ? "rotate(-45deg) translateY(-6px)" : "none" }} />
          </button>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:0 }}>
            {[["home","ホーム"],["companies","企業一覧"],["ranking","ランキング"]].map(([p,l]) => (
              <span key={p}>
                <button style={{ background:"none", border:"none", color:C.ink, fontSize:12, padding:"4px 10px", fontFamily:"inherit", cursor:"pointer" }} onClick={() => go(p)}>{l}</button>
                <span style={{ color:C.border, fontSize:11 }}>|</span>
              </span>
            ))}
            <button style={{ background:"none", border:"none", color:C.accent, fontWeight:"bold", fontSize:12, padding:"4px 10px", fontFamily:"inherit", cursor:"pointer" }} onClick={() => go("pricing")}>料金プラン</button>
            <span style={{ color:C.border, fontSize:11 }}>|</span>
            <button style={{ background:"none", border:"none", color:C.ink, fontSize:12, padding:"4px 10px", fontFamily:"inherit", cursor:"pointer" }} onClick={() => go("addCompany")}>＋企業追加</button>
            <span style={{ color:C.border, fontSize:11 }}>|</span>
            {sess ? (
              <div style={{ position:"relative" }}>
                <button style={{ background:"none", border:"1px solid " + C.border, padding:"4px 10px", display:"flex", alignItems:"center", gap:6, fontSize:12, fontFamily:"inherit", cursor:"pointer" }} onClick={() => setDrop(o => !o)}>
                  <span style={{ background:pl.color, color:"#fff", width:22, height:22, borderRadius:"50%", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:"bold" }}>{ini(sess.displayName)}</span>
                  <span style={{ maxWidth:80, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:C.ink }}>{sess.displayName}</span>
                  <span style={{ background:pl.color, color:"#fff", fontSize:9, padding:"1px 7px", fontWeight:"bold" }}>{pl.name}</span>
                  {isAdmin && <span style={{ background:"#4B0082", color:"#fff", fontSize:9, padding:"1px 6px", fontWeight:"bold" }}>管理者</span>}
                  <span style={{ color:"#aaa", fontSize:9 }}>v</span>
                </button>
                {drop && (
                  <div style={{ position:"absolute", right:0, top:"calc(100% + 4px)", background:"#fff", border:"1px solid " + C.border, boxShadow:"0 4px 12px rgba(0,0,0,0.1)", minWidth:180, zIndex:300 }} className="fadeUp">
                    {[["mypage","マイページ"],["addCompany","企業を追加"],["pricing","プランを変更"]].map(([p,l]) => (
                      <button key={p} style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"9px 14px", fontSize:12, color:C.ink, fontFamily:"inherit", cursor:"pointer", borderBottom:"1px solid " + C.border }} onClick={() => { go(p); setDrop(false); }}>{l}</button>
                    ))}
                    {isAdmin && (
                      <div>
                        <div style={{ height:1, background:C.border }} />
                        {[["admin","管理パネル"],["analytics","アクセス解析"]].map(([p,l]) => (
                          <button key={p} style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"9px 14px", fontSize:12, color:C.ink, fontFamily:"inherit", cursor:"pointer", borderBottom:"1px solid " + C.border }} onClick={() => { go(p); setDrop(false); }}>{l}</button>
                        ))}
                      </div>
                    )}
                    <div style={{ height:1, background:C.border }} />
                    <button style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"9px 14px", fontSize:12, color:C.ink, fontFamily:"inherit", cursor:"pointer" }} onClick={() => { logout(); setDrop(false); }}>ログアウト</button>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display:"flex", gap:8 }}>
                <button style={{ background:"none", border:"1px solid " + C.border, color:C.accent, fontSize:12, fontFamily:"inherit", cursor:"pointer", fontWeight:"bold", padding:"4px 10px" }} onClick={() => setAuthMode("login")}>ログイン</button>
                <button style={{ background:C.accent, border:"none", color:"#fff", padding:"6px 14px", fontSize:12, fontWeight:"bold", fontFamily:"inherit", cursor:"pointer" }} onClick={() => setAuthMode("register")}>新規登録</button>
              </div>
            )}
          </div>
        )}
      </div>
      {isMobile && menuOpen && (
        <div style={{ background:"#fff", borderBottom:"1px solid " + C.border, boxShadow:"0 4px 12px rgba(0,0,0,0.1)" }} className="fadeUp">
          {[["home","ホーム"],["companies","企業一覧"],["ranking","ランキング"],["addCompany","＋企業追加"],["pricing","料金プラン"]].map(([p,l]) => (
            <button key={p} style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"12px 16px", fontSize:13, color:C.ink, fontFamily:"inherit", cursor:"pointer", borderBottom:"1px solid " + C.border }} onClick={() => go(p)}>{l}</button>
          ))}
          {sess ? (
            <div>
              <button style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"12px 16px", fontSize:13, color:C.ink, fontFamily:"inherit", cursor:"pointer", borderBottom:"1px solid " + C.border }} onClick={() => go("mypage")}>マイページ</button>
              {isAdmin && [["admin","管理パネル"],["analytics","アクセス解析"]].map(([p,l]) => (
                <button key={p} style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"12px 16px", fontSize:13, color:C.ink, fontFamily:"inherit", cursor:"pointer", borderBottom:"1px solid " + C.border }} onClick={() => go(p)}>{l}</button>
              ))}
              <button style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"12px 16px", fontSize:13, color:C.accent, fontFamily:"inherit", cursor:"pointer", borderBottom:"1px solid " + C.border }} onClick={logout}>ログアウト</button>
            </div>
          ) : (
            <div>
              <button style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"12px 16px", fontSize:13, color:C.ink, fontFamily:"inherit", cursor:"pointer", borderBottom:"1px solid " + C.border }} onClick={() => setAuthMode("login")}>ログイン</button>
              <button style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"none", padding:"12px 16px", fontSize:13, color:C.ink, fontFamily:"inherit", cursor:"pointer", borderBottom:"1px solid " + C.border }} onClick={() => setAuthMode("register")}>新規登録</button>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

// ─── ホームページ ──────────────────────────────────────────────────────────────
function HomePage({ sess, go, companies, posts, reviews, salaries, isAdmin, adminDelete, setEditTgt, coPosts, coRevs, coSals, isMobile }) {
  const recent   = posts.slice(0, 6);
  const topCos   = [...companies].sort((a,b) => coRevs(b.id).length + coPosts(b.id).length - (coRevs(a.id).length + coPosts(a.id).length)).slice(0, 8);
  const weekAgo  = Date.now() - 7 * 86400000;
  const trending = [...posts].filter(p => {
    const ts = p.createdAt?.toDate?.()?.getTime() || 0;
    return ts > weekAgo;
  }).sort((a,b) => (b.likes?.length || 0) - (a.likes?.length || 0)).slice(0, 3);

  return (
    <div>
      <section style={{ ...S.hero, flexDirection: isMobile ? "column" : "row", padding: isMobile ? "16px 0 20px" : "56px 0 40px" }}>
        <div style={{ flex:"1 1 300px" }}>
          <p style={{ fontSize:10, fontWeight:"bold", letterSpacing:"0.14em", textTransform:"uppercase", color:C.accent, marginBottom:10 }}>
            メール登録で無料で使えます
          </p>
          <h1 style={{ fontWeight:"bold", lineHeight:1.5, marginBottom:10, fontFamily:"serif", fontSize: isMobile ? "clamp(18px,5vw,22px)" : "clamp(20px,3vw,28px)" }}>
            面接体験談・年収・口コミ・求人情報を<br />みんなで共有するコミュニティ
          </h1>
          <p style={{ color:C.sub, lineHeight:1.9, fontSize: isMobile ? 12 : 13, marginBottom:16 }}>
            無料会員登録（メールのみ）で投稿・閲覧・企業追加が可能。情報が集まるほど、みんなの役に立ちます。
          </p>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            <button style={S.primaryBtn} onClick={() => go("companies")}>企業一覧を見る</button>
            <button style={{ ...S.primaryBtn, background:"none", border:"1px solid " + C.ink, color:C.ink }} onClick={() => go("addCompany")}>＋ 企業を追加</button>
          </div>
          <div style={{ marginTop:12, padding:"10px 14px", background:"#FFF8F0", border:"1px solid #E8C97A", fontSize:12, lineHeight:1.8 }}>
            ベータ版提供中。早期登録ユーザーには正式リリース後も現行価格での継続利用を保証します。
          </div>
        </div>
        <div style={{ display:"flex", flexDirection: isMobile ? "row" : "column", gap: isMobile ? 8 : 0, border: isMobile ? "none" : "1px solid " + C.border, alignSelf:"flex-start" }}>
          {[[posts.length,"件","体験談"],[reviews.length,"件","口コミ"],[salaries.length,"件","年収情報"],[companies.length,"社","掲載企業"]].map(([n,u,l]) => (
            <div key={l} style={{ padding: isMobile ? "8px 10px" : "12px 18px", background:C.surface, borderBottom: isMobile ? "none" : "1px solid " + C.border }}>
              <div style={{ fontSize:20, fontWeight:"bold", color:C.accent, fontFamily:"serif" }}>{n}<span style={{ fontSize:11, fontWeight:"normal", marginLeft:2 }}>{u}</span></div>
              <div style={{ fontSize:10, color:C.sub, marginTop:2 }}>{l}</div>
            </div>
          ))}
        </div>
      </section>

      {posts.length < 20 && (
        <div style={{ background:C.ink, color:"#fff", padding:"14px 20px", marginBottom:24, display:"flex", gap:12, alignItems:"center", flexWrap:"wrap" }}>
          <span style={{ fontSize:20 }}>🔥</span>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:"bold", fontSize:13, marginBottom:3 }}>あなたの情報が次の転職者を助けます</div>
            <div style={{ fontSize:12, opacity:0.8 }}>体験談を投稿すると、他社の情報が見やすくなります。</div>
          </div>
          <button style={{ ...S.primaryBtn, background:C.accent, border:"none", whiteSpace:"nowrap" }} onClick={() => go("companies")}>投稿する →</button>
        </div>
      )}

      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 280px", gap:28, alignItems:"start" }}>
        <section>
          {trending.length > 0 && (
            <div>
              <STitle label="今週のトレンド" />
              {trending.map(p => (
                <PostCard key={p.id} post={p} co={companies.find(c => c.id === p.companyId)} go={go} isAdmin={isAdmin} onDelete={adminDelete} onEdit={d => setEditTgt({ type:"post", data:d })} />
              ))}
              <div style={{ marginTop:24 }} />
            </div>
          )}
          <STitle label="最新の体験談" />
          {recent.length === 0
            ? <Empty text="まだ投稿がありません。最初の投稿をしてみましょう！" />
            : recent.map(p => (
                <PostCard key={p.id} post={p} co={companies.find(c => c.id === p.companyId)} go={go} isAdmin={isAdmin} onDelete={adminDelete} onEdit={d => setEditTgt({ type:"post", data:d })} />
              ))
          }
        </section>
        {!isMobile && (
          <aside>
            <STitle label="注目の企業" />
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr>
                  <th style={S.th}>企業名</th>
                  <th style={{ ...S.th, textAlign:"right" }}>評価</th>
                  <th style={{ ...S.th, textAlign:"right" }}>年収</th>
                </tr>
              </thead>
              <tbody>
                {topCos.map((co, i) => {
                  const a   = calcAvg(coRevs(co.id));
                  const sal = calcAvgSal(coSals(co.id));
                  return (
                    <tr key={co.id} style={{ ...S.tableRow, cursor:"pointer" }} onClick={() => go("company", co)}>
                      <td style={S.td}><span style={{ fontSize:11, color:C.sub, marginRight:4 }}>{i + 1}.</span>{co.name}</td>
                      <td style={{ ...S.td, textAlign:"right", color:C.accent, fontWeight:"bold", fontSize:12 }}>{a ? ("★" + a.overall.toFixed(1)) : "-"}</td>
                      <td style={{ ...S.td, textAlign:"right", fontSize:12, color:"#1a5276", fontWeight:"bold" }}>{sal ? (sal + "万") : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button style={{ ...S.secondaryBtn, width:"100%", marginTop:8, fontSize:12 }} onClick={() => go("ranking")}>ランキングを見る →</button>
            <div style={{ marginTop:16 }} />
            <STitle label="業種別に探す" />
            {ALL_GROUPS.map(grp => (
              <button key={grp} style={{ display:"block", width:"100%", textAlign:"left", background:"none", border:"1px solid " + C.border, padding:"7px 10px", marginBottom:4, fontSize:12, cursor:"pointer", fontFamily:"inherit" }} onClick={() => go("companies")}>
                {grp}
              </button>
            ))}
          </aside>
        )}
      </div>
    </div>
  );
}

// ─── 企業一覧 ─────────────────────────────────────────────────────────────────
function CompaniesPage({ go, filtered, searchQ, setSearchQ, grpFilter, setGrpFilter, subFilter, setSubFilter, sortBy, setSortBy, coPosts, coRevs, coSals, isAdmin, adminDelete, setEditTgt, isMobile }) {
  const subs = grpFilter ? (INDUSTRY_GROUPS[grpFilter] || []) : [];
  return (
    <div>
      <PageHeader title="企業一覧" desc="業種・評価・年収で絞り込んで企業を探せます" />
      <div style={{ overflowX:"auto", marginBottom:8 }}>
        <div style={{ display:"flex", gap:4, paddingBottom:4, minWidth:"max-content" }}>
          <button style={{ ...S.chip, ...(grpFilter === "" ? S.chipOn : {}) }} onClick={() => { setGrpFilter(""); setSubFilter(""); }}>すべて</button>
          {ALL_GROUPS.map(grp => (
            <button key={grp} style={{ ...S.chip, ...(grpFilter === grp ? S.chipOn : {}) }} onClick={() => setGrpFilter(g => g === grp ? "" : grp)}>{grp}</button>
          ))}
        </div>
      </div>
      {grpFilter && subs.length > 0 && (
        <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:10 }}>
          {subs.map(s => (
            <button key={s} style={{ border:"1px solid " + C.border, background: subFilter === s ? C.accent : "#F7F7F7", color: subFilter === s ? "#fff" : C.sub, padding:"3px 9px", fontSize:11, cursor:"pointer", fontFamily:"inherit" }} onClick={() => setSubFilter(x => x === s ? "" : s)}>{s}</button>
          ))}
        </div>
      )}
      <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap", alignItems:"center" }}>
        <input style={{ ...S.input, flex:"1 1 150px" }} placeholder="企業名で検索" value={searchQ} onChange={e => setSearchQ(e.target.value)} />
        <select style={{ ...S.input, width:"auto", flex:"0 0 auto" }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="posts">投稿数順</option>
          <option value="rating">評価順</option>
          <option value="salary">年収順</option>
        </select>
        <button style={S.primaryBtn} onClick={() => go("addCompany")}>＋ 企業追加</button>
      </div>
      <p style={{ fontSize:12, color:C.sub, marginBottom:10 }}>{filtered.length}社</p>
      {filtered.length === 0 ? <Empty text="該当する企業が見つかりません" /> : (
        isMobile ? (
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {filtered.map(co => {
              const a   = calcAvg(coRevs(co.id));
              const sal = calcAvgSal(coSals(co.id));
              return (
                <div key={co.id} style={{ background:C.surface, padding:"12px", borderBottom:"1px solid " + C.border, cursor:"pointer" }} onClick={() => go("company", co)}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:22 }}>{co.emoji}</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:"bold", fontSize:13 }}>{co.name}</div>
                      <div style={{ fontSize:11, color:C.sub }}>{co.group || getGroup(co.industry)} &gt; {co.industry}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      {a && <div style={{ color:C.accent, fontWeight:"bold", fontSize:12 }}>★{a.overall.toFixed(1)}</div>}
                      {sal && <div style={{ color:"#1a5276", fontWeight:"bold", fontSize:12 }}>{sal}万</div>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr>
                <th style={S.th}>企業名</th>
                <th style={S.th}>業界</th>
                <th style={{ ...S.th, textAlign:"center" }}>評価</th>
                <th style={{ ...S.th, textAlign:"right" }}>平均年収</th>
                <th style={{ ...S.th, textAlign:"center" }}>体験談</th>
                <th style={{ ...S.th, textAlign:"center" }}>口コミ</th>
                {isAdmin && <th style={S.th} />}
              </tr>
            </thead>
            <tbody>
              {filtered.map(co => {
                const a   = calcAvg(coRevs(co.id));
                const sal = calcAvgSal(coSals(co.id));
                return (
                  <tr key={co.id} style={{ ...S.tableRow, cursor:"pointer" }} onClick={() => go("company", co)}>
                    <td style={S.td}><span style={{ fontSize:16, marginRight:8 }}>{co.emoji}</span><span style={{ fontWeight:"bold", fontSize:13 }}>{co.name}</span></td>
                    <td style={{ ...S.td, fontSize:12, color:C.sub }}>{co.industry}</td>
                    <td style={{ ...S.td, textAlign:"center", color:C.accent, fontWeight:"bold", fontSize:12 }}>{a ? ("★" + a.overall.toFixed(1)) : "-"}</td>
                    <td style={{ ...S.td, textAlign:"right", fontSize:12, fontWeight:"bold", color:"#1a5276" }}>{sal ? (sal + "万円") : "-"}</td>
                    <td style={{ ...S.td, textAlign:"center", fontSize:12 }}>{coPosts(co.id).length}件</td>
                    <td style={{ ...S.td, textAlign:"center", fontSize:12 }}>{coRevs(co.id).length}件</td>
                    {isAdmin && (
                      <td style={{ ...S.td, textAlign:"right" }} onClick={e => e.stopPropagation()}>
                        <SmBtn onClick={() => setEditTgt({ type:"company", data:co })}>編集</SmBtn>
                        <SmBtn red onClick={() => adminDelete("company", co.id)}>削除</SmBtn>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      )}
    </div>
  );
}

// ─── 企業ページ ───────────────────────────────────────────────────────────────
function CompanyPage({ go, co, cposts, crevs, csals, cjobs, initTab, onToggleLike, onAddComment, onAddPost, onAddReview, onAddSalary, onAddJob, isAdmin, adminDelete, setEditTgt, plan, setAuthMode, isMobile, uName, favorites, toggleFavorite }) {
  const [tab,     setTab]     = useState(initTab || "interview");
  const [jobCat,  setJobCat]  = useState("全職種");
  useEffect(() => { if (initTab) setTab(initTab); }, [initTab]);

  // 職種フィルター
  const filterByJob = (posts) => jobCat === "全職種" ? posts : posts.filter(p => p.jobCategory === jobCat);

  const iv  = filterByJob(cposts.filter(p => p.ptype === "interview"));
  const bd  = filterByJob(cposts.filter(p => p.ptype === "board"));
  const a   = calcAvg(crevs);
  const sal = calcAvgSal(csals);

  const tabs = [
    ["interview", "面接体験談", iv.length],
    ["board",     "選考掲示板", bd.length],
    ["review",    "口コミ",     crevs.length],
    ["salary",    "年収情報",   csals.length],
    ["jobs",      "募集要項",   cjobs.length],
  ];

  return (
    <div>
      <button style={{ background:"none", border:"none", color:C.accent, cursor:"pointer", fontSize:12, fontFamily:"inherit", marginTop:16, marginBottom:4, padding:0, textDecoration:"underline" }} onClick={() => go("companies")}>
        &larr; 企業一覧に戻る
      </button>
      <div style={{ borderTop:"3px solid " + C.ink, borderBottom:"1px solid " + C.border, padding:"16px 0", marginBottom:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
          <span style={{ fontSize: isMobile ? 28 : 40 }}>{co.emoji}</span>
          <div style={{ flex:1 }}>
            <h1 style={{ fontWeight:"bold", fontFamily:"serif", fontSize: isMobile ? 18 : 24 }}>{co.name}</h1>
            <p style={{ fontSize:12, color:C.sub, marginTop:3 }}>{co.group || getGroup(co.industry)} &gt; {co.industry}</p>
          </div>
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            {a && (
              <div style={{ textAlign:"center", border:"1px solid " + C.border, padding:"10px 14px", minWidth:90 }}>
                <div style={{ fontSize:10, color:C.sub, marginBottom:3 }}>総合評価</div>
                <div style={{ fontSize:26, fontWeight:"bold", color:C.accent, fontFamily:"serif", lineHeight:1 }}>{a.overall.toFixed(1)}</div>
                <Stars r={a.overall} size={11} />
              </div>
            )}
            {sal && (
              <div style={{ textAlign:"center", border:"1px solid " + C.border, padding:"10px 14px", minWidth:90 }}>
                <div style={{ fontSize:10, color:C.sub, marginBottom:3 }}>平均年収</div>
                <div style={{ fontSize:22, fontWeight:"bold", color:"#1a5276", fontFamily:"serif", lineHeight:1 }}>{sal}<span style={{ fontSize:12, fontWeight:"normal" }}>万円</span></div>
                <div style={{ fontSize:10, color:C.sub, marginTop:3 }}>{csals.length}件</div>
              </div>
            )}
          </div>
          {isAdmin && (
            <div style={{ display:"flex", gap:4 }}>
              <SmBtn onClick={() => setEditTgt({ type:"company", data:co })}>編集</SmBtn>
              <SmBtn red onClick={() => adminDelete("company", co.id)}>削除</SmBtn>
            </div>
          )}
        </div>
      </div>
      {/* 職種別フィルター */}
      <div style={{ overflowX:"auto", margin:"12px 0 0 0", paddingBottom:4 }}>
        <div style={{ display:"flex", gap:4, minWidth:"max-content" }}>
          {JOB_CATEGORIES.map(jc => (
            <button key={jc} style={{ border:"1px solid " + C.border, background: jobCat===jc ? C.accent : "#F7F7F7", color: jobCat===jc ? "#fff" : C.sub, padding:"3px 10px", fontSize:11, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }} onClick={() => setJobCat(jc)}>{jc}</button>
          ))}
        </div>
      </div>
      <div style={{ display:"flex", borderBottom:"2px solid " + C.ink, marginTop:8, overflowX:"auto" }}>
        {tabs.map(([k,l,n]) => (
          <button key={k} style={{ background:"none", border:"none", padding:"9px 14px", fontSize:12, fontFamily:"inherit", cursor:"pointer", color: tab===k ? C.accent : C.sub, borderBottom:"3px solid " + (tab===k ? C.accent : "transparent"), marginBottom:-2, fontWeight: tab===k ? "bold" : "500", whiteSpace:"nowrap" }} onClick={() => setTab(k)}>
            {l}<span style={{ fontSize:10, background: tab===k ? C.accent : "#eee", color: tab===k ? "#fff" : C.sub, padding:"1px 5px", marginLeft:3 }}>{n}</span>
          </button>
        ))}
      </div>
      <div style={{ paddingTop:20 }}>
        {tab === "interview" && <PostsTab posts={iv} ptype="interview" label="面接体験談" co={co} uName={uName} onAddPost={onAddPost} onToggleLike={onToggleLike} onAddComment={onAddComment} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} favorites={favorites} toggleFavorite={toggleFavorite} jobCat={jobCat} />}
        {tab === "board"     && <PostsTab posts={bd} ptype="board"     label="選考掲示板" co={co} uName={uName} onAddPost={onAddPost} onToggleLike={onToggleLike} onAddComment={onAddComment} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} favorites={favorites} toggleFavorite={toggleFavorite} jobCat={jobCat} />}
        {tab === "review"    && <ReviewsTab revs={crevs} avgData={a}   co={co} uName={uName} plan={plan} onAddReview={onAddReview} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} go={go} />}
        {tab === "salary"    && <SalaryTab  sals={csals} avgSalary={sal} co={co} uName={uName} plan={plan} onAddSalary={onAddSalary} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} go={go} />}
        {tab === "jobs"      && <JobsTab    jobs={cjobs} co={co} uName={uName} onAddJob={onAddJob} isAdmin={isAdmin} adminDelete={adminDelete} setEditTgt={setEditTgt} />}
      </div>
    </div>
  );
}

// ─── 掲示板・体験談タブ ───────────────────────────────────────────────────────
function PostsTab({ posts, ptype, label, co, uName, onAddPost, onToggleLike, onAddComment, isAdmin, adminDelete, setEditTgt, favorites, toggleFavorite, jobCat }) {
  const [exp,  setExp]  = useState(null);
  const [cmt,  setCmt]  = useState("");
  const [form, setForm] = useState(null);
  const initF = { companyId:co.id, ptype, stage:"", title:"", content:"" };
  const sorted = [...posts].sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, paddingBottom:10, borderBottom:"1px solid " + C.border, flexWrap:"wrap", gap:8 }}>
        <span style={{ fontSize:12, color:C.sub }}>{posts.length}件の{label}</span>
        <button style={S.primaryBtn} onClick={() => setForm(form ? null : initF)}>
          {form ? "キャンセル" : "＋ " + label + "を投稿する"}
        </button>
      </div>
      {form && (
        <div style={{ background:C.surface, border:"1px solid " + C.border, borderTop:"3px solid " + C.accent, padding:"18px 20px", marginBottom:20 }}>
          <Fld label="職種カテゴリ">
            <select style={S.input} value={form.jobCategory || "全職種"} onChange={e => setForm({ ...form, jobCategory:e.target.value })}>
              {JOB_CATEGORIES.map(j => <option key={j}>{j}</option>)}
            </select>
          </Fld>
          <Fld label="選考段階 *">
            <select style={S.input} value={form.stage} onChange={e => setForm({ ...form, stage:e.target.value })}>
              <option value="">選択してください</option>
              {STAGES.map(s => <option key={s}>{s}</option>)}
            </select>
          </Fld>
          <Fld label="タイトル *">
            <input style={S.input} placeholder="例：一次面接で聞かれたこと" value={form.title} onChange={e => setForm({ ...form, title:e.target.value })} />
          </Fld>
          <Fld label="本文 *">
            <textarea style={{ ...S.input, resize:"vertical" }} rows={5} placeholder="面接の様子、聞かれた内容、準備のポイントなどをご記入ください。" value={form.content} onChange={e => setForm({ ...form, content:e.target.value })} />
          </Fld>
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderTop:"1px solid " + C.border, fontSize:12, color:C.sub }}>
            <AC>{ini(uName)}</AC>{uName} として投稿
          </div>
          <button style={{ ...S.primaryBtn, width:"100%", padding:"11px" }} onClick={async () => {
            if (!form.stage || !form.title.trim() || !form.content.trim()) return;
            await onAddPost(form);
            setForm(null);
          }}>
            投稿する
          </button>
        </div>
      )}
      {sorted.length === 0
        ? <Empty text={"まだ" + label + "がありません。最初の投稿をしてみましょう！"} />
        : sorted.map(p => (
            <article key={p.id} style={{ background:C.surface, padding:"12px 0", borderBottom:"1px solid " + C.border }}>
              {isAdmin && (
                <div style={{ display:"flex", gap:4, justifyContent:"flex-end", marginBottom:6 }}>
                  <SmBtn onClick={() => setEditTgt({ type:"post", data:p })}>編集</SmBtn>
                  <SmBtn red onClick={() => adminDelete("post", p.id)}>削除</SmBtn>
                </div>
              )}
              <div style={{ display:"flex", gap:8, marginBottom:10, alignItems:"center", flexWrap:"wrap" }}>
                <StageBadge s={p.stage} />
                {p.jobCategory && p.jobCategory !== "全職種" && (
                  <span style={{ fontSize:10, background:"#EFF6FF", color:"#1E40AF", border:"1px solid #BFDBFE", padding:"1px 7px", fontWeight:"bold" }}>{p.jobCategory}</span>
                )}
                <span style={{ fontSize:11, color:C.sub, marginLeft:"auto" }}>{ago(p.createdAt)}</span>
              </div>
              <h3 style={{ fontSize:15, fontWeight:"bold", marginBottom:8, lineHeight:1.55, fontFamily:"serif" }}>{p.title}</h3>
              <p style={{ fontSize:13, lineHeight:1.9, marginBottom:12 }}>{p.content}</p>
              <div style={{ display:"flex", alignItems:"center", gap:10, borderTop:"1px solid " + C.border, paddingTop:10, flexWrap:"wrap" }}>
                <AC>{ini(p.author)}</AC>
                <span style={{ fontSize:12, color:C.sub }}>{p.author}</span>
                <button style={{ background:"none", border:"none", color:C.sub, fontSize:12, cursor:"pointer", fontFamily:"inherit", marginLeft:"auto" }} onClick={() => onToggleLike(p.id)}>
                  {(p.likes || []).length > 0 ? ("♥ " + (p.likes || []).length) : "♡ いいね"}
                </button>
                <button style={{ background:"none", border:"none", fontSize:12, cursor:"pointer", fontFamily:"inherit", color: favorites && favorites.includes(p.id) ? "#E8A000" : C.sub }} onClick={() => toggleFavorite && toggleFavorite(p.id)}>
                  {favorites && favorites.includes(p.id) ? "★ お気に入り" : "☆ お気に入り"}
                </button>
                <button style={{ background:"none", border:"none", color:C.sub, fontSize:12, cursor:"pointer", fontFamily:"inherit" }} onClick={() => setExp(exp === p.id ? null : p.id)}>
                  コメント({(p.comments || []).length}){exp === p.id ? " ▴" : " ▾"}
                </button>
              </div>
              {exp === p.id && (
                <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid " + C.border }}>
                  {(p.comments || []).map(c => (
                    <div key={c.id} style={{ borderLeft:"3px solid " + C.border, paddingLeft:10, marginBottom:8, paddingBottom:8 }}>
                      {isAdmin && <span style={{ float:"right" }}><SmBtn red onClick={() => adminDelete("comment", p.id + ":" + c.id)}>削除</SmBtn></span>}
                      <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>{c.author} · {c.date}</div>
                      <p style={{ fontSize:13, lineHeight:1.8 }}>{c.content}</p>
                    </div>
                  ))}
                  <div style={{ display:"flex", gap:8, marginTop:8, alignItems:"flex-start" }}>
                    <AC>{ini(uName)}</AC>
                    <div style={{ flex:1 }}>
                      <textarea style={{ ...S.input, resize:"vertical", width:"100%" }} rows={2} placeholder="コメントを入力" value={cmt} onChange={e => setCmt(e.target.value)} />
                      <button style={{ ...S.primaryBtn, marginTop:6, fontSize:12, padding:"7px 14px" }} onClick={async () => {
                        if (cmt.trim()) { await onAddComment(p.id, cmt.trim()); setCmt(""); }
                      }}>
                        送信
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </article>
          ))
      }
    </div>
  );
}

// ─── 口コミタブ ───────────────────────────────────────────────────────────────
function ReviewsTab({ revs, avgData: a, co, uName, plan, onAddReview, isAdmin, adminDelete, setEditTgt, go }) {
  const [form, setForm] = useState(null);
  const canRead = ["standard","premium"].includes(plan);
  const initF = { companyId:co.id, overall:3, rats:{salary:3,culture:3,wlb:3,career:3,mgmt:3}, empType:"正社員", tenure:"1~3年", dept:"", pros:"", cons:"", advice:"" };

  return (
    <div>
      {a && (
        <div style={{ display:"flex", gap:20, flexWrap:"wrap", padding:"14px 0", borderBottom:"1px solid " + C.border, marginBottom:16 }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, minWidth:80, paddingRight:18, borderRight:"1px solid " + C.border }}>
            <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>総合評価</div>
            <div style={{ fontSize:46, fontWeight:"bold", color:C.accent, lineHeight:1, fontFamily:"serif" }}>{a.overall.toFixed(1)}</div>
            <Stars r={a.overall} size={14} />
            <div style={{ fontSize:11, color:C.sub, marginTop:4 }}>{revs.length}件</div>
          </div>
          <div style={{ flex:1, minWidth:180 }}>
            {RCATS.map(cat => (
              <div key={cat.key} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:9 }}>
                <span style={{ fontSize:11, color:C.sub, width:134, flexShrink:0 }}>{cat.label}</span>
                <div style={{ flex:1, height:5, background:"#E5E7EB", position:"relative" }}>
                  <div style={{ position:"absolute", left:0, top:0, height:"100%", width: ((a[cat.key] / 5) * 100) + "%", background:C.accent }} />
                </div>
                <span style={{ fontSize:12, fontWeight:"bold", width:24, textAlign:"right" }}>{parseFloat(a[cat.key]).toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, paddingBottom:10, borderBottom:"1px solid " + C.border, flexWrap:"wrap", gap:8 }}>
        <span style={{ fontSize:12, color:C.sub }}>{revs.length}件の口コミ</span>
        <button style={S.primaryBtn} onClick={() => setForm(form ? null : initF)}>
          {form ? "キャンセル" : "＋ 口コミを書く"}
        </button>
      </div>
      {form && (
        <div style={{ background:C.surface, border:"1px solid " + C.border, borderTop:"3px solid " + C.accent, padding:"18px 20px", marginBottom:20 }}>
          <Fld label="総合評価 *"><StarPicker value={form.overall} onChange={v => setForm({ ...form, overall:v })} label="総合評価" /></Fld>
          <Fld label="カテゴリ別評価">
            <div style={{ borderLeft:"3px solid " + C.border, paddingLeft:12 }}>
              {RCATS.map(cat => (
                <StarPicker key={cat.key} value={form.rats[cat.key]} onChange={v => setForm({ ...form, rats:{ ...form.rats, [cat.key]:v } })} label={cat.label} />
              ))}
            </div>
          </Fld>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Fld label="在籍形態"><select style={S.input} value={form.empType} onChange={e => setForm({ ...form, empType:e.target.value })}>{EMP_TYPES.map(t => <option key={t}>{t}</option>)}</select></Fld>
            <Fld label="在籍年数"><select style={S.input} value={form.tenure}  onChange={e => setForm({ ...form, tenure: e.target.value })}>{TENURES.map(t => <option key={t}>{t}</option>)}</select></Fld>
          </div>
          <Fld label="良いところ *"><textarea style={{ ...S.input, resize:"vertical" }} rows={3} value={form.pros} onChange={e => setForm({ ...form, pros:e.target.value })} /></Fld>
          <Fld label="改善点 *"><textarea style={{ ...S.input, resize:"vertical" }} rows={3} value={form.cons} onChange={e => setForm({ ...form, cons:e.target.value })} /></Fld>
          <Fld label="アドバイス（任意）"><textarea style={{ ...S.input, resize:"vertical" }} rows={2} value={form.advice} onChange={e => setForm({ ...form, advice:e.target.value })} /></Fld>
          <div style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 0", borderTop:"1px solid " + C.border, fontSize:12, color:C.sub }}>
            <AC>{ini(uName)}</AC>{uName} として投稿
          </div>
          <button style={{ ...S.primaryBtn, width:"100%", padding:"11px" }} onClick={async () => {
            if (!form.pros.trim() || !form.cons.trim()) return;
            await onAddReview(form);
            setForm(null);
          }}>
            口コミを投稿する
          </button>
        </div>
      )}
      {!canRead && revs.length > 0 && (
        <div style={{ background:"#FFF8F0", border:"1px solid #E8C97A", padding:"14px 16px", marginBottom:14 }}>
          <div style={{ fontWeight:"bold", marginBottom:6, fontSize:14 }}>口コミ全文はスタンダードプラン以上で閲覧できます</div>
          <button style={S.primaryBtn} onClick={() => go("pricing")}>プランを確認する →</button>
        </div>
      )}
      {revs.length === 0 && <Empty text="まだ口コミがありません" />}
      {(canRead ? revs : []).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map(r => (
        <div key={r.id} style={{ background:C.surface, border:"1px solid " + C.border, padding:"14px 16px", marginBottom:10 }}>
          {isAdmin && (
            <div style={{ display:"flex", gap:4, justifyContent:"flex-end", marginBottom:8 }}>
              <SmBtn onClick={() => setEditTgt({ type:"review", data:r })}>編集</SmBtn>
              <SmBtn red onClick={() => adminDelete("review", r.id)}>削除</SmBtn>
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:8, marginBottom:10, paddingBottom:10, borderBottom:"1px solid " + C.border }}>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <Stars r={r.overall} size={13} />
                <span style={{ fontWeight:"bold", fontSize:15, color:C.accent }}>{r.overall.toFixed(1)}</span>
              </div>
              {[r.empType, r.tenure, r.dept].filter(Boolean).map(t => (
                <span key={t} style={{ fontSize:11, color:C.sub, border:"1px solid " + C.border, padding:"1px 6px", marginRight:4, marginBottom:3, display:"inline-block" }}>{t}</span>
              ))}
            </div>
            <span style={{ fontSize:11, color:C.sub }}>{ago(r.createdAt)}</span>
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:14, padding:"8px 12px", background:"#F7F7F7", borderLeft:"3px solid " + C.border, marginBottom:12 }}>
            {RCATS.map(cat => (
              <div key={cat.key} style={{ textAlign:"center" }}>
                <div style={{ fontSize:9, color:C.sub, marginBottom:1 }}>{cat.label}</div>
                <div style={{ fontSize:13, fontWeight:"bold" }}>{((r.rats && r.rats[cat.key]) || 0).toFixed(1)}</div>
              </div>
            ))}
          </div>
          {r.pros   && <div style={{ marginBottom:10 }}><div style={{ fontSize:11, fontWeight:"bold", color:C.sub, marginBottom:3 }}>良いところ</div><p style={{ fontSize:13, lineHeight:1.9 }}>{r.pros}</p></div>}
          {r.cons   && <div style={{ marginBottom:10 }}><div style={{ fontSize:11, fontWeight:"bold", color:C.sub, marginBottom:3 }}>改善点</div><p style={{ fontSize:13, lineHeight:1.9 }}>{r.cons}</p></div>}
          {r.advice && <div style={{ marginBottom:10 }}><div style={{ fontSize:11, fontWeight:"bold", color:C.sub, marginBottom:3 }}>アドバイス</div><p style={{ fontSize:13, lineHeight:1.9 }}>{r.advice}</p></div>}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, paddingTop:10, borderTop:"1px solid " + C.border }}>
            <AC>{ini(r.author)}</AC><span style={{ fontSize:12, color:C.sub }}>{r.author}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 年収タブ ─────────────────────────────────────────────────────────────────
function SalaryTab({ sals, avgSalary, co, uName, plan, onAddSalary, isAdmin, adminDelete, setEditTgt, go }) {
  const [form, setForm] = useState(null);
  const canRead = ["standard","premium"].includes(plan);
  const byJob   = sals.reduce((acc, s) => { if (!acc[s.jobType]) acc[s.jobType] = []; acc[s.jobType].push(s); return acc; }, {});
  const initF   = { companyId:co.id, jobType:"", ageRange:"", empType:"正社員", annualSalary:"", baseSalary:"", bonus:"", comment:"" };

  return (
    <div>
      {avgSalary && (
        <div style={{ display:"flex", gap:20, flexWrap:"wrap", padding:"14px 0", borderBottom:"1px solid " + C.border, marginBottom:16 }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, minWidth:80, paddingRight:18, borderRight:"1px solid " + C.border }}>
            <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>平均年収</div>
            <div style={{ fontSize:36, fontWeight:"bold", color:"#1a5276", lineHeight:1, fontFamily:"serif" }}>{avgSalary}<span style={{ fontSize:13, fontWeight:"normal" }}>万円</span></div>
            <div style={{ fontSize:11, color:C.sub, marginTop:4 }}>{sals.length}件</div>
          </div>
          {Object.keys(byJob).length > 0 && (
            <div style={{ flex:1, minWidth:160 }}>
              <div style={{ fontSize:11, fontWeight:"bold", color:C.sub, marginBottom:8 }}>職種別平均年収</div>
              {Object.entries(byJob).map(([job, ss]) => {
                const m = Math.round(ss.reduce((a,s) => a + s.annualSalary, 0) / ss.length);
                return (
                  <div key={job} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                    <span style={{ fontSize:11, color:C.sub, width:150, flexShrink:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job}</span>
                    <div style={{ flex:1, height:5, background:"#E5E7EB", position:"relative" }}>
                      <div style={{ position:"absolute", left:0, top:0, height:"100%", width: Math.min((m / 1500) * 100, 100) + "%", background:"#1a5276" }} />
                    </div>
                    <span style={{ fontSize:12, fontWeight:"bold", color:"#1a5276", width:44, textAlign:"right" }}>{m}万</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, paddingBottom:10, borderBottom:"1px solid " + C.border, flexWrap:"wrap", gap:8 }}>
        <span style={{ fontSize:12, color:C.sub }}>{sals.length}件の年収情報</span>
        <button style={S.primaryBtn} onClick={() => setForm(form ? null : initF)}>
          {form ? "キャンセル" : "＋ 年収情報を投稿する"}
        </button>
      </div>
      {form && (
        <div style={{ background:C.surface, border:"1px solid " + C.border, borderTop:"3px solid " + C.accent, padding:"18px 20px", marginBottom:20 }}>
          <Fld label="職種 *">
            <select style={S.input} value={form.jobType} onChange={e => setForm({ ...form, jobType:e.target.value })}>
              <option value="">選択してください</option>
              {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </Fld>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Fld label="年齢帯 *">
              <select style={S.input} value={form.ageRange} onChange={e => setForm({ ...form, ageRange:e.target.value })}>
                <option value="">選択</option>
                {AGE_RANGES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Fld>
            <Fld label="在籍形態">
              <select style={S.input} value={form.empType} onChange={e => setForm({ ...form, empType:e.target.value })}>
                {EMP_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Fld>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
            <Fld label="年収（万円）*"><input style={S.input} type="number" placeholder="600" value={form.annualSalary} onChange={e => setForm({ ...form, annualSalary:e.target.value })} /></Fld>
            <Fld label="月給（万円）" ><input style={S.input} type="number" placeholder="40"  value={form.baseSalary}   onChange={e => setForm({ ...form, baseSalary:  e.target.value })} /></Fld>
            <Fld label="賞与（万円）" ><input style={S.input} type="number" placeholder="120" value={form.bonus}        onChange={e => setForm({ ...form, bonus:       e.target.value })} /></Fld>
          </div>
          <Fld label="コメント">
            <textarea style={{ ...S.input, resize:"vertical" }} rows={2} value={form.comment} onChange={e => setForm({ ...form, comment:e.target.value })} />
          </Fld>
          <button style={{ ...S.primaryBtn, width:"100%", padding:"11px" }} onClick={async () => {
            if (!form.jobType || !form.ageRange || !form.annualSalary) return;
            await onAddSalary({ ...form, annualSalary: Number(form.annualSalary), baseSalary: Number(form.baseSalary) || 0, bonus: Number(form.bonus) || 0 });
            setForm(null);
          }}>
            年収情報を投稿する
          </button>
        </div>
      )}
      {!canRead && sals.length > 0 && (
        <div style={{ background:"#FFF8F0", border:"1px solid #E8C97A", padding:"14px 16px", marginBottom:14 }}>
          <div style={{ fontWeight:"bold", marginBottom:6 }}>年収詳細はスタンダードプラン以上で閲覧できます</div>
          <button style={S.primaryBtn} onClick={() => go("pricing")}>プランを確認する →</button>
        </div>
      )}
      {sals.length === 0 && <Empty text="まだ年収情報がありません" />}
      {(canRead ? sals : []).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map(s => (
        <div key={s.id} style={{ background:C.surface, border:"1px solid " + C.border, padding:"14px 16px", marginBottom:10 }}>
          {isAdmin && (
            <div style={{ display:"flex", gap:4, justifyContent:"flex-end", marginBottom:8 }}>
              <SmBtn onClick={() => setEditTgt({ type:"salary", data:s })}>編集</SmBtn>
              <SmBtn red onClick={() => adminDelete("salary", s.id)}>削除</SmBtn>
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:8, marginBottom:10 }}>
            <div>
              <div style={{ fontSize:22, fontWeight:"bold", color:"#1a5276", fontFamily:"serif", marginBottom:4 }}>{s.annualSalary}<span style={{ fontSize:13, fontWeight:"normal", color:C.sub }}>万円/年</span></div>
              {[s.jobType, s.ageRange, s.empType].filter(Boolean).map(t => (
                <span key={t} style={{ fontSize:11, color:C.sub, border:"1px solid " + C.border, padding:"1px 6px", marginRight:4 }}>{t}</span>
              ))}
            </div>
            <div style={{ fontSize:12, color:C.sub, textAlign:"right" }}>
              {s.baseSalary ? <div>月給 <strong>{s.baseSalary}万円</strong></div> : null}
              {s.bonus      ? <div>賞与 <strong>{s.bonus}万円</strong></div>      : null}
              <div style={{ marginTop:4 }}>{ago(s.createdAt)}</div>
            </div>
          </div>
          {s.comment && <p style={{ fontSize:13, lineHeight:1.85, borderTop:"1px solid " + C.border, paddingTop:10 }}>{s.comment}</p>}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, paddingTop:10, borderTop:"1px solid " + C.border }}>
            <AC>{ini(s.author)}</AC><span style={{ fontSize:12, color:C.sub }}>{s.author}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── 募集要項タブ（過去求人も蓄積）────────────────────────────────────────────
function JobsTab({ jobs, co, uName, onAddJob, isAdmin, adminDelete, setEditTgt }) {
  const [form,   setForm]   = useState(null);
  const [expand, setExpand] = useState(null);
  const initF = { companyId:co.id, title:"", jobType:"", empType:"正社員", postedDate:today(), closingDate:"", salary:"", location:"", requirements:"", content:"", url:"" };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, paddingBottom:10, borderBottom:"1px solid " + C.border, flexWrap:"wrap", gap:8 }}>
        <div>
          <span style={{ fontSize:12, color:C.sub }}>{jobs.length}件の募集要項</span>
          <span style={{ fontSize:11, color:"#888", marginLeft:8 }}>（過去の求人情報も含む）</span>
        </div>
        <button style={S.primaryBtn} onClick={() => setForm(form ? null : initF)}>
          {form ? "キャンセル" : "＋ 募集要項を追加する"}
        </button>
      </div>
      {form && (
        <div style={{ background:C.surface, border:"1px solid " + C.border, borderTop:"3px solid " + C.accent, padding:"18px 20px", marginBottom:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Fld label="職種・ポジション名 *"><input style={S.input} placeholder="例：Webエンジニア" value={form.title} onChange={e => setForm({ ...form, title:e.target.value })} /></Fld>
            <Fld label="職種カテゴリ">
              <select style={S.input} value={form.jobType} onChange={e => setForm({ ...form, jobType:e.target.value })}>
                <option value="">選択</option>
                {JOB_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </Fld>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
            <Fld label="雇用形態"><select style={S.input} value={form.empType}     onChange={e => setForm({ ...form, empType:     e.target.value })}>{EMP_TYPES.map(t => <option key={t}>{t}</option>)}</select></Fld>
            <Fld label="掲載開始日"><input style={S.input} type="date" value={form.postedDate}  onChange={e => setForm({ ...form, postedDate:  e.target.value })} /></Fld>
            <Fld label="応募締切日"><input style={S.input} type="date" value={form.closingDate} onChange={e => setForm({ ...form, closingDate: e.target.value })} /></Fld>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Fld label="給与・報酬"><input style={S.input} placeholder="例：年収500~800万円"  value={form.salary}   onChange={e => setForm({ ...form, salary:   e.target.value })} /></Fld>
            <Fld label="勤務地">    <input style={S.input} placeholder="例：東京・リモート可" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></Fld>
          </div>
          <Fld label="応募要件">
            <textarea style={{ ...S.input, resize:"vertical" }} rows={3} placeholder="必須スキル・経験年数・資格など" value={form.requirements} onChange={e => setForm({ ...form, requirements:e.target.value })} />
          </Fld>
          <Fld label="仕事内容 *">
            <textarea style={{ ...S.input, resize:"vertical" }} rows={5} placeholder="業務内容・職場環境・福利厚生など" value={form.content} onChange={e => setForm({ ...form, content:e.target.value })} />
          </Fld>
          <Fld label="求人URL（任意）">
            <input style={S.input} type="url" placeholder="https://..." value={form.url} onChange={e => setForm({ ...form, url:e.target.value })} />
          </Fld>
          <button style={{ ...S.primaryBtn, width:"100%", padding:"11px" }} onClick={async () => {
            if (!form.title.trim() || !form.content.trim()) return;
            await onAddJob(form);
            setForm(null);
          }}>
            募集要項を追加する
          </button>
        </div>
      )}
      {jobs.length === 0 && <Empty text="まだ募集要項が登録されていません。知っている求人情報があれば追加してください。" />}
      {[...jobs].sort((a,b) => (b.postedDate || "").localeCompare(a.postedDate || "")).map(j => {
        const ended = j.closingDate && new Date(j.closingDate) < new Date();
        return (
          <div key={j.id} style={{ background:C.surface, border:"1px solid " + C.border, padding:"14px 16px", marginBottom:10 }}>
            {isAdmin && (
              <div style={{ display:"flex", gap:4, justifyContent:"flex-end", marginBottom:8 }}>
                <SmBtn onClick={() => setEditTgt({ type:"job", data:j })}>編集</SmBtn>
                <SmBtn red onClick={() => adminDelete("job", j.id)}>削除</SmBtn>
              </div>
            )}
            <div style={{ display:"flex", justifyContent:"space-between", flexWrap:"wrap", gap:8, marginBottom:10 }}>
              <div>
                <h3 style={{ fontSize:15, fontWeight:"bold", marginBottom:6, fontFamily:"serif" }}>{j.title}</h3>
                <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                  {[j.jobType, j.empType, j.location].filter(Boolean).map(t => (
                    <span key={t} style={{ fontSize:11, color:C.sub, border:"1px solid " + C.border, padding:"1px 8px" }}>{t}</span>
                  ))}
                  {j.salary && <span style={{ fontSize:11, color:"#1a5276", fontWeight:"bold", border:"1px solid #1a5276", padding:"1px 8px" }}>{j.salary}</span>}
                </div>
              </div>
              <div style={{ textAlign:"right", fontSize:11, color:C.sub }}>
                <div>掲載: {j.postedDate || "-"}</div>
                {j.closingDate && (
                  <div style={{ color: ended ? "#aaa" : C.accent, fontWeight:"bold" }}>
                    締切: {j.closingDate}{ended ? " （終了）" : ""}
                  </div>
                )}
              </div>
            </div>
            {j.requirements && (
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:11, fontWeight:"bold", color:C.sub, marginBottom:3 }}>応募要件</div>
                <p style={{ fontSize:13, lineHeight:1.8 }}>{j.requirements}</p>
              </div>
            )}
            <div>
              <div style={{ fontSize:11, fontWeight:"bold", color:C.sub, marginBottom:3 }}>仕事内容</div>
              <p style={{ fontSize:13, lineHeight:1.85, whiteSpace:"pre-wrap" }}>
                {expand === j.id ? j.content : (j.content && j.content.length > 120 ? j.content.slice(0,120) + "..." : j.content)}
              </p>
              {j.content && j.content.length > 120 && (
                <button style={{ background:"none", border:"none", color:C.sub, fontSize:12, cursor:"pointer", fontFamily:"inherit", display:"block", marginTop:4 }} onClick={() => setExpand(expand === j.id ? null : j.id)}>
                  {expand === j.id ? "▴ 閉じる" : "▾ 続きを読む"}
                </button>
              )}
            </div>
            {j.url && (
              <div style={{ marginTop:10, paddingTop:10, borderTop:"1px solid " + C.border }}>
                <a href={j.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:C.accent, textDecoration:"underline" }}>求人ページを見る →</a>
              </div>
            )}
            <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:10, paddingTop:10, borderTop:"1px solid " + C.border }}>
              <AC>{ini(j.author)}</AC><span style={{ fontSize:12, color:C.sub }}>{j.author} · {ago(j.createdAt)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ランキング ───────────────────────────────────────────────────────────────
function RankingPage({ go, companies, coPosts, coRevs, coSals, isMobile }) {
  const [tab, setTab] = useState("rating");
  const ranked = companies.map(co => {
    const a   = calcAvg(coRevs(co.id));
    const sal = calcAvgSal(coSals(co.id));
    return { ...co, rating:a?.overall || 0, salary:sal || 0, activity: coPosts(co.id).length + coRevs(co.id).length, avgObj:a };
  });
  const sorted = tab === "rating"  ? [...ranked].sort((a,b) => b.rating   - a.rating)
    : tab === "salary"  ? [...ranked].filter(c => c.salary > 0).sort((a,b) => b.salary   - a.salary)
    : [...ranked].sort((a,b) => b.activity - a.activity);

  return (
    <div>
      <PageHeader title="企業ランキング" desc="評価・年収・活発さで企業を比較" />
      <div style={{ display:"flex", borderBottom:"2px solid " + C.ink, marginTop:0, marginBottom:20 }}>
        {[["rating","総合評価順"],["salary","平均年収順"],["activity","投稿数順"]].map(([k,l]) => (
          <button key={k} style={{ background:"none", border:"none", padding:"9px 14px", fontSize:12, fontFamily:"inherit", cursor:"pointer", color: tab===k ? C.accent : C.sub, borderBottom:"3px solid " + (tab===k ? C.accent : "transparent"), marginBottom:-2, fontWeight: tab===k ? "bold" : "500" }} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <table style={{ width:"100%", borderCollapse:"collapse" }}>
        <thead>
          <tr>
            <th style={{ ...S.th, width:28 }}>順位</th>
            <th style={S.th}>企業名</th>
            {!isMobile && <th style={S.th}>業界</th>}
            <th style={{ ...S.th, textAlign:"center" }}>評価</th>
            <th style={{ ...S.th, textAlign:"right" }}>年収</th>
            {!isMobile && <th style={{ ...S.th, textAlign:"center" }}>投稿数</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((co, i) => (
            <tr key={co.id} style={{ ...S.tableRow, cursor:"pointer" }} onClick={() => go("company", co)}>
              <td style={S.td}><span style={{ fontSize:15, fontWeight:"bold", color: i < 3 ? C.accent : "#bbb", fontFamily:"serif" }}>{i + 1}</span></td>
              <td style={S.td}><span style={{ fontSize:16, marginRight:8 }}>{co.emoji}</span><span style={{ fontWeight:"bold", fontSize:13 }}>{co.name}</span></td>
              {!isMobile && <td style={{ ...S.td, fontSize:12, color:C.sub }}>{co.industry}</td>}
              <td style={{ ...S.td, textAlign:"center" }}>
                {co.avgObj
                  ? <span><Stars r={co.avgObj.overall} size={11} /><span style={{ fontSize:12, fontWeight:"bold", color:C.accent, marginLeft:4 }}>{co.avgObj.overall.toFixed(1)}</span></span>
                  : <span style={{ color:C.sub, fontSize:12 }}>-</span>
                }
              </td>
              <td style={{ ...S.td, textAlign:"right", fontSize:13, fontWeight:"bold", color:"#1a5276" }}>{co.salary ? (co.salary + "万円") : "-"}</td>
              {!isMobile && <td style={{ ...S.td, textAlign:"center", fontSize:12 }}>{co.activity}件</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 料金ページ ───────────────────────────────────────────────────────────────
function PricingPage({ sess, go, setAuthMode, plan, upgradePlan, isMobile }) {
  const [billing, setBilling] = useState("monthly");
  const targetDate = useRef(new Date("2026-06-30T23:59:59").getTime());
  const [rem, setRem] = useState(0);
  useEffect(() => {
    const tick = () => setRem(Math.max(0, targetDate.current - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const sec = Math.floor(rem / 1000);
  const pad = n => String(n).padStart(2, "0");
  const countdown = [[Math.floor(sec / 86400),"日"],[Math.floor((sec % 86400) / 3600),"時間"],[Math.floor((sec % 3600) / 60),"分"],[sec % 60,"秒"]];

  const plans = [
    { id:"free",     name:"無料プラン",  price:0,    color:"#555",    desc:"まず閲覧・投稿を試したい方へ",       features:["企業情報・体験談の閲覧","登録不要で投稿・コメント可能","掲示板・募集要項の閲覧"], limits:["口コミ・年収全文は閲覧不可"] },
    { id:"standard", name:"スタンダード", price:980,  color:"#1a5276", desc:"転職活動中の方に最適",               features:["口コミ・年収情報の全文閲覧","すべての機能を制限なしで利用"],             limits:["CSV出力不可"], popular:true },
    { id:"premium",  name:"プレミアム",  price:2980, color:"#7B0000", desc:"本気で転職を成功させたい方へ",       features:["スタンダードの全機能","データのCSV出力","優先サポート","新機能の先行利用"],  limits:[] },
  ];

  return (
    <div>
      <PageHeader title="料金プラン" desc="" />
      <div style={{ background:C.accent, color:"#fff", padding:"14px 20px", marginBottom:24, textAlign:"center" }}>
        <div style={{ fontSize:11, letterSpacing:"0.12em", fontWeight:"bold", marginBottom:6 }}>期間限定キャンペーン実施中 - 残り時間</div>
        <div style={{ display:"flex", gap:4, alignItems:"center", justifyContent:"center", marginBottom:6 }}>
          {countdown.map(([n,l], i) => (
            <span key={l} style={{ display:"inline-flex", flexDirection:"column", alignItems:"center" }}>
              <span style={{ background:"rgba(255,255,255,0.2)", fontWeight:"bold", fontFamily:"serif", fontSize:20, minWidth:34, textAlign:"center", padding:"3px 0", display:"block" }}>{pad(n)}</span>
              <span style={{ fontSize:9, marginTop:2 }}>{l}</span>
            </span>
          ))}
        </div>
        <div style={{ fontSize:12 }}>スタンダード・プレミアムが初月50%オフ - 正式リリース後は通常価格に戻ります</div>
      </div>
      <div style={{ border:"2px solid " + C.accent, padding:"14px 18px", marginBottom:20 }}>
        <div style={{ fontWeight:"bold", fontSize:14, marginBottom:4 }}>現在、すべての有料機能を<span style={{ color:C.accent }}>無料</span>でご利用いただけます</div>
        <p style={{ fontSize:12, color:C.sub, lineHeight:1.8 }}>ベータテスト期間中につき全機能を無料開放中です。早期登録者には正式リリース後も現行価格での継続利用を保証します。</p>
      </div>
      <div style={{ display:"flex", gap:0, marginBottom:20, border:"1px solid " + C.border, width:"fit-content" }}>
        {[["monthly","月払い"],["annual","年払い（2ヶ月分無料）"]].map(([k,l]) => (
          <button key={k} style={{ border:"none", padding:"8px 18px", fontSize:12, cursor:"pointer", fontFamily:"inherit", background: billing===k ? C.ink : "#F7F7F7", color: billing===k ? "#fff" : C.sub }} onClick={() => setBilling(k)}>{l}</button>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)", gap: isMobile ? 12 : 0, maxWidth:900 }}>
        {plans.map((pl, i) => {
          const base     = billing === "annual" ? Math.floor(pl.price * 10 / 12) : pl.price;
          const disp     = pl.price === 0 ? 0 : Math.floor(base * 0.5);
          const isCurrent = plan === pl.id;
          return (
            <div key={pl.id} style={{ background:C.surface, position:"relative", ...(pl.popular ? { boxShadow:"0 0 0 2px #9B0000" } : {}), ...(isMobile ? {} : { borderRight: i < 2 ? "1px solid " + C.border : "none" }) }}>
              {pl.popular && <div style={{ position:"absolute", top:-11, left:"50%", transform:"translateX(-50%)", background:C.accent, color:"#fff", fontSize:10, padding:"2px 12px", fontWeight:"bold", whiteSpace:"nowrap" }}>人気No.1</div>}
              <div style={{ borderTop:"3px solid " + pl.color, padding:"18px 20px 14px" }}>
                <div style={{ fontSize:10, fontWeight:"bold", color:pl.color, letterSpacing:"0.1em", marginBottom:5 }}>{pl.name.toUpperCase()}</div>
                {pl.price === 0
                  ? <div style={{ fontSize:24, fontWeight:"bold", fontFamily:"serif", marginBottom:4 }}>無料</div>
                  : (
                    <div style={{ marginBottom:4 }}>
                      <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                        <span style={{ fontSize:24, fontWeight:"bold", fontFamily:"serif", color:C.accent }}>{"¥" + disp.toLocaleString()}</span>
                        <span style={{ fontSize:12, color:C.sub }}>/月</span>
                        <span style={{ fontSize:12, color:"#bbb", textDecoration:"line-through" }}>{"¥" + base.toLocaleString()}</span>
                      </div>
                      <div style={{ fontSize:10, color:C.accent, fontWeight:"bold", marginTop:2 }}>初月50%OFFキャンペーン中</div>
                    </div>
                  )
                }
                <p style={{ fontSize:11, color:C.sub, marginBottom:12, lineHeight:1.6 }}>{pl.desc}</p>
                {isCurrent
                  ? <div style={{ border:"1px solid " + C.border, textAlign:"center", padding:"8px", fontSize:12, color:C.sub }}>現在のプラン</div>
                  : sess ? (
                    <div>
                      <button style={{ ...S.primaryBtn, width:"100%", padding:"9px", fontSize:12, background:pl.color, border:"none" }} onClick={() => upgradePlan(pl.id)}>
                        このプランに変更する（β無料）
                      </button>
                      <p style={{ fontSize:10, color:C.sub, textAlign:"center", marginTop:4 }}>
                        ベータ期間中は無料。Stripe課金は正式リリース時に有効化されます。
                      </p>
                    </div>
                  ) : (
                    <button style={{ ...S.primaryBtn, width:"100%", padding:"9px", fontSize:12, background:pl.color, border:"none" }} onClick={() => setAuthMode("register")}>
                      無料登録して始める →
                    </button>
                  )
                }
                {pl.id !== "free" && !isCurrent && <p style={{ fontSize:10, color:C.sub, textAlign:"center", marginTop:5 }}>クレジットカード不要・いつでも解約可</p>}
              </div>
              <div style={{ borderTop:"1px solid " + C.border, padding:"12px 20px" }}>
                {pl.features.map(f => <div key={f} style={{ display:"flex", gap:6, marginBottom:5, fontSize:12 }}><span style={{ color:"#16A34A", flexShrink:0, fontWeight:"bold" }}>✓</span><span>{f}</span></div>)}
                {pl.limits.map(f  => <div key={f} style={{ display:"flex", gap:6, marginBottom:5, fontSize:12, color:"#aaa"    }}><span style={{ flexShrink:0 }}>-</span><span>{f}</span></div>)}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ background:"#FFF8F0", border:"1px solid #E8C97A", borderLeft:"4px solid " + C.accent, padding:"12px 16px", marginTop:20 }}>
        <p style={{ fontSize:12, color:C.sub, lineHeight:1.8 }}>
          ※ ベータ期間中は全プランが無料です。正式リリース時にStripeによる課金を有効化します。<br />
          ※ Stripe連携は Firebase Extensions で1クリックで追加可能です（App.jsxのコメントに手順あり）。<br />
          ※ 早期登録ユーザーには現行価格での継続利用を保証します。
        </p>
      </div>
    </div>
  );
}

// ─── 企業追加 ─────────────────────────────────────────────────────────────────
function AddCompanyPage({ go, onSubmit, uName }) {
  const [f,   setF]   = useState({ name:"", group:"", industry:"", emoji:"🏢" });
  const [err, setErr] = useState("");
  const subs = f.group ? (INDUSTRY_GROUPS[f.group] || []) : [];

  return (
    <div style={{ maxWidth:620, margin:"0 auto" }}>
      <PageHeader title="企業を追加する" desc="まだ掲載されていない企業を追加できます。無料会員登録が必要です。" />
      <div style={{ background:C.surface, border:"1px solid " + C.border, borderTop:"3px solid " + C.accent, padding:"18px 20px" }}>
        {err && <div style={S.errBox}>{err}</div>}
        <Fld label="アイコン">
          <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
            {EMOJIS.map(e => (
              <button key={e} style={{ border:"2px solid " + (f.emoji === e ? C.accent : "#eee"), background: f.emoji === e ? "#FFF8F0" : "#F7F7F7", width:33, height:33, fontSize:16, cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center" }} onClick={() => setF({ ...f, emoji:e })}>{e}</button>
            ))}
          </div>
        </Fld>
        <Fld label="企業名 *">
          <input style={S.input} placeholder="例：株式会社○○" value={f.name} onChange={e => setF({ ...f, name:e.target.value })} />
        </Fld>
        <Fld label="業界（大分類）*">
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {ALL_GROUPS.map(g => (
              <button key={g} style={{ border:"1px solid " + C.border, background: f.group === g ? C.ink : "#F7F7F7", color: f.group === g ? "#fff" : C.sub, padding:"5px 12px", fontSize:12, cursor:"pointer", fontFamily:"inherit" }} onClick={() => setF({ ...f, group:g, industry:"" })}>
                {g}
              </button>
            ))}
          </div>
        </Fld>
        {subs.length > 0 && (
          <Fld label="業界（小分類）">
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {subs.map(s => (
                <button key={s} style={{ border:"1px solid " + C.border, background: f.industry === s ? C.accent : "#F7F7F7", color: f.industry === s ? "#fff" : C.sub, padding:"4px 10px", fontSize:11, cursor:"pointer", fontFamily:"inherit" }} onClick={() => setF({ ...f, industry:s })}>
                  {s}
                </button>
              ))}
            </div>
          </Fld>
        )}
        {!authUser
          ? <div style={{ padding:"12px 14px", background:"#FFF8F0", border:"1px solid #E8C97A", marginBottom:12, fontSize:13 }}>
              企業を追加するには <button style={S.textLink} onClick={() => {}}>ログイン</button> が必要です（無料）
            </div>
          : <div style={{ padding:"10px 0", borderTop:"1px solid " + C.border, fontSize:12, color:C.sub }}>{uName} として追加されます</div>
        }
        <button style={{ ...S.primaryBtn, width:"100%", padding:"12px" }} onClick={async () => {
          if (!f.name.trim() || !f.group) { setErr("企業名と業界は必須です"); return; }
          await onSubmit({ ...f, industry: f.industry || f.group });
        }}>
          企業を追加する
        </button>
      </div>
    </div>
  );
}

// ─── マイページ ───────────────────────────────────────────────────────────────
function MyPage({ sess, go, companies, plan, upgradePlan, isMobile, diary, saveDiary, myPosts, myRevs, favPosts, favorites }) {
  const [mTab, setMTab] = useState("activity");
  const pl = PLANS[plan];

  if (!sess) {
    return (
      <div style={{ textAlign:"center", padding:"48px 20px" }}>
        <p style={{ marginBottom:14, color:C.sub }}>マイページはログインが必要です</p>
        <button style={S.primaryBtn} onClick={() => go("home")}>トップに戻る</button>
      </div>
    );
  }

  const exportCSV = () => {
    const rows = [["日付","企業","タイトル","段階"], ...myPosts.map(p => [
      p.createdAt?.toDate?.()?.toISOString().slice(0,10) || "",
      (companies.find(c => c.id === p.companyId) || {}).name || "",
      p.title, p.stage,
    ])];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = "data:text/csv;charset=utf-8,\uFEFF" + encodeURIComponent(csv);
    a.download = "tenkatsu.csv";
    a.click();
  };

  return (
    <div>
      <PageHeader title="マイページ" desc="投稿履歴・就活日記・プラン情報" />
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "240px 1fr", gap:20, alignItems:"start" }}>
        <div style={{ border:"1px solid " + C.border, borderTop:"3px solid " + pl.color }}>
          <div style={{ padding:"16px 14px", borderBottom:"1px solid " + C.border }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
              <span style={{ background:pl.color, color:"#fff", width:34, height:34, borderRadius:"50%", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:"bold" }}>{ini(sess.displayName)}</span>
              <div>
                <div style={{ fontWeight:"bold", fontSize:14 }}>{sess.displayName}</div>
                <div style={{ fontSize:11, color:C.sub }}>{sess.email || ""}</div>
              </div>
            </div>
            <span style={{ background:pl.color, color:"#fff", fontSize:11, padding:"2px 10px", fontWeight:"bold" }}>{pl.name}</span>
            {plan !== "premium" && <button style={{ ...S.textLink, fontSize:11, marginLeft:8 }} onClick={() => go("pricing")}>変更 →</button>}
          </div>
          <div style={{ padding:"12px 14px" }}>
            {[["体験談", myPosts.length + "件"],["口コミ", myRevs.length + "件"],["お気に入り", (favorites||[]).length + "件"],["日記", diary.length + "件"]].map(([l,v]) => (
              <div key={l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid " + C.border, fontSize:12 }}>
                <span style={{ color:C.sub }}>{l}</span><span style={{ fontWeight:"bold" }}>{v}</span>
              </div>
            ))}
          </div>
          {plan === "premium" && (
            <div style={{ padding:"10px 14px", borderTop:"1px solid " + C.border }}>
              <button style={{ ...S.secondaryBtn, width:"100%", fontSize:12 }} onClick={exportCSV}>CSV出力</button>
            </div>
          )}
        </div>
        <div>
          <div style={{ display:"flex", borderBottom:"2px solid " + C.ink, marginBottom:14 }}>
            {[["activity","投稿履歴"],["favorites","お気に入り"],["diary","就活日記"]].map(([k,l]) => (
              <button key={k} style={{ background:"none", border:"none", padding:"9px 14px", fontSize:12, fontFamily:"inherit", cursor:"pointer", color: mTab===k ? C.accent : C.sub, borderBottom:"3px solid " + (mTab===k ? C.accent : "transparent"), marginBottom:-2, fontWeight: mTab===k ? "bold" : "500" }} onClick={() => setMTab(k)}>{l}</button>
            ))}
          </div>
          {mTab === "diary" && <DiarySection entries={diary} onSave={saveDiary} />}
          {mTab === "favorites" && (
            <div>
              <STitle label={"お気に入りした投稿（" + (favPosts||[]).length + "件）"} />
              {(favPosts||[]).length === 0
                ? <Empty text="まだお気に入りがありません。投稿の☆ボタンで追加できます。" />
                : (favPosts||[]).map(p => (
                    <div key={p.id} style={{ ...S.cardItem, cursor:"pointer" }} onClick={() => go("company", companies.find(c => c.id === p.companyId))}>
                      <div style={{ display:"flex", gap:8, marginBottom:6, alignItems:"center" }}>
                        <StageBadge s={p.stage} />
                        {p.jobCategory && p.jobCategory !== "全職種" && <span style={{ fontSize:10, background:"#EFF6FF", color:"#1E40AF", border:"1px solid #BFDBFE", padding:"1px 7px", fontWeight:"bold" }}>{p.jobCategory}</span>}
                        <span style={{ fontSize:10, color:C.sub, marginLeft:"auto" }}>{ago(p.createdAt)}</span>
                      </div>
                      <div style={{ fontWeight:"bold", fontSize:13, marginBottom:3 }}>{p.title}</div>
                      <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>{(companies.find(c => c.id === p.companyId) || {}).name}</div>
                      <div style={{ fontSize:12, color:C.sub, lineHeight:1.7 }}>{p.content && p.content.slice(0, 80)}{p.content && p.content.length > 80 ? "..." : ""}</div>
                    </div>
                  ))
              }
            </div>
          )}
          {mTab === "activity" && (
            <div>
              <STitle label="投稿した体験談" />
              {myPosts.length === 0
                ? <Empty text="まだ投稿がありません" />
                : myPosts.map(p => (
                    <div key={p.id} style={{ ...S.cardItem, cursor:"pointer" }} onClick={() => go("company", companies.find(c => c.id === p.companyId))}>
                      <div style={{ display:"flex", gap:8, marginBottom:6, alignItems:"center" }}><StageBadge s={p.stage} /><span style={{ fontSize:11, color:C.sub, marginLeft:"auto" }}>{ago(p.createdAt)}</span></div>
                      <div style={{ fontWeight:"bold", fontSize:13, marginBottom:3 }}>{p.title}</div>
                      <div style={{ fontSize:11, color:C.sub }}>{(companies.find(c => c.id === p.companyId) || {}).name}</div>
                    </div>
                  ))
              }
              <div style={{ marginTop:16 }} />
              <STitle label="投稿した口コミ" />
              {myRevs.length === 0
                ? <Empty text="まだ口コミがありません" />
                : myRevs.map(r => (
                    <div key={r.id} style={{ ...S.cardItem, cursor:"pointer" }} onClick={() => go("company", companies.find(c => c.id === r.companyId), "review")}>
                      <div style={{ display:"flex", gap:8, marginBottom:6, alignItems:"center" }}><Stars r={r.overall} size={12} /><span style={{ fontWeight:"bold", color:C.accent, fontSize:12 }}>{r.overall.toFixed(1)}</span><span style={{ fontSize:11, color:C.sub, marginLeft:"auto" }}>{ago(r.createdAt)}</span></div>
                      <div style={{ fontSize:11, color:C.sub }}>{(companies.find(c => c.id === r.companyId) || {}).name} · {r.empType} · {r.tenure}</div>
                    </div>
                  ))
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 就活日記 ─────────────────────────────────────────────────────────────────
function DiarySection({ entries, onSave }) {
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title:"", content:"", mood:"😊", date:today() });
  const moods = ["😊","😐","😔","💪","🤔"];
  const save = () => {
    if (!f.title.trim() || !f.content.trim()) return;
    onSave([{ ...f, id: Math.random().toString(36).slice(2,10) }, ...entries]);
    setAdding(false);
    setF({ title:"", content:"", mood:"😊", date:today() });
  };
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12, paddingBottom:10, borderBottom:"1px solid " + C.border }}>
        <span style={{ fontSize:12, color:C.sub }}>{entries.length}件の日記</span>
        <button style={S.primaryBtn} onClick={() => setAdding(a => !a)}>{adding ? "キャンセル" : "＋ 日記を書く"}</button>
      </div>
      {adding && (
        <div style={{ background:C.surface, border:"1px solid " + C.border, borderTop:"3px solid " + C.accent, padding:"18px 20px", marginBottom:14 }}>
          <Fld label="日付"><input style={S.input} type="date" value={f.date} onChange={e => setF({ ...f, date:e.target.value })} /></Fld>
          <Fld label="気分">
            <div style={{ display:"flex", gap:8 }}>
              {moods.map(m => (
                <button key={m} style={{ fontSize:22, background:"none", border:"2px solid " + (f.mood === m ? C.accent : "#ddd"), borderRadius:5, padding:"3px 7px", cursor:"pointer" }} onClick={() => setF({ ...f, mood:m })}>{m}</button>
              ))}
            </div>
          </Fld>
          <Fld label="タイトル"><input style={S.input} placeholder="今日の就活メモ" value={f.title} onChange={e => setF({ ...f, title:e.target.value })} /></Fld>
          <Fld label="内容"><textarea style={{ ...S.input, resize:"vertical" }} rows={5} value={f.content} onChange={e => setF({ ...f, content:e.target.value })} /></Fld>
          <button style={{ ...S.primaryBtn, width:"100%", padding:"10px" }} onClick={save}>保存する</button>
        </div>
      )}
      {entries.length === 0 && !adding && <Empty text="まだ日記がありません。転職活動の記録を残しましょう。" />}
      {entries.map(e => (
        <div key={e.id} style={{ ...S.cardItem, cursor:"default" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
            <span style={{ fontSize:20 }}>{e.mood}</span>
            <span style={{ fontWeight:"bold", fontSize:14, fontFamily:"serif", flex:1 }}>{e.title}</span>
            <span style={{ fontSize:11, color:C.sub }}>{e.date}</span>
            <button style={{ background:"none", border:"1px solid #FAA", padding:"3px 8px", fontSize:11, cursor:"pointer", fontFamily:"inherit", color:"#C00", marginLeft:4 }} onClick={() => onSave(entries.filter(x => x.id !== e.id))}>削除</button>
          </div>
          <p style={{ fontSize:13, lineHeight:1.85, borderTop:"1px solid " + C.border, paddingTop:8 }}>{e.content}</p>
        </div>
      ))}
    </div>
  );
}

// ─── 管理パネル ───────────────────────────────────────────────────────────────
function AdminPage({ companies, posts, reviews, salaries, jobListings, adminDelete, setEditTgt, isMobile }) {
  const [tab, setTab] = useState("posts");
  const allCmts = posts.flatMap(p => (p.comments || []).map(c => ({ ...c, postId:p.id, postTitle:p.title })));
  const tabs = [
    ["posts",     "投稿(" + posts.length + ")"],
    ["reviews",   "口コミ(" + reviews.length + ")"],
    ["salaries",  "年収(" + salaries.length + ")"],
    ["jobs",      "募集要項(" + jobListings.length + ")"],
    ["companies", "企業(" + companies.length + ")"],
    ["comments",  "コメント(" + allCmts.length + ")"],
  ];
  const rowsByTab = {
    posts:     posts.map(p =>      ({ id:p.id,         primary:p.title,                secondary:(companies.find(c => c.id === p.companyId) || {}).name + " · " + p.author + " · " + ago(p.createdAt),           onEdit:() => setEditTgt({ type:"post",    data:p }),  onDel:() => adminDelete("post",    p.id) })),
    reviews:   reviews.map(r =>    ({ id:r.id,         primary:"★" + r.overall.toFixed(1) + " " + ((companies.find(c => c.id === r.companyId) || {}).name || ""), secondary:r.author + " · " + ago(r.createdAt), onEdit:() => setEditTgt({ type:"review",  data:r }),  onDel:() => adminDelete("review",  r.id) })),
    salaries:  salaries.map(s =>   ({ id:s.id,         primary:((companies.find(c => c.id === s.companyId) || {}).name || "") + " " + s.annualSalary + "万円 " + s.jobType, secondary:s.author + " · " + ago(s.createdAt),                                             onEdit:() => setEditTgt({ type:"salary",  data:s }),  onDel:() => adminDelete("salary",  s.id) })),
    jobs:      jobListings.map(j=> ({ id:j.id,         primary:j.title,                secondary:((companies.find(c => c.id === j.companyId) || {}).name || "") + " · " + (j.postedDate || "") + " · " + j.author, onEdit:() => setEditTgt({ type:"job",     data:j }),  onDel:() => adminDelete("job",     j.id) })),
    companies: companies.map(c =>  ({ id:c.id,         primary:c.emoji + " " + c.name, secondary:c.industry + " · " + (c.author || ""),                                                                            onEdit:() => setEditTgt({ type:"company", data:c }),  onDel:() => adminDelete("company", c.id) })),
    comments:  allCmts.map(cm =>   ({ id:cm.postId+":"+cm.id, primary:cm.content,      secondary:cm.author + " → 「" + cm.postTitle + "」",                                                                        onDel:() => adminDelete("comment", cm.postId + ":" + cm.id) })),
  };
  const rows = rowsByTab[tab] || [];

  return (
    <div>
      <PageHeader title="管理パネル" desc="全コンテンツの管理" />
      {isMobile
        ? <select style={{ ...S.input, marginBottom:16 }} value={tab} onChange={e => setTab(e.target.value)}>{tabs.map(([k,l]) => <option key={k} value={k}>{l}</option>)}</select>
        : <div style={{ display:"flex", borderBottom:"2px solid " + C.ink, marginBottom:16, flexWrap:"wrap" }}>{tabs.map(([k,l]) => <button key={k} style={{ background:"none", border:"none", padding:"9px 14px", fontSize:12, fontFamily:"inherit", cursor:"pointer", color: tab===k ? C.accent : C.sub, borderBottom:"3px solid " + (tab===k ? C.accent : "transparent"), marginBottom:-2, fontWeight: tab===k ? "bold" : "500", whiteSpace:"nowrap" }} onClick={() => setTab(k)}>{l}</button>)}</div>
      }
      {rows.length === 0
        ? <Empty text="データがありません" />
        : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={S.tableRow}>
                  <td style={{ ...S.td, width:"100%" }}>
                    <div style={{ fontSize:13, fontWeight:"bold", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:460 }}>{r.primary}</div>
                    <div style={{ fontSize:11, color:C.sub, marginTop:2 }}>{r.secondary}</div>
                  </td>
                  <td style={{ ...S.td, whiteSpace:"nowrap" }}>
                    {r.onEdit && <SmBtn onClick={r.onEdit}>編集</SmBtn>}
                    <SmBtn red onClick={r.onDel}>削除</SmBtn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    </div>
  );
}

// ─── アクセス解析 ─────────────────────────────────────────────────────────────
function AnalyticsPage({ companies, posts, reviews, salaries, isMobile }) {
  const grouped   = Object.fromEntries(ALL_GROUPS.map(g => [g, companies.filter(c => (c.group || getGroup(c.industry)) === g).length]));
  const topActive = [...companies].map(co => ({ ...co, score: posts.filter(p => p.companyId === co.id).length + reviews.filter(r => r.companyId === co.id).length })).sort((a,b) => b.score - a.score).slice(0, 8);
  const weekAgo   = Date.now() - 7 * 86400000;
  const weekPosts = posts.filter(p => (p.createdAt?.toDate?.()?.getTime() || 0) > weekAgo).length;

  return (
    <div>
      <PageHeader title="アクセス解析" desc="コンテンツ統計" />
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(5,1fr)", gap:0, border:"1px solid " + C.border, marginBottom:20 }}>
        {[["投稿数",posts.length],["口コミ数",reviews.length],["年収情報",salaries.length],["掲載企業",companies.length],["今週の投稿",weekPosts]].map(([l,v],i) => (
          <div key={l} style={{ padding:"12px 14px", background:C.surface, textAlign:"center", ...(i > 0 ? { borderLeft:"1px solid " + C.border } : {}) }}>
            <div style={{ fontSize:11, color:C.sub, marginBottom:5 }}>{l}</div>
            <div style={{ fontSize:22, fontWeight:"bold", color:C.accent, fontFamily:"serif" }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:14 }}>
        <div style={{ background:C.surface, border:"1px solid " + C.border, padding:"14px 16px" }}>
          <h3 style={{ fontSize:13, fontWeight:"bold", marginBottom:12, paddingBottom:8, borderBottom:"1px solid " + C.border }}>業界別企業数</h3>
          {Object.entries(grouped).filter(([,v]) => v > 0).map(([g,v]) => (
            <div key={g} style={{ display:"flex", alignItems:"center", gap:10, padding:"5px 0", borderBottom:"1px solid " + C.border }}>
              <span style={{ flex:1, fontSize:12 }}>{g}</span>
              <div style={{ width:80, height:5, background:"#eee" }}>
                <div style={{ width: (companies.length ? (v / companies.length) * 100 : 0) + "%", height:"100%", background:C.accent }} />
              </div>
              <span style={{ fontSize:12, fontWeight:"bold", minWidth:28, textAlign:"right" }}>{v}社</span>
            </div>
          ))}
        </div>
        <div style={{ background:C.surface, border:"1px solid " + C.border, padding:"14px 16px" }}>
          <h3 style={{ fontSize:13, fontWeight:"bold", marginBottom:12, paddingBottom:8, borderBottom:"1px solid " + C.border }}>投稿数ランキング</h3>
          {topActive.map((co, i) => (
            <div key={co.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:"1px solid " + C.border }}>
              <span style={{ fontSize:12, fontWeight:"bold", color: i < 3 ? C.accent : "#bbb", width:20 }}>{i + 1}</span>
              <span style={{ fontSize:13, flex:1 }}>{co.emoji} {co.name}</span>
              <span style={{ fontSize:13, fontWeight:"bold", color:C.accent }}>{co.score}件</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 共通 UI ─────────────────────────────────────────────────────────────────
function Stars({ r, size = 13 }) {
  return (
    <span style={{ display:"inline-flex", gap:1 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ fontSize:size, color: i <= Math.round(r) ? C.accent : "#DDD" }}>★</span>
      ))}
    </span>
  );
}
function StarPicker({ value, onChange, label }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, paddingBottom:8, borderBottom:"1px solid " + C.border }}>
      <span style={{ fontSize:12, color:C.sub, width:134, flexShrink:0 }}>{label}</span>
      {[1,2,3,4,5].map(n => (
        <button key={n} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color: n <= value ? C.accent : "#DDD", padding:0 }} onClick={() => onChange(n)}>★</button>
      ))}
      <span style={{ fontSize:12, color:C.sub, marginLeft:4 }}>{value}.0</span>
    </div>
  );
}
function StageBadge({ s }) {
  const c = STAGE_COLORS[s] || { bg:"#F9FAFB", tx:"#525252", br:"#CCC" };
  return (
    <span style={{ fontSize:11, fontWeight:"bold", padding:"2px 9px", border:"1px solid " + c.br, background:c.bg, color:c.tx }}>{s}</span>
  );
}
function PostCard({ post, co, go, isAdmin, onDelete, onEdit }) {
  return (
    <article style={{ ...S.cardItem, cursor:"pointer" }} onClick={() => go("company", co)}>
      {isAdmin && (
        <div style={{ display:"flex", gap:4, justifyContent:"flex-end", marginBottom:6 }} onClick={e => e.stopPropagation()}>
          <SmBtn onClick={() => onEdit(post)}>編集</SmBtn>
          <SmBtn red onClick={() => onDelete("post", post.id)}>削除</SmBtn>
        </div>
      )}
      <div style={{ display:"flex", gap:8, marginBottom:8, alignItems:"center", flexWrap:"wrap" }}>
        <span style={{ fontSize:11, color:C.sub }}>{co && co.emoji} {co && co.name}</span>
        <StageBadge s={post.stage} />
        <span style={{ fontSize:10, color:C.sub, marginLeft:"auto" }}>{ago(post.createdAt)}</span>
      </div>
      <h3 style={{ fontSize:14, fontWeight:"bold", marginBottom:6, lineHeight:1.5, fontFamily:"serif" }}>{post.title}</h3>
      <p style={{ fontSize:12, color:C.sub, lineHeight:1.8, marginBottom:8 }}>{post.content && post.content.slice(0, 90)}{post.content && post.content.length > 90 ? "..." : ""}</p>
      <div style={{ display:"flex", alignItems:"center", gap:8, borderTop:"1px solid " + C.border, paddingTop:8 }}>
        <AC>{ini(post.author)}</AC>
        <span style={{ fontSize:11, color:C.sub }}>{post.author}</span>
        <span style={{ marginLeft:"auto", fontSize:11, color:C.sub }}>♡ {(post.likes || []).length}</span>
      </div>
    </article>
  );
}
function STitle({ label }) {
  return (
    <div style={{ borderTop:"3px solid " + C.ink, paddingTop:10, marginBottom:14 }}>
      {label && <h2 style={{ fontSize:14, fontWeight:"bold", letterSpacing:"0.04em" }}>{label}</h2>}
    </div>
  );
}
function PageHeader({ title, desc }) {
  return (
    <div style={{ borderTop:"3px solid " + C.ink, paddingTop:14, marginBottom:20 }}>
      <h1 style={{ fontSize:"clamp(18px,3vw,26px)", fontWeight:"bold", fontFamily:"serif" }}>{title}</h1>
      {desc && <p style={{ color:C.sub, marginTop:6, fontSize:12 }}>{desc}</p>}
    </div>
  );
}
function Fld({ label, children }) {
  return (
    <div style={{ marginBottom:13 }}>
      <label style={{ display:"block", fontSize:10, fontWeight:"bold", color:C.sub, letterSpacing:"0.08em", marginBottom:4 }}>{label}</label>
      {children}
    </div>
  );
}
function Empty({ text }) {
  return (
    <div style={{ textAlign:"center", color:C.sub, padding:"28px 0", fontSize:13, borderTop:"1px solid " + C.border, borderBottom:"1px solid " + C.border }}>{text}</div>
  );
}
function AccessDenied({ go }) {
  return (
    <div style={{ textAlign:"center", padding:"72px 20px" }}>
      <div style={{ fontSize:44, marginBottom:14 }}>🔒</div>
      <h2 style={{ fontSize:18, fontWeight:"bold", fontFamily:"serif", marginBottom:10 }}>アクセス権限がありません</h2>
      <p style={{ fontSize:13, color:C.sub, marginBottom:20, lineHeight:1.8 }}>このページは管理者のみが閲覧できます。</p>
      <button style={S.primaryBtn} onClick={() => go("home")}>トップに戻る</button>
    </div>
  );
}
function SmBtn({ onClick, red, children }) {
  return (
    <button style={{ background:"none", border:"1px solid " + (red ? "#FAA" : C.border), padding:"3px 8px", fontSize:11, cursor:"pointer", fontFamily:"inherit", color: red ? "#C00" : C.sub, marginLeft:4 }} onClick={onClick}>{children}</button>
  );
}
function AC({ children }) {
  return (
    <span style={{ background:C.accent, color:"#fff", width:22, height:22, borderRadius:"50%", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:"bold", flexShrink:0 }}>{children}</span>
  );
}

// ─── スタイル ─────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;700&family=Noto+Sans+JP:wght@400;500;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  button { cursor: pointer; transition: opacity .15s; }
  button:hover { opacity: .75; }
  textarea, input, select { font-family: 'Noto Sans JP', sans-serif; }
  @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  .fadeUp { animation: fadeUp .18s ease; }
  tr:hover td { background: #FAFAF8; }
  a { color: inherit; }
`;

const S = {
  root:        { fontFamily:"'Noto Sans JP',sans-serif", background:C.bg, minHeight:"100vh", color:C.ink, fontSize:14 },
  nav:         { background:"#fff", position:"sticky", top:0, zIndex:200, borderBottom:"1px solid " + C.border, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" },
  logoBtn:     { background:"none", border:"none", textAlign:"left", cursor:"pointer" },
  logoText:    { display:"block", fontWeight:"bold", color:C.ink, fontFamily:"'Noto Serif JP',serif", letterSpacing:"0.06em" },
  toast:       { position:"fixed", bottom:20, left:"50%", transform:"translateX(-50%)", background:C.ink, color:"#fff", padding:"9px 20px", fontSize:12, zIndex:600, boxShadow:"0 2px 10px rgba(0,0,0,0.25)", whiteSpace:"nowrap" },
  overlay:     { position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:400, display:"flex", alignItems:"center", justifyContent:"center", padding:16 },
  modal:       { background:"#fff", padding:"24px 22px", width:"100%", maxWidth:420, maxHeight:"94vh", overflowY:"auto", borderTop:"4px solid " + C.accent },
  modalTitle:  { fontSize:17, fontWeight:"bold", fontFamily:"serif", marginBottom:12 },
  modalHr:     { height:1, background:C.border, marginBottom:14 },
  errBox:      { background:"#FFF5F5", border:"1px solid #F5AAAA", color:"#8B0000", padding:"8px 12px", fontSize:12, marginBottom:12 },
  main:        { maxWidth:1160, margin:"0 auto" },
  hero:        { borderBottom:"1px solid " + C.border, paddingBottom:24, marginBottom:24, marginTop:20, display:"flex", gap:24, alignItems:"flex-start" },
  th:          { fontSize:11, fontWeight:"bold", color:C.sub, padding:"6px 10px", borderBottom:"2px solid " + C.ink, textAlign:"left", letterSpacing:"0.04em", whiteSpace:"nowrap" },
  tableRow:    { borderBottom:"1px solid " + C.border },
  td:          { padding:"8px 10px", fontSize:13, verticalAlign:"middle" },
  cardItem:    { background:C.surface, padding:"12px 0", borderBottom:"1px solid " + C.border },
  input:       { width:"100%", padding:"8px 10px", border:"1px solid " + C.border, fontSize:13, background:"#fff", color:C.ink, outline:"none", fontFamily:"inherit" },
  primaryBtn:  { background:C.accent, color:"#fff", border:"none", padding:"8px 18px", fontSize:13, fontWeight:"bold", fontFamily:"inherit", cursor:"pointer" },
  secondaryBtn:{ background:"none", border:"1px solid " + C.border, color:C.ink, padding:"8px 18px", fontSize:13, fontFamily:"inherit", cursor:"pointer" },
  textLink:    { background:"none", border:"none", color:C.accent, fontWeight:"bold", fontFamily:"inherit", fontSize:12, cursor:"pointer", textDecoration:"underline" },
  chip:        { border:"1px solid " + C.border, background:"#F7F7F7", color:C.sub, padding:"5px 12px", fontSize:12, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" },
  chipOn:      { background:C.ink, color:"#fff", borderColor:C.ink },
  footer:      { borderTop:"2px solid " + C.ink, padding:"16px 20px", background:C.surface, marginTop:20 },
};
