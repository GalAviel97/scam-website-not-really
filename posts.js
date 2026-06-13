/*
 * Posts index — the single source of truth for the blog listing & search.
 * To add a post: create posts/<slug>.html, then add an entry here (newest first).
 */
var POSTS = [
  {
    title: "ברוכים הבאים לבלוג",
    url: "posts/welcome.html",
    date: "2026-06-13",
    excerpt: "למה פתחתי בלוג אישי, על מה אכתוב כאן, ואיך הבלוג הזה בנוי — הכל בקובץ HTML סטטי אחד.",
    tags: ["כללי", "מאחורי הקלעים"],
    readingTime: 3
  },
  {
    title: "לבנות אפליקציית iOS לבד — מה למדתי",
    url: "posts/building-an-ios-app.html",
    date: "2026-05-28",
    excerpt: "מרעיון ועד App Store: על SwiftUI, פרטיות, עיבוד מקומי של נתונים, ולמה פשטות מנצחת.",
    tags: ["פיתוח", "iOS", "מוצר"],
    readingTime: 6
  },
  {
    title: "SEO בסיסי לאתר סטטי",
    url: "posts/seo-basics.html",
    date: "2026-05-10",
    excerpt: "תגיות meta, Open Graph, נתונים מובנים (JSON-LD), sitemap ו-RSS — מה באמת חשוב ומה לא.",
    tags: ["SEO", "ווב", "פיתוח"],
    readingTime: 5
  }
];
