import { getPost, getAllPosts } from "@/lib/blog";
import MainNav from "@/components/MainNav";
import Link from "next/link";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
  return getAllPosts().map(p => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};
  return { title: `${post.title} — Lawrenn`, description: post.description };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <>
      <MainNav />
      <main style={{ minHeight: "100vh", background: "white", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "8rem 2rem 6rem" }}>

          {/* Back */}
          <Link href="/blog" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontFamily: "'DM Mono'", fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(17,17,17,0.4)", textDecoration: "none", marginBottom: "3rem" }}>
            ← All posts
          </Link>

          {/* Meta */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
            <span style={{ fontFamily: "'DM Mono'", fontSize: "0.72rem", color: "rgba(17,17,17,0.4)", letterSpacing: "0.06em" }}>{formatDate(post.date)}</span>
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(17,17,17,0.2)", display: "inline-block" }} />
            <span style={{ fontFamily: "'DM Mono'", fontSize: "0.72rem", color: "rgba(17,17,17,0.4)", letterSpacing: "0.06em" }}>{post.readTime}</span>
            <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(17,17,17,0.2)", display: "inline-block" }} />
            <span style={{ fontFamily: "'DM Mono'", fontSize: "0.72rem", color: "rgba(17,17,17,0.4)", letterSpacing: "0.06em" }}>{post.author}</span>
          </div>

          {/* Title */}
          <h1 style={{ fontSize: "clamp(1.75rem, 4vw, 2.5rem)", fontWeight: 700, color: "#111111", lineHeight: 1.2, letterSpacing: "-0.02em", marginBottom: "1rem" }}>{post.title}</h1>
          <p style={{ fontSize: "1.1rem", color: "rgba(17,17,17,0.5)", lineHeight: 1.7, marginBottom: "3rem", borderBottom: "1px solid rgba(0,0,0,0.08)", paddingBottom: "2rem" }}>{post.description}</p>

          {/* Content */}
          <div
            className="blog-content"
            dangerouslySetInnerHTML={{ __html: post.contentHtml }}
          />

          {/* Footer */}
          <div style={{ marginTop: "4rem", paddingTop: "2rem", borderTop: "1px solid rgba(0,0,0,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
            <Link href="/blog" style={{ fontFamily: "'DM Mono'", fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(17,17,17,0.4)", textDecoration: "none" }}>← All posts</Link>
            <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", padding: "0.65rem 1.25rem", background: "#111111", border: "none", borderRadius: 8, color: "white", fontFamily: "'DM Sans'", fontSize: "0.875rem", fontWeight: 600, textDecoration: "none" }}>Try Lawrenn →</Link>
          </div>

        </div>
      </main>

      <style>{`
        .blog-content { color: rgba(17,17,17,0.75); font-size: 1rem; line-height: 1.85; }
        .blog-content h2 { font-size: 1.35rem; font-weight: 700; color: #111111; margin: 2.5rem 0 1rem; letter-spacing: -0.01em; line-height: 1.3; }
        .blog-content h3 { font-size: 1.1rem; font-weight: 700; color: #111111; margin: 2rem 0 0.75rem; }
        .blog-content p { margin: 0 0 1.5rem; }
        .blog-content strong { color: #111111; font-weight: 700; }
        .blog-content ul, .blog-content ol { margin: 0 0 1.5rem 1.5rem; }
        .blog-content li { margin-bottom: 0.5rem; }
        .blog-content blockquote { border-left: 3px solid #111111; margin: 2rem 0; padding: 0.75rem 1.5rem; color: rgba(17,17,17,0.6); font-style: italic; }
        .blog-content hr { border: none; border-top: 1px solid rgba(0,0,0,0.08); margin: 2.5rem 0; }
        .blog-content a { color: #111111; text-decoration: underline; }
      `}</style>
    </>
  );
}
