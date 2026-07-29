"use client";

import { motion } from "framer-motion";
import { Github, Linkedin, FileText, Users } from "lucide-react";
import SectionHeading from "./SectionHeading";

const links = [
  {
    icon: Github,
    title: "GitHub",
    desc: "Source code for agentic pipelines, RAG systems, and full-stack projects — most of what's on this page is open to read.",
    href: "https://github.com/Saifurrehman2094",
    cta: "@Saifurrehman2094",
  },
  {
    icon: Linkedin,
    title: "LinkedIn",
    desc: "Full work history, recommendations, and updates on what I'm building right now.",
    href: "https://www.linkedin.com/in/saif-ur-rehman001/",
    cta: "/in/saif-ur-rehman001",
  },
  {
    icon: Users,
    title: "Teaching & Mentorship",
    desc: "Mentored 100+ students as a Teaching Assistant for Operating Systems at FAST-NUCES.",
    href: "#experience",
    cta: "See experience",
  },
  {
    icon: FileText,
    title: "Resume",
    desc: "Full breakdown of experience, certifications, and technical skills in one PDF.",
    href: "/resume/Saif_ur_Rehman_Resume.pdf",
    cta: "Download PDF",
  },
];

export default function Testimonials() {
  return (
    <section id="testimonials" className="relative py-28">
      <div className="mx-auto max-w-7xl px-6 lg:px-10">
        <SectionHeading
          tag="// 07_elsewhere"
          title="Find me elsewhere"
          description="This page covers the highlights — for the full picture, these are the best next stops."
          align="center"
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {links.map((l, i) => (
            <motion.a
              key={l.title}
              href={l.href}
              target={l.href.startsWith("http") ? "_blank" : undefined}
              rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="glow-border group flex flex-col rounded-2xl"
            >
              <div className="glass flex h-full flex-col rounded-2xl p-6 transition-transform duration-300 group-hover:-translate-y-1.5">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet/40 bg-violet/10 text-violet-soft">
                  <l.icon size={20} />
                </span>
                <p className="mt-4 font-display text-base font-semibold text-cloud">
                  {l.title}
                </p>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-mist">
                  {l.desc}
                </p>
                <p className="mt-4 font-mono text-xs text-cyan-soft">
                  {l.cta} →
                </p>
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
}
