"use client";

import Link from "next/link";
import { useState } from "react";

export interface PostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  readTime: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function PostCard({ post, isLast }: { post: PostMeta; isLast: boolean }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href={`/blog/${post.slug}`} style={{ textDecoration: "none", color: "inherit" }}>
      <article
        style={{
          padding: "2rem 0",
          borderTop: "1px solid rgba(0,0,0,0.08)",
          borderBottom: isLast ? "1px solid rgba(0,0,0,0.08)" : "none",
          transition: "opacity 0.15s",
          opacity: hovered ? 0.6 : 1,
          cursor: "pointer",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.75rem" }}>
          <span style={{ fontFamily: "'DM Mono'", fontSize: "0.72rem", color: "rgba(17,17,17,0.4)", letterSpacing: "0.06em" }}>{formatDate(post.date)}</span>
          <span style={{ width: 3, height: 3, borderRadius: "50%", background: "rgba(17,17,17,0.2)", display: "inline-block" }} />
          <span style={{ fontFamily: "'DM Mono'", fontSize: "0.72rem", color: "rgba(17,17,17,0.4)", letterSpacing: "0.06em" }}>{post.readTime}</span>
        </div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#111111", marginBottom: "0.5rem", lineHeight: 1.3, letterSpacing: "-0.01em" }}>{post.title}</h2>
        <p style={{ fontSize: "0.9rem", color: "rgba(17,17,17,0.5)", lineHeight: 1.65, margin: 0 }}>{post.description}</p>
      </article>
    </Link>
  );
}
