"use client";

import { motion } from "framer-motion";

export default function SectionHeading({
  tag,
  title,
  description,
  align = "left",
}: {
  tag: string;
  title: string;
  description?: string;
  align?: "left" | "center";
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`mb-12 ${align === "center" ? "mx-auto max-w-2xl text-center" : ""}`}
    >
      <p className="tag-label mb-3 flex items-center gap-2 justify-start">
        <span className={align === "center" ? "mx-auto flex items-center gap-2" : "flex items-center gap-2"}>
          <span className="h-px w-6 bg-cyan" />
          {tag}
        </span>
      </p>
      <h2 className="font-display text-3xl font-semibold text-cloud sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-base leading-relaxed text-mist">{description}</p>
      )}
    </motion.div>
  );
}
