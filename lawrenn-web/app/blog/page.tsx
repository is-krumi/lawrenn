import { getAllPosts } from "@/lib/blog";
import MainNav from "@/components/MainNav";
import { PostCard } from "./PostCard";

export const metadata = { title: "Blog — Lawrenn", description: "Insights on AI, law firm intake, and growing your legal practice." };

export default function BlogIndex() {
  const posts = getAllPosts();

  return (
    <>
      <MainNav />
      <main style={{ minHeight: "100vh", background: "white", fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "8rem 2rem 6rem" }}>

          <div style={{ marginBottom: "4rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ width: 24, height: 1, background: "#111111" }} />
              <span style={{ fontFamily: "'DM Mono'", fontSize: "0.75rem", letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(17,17,17,0.5)" }}>Blog</span>
            </div>
            <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: "clamp(2.5rem, 5vw, 4rem)", letterSpacing: "0.02em", lineHeight: 1, color: "#111111", marginBottom: "1rem" }}>
              INSIGHTS FOR<br />LAW FIRMS.
            </h1>
            <p style={{ fontSize: "1.05rem", color: "rgba(17,17,17,0.5)", lineHeight: 1.7, maxWidth: 480 }}>
              Practical thinking on AI, client intake, and building a more efficient legal practice.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            {posts.map((post, i) => (
              <PostCard key={post.slug} post={post} isLast={i === posts.length - 1} />
            ))}
          </div>

        </div>
      </main>
    </>
  );
}
